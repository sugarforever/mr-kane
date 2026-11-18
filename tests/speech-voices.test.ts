import { afterEach, expect, it, vi } from 'vitest';
import { miniMaxVoices } from '../src/lib/server/speech/voices';
import { defaultSpeechSettings, speechSettingsSchema } from '../src/lib/speech';
afterEach(() => vi.unstubAllGlobals());
it('loads system, cloned and generated voices with API labels', async () => {
	vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
		expect(url).toBe('https://api.minimax.io/v1/get_voice');
		expect(JSON.parse(init.body as string)).toEqual({ voice_type: 'all' });
		expect(init.headers).toMatchObject({ Authorization: 'Bearer test-key' });
		return Response.json({
			system_voice: [{ voice_id: 'new-spanish', voice_name: 'New Spanish' }],
			voice_cloning: [{ voice_id: 'my-clone' }],
			voice_generation: [{ voice_id: 'my-generated' }],
			base_resp: { status_code: 0 },
		});
	});
	expect(await miniMaxVoices('test-key')).toEqual([
		{ id: 'new-spanish', label: 'New Spanish' },
		{ id: 'my-clone', label: 'my-clone' },
		{ id: 'my-generated', label: 'my-generated' },
	]);
});
it('rejects API errors instead of presenting an empty catalog', async () => {
	vi.stubGlobal('fetch', async () =>
		Response.json({ base_resp: { status_code: 1004, status_msg: 'secret' } }),
	);
	await expect(miniMaxVoices('key')).rejects.toThrow(
		'Could not load MiniMax voices',
	);
});
it('accepts API voice IDs outside the former shortlist', () => {
	expect(
		speechSettingsSchema.safeParse({
			...defaultSpeechSettings,
			tts: {
				provider: 'minimax',
				model: 'speech-2.8-hd',
				voice: 'new-spanish',
			},
		}).success,
	).toBe(true);
});
it('loads voices with an entered key before settings are saved', async () => {
	const route = await import('../src/routes/api/speech/voices/+server');
	vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
		expect(init.headers).toMatchObject({ Authorization: 'Bearer entered-key' });
		return Response.json({
			system_voice: [{ voice_id: 'new-voice' }],
			base_resp: { status_code: 0 },
		});
	});
	const response = await route.POST({
		request: new Request('http://localhost/api/speech/voices', {
			method: 'POST',
			headers: {
				origin: 'http://localhost',
				'content-type': 'application/json',
			},
			body: JSON.stringify({ key: 'entered-key' }),
		}),
		url: new URL('http://localhost/api/speech/voices'),
	} as any);
	expect(await response.json()).toEqual({
		voices: [{ id: 'new-voice', label: 'new-voice' }],
	});
});
