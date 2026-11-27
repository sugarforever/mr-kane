import { json } from '@sveltejs/kit';
import { recordingAccess } from '$lib/server/recording-http';
import { listMathPlans } from '$lib/server/math/study';
export async function GET({ request, url }) {
	recordingAccess(request, url);
	return json(await listMathPlans(), {
		headers: { 'Cache-Control': 'no-store' },
	});
}
