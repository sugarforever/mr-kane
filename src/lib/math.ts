import { z } from 'zod';
export const learnerSchema = z.object({
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
export const mathTurnSchema = z
	.object({
		requestId: z.string().uuid(),
		message: z.string().trim().min(1).max(6000),
	})
	.strict();
export type Learner = z.infer<typeof learnerSchema>;
export type MathMessage = {
	role: 'user' | 'assistant';
	content: string;
	createdAt: string;
};
export type MathSession = {
	id: string;
	title: string;
	updatedAt: string;
	learner: Learner;
	messages: MathMessage[];
	pending: { id: string; message: string } | null;
};
export type MathSummary = Pick<MathSession, 'id' | 'title' | 'updatedAt'>;
