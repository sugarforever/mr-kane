import { z } from 'zod';
import { coursePlansSchema } from './math-courses';
export const learnerSchema = z.object({
	coursePlans: coursePlansSchema.optional(),
	background: z.string().max(1200),
	goal: z.string().max(1200),
	weeklyTime: z.string().max(300),
	reportedKnowledge: z.array(z.string().max(400)).max(12),
	strengths: z.array(z.string().max(400)).max(12),
	gaps: z.array(z.string().max(400)).max(12),
	observations: z.array(z.string().max(600)).max(12),
});
export const emptyLearner = () =>
	learnerSchema.parse({
		background: '',
		goal: '',
		weeklyTime: '',
		reportedKnowledge: [],
		strengths: [],
		gaps: [],
		observations: [],
	});
export const mathAnswerSchema = z.object({
	reply: z.string().trim().min(1).max(20000),
	learner: learnerSchema,
});
export { studyTurnSchema as mathTurnSchema } from './learning';
export type Learner = z.infer<typeof learnerSchema>;
export type MathMessage = import('./learning').StudyMessage;
export type MathSession = import('./learning').StudySession<Learner>;
export type MathSummary = import('./learning').StudySummary;
