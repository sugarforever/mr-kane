import { isDeepStrictEqual } from 'node:util';
import { checkpointSaveSchema, applyCheckpointSave } from './checkpoint';
import type { MathSession, Learner } from '$lib/math';
import { StudyError } from '../learning/study';
import { createStudy } from '../learning/study';
import { mathAgent } from './agent';
import { consolidateMathProfile, lessonIsComplete } from './profile';
import { validateCourseUpdate } from './course-validation';
import {
	emptyLearner,
	learnerSchema,
	mathAnswerSchema,
	lessonCompletionSchema,
} from '$lib/math';
export { StudyError as MathStudyError } from '../learning/study';
const study = createStudy({
	namespace: 'math',
	title: 'New math conversation',
	operation: 'math-chat',
	replyFormat: 'markdown',
	agent: mathAgent,
	emptyLearner,
	answerSchema: mathAnswerSchema,
	validateLearner: validateCourseUpdate,
	prepareSession: (session) => hydrateLesson(session, true),
	persistLearner: persistLesson,
	checkpoint: {
		saveSchema: checkpointSaveSchema,
		applySave: applyCheckpointSave,
		completionSchema: lessonCompletionSchema,
		generate: consolidateMathProfile,
		isComplete: lessonIsComplete,
	},
});
export const createMathSession = study.createSession;
export const listMathSessions = study.listSessions;
export const getMathSession = async (id: string) =>
	hydrateLesson(await study.getSession(id));
export const runMathTurn = study.runTurn;
export const discardMathTurn = study.discardTurn;

export const hasMathRequest = study.hasRequest;

export const resumeMathProfileUpdates = study.resumeProfileUpdates;

// The original conversation owns plans. Bound conversations own their transcript;
// their learner is a cache, refreshed from the owner before every new turn.
async function hydrateLesson(
	session: MathSession,
	requireActive = false,
): Promise<MathSession> {
	const bound = session.lessonContext;
	if (!bound) return session;
	const owner = await study.getSession(bound.ownerSessionId);
	if (owner.lessonContext) throw new StudyError(409, 'Invalid plan owner.');
	const plan = owner.learner.coursePlans?.find((p) => p.id === bound.planId);
	if (!plan?.lessons.some((l) => l.courseId === bound.courseId)) {
		if (requireActive)
			throw new StudyError(409, 'This lesson is no longer in the saved plan.');
		return { ...session, learner: owner.learner, lessonUnavailable: true };
	}
	return { ...session, learner: owner.learner };
}
async function persistLesson(
	next: Learner,
	previous: MathSession,
): Promise<Learner> {
	const bound = previous.lessonContext;
	if (!bound) return next;
	const oldPlan = previous.learner.coursePlans?.find(
		(p) => p.id === bound.planId,
	);
	const nextPlan = next.coursePlans?.find((p) => p.id === bound.planId);
	const oldLesson = oldPlan?.lessons.find((l) => l.courseId === bound.courseId);
	const nextLesson = nextPlan?.lessons.find(
		(l) => l.courseId === bound.courseId,
	);
	if (!oldPlan || !nextPlan || !oldLesson || !nextLesson)
		throw new StudyError(409, 'Bound lesson is missing.');
	// A lesson cannot rewrite its parent's plan, learner facts, or siblings.
	const mask = (learner: Learner) => ({
		...learner,
		coursePlans: learner.coursePlans?.map((p) =>
			p.id === bound.planId
				? {
						...p,
						lessons: p.lessons.map((l) =>
							l.courseId === bound.courseId ? null : l,
						),
					}
				: p,
		),
	});
	if (!isDeepStrictEqual(mask(next), mask(previous.learner)))
		throw new StudyError(
			409,
			'Revise the plan or learner background in its original conversation.',
		);
	const owner = await study.mutateSession(bound.ownerSessionId, (current) => {
		const plan = current.learner.coursePlans?.find(
			(p) => p.id === bound.planId,
		);
		const lesson = plan?.lessons.find((l) => l.courseId === bound.courseId);
		if (
			!isDeepStrictEqual(lesson, oldLesson) &&
			!isDeepStrictEqual(lesson, nextLesson)
		)
			throw new StudyError(
				409,
				'The lesson changed. Reload before saving progress.',
			);
		const learner = {
			...current.learner,
			coursePlans: current.learner.coursePlans!.map((p) =>
				p.id === bound.planId
					? {
							...p,
							lessons: p.lessons.map((l) =>
								l.courseId === bound.courseId ? nextLesson : l,
							),
						}
					: p,
			),
		};
		learnerSchema.parse(learner);
		validateCourseUpdate(learner, current.learner, previous.messages);
		return { ...current, learner, updatedAt: new Date().toISOString() };
	});
	return owner.learner;
}
export type MathPlanEntry = {
	ownerSessionId: string;
	ownerTitle: string;
	plan: NonNullable<Learner['coursePlans']>[number];
};
export async function mathPlanWorkspace() {
	const sessions = await Promise.all(
		(await study.listSessions()).map((s) => study.getSession(s.id)),
	);
	const owners = sessions.filter((s) => !s.lessonContext);
	const plans = owners
		.filter((s) => !s.lessonContext)
		.flatMap((s) =>
			(s.learner.coursePlans ?? []).map((plan) => ({
				ownerSessionId: s.id,
				ownerTitle: s.title,
				plan,
			})),
		);
	return { plans, planningSessionId: owners[0]?.id ?? null };
}
export async function listMathPlans(): Promise<MathPlanEntry[]> {
	return (await mathPlanWorkspace()).plans;
}

export async function openMathLesson(
	ownerSessionId: string,
	planId: string,
	courseId: string,
): Promise<MathSession> {
	let lessonSession: MathSession | undefined;
	await study.mutateSession(ownerSessionId, async (owner) => {
		if (owner.lessonContext)
			throw new StudyError(409, 'Open lessons from the original plan.');
		const plan = owner.learner.coursePlans?.find((p) => p.id === planId);
		if (!plan) throw new StudyError(404, 'Plan not found.');
		const lesson = plan.lessons.find((l) => l.courseId === courseId);
		if (!lesson) throw new StudyError(404, 'Lesson not found.');
		// Navigation changes activity only, never mastery or recorded evidence.
		if (lesson.status === 'planned' || lesson.status === 'paused') {
			owner = {
				...owner,
				learner: {
					...owner.learner,
					coursePlans: owner.learner.coursePlans!.map((p) =>
						p.id === planId
							? {
									...p,
									lessons: p.lessons.map((l) =>
										l.courseId !== courseId && l.status === 'in-progress'
											? { ...l, status: 'paused' as const }
											: l,
									),
								}
							: p,
					),
				},
			};
		}
		const key = JSON.stringify([planId, courseId]);
		const existing = owner.lessonSessions?.[key];
		lessonSession = existing
			? await study.getSession(existing)
			: await study.createSession({
					title: lesson.title,
					learner: owner.learner,
					lessonContext: { ownerSessionId, planId, courseId },
				});
		return {
			...owner,
			lessonSessions: { ...owner.lessonSessions, [key]: lessonSession.id },
		};
	});
	return hydrateLesson(lessonSession!);
}
