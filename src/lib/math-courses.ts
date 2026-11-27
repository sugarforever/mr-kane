import { z } from 'zod';

// Recommended routes, not a claim about the books' prescribed order. Branches
// can be omitted from a personal plan; proof is shared just-in-time support.
export const courseCatalog = [
	{
		id: 'number-theory',
		title: 'Number theory',
		chapters: [
			'V1-C05',
			'V1-C25',
			'V1-C28',
			'V2-C00',
			'V2-C23',
			'V2-C24',
			'V2-C18',
			'V2-C06',
			'V2-C16',
		],
	},
	{
		id: 'algebra',
		title: 'Algebra',
		chapters: [
			'V1-C01',
			'V1-C03',
			'V1-C04',
			'V1-C08',
			'V1-C06',
			'V1-C07',
			'V1-C02',
			'V1-C21',
			'V1-C22',
			'V1-C23',
			'V1-C24',
			'V2-C06',
			'V2-C13',
			'V2-C07',
			'V2-C14',
			'V2-C16',
			'V2-C01',
			'V2-C08',
			'V2-C09',
			'V2-C10',
			'V2-C11',
			'V2-C18',
			'V1-C28',
			'V2-C00',
		],
	},
	{
		id: 'geometry',
		title: 'Geometry and trigonometry',
		chapters: [
			'V1-C09',
			'V1-C10',
			'V1-C11',
			'V1-C12',
			'V1-C13',
			'V1-C14',
			'V1-C15',
			'V1-C16',
			'V1-C17',
			'V1-C18',
			'V1-C19',
			'V1-C20',
			'V2-C02',
			'V2-C03',
			'V2-C04',
			'V2-C05',
			'V2-C10',
			'V2-C11',
			'V2-C12',
			'V2-C20',
			'V2-C21',
			'V2-C22',
			'V1-C28',
			'V2-C00',
		],
	},
	{
		id: 'counting-probability',
		title: 'Counting and probability',
		chapters: [
			'V1-C27',
			'V1-C25',
			'V1-C26',
			'V2-C15',
			'V2-C17',
			'V2-C19',
			'V2-C25',
			'V1-C28',
			'V2-C00',
		],
	},
	{ id: 'proof', title: 'Proof', chapters: ['V1-C28', 'V2-C00'] },
	{
		id: 'mixed',
		title: 'Mixed problem solving',
		chapters: ['V1-C29', 'V2-C26'],
	},
] as const;
const text = z.string().trim().min(1).max(1600);
// Source-neutral unit metadata; chapter IDs remain the current adapter's stable keys.
export const lessonDefinitionSchema = z.object({
	source: z.object({
		kind: z.enum(['chapter', 'paper', 'problem-set']),
		reference: text,
	}),
	scope: text,
	prerequisites: z.array(text).max(30),
	assessment: text,
});
export const courseLessonSchema = z
	.object({
		title: text,
		definition: lessonDefinitionSchema.optional(),
		courseId: z.string().regex(/^V[12]-C\d{2}$/),
		status: z.enum(['planned', 'in-progress', 'paused', 'completed', 'waived']),
		phase: z.enum([
			'orientation',
			'explanation',
			'practice',
			'independent-check',
			'remediation',
			'report',
		]),
		objectives: z
			.array(
				z.object({
					id: text,
					description: text,
					masteryCriteria: text.optional(),
				}),
			)
			.min(1)
			.max(30),
		attempts: z
			.array(
				z.object({
					id: text,
					objectiveIds: z.array(text).min(1).max(30),
					exercise: text,
					studentAnswer: text,
					support: z.enum(['independent', 'hinted', 'demonstrated']),
					kind: z.enum(['routine', 'explanation', 'transfer']),
					result: z.enum(['correct', 'partial', 'incorrect']),
					feedback: text,
				}),
			)
			.max(200),
		report: z.object({ summary: text, nextStep: text }).nullable(),
	})
	.superRefine((lesson, ctx) => {
		const issue = (message: string) =>
			ctx.addIssue({ code: 'custom', message });
		const ids = lesson.objectives.map((o) => o.id);
		if (new Set(ids).size !== ids.length)
			issue('Objective IDs must be unique.');
		if (
			new Set(lesson.attempts.map((a) => a.id)).size !== lesson.attempts.length
		)
			issue('Attempt IDs must be unique.');
		for (const a of lesson.attempts)
			if (a.objectiveIds.some((id) => !ids.includes(id)))
				issue('Attempt references an unknown objective.');
		if (lesson.status === 'completed') {
			if (!lesson.report || lesson.phase !== 'report')
				issue('Completion requires a report and report phase.');
			for (const id of ids) {
				const evidence = lesson.attempts.filter(
					(a) =>
						a.objectiveIds.includes(id) &&
						a.support === 'independent' &&
						a.result === 'correct',
				);
				// Declared criteria are assessed mathematically by the agent; the server
				// still requires independently correct, source-checked student evidence.
				if (lesson.objectives.find((o) => o.id === id)?.masteryCriteria) {
					if (!evidence.length)
						issue(
							`Objective ${id} needs independently correct evidence for its declared criteria.`,
						);
					continue;
				}
				if (
					!evidence.some((a) => a.kind === 'routine') ||
					!evidence.some(
						(a) =>
							a.kind !== 'routine' &&
							evidence.some(
								(b) => b.kind === 'routine' && b.exercise !== a.exercise,
							),
					)
				)
					issue(
						`Objective ${id} needs independent routine and explanation/transfer evidence from different tasks.`,
					);
			}
		}
		if (lesson.status === 'waived' && !lesson.report)
			issue(
				'Waiving a lesson requires a placement rationale in the report; it is not completion.',
			);
	});
export const coursePlanSchema = z
	.object({
		id: text,
		domain: z.enum([
			'number-theory',
			'algebra',
			'geometry',
			'counting-probability',
			'proof',
			'mixed',
		]),
		title: text,
		revision: z.number().int().positive(),
		changeReason: text,
		lessons: z.array(courseLessonSchema).min(1).max(56),
	})
	.superRefine((plan, ctx) => {
		const route = courseCatalog.find((r) => r.id === plan.domain)!;
		if (
			new Set(plan.lessons.map((l) => l.courseId)).size !== plan.lessons.length
		)
			ctx.addIssue({
				code: 'custom',
				message: 'A chapter appears once per plan in the chapter-based MVP.',
			});
		for (const lesson of plan.lessons)
			if (!(route.chapters as readonly string[]).includes(lesson.courseId))
				ctx.addIssue({
					code: 'custom',
					message: 'Chapter is outside this domain route.',
				});
		if (plan.lessons.filter((l) => l.status === 'in-progress').length > 1)
			ctx.addIssue({
				code: 'custom',
				message: 'Only one current lesson per plan.',
			});
	});
export const coursePlansSchema = z
	.array(coursePlanSchema)
	.max(8)
	.superRefine((plans, ctx) => {
		if (new Set(plans.map((p) => p.id)).size !== plans.length)
			ctx.addIssue({ code: 'custom', message: 'Plan IDs must be unique.' });
	});

export type CoursePlan = z.infer<typeof coursePlanSchema>;
