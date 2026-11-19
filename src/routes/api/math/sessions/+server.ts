import { json } from '@sveltejs/kit';
import { readInput } from '$lib/server/http';
import { recordingAccess } from '$lib/server/recording-http';
import { createMathSession, listMathSessions } from '$lib/server/math/study';
export function GET({ request, url }) {
	recordingAccess(request, url);
	return json(listMathSessions(), { headers: { 'Cache-Control': 'no-store' } });
}
export async function POST({ request, url }) {
	await readInput(request, url);
	return json(createMathSession(), {
		status: 201,
		headers: { 'Cache-Control': 'no-store' },
	});
}
