import { afterEach, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
	saveConnection,
	readConnection,
	selectConnection,
	readCredential,
	credentialStore,
} from '../src/lib/server/providers-store';
import {
	discover,
	modelsFor,
	nativeProvider,
} from '../src/lib/server/providers-models';
import { defaultProfile } from '../src/lib/domain';
import { saveSearchSettings } from '../src/lib/server/research';
import { runCoach, coachSources } from '../src/lib/server/agent';
import {
	startLogin,
	authStatus,
	disconnect,
} from '../src/lib/server/provider-auth';
const dirs: string[] = [];
const servers: Server[] = [];
afterEach(async () => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
	await Promise.all(
		servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))),
	);
	for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
function setup() {
	const d = mkdtempSync(join(tmpdir(), 'kane-runtime-'));
	dirs.push(d);
	vi.stubEnv('MR_KANE_DATA_DIR', d);
	vi.stubEnv('PI_API_KEY', '');
}
async function mockProvider() {
	let turns = 0;
	let authorization = '';
	const server = createServer(async (req, res) => {
		if (req.url === '/v1/models') {
			if (req.headers.authorization === 'Bearer rejected') {
				res.writeHead(401);
				res.end('private upstream error');
				return;
			}
			res.setHeader('Content-Type', 'application/json');
			res.end(
				JSON.stringify({
					data: [
						{ id: 'fixture', created: 100 },
						{ id: 'embedding-only', created: 200 },
					],
				}),
			);
			return;
		}
		if (req.url === '/v1/chat/completions') {
			turns++;
			authorization = req.headers.authorization ?? '';
			let body = '';
			for await (const c of req) body += c;
			const parsed = JSON.parse(body);
			expect(
				parsed.messages.some((m: any) => m.content?.includes('language coach')),
			).toBe(true);
			res.writeHead(200, { 'Content-Type': 'text/event-stream' });
			res.write(
				'data: ' +
					JSON.stringify({
						id: 'test',
						object: 'chat.completion.chunk',
						created: 1,
						model: 'fixture',
						choices: [
							{
								index: 0,
								delta: { role: 'assistant', content: '{"answer":"hello"}' },
								finish_reason: null,
							},
						],
					}) +
					'\n\n',
			);
			res.write(
				'data: ' +
					JSON.stringify({
						id: 'test',
						object: 'chat.completion.chunk',
						created: 1,
						model: 'fixture',
						choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
					}) +
					'\n\ndata: [DONE]\n\n',
			);
			res.end();
			return;
		}
		res.writeHead(404);
		res.end();
	});
	servers.push(server);
	await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
	const address = server.address() as { port: number };
	return {
		baseUrl: `http://127.0.0.1:${address.port}/v1`,
		turns: () => turns,
		authorization: () => authorization,
	};
}
it('discovers text models and rejects bad credentials without exposing provider error bodies', async () => {
	setup();
	const server = await mockProvider();
	const input = {
		name: 'Test',
		service: 'custom',
		authMode: 'api_key' as const,
		baseUrl: server.baseUrl,
		modelId: '',
		protocol: 'openai-completions' as const,
		apiKey: 'rejected',
	};
	await expect(discover(input)).rejects.toThrow('rejected this credential');
	expect(await discover({ ...input, apiKey: 'accepted' })).toEqual(['fixture']);
});
it('runs the real Pi Durable wire path and reopens the persisted answer without another model call', async () => {
	setup();
	const server = await mockProvider();
	const p = saveConnection(
		{
			name: 'Test',
			service: 'custom',
			authMode: 'api_key',
			baseUrl: server.baseUrl,
			modelId: 'fixture',
			models: ['fixture'],
			protocol: 'openai-completions',
		},
		'test-secret',
	);
	selectConnection(p.id);
	const first = await runCoach(
		'practice',
		{ topic: 'plants' },
		{ type: 'object' },
		'request-one',
	);
	expect(first).toBe('{"answer":"hello"}');
	expect(server.authorization()).toBe('Bearer test-secret');
	selectConnection(null);
	expect(
		await runCoach(
			'practice',
			{ topic: 'plants' },
			{ type: 'object' },
			'request-one',
		),
	).toBe(first);
	expect(server.turns()).toBe(1);
	await expect(
		runCoach(
			'practice',
			{ topic: 'different' },
			{ type: 'object' },
			'request-one',
		),
	).rejects.toThrow('different content');
}, 20000);
it('completes the real Pi Codex device flow, persists credentials, refreshes and disconnects without exposing tokens', async () => {
	setup();
	const p = saveConnection({
		name: 'ChatGPT',
		service: 'openai-codex',
		authMode: 'oauth',
		baseUrl: 'https://chatgpt.com/backend-api',
		modelId: nativeProvider('openai-codex').getModels()[0].id,
		models: nativeProvider('openai-codex')
			.getModels()
			.map((m) => m.id),
		protocol: 'openai-completions',
	});
	const token = (id: string) =>
		'header.' +
		Buffer.from(
			JSON.stringify({
				'https://api.openai.com/auth': {
					chatgpt_account_id: 'synthetic-account',
				},
				marker: id,
			}),
		).toString('base64url') +
		'.signature';
	let grants: string[] = [];
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
		const value = String(url);
		if (value.endsWith('/deviceauth/usercode'))
			return Response.json({
				device_auth_id: 'private-device-id',
				user_code: 'KANE-123',
				interval: 0,
			});
		if (value.endsWith('/deviceauth/token'))
			return Response.json({
				authorization_code: 'private-code',
				code_verifier: 'private-verifier',
			});
		if (value.endsWith('/oauth/token')) {
			const form = new URLSearchParams(String(options?.body));
			grants.push(form.get('grant_type')!);
			return Response.json({
				access_token: token(grants.length === 1 ? 'first' : 'refreshed'),
				refresh_token: 'private-refresh',
				expires_in: 3600,
			});
		}
		throw new Error('Unexpected URL');
	});
	startLogin(p.id, 'device_code');
	await vi.waitFor(
		() => expect(authStatus(p.id).flow?.status).toBe('connected'),
		{ timeout: 4000 },
	);
	const stored = readConnection(p.id)!;
	expect(readCredential(stored.credentialSlot)).toMatchObject({
		type: 'oauth',
		refresh: 'private-refresh',
	});
	expect(JSON.stringify(authStatus(p.id))).not.toContain('private-refresh');
	expect(JSON.stringify(authStatus(p.id))).not.toContain('private-device-id');
	await credentialStore(stored.credentialSlot).modify(
		'openai-codex',
		async (c) => ({ ...c!, expires: 1 }) as any,
	);
	const runtime = modelsFor(stored);
	const auth = await runtime.getAuth('openai-codex');
	expect(auth?.auth.apiKey).toBe(token('refreshed'));
	expect(grants).toEqual(['authorization_code', 'refresh_token']);
	await disconnect(p.id);
	expect(authStatus(p.id).connection.connected).toBe(false);
}, 10000);

