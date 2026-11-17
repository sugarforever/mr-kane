import { json, error } from '@sveltejs/kit';
import { recognizeSpeech } from '$lib/server/speech/service';
import { SpeechError } from '$lib/server/speech/contracts';
const audioLimit = 20 * 1024 * 1024;
export async function POST({ request, url }) {
	if (request.headers.get('origin') !== url.origin)
		error(403, 'Please make requests from the app.');
	const language = request.headers.get('x-reading-language');
	if (language !== 'ga' && language !== 'es')
		error(400, 'Choose Irish or Spanish for speech recognition.');
	const type = request.headers.get('content-type') ?? '';
	if (
		!['audio/webm', 'audio/mp4', 'audio/wav', 'audio/x-wav'].includes(
			type.split(';')[0].trim(),
		)
	)
		error(415, 'Use a WebM, MP4 or WAV audio recording.');
	if (Number(request.headers.get('content-length')) > audioLimit)
		error(413, 'Recording is too large. Use up to 20 MB.');
	const reader = request.body?.getReader();
	if (!reader) error(400, 'The recording is empty.');
	let size = 0;
	const chunks: Uint8Array<ArrayBuffer>[] = [];
	try {
		while (true) {
			const { value, done } = await reader.read();
			if (done) break;
			size += value.byteLength;
			if (size > audioLimit) {
				await reader.cancel();
				error(413, 'Recording is too large. Use up to 20 MB.');
			}
			chunks.push(new Uint8Array(value));
		}
	} finally {
		reader.releaseLock();
	}
	if (!size) error(400, 'The recording is empty.');
	try {
		return json(
			await recognizeSpeech(
				new Blob(chunks, { type }),
				language,
				request.signal,
			),
		);
	} catch (cause) {
		if (cause instanceof SpeechError) error(cause.status, cause.message);
		error(
			502,
			'Speech recognition did not finish. Your recording is kept in this browser. Check the selected speech provider, audio access and billing, then retry.',
		);
	}
}
