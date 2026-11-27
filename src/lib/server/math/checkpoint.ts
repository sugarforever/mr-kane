import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { learnerSchema, type Learner } from '$lib/math';
import { coursePlanSchema, courseLessonSchema } from '$lib/math-courses';

const lessonUpdate = z
	.object(courseLessonSchema.shape)
	.partial()
	.extend({
		courseId: courseLessonSchema.shape.courseId,
	})
	.strict();
const planUpdate = z
	.object(coursePlanSchema.shape)
	.partial()
	.extend({
		id: coursePlanSchema.shape.id,
		lessons: z.array(lessonUpdate).min(1).max(56).optional(),
		lessonOrder: z
			.array(courseLessonSchema.shape.courseId)
			.min(1)
			.max(56)
			.optional(),
	})
	.strict();
export const checkpointSaveSchema = z
	.object({
		// Retain the original contract for already admitted requests and small imports.
		learner: learnerSchema.optional(),
		updates: z
			.object({
				learner: learnerSchema
					.omit({ coursePlans: true })
					.partial()
					.strict()
					.optional(),
				plans: z.array(planUpdate).min(1).max(8).optional(),
			})
			.strict()
			.refine(
				(value) => value.learner !== undefined || value.plans !== undefined,
				'Provide learner changes or plan changes.',
			)
			.optional(),
	})
	.strict()
	.refine(
		(value) => (value.learner !== undefined) !== (value.updates !== undefined),
		'Provide either a full learner or incremental updates.',
	);

/** Merge by stable IDs; retained evidence is copied by the server, never re-authored by the model. */
export function applyCheckpointSave(
	input: unknown,
	previous: Learner,
): Learner {
	const parsed = checkpointSaveSchema.parse(input);
	if (parsed.learner) return parsed.learner;
	const updates = parsed.updates!;
	const next = {
		...previous,
		...updates.learner,
		coursePlans: structuredClone(previous.coursePlans ?? []),
	};
	const unique = (ids: string[]) => {
		if (new Set(ids).size !== ids.length)
			throw new Error('Update IDs must be unique.');
	};
	unique((updates.plans ?? []).map((p) => p.id));
	for (const update of updates.plans ?? []) {
		const index = next.coursePlans.findIndex((p) => p.id === update.id);
		const old = next.coursePlans[index];
		const { lessons: lessonChanges = [], lessonOrder, ...fields } = update;
		const lessons = structuredClone(old?.lessons ?? []);
		unique(lessonChanges.map((l) => l.courseId));
		for (const change of lessonChanges) {
			const i = lessons.findIndex((l) => l.courseId === change.courseId);
			const prior = lessons[i];
			const attempts = structuredClone(prior?.attempts ?? []);
			unique((change.attempts ?? []).map((a) => a.id));
			for (const attempt of change.attempts ?? []) {
				const admitted = attempts.find((a) => a.id === attempt.id);
				if (admitted && !isDeepStrictEqual(admitted, attempt))
					throw new Error(
						'Saved attempts are immutable. Append new evidence with a new ID.',
					);
				if (!admitted) attempts.push(attempt);
			}
			const lesson = courseLessonSchema.parse({
				...prior,
				...change,
				attempts,
			});
			if (i < 0) lessons.push(lesson);
			else lessons[i] = lesson;
		}
		if (lessonOrder) {
			unique(lessonOrder);
			if (lessonOrder.some((id) => !lessons.some((l) => l.courseId === id)))
				throw new Error('Lesson order references an unknown lesson.');
		}
		const plan = coursePlanSchema.parse({
			...old,
			...fields,
			lessons: lessonOrder
				? lessonOrder.map((id) => lessons.find((l) => l.courseId === id)!)
				: lessons,
		});
		if (index < 0) next.coursePlans.push(plan);
		else next.coursePlans[index] = plan;
	}
	return learnerSchema.parse(next);
}
