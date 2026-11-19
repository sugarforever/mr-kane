import { error } from '@sveltejs/kit';
import { readInput } from '$lib/server/http';
import { synthesisInput } from '$lib/speech';
import { generateSpeech } from '$lib/server/speech/service';
import { SpeechError } from '$lib/server/speech/contracts';
export async function POST({ request, url }) {
	const input = synthesisInput.safeParse(await readInput(request, url));
	if (!input.success || input.data.text.length > 4000)
		error(
			400,
			'Use up to 4,000 characters of the selected learning language per speech segment.',
		);
	try {
		const result = await generateSpeech(
			input.data.text,
			input.data.language,
			input.data.rate,
			request.signal,
			input.data.expectedVoice,
		);
		return new Response(result.audio, {
			headers: { 'Content-Type': result.mimeType, 'Cache-Control': 'no-store' },
		});
	} catch (cause) {
		if (cause instanceof SpeechError) error(cause.status, cause.message);
		error(502, 'Speech generation failed. Please retry.');
	}
}
