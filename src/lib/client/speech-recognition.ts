import { z } from 'zod';
export const speechCheckSchema = z.object({
	transcript: z.string().trim().max(12000),
	status: z.enum(['complete', 'partial', 'unavailable']),
	message: z.string().max(1000).optional(),
});
export type SpeechCheck = z.infer<typeof speechCheckSchema>;
