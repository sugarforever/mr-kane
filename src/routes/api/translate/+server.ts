import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { translationInput, translationOutput } from '$lib/reading';
import {
	configured,
	runCoach,
	hasCoachRequest,
} from '$lib/server/language-agent';
import { readInput } from '$lib/server/http';
export async function POST({ request, url }) {
	const parsed = translationInput.safeParse(await readInput(request, url));
	if (!parsed.success)
		error(
			400,
			'Select between 1 and 4,000 characters of Irish or Spanish reading text.',
		);
	const id = request.headers.get('x-request-id') ?? undefined;
	if (!configured() && !hasCoachRequest(id ?? null))
		error(503, 'Connect an AI model in Settings to translate reading text.');
	try {
		const answer = await runCoach(
			'translate',
			parsed.data,
			z.toJSONSchema(translationOutput),
			id,
		);
		return json(
			translationOutput.parse(
				JSON.parse(
					answer
						.trim()
						.replace(/^```(?:json)?\s*/i, '')
						.replace(/\s*```$/, ''),
				),
			),
		);
	} catch {
		error(502, 'Translation did not finish. Please try again.');
	}
}
