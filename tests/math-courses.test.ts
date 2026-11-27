import { expect, it } from 'vitest';
import {
	coursePlanSchema,
	courseCatalog,
	type CoursePlan,
} from '../src/lib/math-courses';
import { mathCatalog } from '../src/lib/server/math/aops';
import { emptyLearner } from '../src/lib/math';
import {
	createMathSession,
	getMathSession,
	runMathTurn,
} from '../src/lib/server/math/study';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { vi } from 'vitest';

function plan(): CoursePlan {
	return {
		id: 'number-theory',
		domain: 'number-theory',
		title: 'Number theory',
		revision: 1,
		changeReason: 'Initial plan',
		lessons: [
			{
				courseId: 'V1-C05',
				title: 'Using the Integers',
				status: 'in-progress',
				phase: 'report',
				objectives: [
					{
						id: 'residues',
						description: 'Find a remainder using a power cycle',
					},
				],
				attempts: [],
				report: null,
			},
		],
	};
}
it('maps every chapter into a domain route with valid source sections', async () => {
	const chapters = await mathCatalog();
	expect(new Set(courseCatalog.flatMap((r) => r.chapters))).toEqual(
		new Set(chapters.map((c) => c.id)),
	);
	for (const route of courseCatalog)
		for (const id of route.chapters)
			expect(chapters.some((c) => c.id === id)).toBe(true);
	expect(
		courseCatalog
			.find((r) => r.id === 'number-theory')!
			.chapters.indexOf('V1-C05'),
	).toBeLessThan(
		courseCatalog
			.find((r) => r.id === 'number-theory')!
			.chapters.indexOf('V2-C23'),
	);
});
it('requires independent evidence for every objective and a report before completing a lesson', () => {
	const p: any = plan();
	p.lessons[0].status = 'completed';
	expect(coursePlanSchema.safeParse(p).success).toBe(false);
	p.lessons[0].report = { summary: 'Uses cycles', nextStep: 'Congruences' };
	p.lessons[0].attempts = [
		{
			id: 'a1',
			objectiveIds: ['residues'],
			exercise: 'Find 2^10 mod 3',
			studentAnswer: 'The cycle is 2,1, so 1.',
			support: 'hinted',
			kind: 'routine',
			result: 'correct',
			feedback: 'Correct after a hint',
		},
	];
	expect(coursePlanSchema.safeParse(p).success).toBe(false);
	p.lessons[0].attempts[0].support = 'independent';
	expect(coursePlanSchema.safeParse(p).success).toBe(false);
	p.lessons[0].attempts.push({
		...p.lessons[0].attempts[0],
		id: 'a2',
		kind: 'transfer',
		exercise: 'Find 3^20 mod 5',
		studentAnswer: 'Cycle 3,4,2,1; 20 is divisible by 4, so 1.',
	});
	expect(coursePlanSchema.safeParse(p).success).toBe(true);
	p.lessons[0].attempts[0].objectiveIds = ['invented'];
	expect(coursePlanSchema.safeParse(p).success).toBe(false);
});
it('rejects duplicate lessons and chapters outside the selected route', () => {
	const p = plan();
	p.lessons.push(p.lessons[0]);
	expect(coursePlanSchema.safeParse(p).success).toBe(false);
	p.lessons = [{ ...p.lessons[0], courseId: 'V1-C09' }];
	expect(coursePlanSchema.safeParse(p).success).toBe(false);
});
it('keeps proposed plans in the conversation until a lesson completes', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'kane-courses-'));
	vi.stubEnv('MR_KANE_DATA_DIR', dir);
	try {
		const session = await createMathSession();
		expect(session.learner.coursePlans).toBeUndefined();
		const learner = { ...emptyLearner(), coursePlans: [plan()] };
		await runMathTurn(
			session.id,
			randomUUID(),
			'Please organize my number theory plan',
			async () => 'Here is your plan.',
		);
		const saved = await getMathSession(session.id);
		expect(saved.learner.coursePlans).toBeUndefined();
		expect(saved.messages.at(-1)?.content).toBe('Here is your plan.');
	} finally {
		vi.unstubAllEnvs();
		rmSync(dir, { recursive: true, force: true });
	}
});
it('rejects invented student evidence and silently removed saved plans', async () => {
	const { validateCourseUpdate } =
		await import('../src/lib/server/math/course-validation');
	const old = { ...emptyLearner(), coursePlans: [plan()] };
	expect(() => validateCourseUpdate(emptyLearner(), old, [])).toThrow();
	const updated: any = structuredClone(old);
	updated.coursePlans[0].lessons[0].attempts = [
		{
			id: 'fake',
			objectiveIds: ['residues'],
			exercise: '2^10 mod 3',
			studentAnswer: 'I solved this independently',
			support: 'independent',
			kind: 'routine',
			result: 'correct',
			feedback: 'Correct',
		},
	];
	expect(() =>
		validateCourseUpdate(updated, old, [
			{
				role: 'assistant',
				content: 'I solved this independently',
				createdAt: '',
			},
		]),
	).toThrow();
	expect(() =>
		validateCourseUpdate(updated, old, [
			{ role: 'user', content: 'I solved this independently', createdAt: '' },
		]),
	).not.toThrow();
});
it('exposes course routes and loads each skill through the real agent tools', async () => {
	const { createMathTools } = await import('../src/lib/server/math/library');
	const { BACKGROUND_CONTEXT } = await import('@earendil-works/chord/context');
	const tools = createMathTools();
	const api = {} as import('@earendil-works/pi-durable').ToolExecutionApi;
	for (const skill of ['planning', 'teaching', 'assessment']) {
		const result = await tools
			.find((t) => t.name === 'course_skill')!
			.execute({ skill }, api, BACKGROUND_CONTEXT);
		const loaded = JSON.parse((result.output![0] as { text: string }).text);
		expect(loaded.content).toContain('name: aops-course-');
		if (skill === 'assessment') {
			expect(loaded.completionCriteria).toContain('For every objective');
		}
	}
	const result = await tools
		.find((t) => t.name === 'course_catalog')!
		.execute({ domain: 'number-theory' }, api, BACKGROUND_CONTEXT);
	const route = JSON.parse((result.output![0] as { text: string }).text);
	expect(
		route.chapters
			.find((c: any) => c.courseId === 'V1-C05')
			.sections.some((s: any) => s.id === '5.4'),
	).toBe(true);
});
it('requires a new revision for changed scope and retains historical reports', async () => {
	const { validateCourseUpdate } =
		await import('../src/lib/server/math/course-validation');
	const p = plan();
	p.lessons[0].report = {
		summary: 'Partial progress',
		nextStep: 'Independent check',
	};
	const previous = { ...emptyLearner(), coursePlans: [p] };
	const next = structuredClone(previous);
	next.coursePlans[0].lessons[0].report = null;
	expect(() => validateCourseUpdate(next, previous, [])).toThrow();
	next.coursePlans[0].lessons[0].report = p.lessons[0].report;
	next.coursePlans[0].lessons[0].objectives[0].description = 'A revised target';
	expect(() => validateCourseUpdate(next, previous, [])).toThrow();
	next.coursePlans[0].revision = 2;
	next.coursePlans[0].changeReason = 'Narrow the target after diagnosis';
	expect(() => validateCourseUpdate(next, previous, [])).not.toThrow();
});
