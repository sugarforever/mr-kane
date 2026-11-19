import { languageNames } from '$lib/languages';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { z } from 'zod';
import { database } from './providers-store';
import type { PracticeRequest, Source } from '#lib/domain';

export function researchQuery(input: PracticeRequest) {
	const topics =
		input.profile.interests.trim().slice(0, 200) ||
		'everyday science nature sport';
	const scene = {
		daily: 'real everyday life observations',
		science: 'science explained university museum',
		nature: 'wildlife nature environment conservation',
		news: `positive science nature community news ${new Date().toISOString().slice(0, 10)}`,
		exam: `${languageNames[input.profile.language]} secondary school exam themes learning objectives official curriculum`,
	}[input.sourceType];
	return `${scene}: ${topics}`;
}
export function parseSearchResults(result: any): Source[] {
	if (result?.isError) return [];
	const text = (result?.content || [])
		.filter((c: any) => c.type === 'text')
		.map((c: any) => c.text)
		.join('\n')
		.slice(0, 100000);
	const seen = new Set<string>();
	const sources: Source[] = [];
	for (const block of text.split(/(?=^Title: )/m)) {
		const title = block.match(/^Title: (.+)$/m)?.[1];
		const raw = block.match(/^URL: (\S+)/m)?.[1];
		if (!title || !raw) continue;
		try {
			const url = new URL(raw);
			if (
				!['http:', 'https:'].includes(url.protocol) ||
				url.username ||
				url.password ||
				seen.has(url.href)
			)
				continue;
			seen.add(url.href);
			const date = block.match(/^Published(?: Date)?: (.+)$/m)?.[1];
			sources.push({
				title: title.slice(0, 300),
				url: url.href,
				publishedAt: date && date !== 'N/A' ? date.slice(0, 80) : undefined,
				excerpt: (block.split(/^(?:Text|Highlights|Content):\s*/m)[1] || '')
					.trim()
					.slice(0, 1800),
			});
		} catch {
			/* Unusable source URL. */
		}
	}
	return sources.slice(0, 4);
}
export const searchSettingsSchema = z.object({
	provider: z.enum(['exa', 'tavily', 'brave']),
	apiKey: z.string().max(2000).default(''),
});
type SearchConfig = {
	provider: 'exa' | 'tavily' | 'brave';
	keys: Partial<Record<'exa' | 'tavily' | 'brave', string>>;
};
function searchConfig(): SearchConfig {
	const db = database();
	try {
		const row = db
			.prepare('SELECT value FROM metadata WHERE key=?')
			.get('search') as { value: string } | undefined;
		return row ? JSON.parse(row.value) : { provider: 'exa', keys: {} };
	} finally {
		db.close();
	}
}
export function publicSearchSettings() {
	const c = searchConfig();
	return {
		provider: c.provider,
		configured: c.provider === 'exa' || !!c.keys[c.provider],
	};
}
export function saveSearchSettings(input: unknown) {
	const value = searchSettingsSchema.parse(input);
	const config = searchConfig();
	if (value.apiKey.trim()) config.keys[value.provider] = value.apiKey.trim();
	config.provider = value.provider;
	if (value.provider !== 'exa' && !config.keys[value.provider])
		throw new Error('Add a search API key.');
	const db = database();
	try {
		db.prepare('INSERT OR REPLACE INTO metadata VALUES (?,?)').run(
			'search',
			JSON.stringify(config),
		);
	} finally {
		db.close();
	}
	return publicSearchSettings();
}
function safeSources(items: any[]): Source[] {
	const seen = new Set<string>();
	return items
		.flatMap((item) => {
			try {
				const url = new URL(item.url);
				if (
					!['http:', 'https:'].includes(url.protocol) ||
					url.username ||
					url.password ||
					seen.has(url.href)
				)
					return [];
				seen.add(url.href);
				return [
					{
						title: String(item.title || url.hostname).slice(0, 300),
						url: url.href,
						excerpt: String(item.content || item.description || '').slice(
							0,
							1800,
						),
						publishedAt: item.published_date
							? String(item.published_date).slice(0, 80)
							: undefined,
					},
				];
			} catch {
				return [];
			}
		})
		.slice(0, 4);
}
export async function searchWeb(query: string, news: boolean) {
	const config = searchConfig();
	if (config.provider !== 'exa') {
		const key = config.keys[config.provider];
		if (!key) throw new Error('Search is not configured.');
		let response: Response;
		if (config.provider === 'tavily')
			response = await fetch('https://api.tavily.com/search', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${key}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					query,
					search_depth: 'basic',
					max_results: 4,
					topic: news ? 'news' : 'general',
					safe_search: true,
					include_answer: false,
					include_raw_content: false,
					...(news ? { time_range: 'month' } : {}),
				}),
				redirect: 'error',
				signal: AbortSignal.timeout(20000),
			});
		else {
			const url = new URL('https://api.search.brave.com/res/v1/web/search');
			url.search = new URLSearchParams({
				q: query,
				count: '4',
				safesearch: 'strict',
				...(news ? { freshness: 'pm' } : {}),
			}).toString();
			response = await fetch(url, {
				headers: { 'X-Subscription-Token': key, Accept: 'application/json' },
				redirect: 'error',
				signal: AbortSignal.timeout(20000),
			});
		}
		if (!response.ok) throw new Error('Search provider refused the request.');
		const reader = response.body?.getReader();
		if (!reader) throw new Error('Empty search response.');
		let text = '';
		const decoder = new TextDecoder();
		let bytes = 0;
		try {
			for (;;) {
				const chunk = await reader.read();
				if (chunk.done) break;
				bytes += chunk.value.byteLength;
				if (bytes > 2000000) throw new Error('Search response too large.');
				text += decoder.decode(chunk.value, { stream: true });
			}
			text += decoder.decode();
		} finally {
			await reader.cancel();
		}
		const body = JSON.parse(text);
		return {
			provider: config.provider,
			sources: safeSources(
				config.provider === 'tavily'
					? body.results || []
					: body.web?.results || [],
			),
		};
	}
	const client = new Client({ name: 'mr-kane', version: '0.1.0' });
	const endpoint = new URL('https://mcp.exa.ai/mcp');
	if (config.keys.exa) endpoint.searchParams.set('exaApiKey', config.keys.exa);
	const transport = new StreamableHTTPClientTransport(endpoint);
	try {
		await client.connect(transport, { signal: AbortSignal.timeout(15000) });
		const result = await client.callTool(
			{
				name: 'web_search_exa',
				arguments: {
					query,
					numResults: 4,
					objective:
						'Find reliable, age-appropriate educational sources. Prefer original reporting, universities, museums and official exam boards. For news prefer recent dated reporting; exclude graphic, adult and promotional content. Return sources and factual excerpts.',
				},
			},
			undefined,
			{ timeout: 20000 },
		);
		return { provider: 'exa', sources: parseSearchResults(result) };
	} finally {
		await client.close();
	}
}
export async function research(input: PracticeRequest) {
	const query = researchQuery(input);
	const result = await searchWeb(query, input.sourceType === 'news');
	if (!result.sources.length) throw new Error('No usable search sources.');
	return { ...result, query, searchedAt: new Date().toISOString() };
}
