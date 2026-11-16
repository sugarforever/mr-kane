import { json, error } from '@sveltejs/kit';
import { readInput } from '#lib/server/http';
import { connectionInput, discover } from '#lib/server/providers-models';
export async function POST({ request, url }) {
	const body = await readInput(request, url);
	const parsed = connectionInput.safeParse(body);
	if (!parsed.success) error(400, 'Check the connection fields.');
	try {
		return json(
			{ models: await discover(parsed.data) },
			{ headers: { 'cache-control': 'no-store' } },
		);
	} catch (e) {
		error(400, e instanceof Error ? e.message : 'Connection test failed.');
	}
}
