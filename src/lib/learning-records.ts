import { z } from 'zod';
import {
	profileSchema,
	practiceSchema,
	attemptSchema,
	notebookSchema,
	requestSchema,
} from './domain';
import { languageSchema } from './languages';
export const vocabularyEntrySchema = z.object({
	id: z.string(),
	text: z.string().trim().min(1).max(4000),
	language: languageSchema,
	english: z.string().max(16000),
	createdAt: z.string(),
	reviewedAt: z.string().nullable(),
});
export type VocabularyEntry = z.infer<typeof vocabularyEntrySchema>;
const feedbackInput = z.object({
	practice: practiceSchema,
	text: z.string().trim().min(1).max(12000),
});
export const pendingAISchema = z.discriminatedUnion('path', [
	z.object({
		id: z.string().regex(/^[a-zA-Z0-9-]{1,80}$/),
		path: z.literal('/api/practice'),
		body: requestSchema,
		attemptId: z.string().optional(),
	}),
	z.object({
		id: z.string().regex(/^[a-zA-Z0-9-]{1,80}$/),
		path: z.literal('/api/feedback'),
		body: z.union([feedbackInput, z.object({ attemptId: z.string().min(1) })]),
		attemptId: z.string().optional(),
	}),
]);
export type PendingAI = z.infer<typeof pendingAISchema>;
export const learningRecordsSchema = z.object({
	notebook: notebookSchema,
	profiles: z.partialRecord(languageSchema, profileSchema),
	drafts: z.record(z.string(), z.string().max(12000)),
	vocabulary: z.array(vocabularyEntrySchema),
	pending: pendingAISchema.nullable(),
});
export type LearningRecords = z.infer<typeof learningRecordsSchema>;
export const emptyLearningRecords = (): LearningRecords => ({
	notebook: { version: 1, practices: [], attempts: [], reviews: {} },
	profiles: {},
	drafts: {},
	vocabulary: [],
	pending: null,
});
export const learningCommandSchema = z.discriminatedUnion('type', [
	z.object({ type: z.literal('profile.put'), profile: profileSchema }),
	z.object({ type: z.literal('practice.put'), practice: practiceSchema }),
	z.object({ type: z.literal('attempt.put'), attempt: attemptSchema }),
	z.object({
		type: z.literal('draft.put'),
		practiceId: z.string().min(1),
		text: z.string().max(12000),
	}),
	z.object({
		type: z.literal('review.put'),
		key: z.string().min(1),
		reviewed: z.boolean(),
	}),
	z.object({ type: z.literal('pending.put'), pending: pendingAISchema }),
	z.object({
		type: z.literal('pending.clear'),
		id: z.string().regex(/^[a-zA-Z0-9-]{1,80}$/),
	}),
	z.object({
		type: z.literal('vocabulary.add'),
		entry: vocabularyEntrySchema.pick({
			text: true,
			language: true,
			english: true,
		}),
	}),
	z.object({
		type: z.literal('vocabulary.patch'),
		id: z.string(),
		patch: vocabularyEntrySchema
			.pick({ english: true, reviewedAt: true })
			.partial(),
	}),
	z.object({ type: z.literal('vocabulary.delete'), id: z.string() }),
]);
export type LearningCommand = z.infer<typeof learningCommandSchema>;
