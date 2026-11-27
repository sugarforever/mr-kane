import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { readInput } from '$lib/server/http';
import { openMathLesson, MathStudyError } from '$lib/server/math/study';
const inputSchema = z
	.object({
		ownerSessionId: z.string().uuid(),
		planId: z.string().trim().min(1).max(1600),
		courseId: z.string().regex(/^V[12]-C\d{2}$/),
	})
	.strict();
export async function POST({ request, url }) {
	const input = inputSchema.safeParse(await readInput(request, url));
	if (!input.success) error(400, 'Invalid lesson.');
	try {
		return json(
			await openMathLesson(
				input.data.ownerSessionId,
				input.data.planId,
				input.data.courseId,
			),
			{ headers: { 'Cache-Control': 'no-store' } },
		);
	} catch (e) {
		if (e instanceof MathStudyError) error(e.status, e.message);
		throw e;
	}
}
