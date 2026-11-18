import { z } from 'zod';
import { practiceSchema } from '#lib/domain';
import { speechCheckSchema } from '#lib/client/speech-recognition';
export const recordingDetailsSchema = z.object({
	id: z.string().regex(/^[a-zA-Z0-9-]{1,80}$/),
	practice: practiceSchema,
	duration: z.number().finite().min(0).max(3600),
	createdAt: z
		.string()
		.max(80)
		.refine((s) => Number.isFinite(Date.parse(s)), 'Invalid recording date'),
	note: z.string().max(1000),
	targetText: z.string().max(20000).optional(),
	speechCheck: speechCheckSchema.optional(),
});
export const recordingPatchSchema = recordingDetailsSchema
	.pick({ note: true, speechCheck: true })
	.partial()
	.strict();
export type RecordingDetails = z.infer<typeof recordingDetailsSchema>;
export const recordingAudioLimit = 20 * 1024 * 1024;
export const recordingTypes = new Set([
	'audio/webm',
	'audio/mp4',
	'audio/wav',
	'audio/x-wav',
	'audio/mpeg',
	'audio/ogg',
	'audio/flac',
]);
