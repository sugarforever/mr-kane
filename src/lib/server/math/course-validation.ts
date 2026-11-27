import { isDeepStrictEqual } from 'node:util';
import type { Learner } from '../../math';
import type { StudyMessage } from '../../learning';
const normalize = (text: string) =>
	text.normalize('NFC').replace(/\s+/g, ' ').trim();
/** Source provenance check, not a substitute for mathematical assessment. */
export function validateCourseUpdate(
	next: Learner,
	previous: Learner,
	messages: StudyMessage[],
) {
	const fail = () => {
		throw new Error(
			'Course update lost saved records or cited an answer absent from student messages.',
		);
	};
	const plans = next.coursePlans ?? [];
	for (const old of previous.coursePlans ?? []) {
		const updated = plans.find((p) => p.id === old.id);
		if (
			!updated ||
			updated.domain !== old.domain ||
			updated.revision < old.revision
		)
			fail();

		const scope = (plan: NonNullable<Learner['coursePlans']>[number]) =>
			JSON.stringify(
				plan.lessons.map(({ courseId, objectives, definition }) => ({
					courseId,
					objectives,
					definition,
				})),
			);
		if (
			updated &&
			scope(updated) !== scope(old) &&
			updated.revision <= old.revision
		)
			fail();
		for (const lesson of old.lessons) {
			const retained = updated!.lessons.find(
				(l) => l.courseId === lesson.courseId,
			);
			// Unstarted assignments may be removed when revising a plan; learning history stays.
			if (
				(lesson.attempts.length ||
					lesson.report ||
					lesson.status !== 'planned') &&
				!retained
			)
				fail();
			if (lesson.report && !retained?.report) fail();
			if (
				lesson.status === 'completed' &&
				JSON.stringify(lesson.objectives) !==
					JSON.stringify(retained?.objectives)
			)
				fail();
			for (const attempt of lesson.attempts)
				if (!retained?.attempts.some((a) => isDeepStrictEqual(a, attempt)))
					fail();
			if (lesson.status === 'completed' && retained?.status !== 'completed')
				fail();
		}
	}
	const answers = messages
		.filter((m) => m.role === 'user')
		.map((m) => normalize(m.content));
	for (const plan of plans) {
		for (const lesson of plan.lessons) {
			for (const attempt of lesson.attempts) {
				const prior = previous.coursePlans
					?.find((p) => p.id === plan.id)
					?.lessons.find((l) => l.courseId === lesson.courseId)
					?.attempts.find((a) => a.id === attempt.id);
				// Previously admitted excerpts remain valid after history compaction.
				if (prior?.studentAnswer === attempt.studentAnswer) continue;
				if (
					!answers.some((answer) =>
						answer.includes(normalize(attempt.studentAnswer)),
					)
				)
					fail();
			}
		}
	}
}
