import { json, error, isHttpError } from '@sveltejs/kit';
import { ZodError } from 'zod';
import { readInput } from '$lib/server/http';
import {
	recordingAccess,
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
		const input = await readInput(request, url);
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
