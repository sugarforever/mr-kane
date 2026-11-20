import { json, error, isHttpError } from '@sveltejs/kit';
import { ZodError } from 'zod';
import { readInput } from '$lib/server/http';
import {
	recordingAccess,
	recordingBody,
	privateRecordingHeaders,
} from '$lib/server/recording-http';
import { learningCommand, readLearning } from '$lib/server/learning-store';
export async function GET({ request, url }) {
	recordingAccess(request, url);
	return json(await readLearning(), { headers: privateRecordingHeaders });
}
export async function POST({ request, url }) {
	recordingAccess(request, url);
	try {
		// Legacy notebooks can exceed the ordinary 80 KB text-generation limit.
		const input =
			request.headers.get('x-learning-import') === '1'
				? JSON.parse(
						(await recordingBody(request, 20 * 1024 * 1024)).toString('utf8'),
					)
				: await readInput(request, url);
		return json(await learningCommand(input), {
			headers: privateRecordingHeaders,
		});
	} catch (e) {
		if (isHttpError(e)) throw e;
		if (e instanceof ZodError || e instanceof SyntaxError)
			error(400, 'The learning record format is invalid.');
		if (
			e instanceof Error &&
			/saved request|request ID|Vocabulary entry/.test(e.message)
		)
			error(409, e.message);
		error(500, 'Learning records could not be saved. Please retry.');
	}
}
