import { readFile } from 'node:fs/promises';
import { error } from '@sveltejs/kit';
import { recordingAccess } from '$lib/server/recording-http';
import { mathAssetPath } from '$lib/server/math/library';
export async function GET({ request, url, params }) {
	recordingAccess(request, url);
	let path: string;
	try {
		path = mathAssetPath(params.path);
	} catch {
		error(404, 'Image not found.');
	}
	try {
		return new Response(new Uint8Array(await readFile(path)), {
			headers: {
				'Content-Type': 'image/png',
				'Cache-Control': 'private, max-age=86400',
				'X-Content-Type-Options': 'nosniff',
			},
		});
	} catch {
		error(404, 'Image not found.');
	}
}