it('grounds a news request before generation and replays its original sources without searching again', async () => {
	setup();
	const server = await mockProvider();
	const p = saveConnection(
		{
			name: 'Research test',
			service: 'custom',
			authMode: 'api_key',
			baseUrl: server.baseUrl,
			modelId: 'fixture',
			models: ['fixture'],
			protocol: 'openai-completions',
		},
		'test-secret',
	);
	selectConnection(p.id);
	saveSearchSettings({ provider: 'tavily', apiKey: 'test-search' });
	const originalFetch = globalThis.fetch;
	let searches = 0;
	vi.stubGlobal('fetch', async (input: any, init: any) => {
		if (String(input) === 'https://api.tavily.com/search') {
			searches++;
			return Response.json({
				results: [
					{
						title: 'Bird study',
						url: 'https://example.org/study',
						content: 'Researchers observed birds.',
						published_date: '2026-11-01',
					},
				],
			});
		}
		return originalFetch(input, init);
	});
	const input = {
		profile: defaultProfile,
		mode: 'writing',
		sourceType: 'news',
		material: '',
		research: false,
	};
	await runCoach('practice', input, { type: 'object' }, 'research-request');
	expect(coachSources('research-request').sources[0].title).toBe('Bird study');
	selectConnection(null);
	await runCoach('practice', input, { type: 'object' }, 'research-request');
	expect(searches).toBe(1);
	expect(server.turns()).toBe(1);
}, 20000);
