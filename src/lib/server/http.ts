import { error } from '@sveltejs/kit';
export async function readInput(request: Request, url: URL) {
	if (request.headers.get('origin') !== url.origin)
		error(403, 'Please make requests from the app.');
	if (!request.headers.get('content-type')?.includes('application/json'))
		error(415, 'A JSON request is required.');
	const reader = request.body?.getReader();
	if (!reader) error(400, 'The request is empty.');
	let size = 0;
	const chunks: Uint8Array[] = [];
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		size += value.byteLength;
		if (size > 80000) {
			await reader.cancel();
			error(413, 'The content is too long.');
		}
		chunks.push(value);
	}
	try {
		return JSON.parse(Buffer.concat(chunks).toString('utf8'));
	} catch {
		error(400, 'The request format is invalid.');
	}
}
