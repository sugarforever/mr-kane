import { json, error } from '@sveltejs/kit';
import {
	requestSchema,
	parsePractice,
	practiceContentSchema,
} from '#lib/domain';
import {
	configured,
	runCoach,
	hasCoachRequest,
	coachSources,
} from '#lib/server/agent';
import { demoPractice } from '#lib/demo';
import { readInput } from '#lib/server/http';
import { z } from 'zod';
export async function POST({ request, url }) {
	const parsed = requestSchema.safeParse(await readInput(request, url));
	if (!parsed.success) error(400, parsed.error.issues[0].message);
	const input = parsed.data;
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
	const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();
	try {
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
		return json({
			...content,
			id: requestId,
			...(live ? coachSources(requestId) : { sources: [] }),
			profile: input.profile,
			...(input.selectedVocabulary
				? { targetVocabulary: input.selectedVocabulary }
				: {}),
			mode: input.mode,
			origin: live ? 'pi' : 'demo',
			createdAt: new Date().toISOString(),
		});
	} catch {
		error(
			502,
			'Practice generation did not finish. Check your AI connection and search availability, then resume the saved request.',
		);
	}
}
