import { afterEach, expect, it, vi } from 'vitest';
import { speechAudio } from '../src/lib/client/speech-audio';
afterEach(() => {
	vi.unstubAllGlobals();
});
it('reuses downloaded audio across callers and separates voice choices', async () => {
	const fetcher = vi.fn(
		async () =>
			new Response('audio', { headers: { 'Content-Type': 'audio/mpeg' } }),
	);
	vi.stubGlobal('fetch', fetcher);
	const input = {
		text: 'unique-download',
		language: 'es' as const,
		rate: 1,
		provider: 'minimax',
		model: 'speech-2.8-hd',
		voice: 'one',
	};
	const [a, b] = await Promise.all([speechAudio(input), speechAudio(input)]);
	expect(await a.text()).toBe('audio');
	expect(await b.text()).toBe('audio');
	await speechAudio(input);
	expect(fetcher).toHaveBeenCalledTimes(1);
	await speechAudio({ ...input, voice: 'two' });
	expect(fetcher).toHaveBeenCalledTimes(2);
});
it('retries failed downloads instead of caching errors', async () => {
	const fetcher = vi
		.fn()
		.mockResolvedValueOnce(
			Response.json({ message: 'offline' }, { status: 502 }),
		)
		.mockResolvedValueOnce(new Response('audio'));
	vi.stubGlobal('fetch', fetcher);
	const input = {
		text: 'retry-download',
		language: 'es' as const,
		rate: 1,
		provider: 'minimax',
		model: 'speech-2.8-hd',
		voice: 'one',
	};
	await expect(speechAudio(input)).rejects.toThrow('offline');
	expect(await (await speechAudio(input)).text()).toBe('audio');
});

it('loads persisted browser audio after the module is reloaded without downloading again', async () => {
	const saved = new Map<string, Response>();
	vi.stubGlobal('location', { origin: 'https://mr-kane.test' });
	vi.stubGlobal('caches', {
		open: async () => ({
			match: async (key: string) => saved.get(key)?.clone(),
			put: async (key: string, response: Response) => {
				saved.set(key, response.clone());
			},
			keys: async () => [...saved.keys()],
			delete: async (key: string) => saved.delete(key),
		}),
	});
	const fetcher = vi.fn(async () => new Response('persisted audio'));
	vi.stubGlobal('fetch', fetcher);
	const input = {
		text: 'persisted-download',
		language: 'es' as const,
		rate: 1,
		provider: 'minimax',
		model: 'speech-2.8-hd',
		voice: 'one',
	};
	await speechAudio(input);
	expect(saved.size).toBe(1);
	vi.resetModules();
	const reloaded = await import('../src/lib/client/speech-audio');
	expect(await (await reloaded.speechAudio(input)).text()).toBe(
		'persisted audio',
	);
	expect(fetcher).toHaveBeenCalledTimes(1);
});

it('reuses each speed separately when switching speeds and returning to the original', async () => {
	const fetcher = vi.fn(async (_url: string, options: RequestInit) => {
		const { rate } = JSON.parse(options.body as string);
		return new Response(`audio at ${rate}`);
	});
	vi.stubGlobal('fetch', fetcher);
	const input = {
		text: 'speed-dependent-download',
		language: 'es' as const,
		rate: 1,
		provider: 'minimax',
		model: 'speech-2.8-hd',
		voice: 'one',
	};
	expect(await (await speechAudio(input)).text()).toBe('audio at 1');
	expect(await (await speechAudio({ ...input, rate: 0.8 })).text()).toBe(
		'audio at 0.8',
	);
	expect(await (await speechAudio(input)).text()).toBe('audio at 1');
	expect(await (await speechAudio({ ...input, rate: 0.8 })).text()).toBe(
		'audio at 0.8',
	);
	expect(fetcher).toHaveBeenCalledTimes(2);
});
