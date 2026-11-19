import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	defaultSpeechSettings,
	speechSettingsSchema,
	speechModel,
} from '../src/lib/speech';
import {
	readSpeechSettings,
	saveSpeechSettings,
	speechKey,
	publicSpeechSettings,
} from '../src/lib/server/speech/settings';
import { sttProviders, ttsProviders } from '../src/lib/server/speech/providers';
let dir = '';
afterEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
	if (dir) rmSync(dir, { recursive: true, force: true });
	dir = '';
});
function setup() {
	dir = mkdtempSync(join(tmpdir(), 'kane-speech-'));
	vi.stubEnv('MR_KANE_DATA_DIR', dir);
	vi.stubEnv('PI_API_KEY', '');
	vi.stubEnv('OPENAI_API_KEY', '');
	vi.stubEnv('MINIMAX_API_KEY', '');
}
it('validates capability, model and voice combinations independently', () => {
	expect(speechSettingsSchema.parse(defaultSpeechSettings)).toEqual(
		defaultSpeechSettings,
	);
	expect(
		speechSettingsSchema.safeParse({
			...defaultSpeechSettings,
			stt: { provider: 'browser', model: 'local' },
		}).success,
	).toBe(false);
	expect(
		speechSettingsSchema.safeParse({
			...defaultSpeechSettings,
			tts: { provider: 'openai', model: 'asr-1.0', voice: 'coral' },
		}).success,
	).toBe(false);
	expect(
		speechModel('tts', 'minimax', 'speech-2.8-hd').languages,
	).not.toContain('ga');
});
it('persists independent choices and keys without exposing secrets', () => {
	setup();
	vi.stubEnv('OPENAI_API_KEY', 'old-environment-key');
	const settings = {
		...defaultSpeechSettings,
		tts: {
			provider: 'minimax' as const,
			model: 'speech-2.8-hd',
			voice: 'Spanish_SereneWoman',
		},
	};
	saveSpeechSettings(settings, { openai: 'saved-key', minimax: 'mini-key' });
	expect(readSpeechSettings()).toEqual(settings);
	expect(speechKey('openai')).toBe('saved-key');
	expect(speechKey('minimax')).toBe('mini-key');
	expect(JSON.stringify(publicSpeechSettings())).not.toContain('saved-key');
	expect(JSON.stringify(publicSpeechSettings())).not.toContain('mini-key');
	saveSpeechSettings(defaultSpeechSettings, {});
	expect(speechKey('minimax')).toBe('mini-key');
});
it('uses provider-specific STT payloads without expected answers', async () => {
	const calls: any[] = [];
	vi.stubGlobal(
		'fetch',
		vi.fn(async (url, init) => {
			calls.push({ url, init });
			return Response.json({ text: 'Hola' });
		}),
	);
	const input = {
		audio: new Blob(['audio'], { type: 'audio/wav' }),
		language: 'es' as const,
		model: 'asr-1.0',
		key: 'secret',
	};
	expect((await sttProviders.minimax.transcribe(input)).transcript).toBe(
		'Hola',
	);
	expect(calls[0].url).toBe('https://api.minimax.io/v1/speech_to_text');
	expect(calls[0].init.headers.language).toBe('es');
	expect(calls[0].init.body.get('model')).toBe('asr-1.0');
	expect(calls[0].init.body.get('prompt')).toBeNull();
	await expect(
		sttProviders.minimax.transcribe({ ...input, language: 'ga' }),
	).rejects.toThrow('Irish');
});
it('implements both TTS response formats behind the same contract', async () => {
	vi.stubGlobal(
		'fetch',
		vi
			.fn()
			.mockResolvedValueOnce(
				new Response(new Uint8Array([1, 2]), {
					headers: { 'content-type': 'audio/mpeg' },
				}),
			)
			.mockResolvedValueOnce(
				Response.json({
					base_resp: { status_code: 0 },
					data: { audio: '0102' },
				}),
			),
	);
	const input = {
		text: 'Hola',
		language: 'es' as const,
		model: 'gpt-4o-mini-tts',
		voice: 'coral',
		rate: 1,
		key: 'secret',
	};
	expect((await ttsProviders.openai.synthesize(input)).mimeType).toBe(
		'audio/mpeg',
	);
	expect([
		...new Uint8Array(
			(
				await ttsProviders.minimax.synthesize({
					...input,
					model: 'speech-2.8-hd',
					voice: 'Spanish_SereneWoman',
				})
			).audio,
		),
	]).toEqual([1, 2]);
});

