import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { practiceSchema, feedbackSchema, parseFeedback } from '#lib/domain';
import {
	configured,
	runCoach,
	hasCoachRequest,
} from '#lib/server/language-agent';
import { readInput } from '#lib/server/http';
import {
	beginLearningRequest,
	readLearning,
	savedLearningResponse,
	saveLearningResponse,
	LearningRequestConflict,
} from '$lib/server/learning-store';
const inputSchema = z.object({
	practice: practiceSchema,
	text: z.string().trim().min(1).max(12000),
});
export async function POST({ request, url }) {
	const raw = await readInput(request, url);
	const reference = z.object({ attemptId: z.string().min(1) }).safeParse(raw);
	const records = await readLearning();
	const attempt = reference.success
		? records.notebook.attempts.find((a) => a.id === reference.data.attemptId)
		: undefined;
	if (reference.success && !attempt)
		error(404, 'The saved writing attempt was not found.');
	const parsed = inputSchema.safeParse(
		attempt ? { practice: attempt.practice, text: attempt.text } : raw,
	);
	if (!parsed.success)
		error(
			400,
			'Submit a valid practice and some writing, up to 12,000 characters.',
		);
	const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();
	const originalInput = reference.success ? reference.data : parsed.data;
	try {
		const saved = await savedLearningResponse(
			requestId,
			'/api/feedback',
			originalInput,
		);
		if (saved) return json(saved);
	} catch (e) {
		if (e instanceof LearningRequestConflict) error(409, e.message);
		throw e;
	}
	if (!configured() && !hasCoachRequest(request.headers.get('x-request-id')))
		error(
			503,
			'Demo mode is not connected to an AI model. You can save your writing and request feedback after configuring a model.',
		);
	try {
		await beginLearningRequest({
			id: requestId,
			path: '/api/feedback',
			body: originalInput,
			...(attempt ? { attemptId: attempt.id } : {}),
		});
		const feedback = parseFeedback(
			await runCoach(
				'feedback',
				parsed.data,
				z.toJSONSchema(feedbackSchema),
				requestId,
			),
			parsed.data.text,
		);
		const saved = await saveLearningResponse(
			requestId,
			'/api/feedback',
			originalInput,
			feedback,
			(state) => {
				const target =
					attempt ??
					(state.pending?.id === requestId
						? state.notebook.attempts.find(
								(a) => a.id === state.pending?.attemptId,
							)
						: undefined);
				if (target)
					state.notebook.attempts = state.notebook.attempts.map((a) =>
						a.id === target.id ? { ...a, feedback } : a,
					);
			},
		);
		return json(saved);
	} catch (e) {
		if (e instanceof LearningRequestConflict) error(409, e.message);
		error(
			502,
			'Feedback did not finish or its quotes could not be verified. Your writing is kept; please try again.',
		);
	}
}
