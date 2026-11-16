import { z } from 'zod';
const short = z.string().trim().min(1).max(2000);
export const profileSchema = z.object({
	language: z.enum(['ga', 'es']),
	level: z.enum(['A1', 'A2', 'B1', 'B2']),
	ageGroup: z.enum(['Middle school', 'High school']),
	interests: z.string().max(500),
	vocabulary: z.string().max(1000),
	grammar: z.string().max(1000),
});
export type Profile = z.infer<typeof profileSchema>;
export const requestSchema = z.object({
	profile: profileSchema,
	mode: z.enum(['writing', 'speaking']),
	sourceType: z.enum(['daily', 'science', 'nature', 'news', 'exam']),
	material: z.string().max(12000),
	research: z.boolean().optional(),
});
export const sourceSchema = z.object({
	title: z.string().max(300),
	url: z.url().refine((v) => /^https?:\/\//.test(v)),
	publishedAt: z.string().max(80).optional(),
	excerpt: z.string().max(1800),
});
export type Source = z.infer<typeof sourceSchema>;
export type PracticeRequest = z.infer<typeof requestSchema>;
export const practiceContentSchema = z.object({
	title: short,
	prompt: short,
	script: z.string().trim().min(1).max(12000),
	vocabulary: z.array(short).min(1).max(12),
	focus: short,
	sourceNote: short,
});
export const practiceSchema = practiceContentSchema.extend({
	id: z.string(),
	sources: z.array(sourceSchema).max(4).default([]),
	searchedAt: z.string().optional(),
	searchQuery: z.string().optional(),
	profile: profileSchema,
	mode: z.enum(['writing', 'speaking']),
	origin: z.enum(['demo', 'pi', 'user']),
	createdAt: z.string(),
});
export type Practice = z.infer<typeof practiceSchema>;
export const feedbackSchema = z.object({
	encouragement: short,
	points: z
		.array(
			z.object({
				quote: short,
				category: short,
				explanation: short,
				hint: short,
				suggestion: short,
			}),
		)
		.max(5),
});
export type Feedback = z.infer<typeof feedbackSchema>;
export const attemptSchema = z.object({
	id: z.string(),
	practice: practiceSchema,
	text: z.string().trim().min(1).max(12000),
	feedback: feedbackSchema.nullable(),
	createdAt: z.string(),
});
export type Attempt = z.infer<typeof attemptSchema>;
export const notebookSchema = z.object({
	version: z.literal(1),
	attempts: z.array(attemptSchema),
	practices: z.array(practiceSchema),
	reviews: z.record(z.string(), z.boolean()),
});
export type Notebook = z.infer<typeof notebookSchema>;
function structured(text: string) {
	return JSON.parse(
		text
			.trim()
			.replace(/^```(?:json)?\s*/i, '')
			.replace(/\s*```$/, ''),
	);
}
export function parsePractice(text: string) {
	return practiceContentSchema.parse(structured(text));
}
export function parseFeedback(text: string, submission: string): Feedback {
	const result = feedbackSchema.parse(structured(text));
	if (result.points.some((p) => !submission.includes(p.quote)))
		throw new Error(
			'A feedback quote did not match your writing. Please try again.',
		);
	return result;
}
export function addAttempt(attempts: Attempt[], attempt: Attempt): Attempt[] {
	return [attemptSchema.parse(attempt), ...attempts];
}
export function restoreNotebook(raw: string | null): Notebook {
	return raw
		? notebookSchema.parse(
				JSON.parse(raw, (key, value) =>
					key === 'ageGroup' ? legacyAgeGroup(value) : value,
				),
			)
		: { version: 1, attempts: [], practices: [], reviews: {} };
}
export const languageNames = { ga: 'Irish', es: 'Spanish' } as const;
export const defaultProfile: Profile = {
	language: 'es',
	level: 'A2',
	ageGroup: 'Middle school',
	interests: 'Nature, sport, everyday life',
	vocabulary: '',
	grammar: '',
};

export function legacyAgeGroup(value: unknown) {
	return value === '\u521d\u4e2d'
		? 'Middle school'
		: value === '\u9ad8\u4e2d'
			? 'High school'
			: value;
}
