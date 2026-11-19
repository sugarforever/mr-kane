import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import {
	passageInput,
	passageOutput,
	parsePassageTranslation,
} from '$lib/reading';
import {
	configured,
	runCoach,
	hasCoachRequest,
} from '$lib/server/language-agent';
import { readInput } from '$lib/server/http';
export async function POST({ request, url }) {
	const input = passageInput.safeParse(await readInput(request, url));
	if (!input.success)
		error(
			400,
			'Use an the selected learning language passage of up to 12,000 characters and 100 paragraphs.',
		);
	const id = request.headers.get('x-request-id') ?? undefined;
	if (!configured() && !hasCoachRequest(id ?? null))
		error(
			503,
			'Connect an AI model in AI Providers to show an English translation.',
		);
	try {
		const answer = await runCoach(
			'translate-passage',
			input.data,
			z.toJSONSchema(passageOutput),
			id,
		);
		const value = JSON.parse(
			answer
				.trim()
				.replace(/^```(?:json)?\s*/i, '')
				.replace(/\s*```$/, ''),
		);
		return json({
			paragraphs: parsePassageTranslation(value, input.data.text),
		});
	} catch {
		error(502, 'Passage translation did not finish. Please try again.');
	}
}
