import { json, error } from '@sveltejs/kit';
import { recordingAccess } from '$lib/server/recording-http';
import {
	getMathSession,
	discardMathTurn,
	importMathPending,
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
		.object({
			action: z.enum(['discard', 'import-pending']),
			requestId: z.string().uuid(),
			message: z.string().trim().min(1).max(6000).optional(),
		})
		.strict()
		.safeParse(await readInput(request, url));
	if (!input.success) error(400, 'Invalid conversation action.');
	try {
		return json(
			input.data.action === 'import-pending'
				? await importMathPending(params.id, {
						requestId: input.data.requestId,
						message: input.data.message,
					})
				: await discardMathTurn(params.id, input.data.requestId),
			{
				headers: { 'Cache-Control': 'no-store' },
			},
		);
	} catch (e) {
		if (e instanceof MathStudyError) error(e.status, e.message);
		throw e;
	}
}
