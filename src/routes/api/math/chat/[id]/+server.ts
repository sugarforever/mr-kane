import { json, error } from '@sveltejs/kit';
import { readInput } from '$lib/server/http';
import { mathTurnSchema } from '$lib/math';
import { configured, hasCoachRequest } from '$lib/server/agent';
import { runMathTurn, MathStudyError } from '$lib/server/math/study';
export async function POST({ request, url, params }) {
	const input = mathTurnSchema.safeParse(await readInput(request, url));
	if (!input.success) error(400, input.error.issues[0].message);
	if (!configured() && !hasCoachRequest(`math-${input.data.requestId}`))
		error(503, 'Connect an AI provider to study Math.');
	try {
		return json(
			await runMathTurn(params.id, input.data.requestId, input.data.message),
			{ headers: { 'Cache-Control': 'no-store' } },
		);
	} catch (e) {
		if (e instanceof MathStudyError) error(e.status, e.message);
		error(
			502,
			'The Math coach could not finish. Retry this message to continue the same conversation.',
		);
	}
}
