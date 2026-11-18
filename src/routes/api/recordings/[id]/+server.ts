import { error, json } from '@sveltejs/kit';
import {
	getRecording,
	patchRecordingDetails,
	removeRecording,
} from '$lib/server/recordings';
import {
	recordingAccess,
	privateRecordingHeaders as headers,
} from '$lib/server/recording-http';
import { readInput } from '$lib/server/http';
import { recordingPatchSchema } from '$lib/recording-details';
export function GET({ request, url, params }) {
	recordingAccess(request, url);
	const row = getRecording(params.id);
	if (!row) error(404, 'Recording not found.');
	return json(row.details, { headers });
}
export async function PATCH({ request, url, params }) {
	recordingAccess(request, url);
	const input = await readInput(request, url);
	const patch = recordingPatchSchema.safeParse(input);
	if (!patch.success) error(400, 'Invalid note or reading feedback.');
	const updated = patchRecordingDetails(params.id, patch.data);
	if (!updated) error(404, 'Recording not found.');
	return json(updated, { headers });
}
export function DELETE({ request, url, params }) {
	recordingAccess(request, url);
	removeRecording(params.id);
	return json({ deleted: true }, { headers });
}
