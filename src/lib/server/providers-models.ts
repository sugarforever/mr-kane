import { builtinProviders } from '@earendil-works/pi-ai/providers/all';
import {
	createModels,
	createProvider,
	type Provider,
} from '@earendil-works/pi-ai/models';
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy';
import { openAIResponsesApi } from '@earendil-works/pi-ai/api/openai-responses.lazy';
import { anthropicMessagesApi } from '@earendil-works/pi-ai/api/anthropic-messages.lazy';
import { googleGenerativeAIApi } from '@earendil-works/pi-ai/api/google-generative-ai.lazy';
import type { Api, Model } from '@earendil-works/pi-ai';
import { z } from 'zod';
import type { Connection, CatalogEntry } from '#lib/ai-types';
import {
	credentialStore,
	readConnection,
	readCredential,
} from './providers-store';
export const protocols = [
	'openai-completions',
	'openai-responses',
	'anthropic-messages',
	'google-generative-ai',
] as const;
export function nativeProvider(service: string) {
	const p = builtinProviders().find((p) => p.id === service);
	if (!p) throw new Error('Unknown provider.');
	return p;
}
export function catalog(): CatalogEntry[] {
	return builtinProviders()
		.filter(
			(p) =>
				p.auth.oauth ||
				(p.baseUrl &&
					p.auth.apiKey &&
					protocols.includes(
						p.getModels()[0]?.api as (typeof protocols)[number],
					)),
		)
		.map((p) => ({
			id: p.id,
			name: p.name,
			baseUrl: p.baseUrl ?? '',
			oauth: !!p.auth.oauth,
			apiKey: !!p.auth.apiKey && !!p.baseUrl,
			models: p.getModels().map((m) => ({ id: m.id, name: m.name })),
		}));
}
export const connectionInput = z.object({
	id: z.string().max(100).optional(),
	name: z.string().trim().min(1).max(80),
	service: z.string().max(100),
	authMode: z.enum(['api_key', 'oauth', 'none']),
	baseUrl: z.string().max(2000),
	modelId: z.string().max(200),
	apiKey: z.string().max(8192).optional(),
	protocol: z.enum(protocols).default('openai-completions'),
});
export type ConnectionInput = z.infer<typeof connectionInput>;
export function endpoint(raw: string) {
	const url = new URL(raw);
	if (
		!['http:', 'https:'].includes(url.protocol) ||
		url.username ||
		url.password ||
		url.search ||
		url.hash
	)
		throw new Error(
			'Use an HTTP(S) base URL without credentials, query parameters or fragments.',
		);
	return url.toString().replace(/\/$/, '');
}
export function normalize(input: ConnectionInput) {
	const native =
		input.service === 'custom' ? undefined : nativeProvider(input.service);
	if (input.authMode === 'oauth' && !native?.auth.oauth)
		throw new Error('This provider does not support account login.');
	if (input.authMode === 'none' && input.service !== 'custom')
		throw new Error('Keyless mode is only available for custom endpoints.');
	if (input.authMode === 'api_key' && native && !native.auth.apiKey)
		throw new Error('Use account login for this provider.');
	const baseUrl =
		input.authMode === 'oauth'
			? (native?.baseUrl ?? '')
			: endpoint(input.baseUrl || native?.baseUrl || '');
	return { ...input, baseUrl };
}
export function connectionKey(input: ConnectionInput) {
	if (input.apiKey?.trim()) return input.apiKey.trim();
	if (!input.id) return '';
	const saved = readConnection(input.id);
	if (
		!saved ||
		saved.service !== input.service ||
		saved.authMode !== input.authMode ||
		saved.baseUrl !== input.baseUrl
	)
		throw new Error(
			'Enter a new API key after changing the endpoint or provider.',
		);
	const c = readCredential(saved.credentialSlot);
	return c?.type === 'api_key' ? (c.key ?? '') : '';
}
async function responseJSON(url: string, headers: Record<string, string>) {
	let response: Response;
	try {
		response = await fetch(url, {
			headers,
			redirect: 'error',
			signal: AbortSignal.timeout(12000),
		});
	} catch {
		throw new Error(
			'Cannot reach this provider. Check the endpoint and server connection.',
		);
	}
	if (!response.ok) {
		await response.body?.cancel();
		throw new Error(
			response.status === 401 || response.status === 403
				? 'The provider rejected this credential. Check your key or account access.'
				: response.status === 429
					? 'The provider rate limit was reached. Please retry later.'
					: `The models endpoint returned HTTP ${response.status}. Check the base URL.`,
		);
	}
	const reader = response.body?.getReader();
	if (!reader) throw new Error('Empty model catalog.');
	let size = 0;
	const chunks: Uint8Array[] = [];
	for (;;) {
		const r = await reader.read();
		if (r.done) break;
		size += r.value.length;
		if (size > 2000000) {
			await reader.cancel();
			throw new Error('The provider model list is too large.');
		}
		chunks.push(r.value);
	}
	try {
		return JSON.parse(Buffer.concat(chunks).toString('utf8'));
	} catch {
		throw new Error('The provider returned an invalid model catalog.');
	}
}
export async function discover(input: ConnectionInput) {
	const p = normalize(input);
	if (p.authMode === 'oauth')
		return nativeProvider(p.service)
			.getModels()
			.map((m) => m.id);
	const key = connectionKey(p);
	if (p.authMode === 'api_key' && !key)
		throw new Error('Enter an API key first.');
	const native = p.service === 'custom' ? undefined : nativeProvider(p.service);
	const api = native?.getModels()[0]?.api ?? p.protocol;
	const headers: Record<string, string> = { accept: 'application/json' };
	let url = p.baseUrl + '/models';
	if (api === 'anthropic-messages') {
		headers['x-api-key'] = key;
		headers['anthropic-version'] = '2023-06-01';
		url = p.baseUrl + (p.baseUrl.endsWith('/v1') ? '/models' : '/v1/models');
	} else if (api === 'google-generative-ai') headers['x-goog-api-key'] = key;
	else if (key) headers.authorization = `Bearer ${key}`;
	if (p.service === 'openrouter')
		await responseJSON(p.baseUrl + '/key', headers);
	const payload = await responseJSON(url, headers);
	const items = api === 'google-generative-ai' ? payload.models : payload.data;
	if (!Array.isArray(items))
		throw new Error('The endpoint did not return a model list.');
	const models = items
		.filter(
			(m: any) =>
				api !== 'google-generative-ai' ||
				m.supportedGenerationMethods?.includes('generateContent'),
		)
		.map((m: any) => ({
			id:
				api === 'google-generative-ai'
					? m.name?.replace(/^models\//, '')
					: m.id,
			date:
				typeof m.created === 'number'
					? m.created
					: Date.parse(m.created_at ?? '') || 0,
		}))
		.filter(
			(m: any) =>
				typeof m.id === 'string' &&
				m.id.length > 0 &&
				m.id.length <= 200 &&
				!/[\u0000-\u001f]/.test(m.id) &&
				!/(embedding|whisper|tts|dall-e|sora|moderation|realtime)/i.test(m.id),
		)
		.sort((a: any, b: any) => b.date - a.date);
	const ids = [...new Set<string>(models.map((m: any) => m.id))].slice(0, 2000);
	if (!ids.length)
		throw new Error('No text models were found for this connection.');
	return ids;
}
export function modelFor(p: Connection): Model<Api> {
	const native = p.service === 'custom' ? undefined : nativeProvider(p.service);
	const known = native?.getModels().find((m) => m.id === p.modelId);
	if (known) return { ...known, baseUrl: p.baseUrl || known.baseUrl };
	if (!p.models.includes(p.modelId) || p.authMode === 'oauth')
		throw new Error('Choose a model from this connection.');
	return {
		id: p.modelId,
		name: p.modelId,
		provider: p.service,
		api: native?.getModels()[0]?.api ?? p.protocol,
		baseUrl: p.baseUrl,
		input: ['text'],
		reasoning: false,
		contextWindow: 32768,
		maxTokens: 4096,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	};
}
export function modelsFor(p: Connection) {
	const model = modelFor(p);
	const native =
		p.service === 'custom'
			? createProvider({
					id: 'custom',
					baseUrl: p.baseUrl,
					auth: {
						apiKey: {
							name: 'Endpoint key',
							async resolve({ credential }) {
								return { auth: { apiKey: credential?.key || 'local' } };
							},
						},
					},
					models: [model],
					api: {
						'openai-completions': openAICompletionsApi(),
						'openai-responses': openAIResponsesApi(),
						'anthropic-messages': anthropicMessagesApi(),
						'google-generative-ai': googleGenerativeAIApi(),
					},
				})
			: nativeProvider(p.service);
	const provider: Provider = {
		...native,
		auth:
			p.authMode === 'oauth'
				? { oauth: native.auth.oauth }
				: { apiKey: native.auth.apiKey },
		getModels: () => [model],
	};
	const models = createModels({
		credentials: credentialStore(p.credentialSlot),
		authContext: {
			async env() {
				return undefined;
			},
			async fileExists() {
				return false;
			},
		},
	});
	models.setProvider(provider);
	return models;
}
