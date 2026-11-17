import { defineTool } from '@earendil-works/pi-durable';
import { z } from 'zod';
import { recognizeSpeech, generateSpeech } from './service';
import { putAudioArtifact, readAudioArtifact } from './artifacts';
import { SpeechError } from './contracts';
import { speechCheckSchema } from '$lib/client/speech-recognition';
import { assertSpeechAudioFormat } from './input';
const language = z.enum(['ga', 'es']);
const recognition = z
	.object({ artifactId: z.string().uuid(), language })
	.strict();
const synthesis = z
	.object({
		text: z.string().trim().min(1).max(4000),
		language,
		rate: z.number().min(0.5).max(1.5).default(1),
	})
	.strict();
function result(value: Record<string, unknown>) {
	return {
		output: [{ type: 'text' as const, text: JSON.stringify(value) }],
		structuredOutput: value as Record<string, string | number>,
	};
}
async function safe<T>(work: () => Promise<T>) {
	try {
		return await work();
	} catch (e) {
		if (e instanceof SpeechError) throw e;
		if (
			e instanceof Error &&
			(e.name === 'AbortError' || e.message.startsWith('Audio artifact'))
		)
			throw e;
		throw new Error('Speech tool failed. Check Speech settings and retry.');
	}
}
/** Scope is the app request ID, never chosen by the model. No paths, URLs or credentials enter tool arguments/results. */
export function createSpeechTools(scope: string) {
	return [
		defineTool({
			name: 'speech_to_text',
			description:
				'Transcribe an uploaded audio artifact for this request in Irish (ga) or Spanish (es), using the speech recognition model in Settings. Returns a transcript, not pronunciation grading. Audio must already match the selected model input format; WAV-only models require WAV rather than WebM/MP4.',
			parameters: z.toJSONSchema(recognition),
			structuredOutputSchema: z.toJSONSchema(speechCheckSchema),
			replay: 'unsafe',
			async execute(args, _api, context) {
				const input = recognition.parse(args);
				context.abortSignal?.throwIfAborted();
				return safe(async () => {
					const audio = await readAudioArtifact(input.artifactId, scope);
					assertSpeechAudioFormat(audio.type);
					context.abortSignal?.throwIfAborted();
					const transcript = await recognizeSpeech(
						audio,
						input.language,
						context.abortSignal,
					);
					context.abortSignal?.throwIfAborted();
					return result(speechCheckSchema.parse(transcript));
				});
			},
		}),
		defineTool({
			name: 'text_to_speech',
			description:
				'Generate AI speech for up to 4,000 characters of Irish (ga) or Spanish (es) with the remote model and voice selected in Speech settings. Returns a private audio artifact reference. Local browser voices require UI playback and cannot generate server audio.',
			parameters: z.toJSONSchema(synthesis, { io: 'input' }),
			structuredOutputSchema: {
				type: 'object',
				properties: {
					artifactId: { type: 'string' },
					mimeType: { type: 'string' },
					bytes: { type: 'integer' },
					expiresAt: { type: 'string' },
				},
				required: ['artifactId', 'mimeType', 'bytes', 'expiresAt'],
				additionalProperties: false,
			},
			replay: 'unsafe',
			async execute(args, _api, context) {
				const input = synthesis.parse(args);
				context.abortSignal?.throwIfAborted();
				return safe(async () => {
					const speech = await generateSpeech(
						input.text,
						input.language,
						input.rate,
						context.abortSignal,
					);
					context.abortSignal?.throwIfAborted();
					return result(
						await putAudioArtifact(
							new Blob([speech.audio], { type: speech.mimeType }),
							scope,
						),
					);
				});
			},
		}),
	];
}
