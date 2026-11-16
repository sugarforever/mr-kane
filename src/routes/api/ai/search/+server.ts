import { json, error } from '@sveltejs/kit';
import { readInput } from '#lib/server/http';
import {
	publicSearchSettings,
	saveSearchSettings,
	searchWeb,
} from '#lib/server/research';
export function GET({ request, url }) {
	if (
		request.headers.get('sec-fetch-site') === 'cross-site' ||
		(request.headers.get('origin') &&
			request.headers.get('origin') !== url.origin)
	)
		error(403, 'Same-origin request required.');
	return json(publicSearchSettings(), {
		headers: { 'Cache-Control': 'no-store' },
	});
}
export async function POST({ request, url }) {
	const input = await readInput(request, url);
	try {
		if (input.action === 'test') {
			const result = await searchWeb(
				'how plants grow towards light educational science',
				false,
			);
			if (!result.sources.length) throw new Error();
			return json({ count: result.sources.length });
		}
		return json(saveSearchSettings(input));
	} catch {
		error(
			400,
			'Search could not be configured or reached. Check the API key, quota and connection.',
		);
	}
}
