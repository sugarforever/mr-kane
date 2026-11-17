import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { practiceSchema, feedbackSchema, parseFeedback } from '#lib/domain';
import { configured, runCoach, hasCoachRequest } from '#lib/server/agent';
import { readInput } from '#lib/server/http';
const inputSchema = z.object({
	practice: practiceSchema,
	text: z.string().trim().min(1).max(12000),
});
export async function POST({ request, url }) {
	const parsed = inputSchema.safeParse(await readInput(request, url));
	if (!parsed.success)
		error(
			400,
			'Submit a valid practice and some writing, up to 12,000 characters.',
		);
	if (!configured() && !hasCoachRequest(request.headers.get('x-request-id')))
		error(
			503,
			'Demo mode is not connected to an AI model. You can save your writing and request feedback after configuring a model.',
		);
	try {
		return json(
			parseFeedback(
				await runCoach(
					'feedback',
					parsed.data,
					z.toJSONSchema(feedbackSchema),
					request.headers.get('x-request-id') ?? undefined,
				),
				parsed.data.text,
			),
		);
	} catch {
		error(
			502,
			'Feedback did not finish or its quotes could not be verified. Your writing is kept; please try again.',
		);
	}
}
