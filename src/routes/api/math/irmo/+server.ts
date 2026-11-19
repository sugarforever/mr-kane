import { error, json } from '@sveltejs/kit';
import { recordingAccess } from '$lib/server/recording-http';
import { readIrmo, searchIrmo, irmoSearchSchema } from '$lib/server/math/irmo';
export async function GET({ request, url }) {
	recordingAccess(request, url);
	const id = url.searchParams.get('id');
	if (id !== null) {
		if (!/^IRMO-20\d{2}-P[12]-Q(?:10|[1-9])$/.test(id))
			error(400, 'Invalid question ID.');
		try {
			return json(await readIrmo(id), {
				headers: { 'Cache-Control': 'private, max-age=3600' },
			});
		} catch {
			error(404, 'Question not found.');
		}
	}
	const raw = Object.fromEntries(url.searchParams);
	const parsed = irmoSearchSchema.safeParse({
		...raw,
		...(raw.year ? { year: Number(raw.year) } : {}),
		...(raw.paper ? { paper: Number(raw.paper) } : {}),
	});
	if (!parsed.success) error(400, 'Choose a valid year, paper and topic.');
	return json(await searchIrmo(parsed.data), {
		headers: { 'Cache-Control': 'private, max-age=3600' },
	});
}
