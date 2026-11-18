import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cachedSpeech } from '../src/lib/server/speech/cache';
const dirs: string[] = [];
afterEach(async () => {
	await Promise.all(
		dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
	);
});
async function directory() {
	const dir = await mkdtemp(join(tmpdir(), 'speech-cache-'));
	dirs.push(dir);
	return dir;
}
const identity = {
	text: 'Hola',
	language: 'es',
	rate: 1,
	provider: 'minimax',
	model: 'speech-2.8-hd',
	voice: 'voice',
};
it('persists audio and coalesces simultaneous generation for the same identity', async () => {
	const dir = await directory();
	const generate = vi.fn(async () => ({
		audio: new TextEncoder().encode('sound').buffer,
		mimeType: 'audio/mpeg',
	}));
	const results = await Promise.all([
		cachedSpeech(dir, identity, generate),
		cachedSpeech(dir, identity, generate),
	]);
	expect(generate).toHaveBeenCalledTimes(1);
	expect(new TextDecoder().decode(results[0].audio)).toBe('sound');
	const fail = async () => {
		throw new Error('must use disk');
	};
	expect((await cachedSpeech(dir, identity, fail)).mimeType).toBe('audio/mpeg');
});
it('separates all synthesis settings and never caches failures', async () => {
	const dir = await directory();
	const generate = vi.fn(async () => ({
		audio: new ArrayBuffer(2),
		mimeType: 'audio/mpeg',
	}));
	await cachedSpeech(dir, identity, generate);
	for (const change of [
		{ text: 'Adiós' },
		{ language: 'ga' },
		{ rate: 0.8 },
		{ provider: 'openai' },
		{ model: 'other' },
		{ voice: 'other' },
	])
		await cachedSpeech(dir, { ...identity, ...change }, generate);
	expect(generate).toHaveBeenCalledTimes(7);
	const changed = { ...identity, text: 'retry' };
	await expect(
		cachedSpeech(dir, changed, async () => {
			throw new Error('offline');
		}),
	).rejects.toThrow('offline');
	await cachedSpeech(dir, changed, generate);
	expect(generate).toHaveBeenCalledTimes(8);
});
