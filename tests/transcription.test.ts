import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('../src/lib/server/providers-store', () => ({
	connections: vi.fn(() => []),
	defaultConnection: vi.fn(() => undefined),
	readCredential: vi.fn(() => undefined),
}));
vi.mock('../src/lib/server/speech/settings', () => ({
	readSpeechSettings: () => ({
		stt: { provider: 'openai', model: 'gpt-transcribe' },
		tts: { provider: 'browser', model: 'local', voice: 'auto' },
	}),
	speechKey: () => transcriptionKey(),
}));
import { connections, readCredential } from '../src/lib/server/providers-store';
import {
	transcriptionKey,
	transcribeAudio,
} from '../src/lib/server/transcription';
import { POST } from '../src/routes/api/transcribe/+server';
beforeEach(() => {
	vi.clearAllMocks();
	vi.stubEnv('OPENAI_API_KEY', '');
	vi.mocked(connections).mockReturnValue([]);
});
afterEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
});
const url = new URL('http://localhost/api/transcribe');
function request(
	body = 'fake audio',
	origin = url.origin,
	type = 'audio/webm',
	language = 'es',
) {
	return {
		url,
		request: new Request(url, {
			method: 'POST',
			headers: { origin, 'Content-Type': type, 'x-reading-language': language },
			body,
		}),
	};
}
it('never uses subscription OAuth for audio and reuses only official OpenAI API keys', () => {
	const provider = {
		id: 'p',
		service: 'openai',
		authMode: 'oauth',
		baseUrl: 'https://api.openai.com/v1',
		credentialSlot: 'slot',
	} as any;
	vi.mocked(connections).mockReturnValue([provider]);
	expect(transcriptionKey()).toBeUndefined();
	vi.mocked(connections).mockReturnValue([
		{
			...provider,
			authMode: 'api_key',
			baseUrl: 'https://elsewhere.example/v1',
		},
	]);
	expect(transcriptionKey()).toBeUndefined();
	vi.mocked(connections).mockReturnValue([
		{ ...provider, authMode: 'api_key' },
	]);
	vi.mocked(readCredential).mockReturnValue({
		type: 'api_key',
		key: 'stored-secret',
	});
	expect(transcriptionKey()).toBe('stored-secret');
});
it('sends only audio and language to the official endpoint, never the expected reading text', async () => {
	const fetchMock = vi.fn(async (endpoint: any, init: any) => {
		expect(endpoint).toBe('https://api.openai.com/v1/audio/transcriptions');
		expect(init.headers.Authorization).toBe('Bearer synthetic-secret');
		const form = init.body as FormData;
		expect([...form.keys()]).toEqual(['file', 'model', 'languages[]']);
		expect(form.get('model')).toBe('gpt-transcribe');
		expect(form.get('languages[]')).toBe('es');
		return Response.json({ text: 'Hola Ana', languages: [{ code: 'es' }] });
	});
	vi.stubGlobal('fetch', fetchMock);
	expect(
		await transcribeAudio(
			new Blob(['audio'], { type: 'audio/webm' }),
			'es',
			'synthetic-secret',
		),
	).toMatchObject({ transcript: 'Hola Ana', status: 'complete' });
});
it('enforces origin, language and MIME before upload and gives a clear missing-key error', async () => {
	await expect(
		POST(request('audio', 'https://foreign.example') as any),
	).rejects.toMatchObject({ status: 403 });
	await expect(
		POST(request('audio', url.origin, 'text/plain') as any),
	).rejects.toMatchObject({ status: 415 });
	await expect(
		POST(request('audio', url.origin, 'audio/webm', 'en') as any),
	).rejects.toMatchObject({ status: 400 });
	await expect(POST(request() as any)).rejects.toMatchObject({ status: 503 });
});
it('transcribes valid uploads, handles no speech and hides upstream errors', async () => {
	vi.stubEnv('OPENAI_API_KEY', 'synthetic-secret');
	vi.stubGlobal(
		'fetch',
		vi
			.fn()
			.mockResolvedValueOnce(Response.json({ text: 'Hola' }))
			.mockResolvedValueOnce(Response.json({ text: '' }))
			.mockResolvedValueOnce(
				new Response('private upstream error', { status: 500 }),
			),
	);
	const result = await POST(request() as any);
	expect(await result.json()).toEqual({
		transcript: 'Hola',
		status: 'complete',
	});
	expect(await (await POST(request() as any)).json()).toMatchObject({
		transcript: '',
		status: 'unavailable',
	});
	await expect(POST(request() as any)).rejects.toMatchObject({ status: 502 });
});
it('bounds actual uploaded bytes even without content-length', async () => {
	vi.stubEnv('OPENAI_API_KEY', 'synthetic-secret');
	await expect(
		POST(request('x'.repeat(20 * 1024 * 1024 + 1)) as any),
	).rejects.toMatchObject({ status: 413 });
});

it('explains rejected OpenAI credentials without exposing the upstream response', async () => {
	vi.stubEnv('OPENAI_API_KEY', 'synthetic-secret');
	vi.stubGlobal(
		'fetch',
		vi.fn().mockResolvedValue(
			Response.json(
				{
					error: {
						code: 'invalid_api_key',
						message: 'private upstream secret',
					},
				},
				{ status: 401 },
			),
		),
	);
	await expect(POST(request() as any)).rejects.toMatchObject({
		status: 503,
		body: {
			message: expect.stringContaining('rejected the configured API key'),
		},
	});
});

it('uses the saved and tested OpenAI key ahead of an inherited environment key', () => {
	vi.stubEnv('OPENAI_API_KEY', 'old-environment-key');
	vi.mocked(connections).mockReturnValue([
		{
			id: 'saved-openai',
			name: 'OpenAI',
			service: 'openai',
			authMode: 'api_key',
			baseUrl: 'https://api.openai.com/v1',
			credentialSlot: 'saved-slot',
			modelId: 'text-model',
			models: ['text-model'],
			protocol: 'openai-responses',
		},
	]);
	vi.mocked(readCredential).mockReturnValue({
		type: 'api_key',
		key: 'tested-settings-key',
	});
	expect(transcriptionKey()).toBe('tested-settings-key');
});
it('falls back to the environment key only when no saved OpenAI API key is configured', () => {
	vi.stubEnv('OPENAI_API_KEY', 'environment-key');
	expect(transcriptionKey()).toBe('environment-key');
});
