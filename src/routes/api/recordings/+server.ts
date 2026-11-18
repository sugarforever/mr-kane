import { error, json } from '@sveltejs/kit';
import {
	listRecordingDetails,
	putRecording,
	RecordingConflict,
} from '$lib/server/recordings';
import {
	recordingAccess,
	recordingBody,
	privateRecordingHeaders as headers,
} from '$lib/server/recording-http';
import {
	recordingAudioLimit,
	recordingDetailsSchema,
	recordingTypes,
} from '$lib/recording-details';
export function GET({ request, url }) {
	recordingAccess(request, url);
	return json(listRecordingDetails(), { headers });
}
export async function POST({ request, url }) {
	recordingAccess(request, url);
	if (!request.headers.get('content-type')?.startsWith('multipart/form-data;'))
		error(415, 'An audio upload is required.');
	const bytes = await recordingBody(request, recordingAudioLimit + 256 * 1024);
	let form: FormData;
	try {
		form = await new Request(url, {
			method: 'POST',
			headers: { 'Content-Type': request.headers.get('content-type')! },
			body: bytes,
		}).formData();
	} catch {
		error(400, 'Invalid recording upload.');
	}
	const audio = form.get('audio');
	const raw = form.get('details');
	if (
		!(audio instanceof Blob) ||
		typeof raw !== 'string' ||
		raw.length > 200000
	)
		error(400, 'Audio and practice details are required.');
	if (!recordingTypes.has(audio.type.split(';')[0].trim()))
		error(415, 'An audio recording is required.');
	if (!audio.size) error(400, 'The recording is empty.');
	if (audio.size > recordingAudioLimit) error(413, 'Use up to 20 MB of audio.');
	let details;
	try {
		details = recordingDetailsSchema.parse(JSON.parse(raw));
	} catch {
		error(400, 'Invalid practice details.');
	}
	try {
		putRecording(
			details,
			new Uint8Array(await audio.arrayBuffer()),
			audio.type,
		);
	} catch (cause) {
		if (cause instanceof RecordingConflict) error(409, cause.message);
		throw cause;
	}
	return json({ id: details.id }, { headers });
}
