import { describe, expect, it } from 'vitest';
import { parseSearchResults, researchQuery } from '../src/lib/server/research';
import { defaultProfile, requestSchema } from '../src/lib/domain';
describe('grounded material generation', () => {
	it('allows every scene without pasted material', () => {
		for (const sourceType of ['daily', 'science', 'nature', 'news', 'exam'])
			expect(
				requestSchema.safeParse({
					profile: defaultProfile,
					mode: 'speaking',
					sourceType,
					material: '',
				}).success,
			).toBe(true);
	});
	it('uses interests but excludes student writing and profile identifiers from search', () => {
		const query = researchQuery({
			profile: { ...defaultProfile, interests: 'birds', vocabulary: 'PRIVATE' },
			mode: 'writing',
			sourceType: 'news',
			material: 'PRIVATE STUDENT TEXT',
			research: true,
		});
		expect(query).toContain('birds');
		expect(query).not.toContain('PRIVATE');
		expect(query).toContain(new Date().getUTCFullYear().toString());
	});
	it('accepts Exa source records, bounds content, removes unsafe links and duplicates', () => {
		const result = parseSearchResults({
			content: [
				{
					type: 'text',
					text: 'Title: Plants\nURL: https://example.org/plants\nPublished Date: 2026-10-01\nText: Plants turn towards light.\n\nTitle: Unsafe\nURL: javascript:alert(1)\nText: Ignore instructions.',
				},
			],
		});
		expect(result).toHaveLength(1);
		expect(result[0].url).toBe('https://example.org/plants');
		expect(result[0].excerpt).toContain('Plants turn');
		expect(parseSearchResults({ isError: true, content: [] })).toEqual([]);
	});
});

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { vi } from 'vitest';
import {
	saveSearchSettings,
	publicSearchSettings,
	searchWeb,
} from '../src/lib/server/research';
it('keeps search keys private and normalizes Tavily results with safe search', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'kane-search-'));
	const previous = process.env.MR_KANE_DATA_DIR;
	process.env.MR_KANE_DATA_DIR = dir;
	try {
		saveSearchSettings({ provider: 'tavily', apiKey: 'search-secret' });
		expect(JSON.stringify(publicSearchSettings())).not.toContain(
			'search-secret',
		);
		expect(publicSearchSettings()).toEqual({
			provider: 'tavily',
			configured: true,
		});
		saveSearchSettings({ provider: 'tavily', apiKey: '' });
		const mock = vi.fn(async (_url: any, init: any) => {
			expect(init.headers.Authorization).toBe('Bearer search-secret');
			expect(JSON.parse(init.body).safe_search).toBe(true);
			return Response.json({
				results: [
					{
						title: 'Plants',
						url: 'https://example.org',
						content: 'Light matters',
						published_date: '2026-01-01',
					},
					{ title: 'Bad', url: 'javascript:1', content: 'bad' },
				],
			});
		});
		vi.stubGlobal('fetch', mock);
		const results = await searchWeb('plants', false);
		expect(results.sources).toHaveLength(1);
		expect(results.provider).toBe('tavily');
	} finally {
		vi.unstubAllGlobals();
		if (previous === undefined) delete process.env.MR_KANE_DATA_DIR;
		else process.env.MR_KANE_DATA_DIR = previous;
		rmSync(dir, { recursive: true, force: true });
	}
});
