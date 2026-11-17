import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
	BACKGROUND_CONTEXT,
	withAbortSignal,
} from '@earendil-works/chord/context';
import {
	putAudioArtifact,
	readAudioArtifact,
} from '../src/lib/server/speech/artifacts';
import { createSpeechTools } from '../src/lib/server/speech/tools';
import type { ToolExecutionApi } from '@earendil-works/pi-durable';
const service = vi.hoisted(() => ({
	recognizeSpeech: vi.fn(),
	generateSpeech: vi.fn(),
}));
vi.mock('../src/lib/server/speech/service', () => service);
let dir = '';
afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
	if (dir) rmSync(dir, { recursive: true, force: true });
});
function setup() {
	dir = mkdtempSync(join(tmpdir(), 'speech-tools-'));
	vi.stubEnv('MR_KANE_DATA_DIR', dir);
}
const api = {} as ToolExecutionApi;
it('stores private audio references and prevents cross-request access and traversal', async () => {
	setup();
	const saved = await putAudioArtifact(
		new Blob(['audio'], { type: 'audio/wav' }),
		'request-a',
	);
	expect(saved.mimeType).toBe('audio/wav');
	expect(saved.bytes).toBe(5);
	expect(saved).not.toHaveProperty('path');
	expect(
		await (await readAudioArtifact(saved.artifactId, 'request-a')).text(),
	).toBe('audio');
	await expect(
		readAudioArtifact(saved.artifactId, 'request-b'),
	).rejects.toThrow();
	await expect(
		readAudioArtifact('../settings.sqlite', 'request-a'),
	).rejects.toThrow();
	expect(statSync(join(dir, 'speech-artifacts')).mode & 0o777).toBe(0o700);
});
it('validates empty and non-audio artifacts', async () => {
	setup();
	await expect(
		putAudioArtifact(new Blob([], { type: 'audio/wav' }), 'a'),
	).rejects.toThrow();
	await expect(
		putAudioArtifact(new Blob(['x'], { type: 'text/html' }), 'a'),
	).rejects.toThrow();
});
it('transcribes a scoped artifact and synthesizes an artifact without binary model context', async () => {
	setup();
	const input = await putAudioArtifact(
		new Blob(['audio'], { type: 'audio/wav' }),
		'a',
	);
	service.recognizeSpeech.mockResolvedValue({
		status: 'complete',
		transcript: 'Hola.',
	});
	service.generateSpeech.mockResolvedValue({
		audio: new Uint8Array([1, 2, 3]).buffer,
		mimeType: 'audio/mpeg',
	});
	const tools = createSpeechTools('a');
	const stt = await tools[0].execute(
		{ artifactId: input.artifactId, language: 'es' },
		api,
		BACKGROUND_CONTEXT,
	);
	expect(stt.structuredOutput).toEqual({
		status: 'complete',
		transcript: 'Hola.',
	});
	const tts = await tools[1].execute(
		{ text: 'Hola.', language: 'es', rate: 0.8 },
		api,
		BACKGROUND_CONTEXT,
	);
	const result = tts.structuredOutput as { artifactId: string };
	expect((await readAudioArtifact(result.artifactId, 'a')).size).toBe(3);
	expect(JSON.stringify(tts)).not.toContain('base64');
	expect(JSON.stringify(tts)).not.toContain(dir);
});
it('rejects invalid tool inputs and cancelled work before provider calls', async () => {
	setup();
	service.generateSpeech.mockClear();
	const tools = createSpeechTools('a');
	await expect(
		tools[1].execute(
			{ text: 'Hello', language: 'xx' },
			api,
			BACKGROUND_CONTEXT,
		),
	).rejects.toThrow();
	const abort = new AbortController();
	abort.abort();
	await expect(
		tools[1].execute(
			{ text: 'Hola', language: 'es' },
			api,
			withAbortSignal(abort.signal, BACKGROUND_CONTEXT),
		),
	).rejects.toThrow();
	expect(service.generateSpeech).not.toHaveBeenCalled();
});
it('expires stored audio instead of keeping recordings indefinitely', async () => {
	setup();
	const saved = await putAudioArtifact(
		new Blob(['audio'], { type: 'audio/wav' }),
		'a',
	);
	vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 25 * 60 * 60 * 1000);
	await expect(readAudioArtifact(saved.artifactId, 'a')).rejects.toThrow(
		'expired',
	);
});
it('uploads and retrieves audio with request scoping, without allowing foreign writes', async () => {
	setup();
	const { POST } = await import('../src/routes/api/speech/artifacts/+server');
	const { GET } =
		await import('../src/routes/api/speech/artifacts/[id]/+server');
	const url = new URL('http://localhost/api/speech/artifacts?requestId=job-1');
	const upload = new Request(url, {
		method: 'POST',
		headers: { origin: url.origin, 'content-type': 'audio/wav' },
		body: 'wave',
	});
	const response = await POST({ request: upload, url } as never);
	const artifact = await response.json();
	const audioUrl = new URL(
		`http://localhost/api/speech/artifacts/${artifact.artifactId}?requestId=job-1`,
	);
	const audio = await GET({
		request: new Request(audioUrl),
		url: audioUrl,
		params: { id: artifact.artifactId },
	} as never);
	expect(await audio.text()).toBe('wave');
	expect(audio.headers.get('cache-control')).toBe('no-store');
	const foreign = new Request(url, {
		method: 'POST',
		headers: { origin: 'https://other.example', 'content-type': 'audio/wav' },
		body: 'wave',
	});
	await expect(POST({ request: foreign, url } as never)).rejects.toMatchObject({
		status: 403,
	});
});
it('preserves unavailable speech messages under the declared output schema', async () => {
	setup();
	const { speechCheckSchema } =
		await import('../src/lib/client/speech-recognition');
	const artifact = await putAudioArtifact(
		new Blob(['audio'], { type: 'audio/wav' }),
		'a',
	);
	service.recognizeSpeech.mockResolvedValue({
		status: 'unavailable',
		transcript: '',
		message: 'No speech was recognised.',
	});
	const tool = createSpeechTools('a')[0];
	const result = await tool.execute(
		{ artifactId: artifact.artifactId, language: 'es' },
		api,
		BACKGROUND_CONTEXT,
	);
	expect(result.structuredOutput).toEqual({
		status: 'unavailable',
		transcript: '',
		message: 'No speech was recognised.',
	});
	expect(tool.structuredOutputSchema).toEqual(
		(await import('zod')).z.toJSONSchema(speechCheckSchema),
	);
});
it('rejects incompatible MiniMax artifact formats before sending audio to the provider', async () => {
	setup();
	service.recognizeSpeech.mockClear();
	const { saveSpeechSettings } =
		await import('../src/lib/server/speech/settings');
	const { defaultSpeechSettings } = await import('../src/lib/speech');
	saveSpeechSettings({
		...defaultSpeechSettings,
		stt: { provider: 'minimax', model: 'asr-1.0' },
	});
	const artifact = await putAudioArtifact(
		new Blob(['audio'], { type: 'audio/webm' }),
		'a',
	);
	await expect(
		createSpeechTools('a')[0].execute(
			{ artifactId: artifact.artifactId, language: 'es' },
			api,
			BACKGROUND_CONTEXT,
		),
	).rejects.toThrow('requires WAV');
	expect(service.recognizeSpeech).not.toHaveBeenCalled();
});
it('accepts the documented optional rate through Pi argument validation', async () => {
	const { validateToolArguments } =
		await import('@earendil-works/pi-ai/utils/validation');
	const tool = createSpeechTools('a')[1];
	expect(() =>
		validateToolArguments(tool, {
			type: 'toolCall',
			id: 'test',
			name: 'text_to_speech',
			arguments: { text: 'Hola', language: 'es' },
		}),
	).not.toThrow();
});
