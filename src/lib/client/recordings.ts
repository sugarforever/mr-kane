import {
	recordingDetailsSchema,
	type RecordingDetails,
} from '#lib/recording-details';
import { listRecordings as listLegacyRecordings } from './legacy-recordings';
export type Recording = RecordingDetails & { blob: Blob };
export function recordingAudioUrl(id: string) {
	return `/api/recordings/${encodeURIComponent(id)}/audio`;
}
async function checked(response: Response) {
	if (!response.ok) {
		let message = 'Recording storage is unavailable. Please try again.';
		try {
			const body = await response.json();
			if (typeof body.message === 'string') message = body.message;
		} catch {
			/* Keep the safe fallback. */
		}
		throw new Error(message);
	}
	return response;
}
export async function saveRecording(recording: Recording) {
	const details = recordingDetailsSchema.parse(recording);
	const form = new FormData();
	form.set('details', JSON.stringify(details));
	form.set('audio', recording.blob, 'recording');
	await checked(await fetch('/api/recordings', { method: 'POST', body: form }));
}
export async function listRecordingDetails(): Promise<RecordingDetails[]> {
	return recordingDetailsSchema
		.array()
		.parse(
			await (
				await checked(await fetch('/api/recordings', { cache: 'no-store' }))
			).json(),
		);
}
export async function recordingBlob(id: string) {
	return (
		await checked(await fetch(recordingAudioUrl(id), { cache: 'no-store' }))
	).blob();
}
export async function listRecordings(
	language?: 'ga' | 'es',
): Promise<Recording[]> {
	const list = (await listRecordingDetails())
		.filter((r) => !language || r.practice.profile.language === language)
		.slice(0, 3);
	return Promise.all(
		list.map(async (r) => ({ ...r, blob: await recordingBlob(r.id) })),
	);
}
export async function deleteRecording(id: string) {
	await checked(
		await fetch(`/api/recordings/${encodeURIComponent(id)}`, {
			method: 'DELETE',
		}),
	);
}
export async function patchRecording(
	id: string,
	patch: Partial<Pick<Recording, 'note' | 'speechCheck'>>,
): Promise<RecordingDetails | undefined> {
	const response = await fetch(`/api/recordings/${encodeURIComponent(id)}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(patch),
	});
	if (response.status === 404) return undefined;
	const details = recordingDetailsSchema.parse(
		await (await checked(response)).json(),
	);
	return details;
}
export async function importBrowserRecordings() {
	const originals = await listLegacyRecordings();
	const result = {
		saved: 0,
		failed: [] as { id: string; title: string; message: string }[],
	};
	for (const original of originals) {
		try {
			await saveRecording(original);
			result.saved++;
		} catch (e) {
			result.failed.push({
				id: original.id,
				title: original.practice.title,
				message: e instanceof Error ? e.message : 'Import failed.',
			});
		}
	}
	return result;
}