it('routes API uploads and synthesis through the saved provider selections', async () => {
	setup();
	const { POST: transcribe } =
		await import('../src/routes/api/transcribe/+server');
	const { POST: synthesize } =
		await import('../src/routes/api/speech/synthesize/+server');
	const { POST: settingsPost } =
		await import('../src/routes/api/speech/settings/+server');
	const url = new URL('http://localhost/api/speech/settings');
	const choice = {
		stt: { provider: 'minimax', model: 'asr-1.0' },
		tts: {
			provider: 'minimax',
			model: 'speech-2.8-turbo',
			voice: 'Spanish_ThoughtfulMan',
		},
	};
	const saved = await settingsPost({
		url,
		request: new Request(url, {
			method: 'POST',
			headers: { origin: url.origin, 'Content-Type': 'application/json' },
			body: JSON.stringify({
				settings: choice,
				apiKeys: { minimax: 'hidden-key' },
			}),
		}),
	} as any);
	expect(JSON.stringify(await saved.json())).not.toContain('hidden-key');
	const fetchMock = vi
		.fn()
		.mockResolvedValueOnce(Response.json({ text: 'Hola' }))
		.mockResolvedValueOnce(
			Response.json({ base_resp: { status_code: 0 }, data: { audio: '0102' } }),
		);
	vi.stubGlobal('fetch', fetchMock);
	const recognised = await transcribe({
		url,
		request: new Request(url, {
			method: 'POST',
			headers: {
				origin: url.origin,
				'Content-Type': 'audio/wav',
				'x-reading-language': 'es',
			},
			body: 'audio',
		}),
	} as any);
	expect(await recognised.json()).toMatchObject({ transcript: 'Hola' });
	const audio = await synthesize({
		url,
		request: new Request(url, {
			method: 'POST',
			headers: { origin: url.origin, 'Content-Type': 'application/json' },
			body: JSON.stringify({ text: 'Hola', language: 'es', rate: 0.8 }),
		}),
	} as any);
	expect(audio.headers.get('content-type')).toBe('audio/mpeg');
	expect([...new Uint8Array(await audio.arrayBuffer())]).toEqual([1, 2]);
	expect(fetchMock.mock.calls[1][0]).toBe('https://api.minimax.io/v1/t2a_v2');
	expect(JSON.parse(fetchMock.mock.calls[1][1].body).model).toBe(
		'speech-2.8-turbo',
	);
});
it('rejects foreign settings writes and unsupported languages without contacting a provider', async () => {
	setup();
	const { POST } = await import('../src/routes/api/speech/settings/+server');
	const url = new URL('http://localhost/api/speech/settings');
	await expect(
		POST({
			url,
			request: new Request(url, {
				method: 'POST',
				headers: {
					origin: 'https://foreign.example',
					'Content-Type': 'application/json',
				},
				body: '{}',
			}),
		} as any),
	).rejects.toMatchObject({ status: 403 });
	const fetchMock = vi.fn();
	vi.stubGlobal('fetch', fetchMock);
	await expect(
		ttsProviders.openai.synthesize({
			text: 'Dia duit',
			language: 'ga',
			model: 'gpt-4o-mini-tts',
			voice: 'coral',
			rate: 1,
			key: 'key',
		}),
	).rejects.toThrow('Irish');
	expect(fetchMock).not.toHaveBeenCalled();
});
it('keeps keys unchanged after invalid settings and removes only a dedicated key explicitly', () => {
	setup();
	saveSpeechSettings(defaultSpeechSettings, { minimax: 'keep-key' });
	expect(() =>
		saveSpeechSettings(
			{
				...defaultSpeechSettings,
				stt: { provider: 'minimax', model: 'bad-model' },
			},
			{ minimax: 'replacement' },
		),
	).toThrow();
	expect(speechKey('minimax')).toBe('keep-key');
	saveSpeechSettings(defaultSpeechSettings, { minimax: null });
	expect(speechKey('minimax')).toBeUndefined();
});

it.each([
	[1004, 503, 'API key'],
	[1008, 429, 'credit'],
	[1002, 429, 'limited'],
	[2042, 503, 'voice'],
	[2022, 503, 'model'],
])(
	'handles MiniMax business error %s with null audio safely',
	async (code, status, message) => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				Response.json({
					base_resp: {
						status_code: code,
						status_msg: 'secret-provider-detail',
					},
					data: null,
				}),
			),
		);
		await expect(
			ttsProviders.minimax.synthesize({
				text: 'Hola',
				language: 'es',
				model: 'speech-2.8-hd',
				voice: 'Spanish_SereneWoman',
				rate: 1,
				key: 'secret',
			}),
		).rejects.toMatchObject({
			status,
			message: expect.stringContaining(message),
		});
	},
);

it('accepts documented compressed MiniMax STT uploads with matching filenames', async () => {
	const fetchMock = vi.fn().mockResolvedValue(Response.json({ text: 'Hola' }));
	vi.stubGlobal('fetch', fetchMock);
	await sttProviders.minimax.transcribe({
		audio: new Blob(['audio'], { type: 'audio/mpeg' }),
		language: 'es',
		model: 'asr-1.0',
		key: 'secret',
	});
	expect(fetchMock.mock.calls[0][1].body.get('file').name).toBe(
		'recording.mp3',
	);
});

