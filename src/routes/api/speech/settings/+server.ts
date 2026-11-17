import { json, error } from '@sveltejs/kit';
import { readInput } from '$lib/server/http';
import {
	publicSpeechSettings,
	saveSpeechSettings,
} from '$lib/server/speech/settings';
const headers = { 'cache-control': 'no-store' };
export function GET({ request, url }) {
	if (
		request.headers.get('sec-fetch-site') === 'cross-site' ||
		(request.headers.get('origin') &&
			request.headers.get('origin') !== url.origin)
	)
		error(403, 'Open speech settings from the app.');
	return json(publicSpeechSettings(), { headers });
}
export async function POST({ request, url }) {
	const input = await readInput(request, url);
	try {
		saveSpeechSettings(input.settings, input.apiKeys);
		return json(publicSpeechSettings(), { headers });
	} catch {
		error(400, 'Check the speech provider, model, voice and key fields.');
	}
}
