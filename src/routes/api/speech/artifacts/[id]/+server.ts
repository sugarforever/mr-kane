import { error } from '@sveltejs/kit';
import { readAudioArtifact } from '$lib/server/speech/artifacts';
export async function GET({ request, url, params }) {
	const origin = request.headers.get('origin');
	if (
		(origin && origin !== url.origin) ||
		request.headers.get('sec-fetch-site') === 'cross-site'
	)
		error(403, 'Please make requests from the app.');
	const scope = url.searchParams.get('requestId');
	if (!scope || !/^[a-zA-Z0-9-]{1,80}$/.test(scope))
		error(400, 'A valid requestId is required.');
	try {
		const audio = await readAudioArtifact(params.id, scope);
		return new Response(audio, {
			headers: {
				'Content-Type': audio.type,
				'Cache-Control': 'no-store',
				'X-Content-Type-Options': 'nosniff',
				'Referrer-Policy': 'no-referrer',
			},
		});
	} catch {
		error(404, 'Audio artifact is unavailable or expired for this request.');
	}
}
