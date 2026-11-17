import { randomUUID } from 'node:crypto';
import {
	mkdir,
	writeFile,
	readFile,
	stat,
	readdir,
	unlink,
} from 'node:fs/promises';
import { join } from 'node:path';
import { dataDir } from '../providers-store';
export const audioArtifactLimit = 20 * 1024 * 1024;
const lifetime = 24 * 60 * 60 * 1000;
const types = new Set([
	'audio/webm',
	'audio/mp4',
	'audio/wav',
	'audio/x-wav',
	'audio/mpeg',
	'audio/ogg',
	'audio/flac',
]);
const validId =
	/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function directory() {
	return join(dataDir(), 'speech-artifacts');
}
function path(id: string) {
	if (!validId.test(id)) throw new Error('Invalid audio artifact ID.');
	return join(directory(), id);
}
export async function putAudioArtifact(audio: Blob, scope: string) {
	const mimeType = audio.type.split(';')[0].trim();
	if (!scope || scope.length > 80)
		throw new Error('Invalid audio artifact scope.');
	if (!types.has(mimeType))
		throw new Error('Unsupported audio artifact format.');
	if (!audio.size || audio.size > audioArtifactLimit)
		throw new Error('Audio must contain between 1 byte and 20 MB.');
	await mkdir(directory(), { recursive: true, mode: 0o700 });
	// Expired artifacts are removed on the next upload/generation, or when read.
	for (const id of await readdir(directory())) {
		if (!validId.test(id)) continue;
		try {
			if ((await stat(path(id))).mtimeMs < Date.now() - lifetime)
				await unlink(path(id));
		} catch {
			/* Concurrent cleanup is harmless. */
		}
	}
	const artifactId = randomUUID();
	const expiresAt = new Date(Date.now() + lifetime).toISOString();
	const metadata = { scope, mimeType, expiresAt };
	await writeFile(
		path(artifactId),
		Buffer.concat([
			Buffer.from(JSON.stringify(metadata) + '\n'),
			Buffer.from(await audio.arrayBuffer()),
		]),
		{ mode: 0o600, flag: 'wx' },
	);
	return { artifactId, mimeType, bytes: audio.size, expiresAt };
}
export async function readAudioArtifact(id: string, scope: string) {
	const file = path(id);
	try {
		const info = await stat(file);
		if (info.size > audioArtifactLimit + 1024) throw new Error();
		const bytes = await readFile(file);
		const boundary = bytes.indexOf(10);
		if (boundary < 0 || boundary > 1024) throw new Error();
		const meta = JSON.parse(bytes.subarray(0, boundary).toString('utf8'));
		if (Date.parse(meta.expiresAt) <= Date.now()) {
			await unlink(file);
			throw new Error();
		}
		if (
			meta.scope !== scope ||
			!types.has(meta.mimeType) ||
			!Number.isFinite(Date.parse(meta.expiresAt))
		)
			throw new Error();
		return new Blob([bytes.subarray(boundary + 1)], { type: meta.mimeType });
	} catch {
		throw new Error(
			'Audio artifact is unavailable or expired for this request.',
		);
	}
}
