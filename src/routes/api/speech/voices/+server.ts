import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { readInput } from '$lib/server/http';
import { speechKey } from '$lib/server/speech/settings';
import { miniMaxVoices } from '$lib/server/speech/voices';
export async function GET({ request, url }) {
	if (
		request.headers.get('sec-fetch-site') === 'cross-site' ||
		(request.headers.get('origin') &&
			request.headers.get('origin') !== url.origin)
	)
		error(403, 'Open speech settings from the app.');
	return voiceResponse(speechKey('minimax'));
}
export async function POST({ request, url }) {
	const input = z
		.object({ key: z.string().trim().min(1).max(8192) })
		.strict()
		.safeParse(await readInput(request, url));
	if (!input.success) error(400, 'Enter a MiniMax audio API key.');
	return voiceResponse(input.data.key);
}
async function voiceResponse(key: string | undefined) {
	if (!key) error(400, 'Enter a MiniMax audio API key and refresh voices.');
	try {
		return json(
			{ voices: await miniMaxVoices(key) },
			{ headers: { 'cache-control': 'no-store' } },
		);
	} catch {
		error(
			502,
			'Could not load MiniMax voices. Check your API key and audio access, then retry.',
		);
	}
}
