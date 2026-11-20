import { json, error } from '@sveltejs/kit';
import {
	requestSchema,
	parsePractice,
	practiceContentSchema,
	practiceSchema,
} from '#lib/domain';
import {
	configured,
	runCoach,
	hasCoachRequest,
	coachSources,
} from '#lib/server/language-agent';
import { demoPractice } from '#lib/demo';
import { readInput } from '#lib/server/http';
import { z } from 'zod';
import { validateReadingScript } from '$lib/reading-levels';
import {
	beginLearningRequest,
	savedLearningResponse,
	saveLearningResponse,
	LearningRequestConflict,
} from '$lib/server/learning-store';
export async function POST({ request, url }) {
	const parsed = requestSchema.safeParse(await readInput(request, url));
	if (!parsed.success) error(400, parsed.error.issues[0].message);
	const input = parsed.data;
	const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();
	try {
		const saved = await savedLearningResponse(
			requestId,
			'/api/practice',
			input,
		);
		if (saved) return json(saved);
	} catch (e) {
		if (e instanceof LearningRequestConflict) error(409, e.message);
		throw e;
	}
	const live =
		configured() || hasCoachRequest(request.headers.get('x-request-id'));
	if (!live && input.selectedVocabulary)
		error(
			503,
			'Connect an AI model in Settings to generate practice from your vocabulary.',
		);
	if (!live && ['news', 'exam'].includes(input.sourceType))
		error(
			503,
			'Source-based practice needs an AI model. Connect one, or explore a fixed Everyday life or Science sample.',
		);
	try {
		await beginLearningRequest({
			id: requestId,
			path: '/api/practice',
			body: input,
		});
		const content = live
			? parsePractice(
					await runCoach(
						'practice',
						input,
						z.toJSONSchema(practiceContentSchema),
						requestId,
					),
				)
			: demoPractice(input);
		if (input.mode === 'speaking' && input.readingUnit)
			validateReadingScript(
				content.script,
				input.readingUnit,
				input.selectedVocabulary?.length,
			);
		const practice = practiceSchema.parse({
			...content,
			id: requestId,
			...(live ? coachSources(requestId) : { sources: [] }),
			profile: input.profile,
			...(input.selectedVocabulary
				? { targetVocabulary: input.selectedVocabulary }
				: {}),
			mode: input.mode,
			...(input.mode === 'speaking' && input.readingUnit
				? { readingUnit: input.readingUnit }
				: {}),
			origin: live ? 'pi' : 'demo',
			createdAt: new Date().toISOString(),
		});
		const saved = await saveLearningResponse(
			requestId,
			'/api/practice',
			input,
			practice,
			(state) => {
				state.notebook.practices = [
					practice,
					...state.notebook.practices.filter((p) => p.id !== practice.id),
				];
			},
		);
		return json(saved);
	} catch (e) {
		if (e instanceof LearningRequestConflict) error(409, e.message);
		error(
			502,
			'Practice generation did not finish or did not match the selected reading unit. Resume the saved request to recover it, or dismiss it and generate again.',
		);
	}
}
