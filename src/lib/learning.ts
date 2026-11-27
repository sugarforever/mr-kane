import { z } from 'zod';
export const studyTurnSchema = z
	.object({
		requestId: z.string().uuid(),
		message: z.string().trim().min(1).max(6000),
	})
	.strict();
export type StudyMessage = {
	role: 'user' | 'assistant';
	content: string;
	createdAt: string;
};
export type LessonContext = {
	ownerSessionId: string;
	planId: string;
	courseId: string;
};
export type StudySession<Learner> = {
	lessonContext?: LessonContext;
	/** Derived read-only state for a unit removed from its source plan. */
	lessonUnavailable?: boolean;
	lessonSessions?: Record<string, string>;
	id: string;
	title: string;
	updatedAt: string;
	learner: Learner;
	profileUpdate?: 'pending' | 'failed';
	messages: StudyMessage[];
	pending: { id: string; message: string } | null;
};
export type StudySummary = Pick<
	StudySession<unknown>,
	'id' | 'title' | 'updatedAt'
>;
