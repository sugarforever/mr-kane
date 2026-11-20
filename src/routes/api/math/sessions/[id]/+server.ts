import { json, error } from '@sveltejs/kit';
import { recordingAccess } from '$lib/server/recording-http';
import {
	getMathSession,
	discardMathTurn,
	MathStudyError,
} from '$lib/server/math/study';
export async function GET({ request, url, params }) {
	recordingAccess(request, url);
	try {
		return json(await getMathSession(params.id), {
			headers: { 'Cache-Control': 'no-store' },
		});
	} catch (e) {
		if (e instanceof MathStudyError) error(e.status, e.message);
		throw e;
	}
}

import { readInput } from '$lib/server/http';
import { z } from 'zod';
export async function POST({ request, url, params }) {
	const input = z
		.object({ action: z.literal('discard'), requestId: z.string().uuid() })
		.strict()
		.safeParse(await readInput(request, url));
	if (!input.success) error(400, 'Invalid conversation action.');
	try {
		return json(await discardMathTurn(params.id, input.data.requestId), {
			headers: { 'Cache-Control': 'no-store' },
		});
	} catch (e) {
		if (e instanceof MathStudyError) error(e.status, e.message);
		throw e;
	}
}
