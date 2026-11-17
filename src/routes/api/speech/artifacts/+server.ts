import { error, json } from '@sveltejs/kit';
import { assertSpeechAudioFormat } from '$lib/server/speech/input';
import { SpeechError } from '$lib/server/speech/contracts';
import {
	audioArtifactLimit,
	putAudioArtifact,
} from '$lib/server/speech/artifacts';
export async function POST({ request, url }) {
	if (request.headers.get('origin') !== url.origin)
		error(403, 'Please make requests from the app.');
	const scope = url.searchParams.get('requestId');
	if (!scope || !/^[a-zA-Z0-9-]{1,80}$/.test(scope))
		error(400, 'A valid requestId is required.');
	const type = request.headers.get('content-type') || '';
	if (
		![
			'audio/webm',
			'audio/mp4',
			'audio/wav',
			'audio/x-wav',
			'audio/mpeg',
			'audio/ogg',
			'audio/flac',
		].includes(type.split(';')[0].trim())
	)
		error(415, 'An audio recording is required.');
	if (Number(request.headers.get('content-length')) > audioArtifactLimit)
		error(413, 'Use up to 20 MB of audio.');
	try {
		assertSpeechAudioFormat(type);
	} catch (cause) {
		if (cause instanceof SpeechError) error(cause.status, cause.message);
		throw cause;
	}
	const reader = request.body?.getReader();
	if (!reader) error(400, 'The recording is empty.');
	const chunks: Uint8Array<ArrayBuffer>[] = [];
	let size = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			size += value.byteLength;
			if (size > audioArtifactLimit) {
				await reader.cancel();
				error(413, 'Use up to 20 MB of audio.');
			}
			chunks.push(new Uint8Array(value));
		}
	} finally {
		reader.releaseLock();
	}
	if (!size) error(400, 'The recording is empty.');
	return json(await putAudioArtifact(new Blob(chunks, { type }), scope), {
		headers: { 'Cache-Control': 'no-store' },
	});
}
