import { error } from '@sveltejs/kit';
export function recordingAccess(request: Request, url: URL) {
	const origin = request.headers.get('origin');
	if (
		(origin && origin !== url.origin) ||
		request.headers.get('sec-fetch-site') === 'cross-site' ||
		(request.method !== 'GET' && origin !== url.origin)
	)
		error(403, 'Please make requests from the app.');
}
export const privateRecordingHeaders = {
	'Cache-Control': 'no-store',
	'X-Content-Type-Options': 'nosniff',
	'Referrer-Policy': 'no-referrer',
};
export async function recordingBody(request: Request, limit: number) {
	if (Number(request.headers.get('content-length')) > limit)
		error(413, 'The recording is too large. Use up to 20 MB of audio.');
	const reader = request.body?.getReader();
	if (!reader) error(400, 'The recording is empty.');
	const chunks: Uint8Array[] = [];
	let size = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			size += value.length;
			if (size > limit) {
				await reader.cancel();
				error(413, 'The recording is too large.');
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}
	return Buffer.concat(chunks);
}
