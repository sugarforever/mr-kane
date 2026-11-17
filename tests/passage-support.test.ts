import { beforeEach, expect, it, vi } from 'vitest';
import { passageInput, parsePassageTranslation } from '../src/lib/reading';
import { cachePassage, cachedPassage } from '../src/lib/client/passage-cache';
import {
	createPassageSpeech,
	speechChunks,
} from '../src/lib/client/passage-speech';
vi.mock('../src/lib/server/agent', () => ({
	configured: vi.fn(() => true),
	hasCoachRequest: vi.fn(() => false),
	runCoach: vi.fn(async () => '{"paragraphs":["Hello","Goodbye"]}'),
}));
import { POST } from '../src/routes/api/translate-passage/+server';
import { configured, runCoach } from '../src/lib/server/agent';
const url = new URL('http://localhost/api/translate-passage');
function request(body: unknown, origin = url.origin) {
	return {
		url,
		request: new Request(url, {
			method: 'POST',
			headers: { origin, 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
		}),
	};
}
beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(configured).mockReturnValue(true);
	vi.mocked(runCoach).mockResolvedValue('{"paragraphs":["Hello","Goodbye"]}');
});
it('bounds whole passages and validates one translation per original paragraph', () => {
	expect(
		passageInput.safeParse({ text: 'x'.repeat(12000), language: 'ga' }).success,
	).toBe(true);
	for (const text of [
		'',
		'x'.repeat(12001),
		Array(101).fill('word').join('\n\n'),
	])
		expect(passageInput.safeParse({ text, language: 'es' }).success).toBe(
			false,
		);
	expect(
		parsePassageTranslation(
			{ paragraphs: ['Hello', 'Goodbye'] },
			'Hola\n\nAdiós',
		),
	).toEqual(['Hello', 'Goodbye']);
	expect(() =>
		parsePassageTranslation({ paragraphs: ['Hello'] }, 'Hola\n\nAdiós'),
	).toThrow();
});
it('caches by exact text and language without touching practice storage', () => {
	const values = new Map([['mr-kane-notebook', 'keep me']]);
	const store = {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => {
			values.set(key, value);
		},
	};
	cachePassage(store, 'Hola', 'es', ['Hello']);
	expect(cachedPassage(store, 'Hola', 'es')).toEqual(['Hello']);
	expect(cachedPassage(store, 'Hola!', 'es')).toBeUndefined();
	expect(cachedPassage(store, 'Hola', 'ga')).toBeUndefined();
	expect(values.get('mr-kane-notebook')).toBe('keep me');
	for (let i = 0; i < 21; i++) cachePassage(store, String(i), 'ga', ['text']);
	expect(cachedPassage(store, 'Hola', 'es')).toBeUndefined();
});
it('reports cache storage errors instead of pretending to save', () => {
	expect(() =>
		cachePassage(
			{
				getItem: () => null,
				setItem: () => {
					throw new Error('Quota');
				},
			},
			'Hola',
			'es',
			['Hello'],
		),
	).toThrow('Quota');
});
it('translates only passage and language through Pi and preserves paragraph boundaries', async () => {
	const response = await POST(
		request({ text: 'Hola\n\nAdiós', language: 'es' }) as any,
	);
	expect(await response.json()).toEqual({ paragraphs: ['Hello', 'Goodbye'] });
	expect(runCoach).toHaveBeenCalledWith(
		'translate-passage',
		{ text: 'Hola\n\nAdiós', language: 'es' },
		expect.any(Object),
		undefined,
	);
});
it('rejects foreign origins, unavailable AI and mismatched model paragraphs', async () => {
	await expect(
		POST(
			request(
				{ text: 'Hola', language: 'es' },
				'https://foreign.example',
			) as any,
		),
	).rejects.toMatchObject({ status: 403 });
	vi.mocked(configured).mockReturnValueOnce(false);
	await expect(
		POST(request({ text: 'Hola', language: 'es' }) as any),
	).rejects.toMatchObject({ status: 503 });
	await expect(
		POST(request({ text: 'Hola', language: 'es' }) as any),
	).rejects.toMatchObject({ status: 502 });
});
function playback() {
	const synth = {
		cancel: vi.fn(),
		speak: vi.fn(),
		resume: vi.fn(),
		pause: vi.fn(),
	};
	const state = vi.fn();
	const utterances: any[] = [];
	const player = createPassageSpeech(synth as any, state, (text) => {
		const u = { text, onend: null, onerror: null };
		utterances.push(u);
		return u as any;
	});
	const voice = { lang: 'es-ES', localService: true } as SpeechSynthesisVoice;
	return { synth, state, utterances, player, voice };
}
it('plays bounded chunks with an explicit language voice and supports pause/resume', () => {
	const { player, synth, state, utterances, voice } = playback();
	expect(speechChunks('a'.repeat(1000)).every((c) => c.length <= 220)).toBe(
		true,
	);
	player.play('Hola. Adiós.', voice, 0.8);
	expect(utterances[0]).toMatchObject({
		text: 'Hola.',
		voice,
		lang: 'es-ES',
		rate: 0.8,
	});
	player.pause();
	expect(synth.pause).toHaveBeenCalled();
	expect(state).toHaveBeenLastCalledWith('paused');
	player.resume();
	expect(state).toHaveBeenLastCalledWith('playing');
	utterances[0].onend();
	expect(utterances[1].text).toBe('Adiós.');
	utterances[1].onend();
	expect(state).toHaveBeenLastCalledWith('idle');
});
it('stops queued playback safely for recording/navigation and ignores stale callbacks', () => {
	const { player, synth, state, utterances, voice } = playback();
	player.play('Uno. Dos.', voice, 1);
	const staleEnd = utterances[0].onend;
	player.stop();
	staleEnd();
	expect(synth.speak).toHaveBeenCalledTimes(1);
	expect(state).toHaveBeenLastCalledWith('idle');
	player.dispose();
	player.play('Tres.', voice, 1);
	expect(synth.speak).toHaveBeenCalledTimes(1);
});
it('refuses network voices and surfaces genuine speech failures', () => {
	const { player, synth, state, utterances, voice } = playback();
	player.play('Hola', { ...voice, localService: false } as any, 1);
	expect(synth.speak).not.toHaveBeenCalled();
	player.play('Hola', voice, 1);
	utterances[0].onerror({ error: 'audio-busy' });
	expect(state).toHaveBeenLastCalledWith(
		'idle',
		expect.stringContaining('could not play'),
	);
});
