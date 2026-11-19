import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
type Audio = { audio: ArrayBuffer; mimeType: string };
type Identity = {
	text: string;
	language: string;
	rate: number;
	provider: string;
	model: string;
	voice: string;
	minimaxRegion?: string;
};
const pending = new Map<string, Promise<Audio>>();
// Version the key when provider output options change. Credentials never enter the cache.
export async function cachedSpeech(
	directory: string,
	input: Identity,
	generate: () => Promise<Audio>,
): Promise<Audio> {
	const hash = createHash('sha256')
		.update(
			JSON.stringify([
				1,
				input.text,
				input.language,
				input.rate,
				input.provider,
				input.model,
				input.voice,
				input.provider === 'minimax'
					? (input.minimaxRegion ?? 'international')
					: undefined,
			]),
		)
		.digest('hex');
	const file = join(directory, hash);
	const existing = pending.get(file);
	if (existing) return existing;
	const job = (async () => {
		try {
			const bytes = await readFile(file);
			const boundary = bytes.indexOf(10);
			const mimeType = bytes.subarray(0, boundary).toString();
			if (
				boundary > 0 &&
				boundary < 100 &&
				mimeType.startsWith('audio/') &&
				bytes.length > boundary + 1
			) {
				return {
					mimeType,
					audio: Uint8Array.from(bytes.subarray(boundary + 1)).buffer,
				};
			}
		} catch {
			/* A missing/unreadable cache must not prevent playback. */
		}
		const result = await generate();
		if (result.audio.byteLength) {
			const temporary = `${file}.${randomUUID()}.tmp`;
			try {
				await mkdir(directory, { recursive: true, mode: 0o700 });
				await writeFile(
					temporary,
					Buffer.concat([
						Buffer.from(result.mimeType + '\n'),
						Buffer.from(result.audio),
					]),
					{ mode: 0o600 },
				);
				await rename(temporary, file);
			} catch {
				/* Playback remains available when disk storage is unavailable. */
			} finally {
				await unlink(temporary).catch(() => {});
			}
		}
		return result;
	})();
	pending.set(file, job);
	try {
		return await job;
	} finally {
		pending.delete(file);
	}
}