it.each(['', '0', 'xyz'])(
	'rejects malformed MiniMax audio %j as a provider failure',
	async (audio) => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				Response.json({
					base_resp: { status_code: 0 },
					data: { audio },
				}),
			),
		);
		await expect(
			ttsProviders.minimax.synthesize({
				text: 'Hola',
				language: 'es',
				model: 'speech-2.8-hd',
				voice: 'Spanish_SereneWoman',
				rate: 1,
				key: 'secret',
			}),
		).rejects.toMatchObject({ status: 502 });
	},
);

it('reports MiniMax STT billing failures without echoing the provider body', async () => {
	vi.stubGlobal(
		'fetch',
		vi
			.fn()
			.mockResolvedValue(
				new Response('secret-provider-detail', { status: 402 }),
			),
	);
	await expect(
		sttProviders.minimax.transcribe({
			audio: new Blob(['audio'], { type: 'audio/wav' }),
			language: 'es',
			model: 'asr-1.0',
			key: 'secret',
		}),
	).rejects.toMatchObject({
		status: 429,
		message: expect.stringContaining('credit'),
	});
});

it.each(['en', 'ja'] as const)(
	'sends %s hints to MiniMax recognition and synthesis',
	async (language) => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(Response.json({ text: 'sample' }))
			.mockResolvedValueOnce(
				Response.json({
					base_resp: { status_code: 0 },
					data: { audio: '0102' },
				}),
			);
		vi.stubGlobal('fetch', fetchMock);
		await sttProviders.minimax.transcribe({
			audio: new Blob(['audio'], { type: 'audio/wav' }),
			language,
			model: 'asr-1.0',
			key: 'synthetic-secret',
		});
		expect(fetchMock.mock.calls[0][1].headers.language).toBe(language);
		await ttsProviders.minimax.synthesize({
			text: language === 'ja' ? 'こんにちは。' : 'Hello.',
			language,
			model: 'speech-2.8-hd',
			voice: 'test-voice',
			rate: 1,
			key: 'synthetic-secret',
		});
		expect(JSON.parse(fetchMock.mock.calls[1][1].body).language_boost).toBe(
			language === 'en' ? 'English' : 'Japanese',
		);
	},
);

it('keeps MiniMax region credentials isolated and preserves international credentials', () => {
	setup();
	saveSpeechSettings(defaultSpeechSettings, { minimax: 'international-key' });
	const china = { ...defaultSpeechSettings, minimaxRegion: 'china' };
	saveSpeechSettings(china, { minimax: 'china-key' });
	expect(readSpeechSettings().minimaxRegion).toBe('china');
	expect(speechKey('minimax')).toBe('china-key');
	saveSpeechSettings(defaultSpeechSettings);
	expect(speechKey('minimax')).toBe('international-key');
	saveSpeechSettings(china);
	expect(speechKey('minimax')).toBe('china-key');
});

it('routes mainland recognition and synthesis to mainland endpoints', async () => {
	setup();
	saveSpeechSettings({ ...defaultSpeechSettings, minimaxRegion: 'china' });
	const urls: string[] = [];
	vi.stubGlobal('fetch', async (url: string) => {
		urls.push(url);
		return Response.json(
			url.endsWith('speech_to_text')
				? { text: 'hello', base_resp: { status_code: 0 } }
				: { data: { audio: 'abcd' }, base_resp: { status_code: 0 } },
		);
	});
	await sttProviders.minimax.transcribe({
		audio: new Blob(['wav'], { type: 'audio/wav' }),
		language: 'en',
		model: 'asr-1.0',
		key: 'cn',
		minimaxRegion: 'china',
	});
	await ttsProviders.minimax.synthesize({
		text: 'hello',
		language: 'en',
		model: 'speech-2.8-hd',
		voice: 'voice',
		rate: 1,
		key: 'cn',
		minimaxRegion: 'china',
	});
	expect(urls).toEqual([
		'https://api.minimaxi.com/v1/speech_to_text',
		'https://api.minimaxi.com/v1/t2a_v2',
	]);
});

it('rejects stale MiniMax region before generating or caching speech', async () => {
	setup();
	saveSpeechSettings(
		{
			minimaxRegion: 'china',
			stt: defaultSpeechSettings.stt,
			tts: { provider: 'minimax', model: 'speech-2.8-hd', voice: 'same-voice' },
		},
		{ minimax: 'cn-key' },
	);
	const { generateSpeech } = await import('../src/lib/server/speech/service');
	await expect(
		generateSpeech('hello', 'en', 1, undefined, {
			provider: 'minimax',
			model: 'speech-2.8-hd',
			voice: 'same-voice',
			minimaxRegion: 'international',
		}),
	).rejects.toThrow('Speech settings changed');
});
