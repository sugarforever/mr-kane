import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import { emptyLearner } from '../src/lib/math';
import type { CoursePlan } from '../src/lib/math-courses';
import * as math from '../src/lib/server/math/study';
let dir = '';
afterEach(() => {
	vi.unstubAllEnvs();
	if (dir) rmSync(dir, { recursive: true, force: true });
});
function setup() {
	dir = mkdtempSync(join(tmpdir(), 'math-plans-'));
	vi.stubEnv('MR_KANE_DATA_DIR', dir);
}
const plan = (): CoursePlan => ({
	id: 'integers',
	domain: 'number-theory',
	title: 'My integers',
	revision: 1,
	changeReason: 'Initial plan',
	lessons: [
		{
			courseId: 'V1-C05',
			title: 'Integers',
			status: 'planned',
			phase: 'orientation',
			objectives: [
				{
					id: 'remainders',
					description: 'Explain remainders',
					masteryCriteria: 'Independently explain a remainder',
				},
			],
			attempts: [],
			report: null,
		},
	],
});
function save(
	learner: ReturnType<typeof emptyLearner>,
): NonNullable<Parameters<typeof math.runMathTurn>[3]> {
	return async (_op, _data, _schema, requestId, options) => {
		const tools = options.agent.createTools({
			requestId,
			connection: {
				service: 'custom',
				modelId: 'fixture',
				models: ['fixture'],
				protocol: 'openai-completions',
			} as any,
		});
		const tool = tools.find((t) => t.name === 'save_learning_checkpoint');
		expect(tool).toBeDefined();
		await tool!.execute({ learner }, {} as any, BACKGROUND_CONTEXT);
		return 'Saved your plan.';
	};
}
it('publishes a plan before completion and resumes one durable lesson with learner context', async () => {
	setup();
	const owner = await math.createMathSession();
	const learner = {
		...emptyLearner(),
		background: 'Grade 10',
		coursePlans: [plan()],
	};
	await math.runMathTurn(
		owner.id,
		randomUUID(),
		'I am in Grade 10. Make a plan.',
		save(learner),
	);
	const plans = await math.listMathPlans();
	expect(plans).toHaveLength(1);
	expect(plans[0]).toMatchObject({ ownerSessionId: owner.id, plan: plan() });
	const [a, b] = await Promise.all([
		math.openMathLesson(owner.id, 'integers', 'V1-C05'),
		math.openMathLesson(owner.id, 'integers', 'V1-C05'),
	]);
	expect(a.id).toBe(b.id);
	expect(a.learner.background).toBe('Grade 10');
	expect(a.lessonContext).toEqual({
		ownerSessionId: owner.id,
		planId: 'integers',
		courseId: 'V1-C05',
	});
	await math.runMathTurn(
		a.id,
		randomUUID(),
		'The remainder is 2.',
		async (_op, data, _schema, _id, options) => {
			expect(data).toMatchObject({ learner, lessonContext: a.lessonContext });
			expect(await options.agent.loadPrompt()).toContain('BOUND LESSON');
			const updated = structuredClone(learner);
			const l = updated.coursePlans[0].lessons[0];
			l.status = 'in-progress';
			l.phase = 'practice';
			l.attempts.push({
				id: 'a1',
				objectiveIds: ['remainders'],
				exercise: '17 mod 5',
				studentAnswer: 'The remainder is 2.',
				support: 'hinted',
				kind: 'routine',
				result: 'correct',
				feedback: 'Correct after hint',
			});
			return save(updated)(_op, data, _schema, _id, options);
		},
	);
	const resumed = await math.openMathLesson(owner.id, 'integers', 'V1-C05');
	expect(resumed.id).toBe(a.id);
	expect(resumed.messages[0].content).toBe('The remainder is 2.');
	expect(
		(await math.getMathSession(owner.id)).learner.coursePlans![0].lessons[0]
			.attempts[0].support,
	).toBe('hinted');
	expect((await math.listMathPlans())[0].plan.lessons[0].status).toBe(
		'in-progress',
	);
});
it('does not infer plans from old prose and rejects unknown lesson entry', async () => {
	setup();
	const owner = await math.createMathSession();
	await math.runMathTurn(
		owner.id,
		randomUUID(),
		'Plan integers',
		async () => 'Study V1-C05 next.',
	);
	expect(await math.listMathPlans()).toEqual([]);
	await expect(
		math.openMathLesson(owner.id, 'missing', 'V1-C05'),
	).rejects.toThrow('Plan not found');
	expect((await math.getMathSession(owner.id)).messages).toHaveLength(2);
});
it('keeps the original answer when a checkpoint was saved before a failed turn is discarded', async () => {
	setup();
	const owner = await math.createMathSession();
	const id = randomUUID();
	await expect(
		math.runMathTurn(owner.id, id, 'I am in Grade 10.', async (...args) => {
			await save({
				...emptyLearner(),
				background: 'Grade 10',
				coursePlans: [plan()],
			})(...args);
			throw Error('offline after save');
		}),
	).rejects.toThrow('offline');
	const discarded = await math.discardMathTurn(owner.id, id);
	expect(
		discarded.messages.some(
			(m) => m.role === 'user' && m.content === 'I am in Grade 10.',
		),
	).toBe(true);
	expect(await math.listMathPlans()).toHaveLength(1);
});
it('preserves an old saved checkpoint and does not automatically infer new evidence', async () => {
	setup();
	const { database } = await import('../src/lib/server/providers-store');
	const id = randomUUID();
	const learner = {
		...emptyLearner(),
		background: 'Legacy learner',
		coursePlans: [plan()],
	};
	const session = {
		id,
		title: 'Old plan',
		updatedAt: new Date().toISOString(),
		learner,
		messages: [
			{ role: 'user', content: 'Original answer', createdAt: '2026-01-01' },
		],
		pending: null,
	};
	const db = database();
	try {
		db.exec(
			'CREATE TABLE math_sessions(id TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE math_turns(id TEXT PRIMARY KEY,session_id TEXT,message TEXT,context TEXT,complete INTEGER)',
		);
		db.prepare('INSERT INTO math_sessions VALUES (?,?)').run(
			id,
			JSON.stringify(session),
		);
	} finally {
		db.close();
	}
	expect((await math.listMathPlans())[0]).toMatchObject({
		ownerSessionId: id,
		plan: plan(),
	});
	expect(await math.getMathSession(id)).toEqual(session);
	const lesson = await math.openMathLesson(id, 'integers', 'V1-C05');
	expect(lesson.learner).toEqual(learner);
	expect(lesson.messages).toEqual([]);
	await math.runMathTurn(
		lesson.id,
		randomUUID(),
		'Continue my old plan',
		save(learner),
	);
	expect((await math.getMathSession(id)).messages).toEqual(session.messages);
});
it('rejects changes outside the bound lesson and retains admitted assistance evidence', async () => {
	setup();
	const source = await math.createMathSession();
	const learner = { ...emptyLearner(), coursePlans: [plan()] };
	await math.runMathTurn(source.id, randomUUID(), 'Plan', save(learner));
	const lesson = await math.openMathLesson(source.id, 'integers', 'V1-C05');
	const invalid = { ...learner, background: 'Overwritten' };
	await expect(
		math.runMathTurn(lesson.id, randomUUID(), 'Continue', save(invalid)),
	).rejects.toThrow('original conversation');
	expect((await math.getMathSession(source.id)).learner.background).toBe('');
	const { validateCourseUpdate } =
		await import('../src/lib/server/math/course-validation');
	const old = structuredClone(learner);
	old.coursePlans[0].lessons[0].attempts.push({
		id: 'a',
		objectiveIds: ['remainders'],
		exercise: '17 mod 5',
		studentAnswer: '2',
		support: 'hinted',
		kind: 'routine',
		result: 'correct',
		feedback: 'After hint',
	});
	const changed = structuredClone(old);
	changed.coursePlans[0].lessons[0].attempts[0].support = 'independent';
	expect(() =>
		validateCourseUpdate(changed, old, [
			{ role: 'user', content: '2', createdAt: '' },
		]),
	).toThrow();
});
it('protects plan endpoints and reports missing lessons without creating sessions', async () => {
	setup();
	const { POST } = await import('../src/routes/api/math/plans/lesson/+server');
	const url = new URL('http://localhost/api/math/plans/lesson');
	const call = (body: unknown, origin = url.origin) =>
		POST({
			url,
			request: new Request(url, {
				method: 'POST',
				headers: { origin, 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
			}),
		} as any);
	await expect(call({}, 'https://outside.test')).rejects.toMatchObject({
		status: 403,
	});
	await expect(call({})).rejects.toMatchObject({ status: 400 });
	const source = await math.createMathSession();
	await expect(
		call({ ownerSessionId: source.id, planId: 'unknown', courseId: 'V1-C05' }),
	).rejects.toMatchObject({ status: 404 });
	expect(await math.listMathSessions()).toHaveLength(1);
});
it('switches between planned lessons without blocking progress behind another active lesson', async () => {
	setup();
	const owner = await math.createMathSession();
	const p = plan();
	p.lessons[0].status = 'in-progress';
	p.lessons.push({
		...structuredClone(p.lessons[0]),
		courseId: 'V1-C25',
		title: 'Special topics',
		status: 'planned',
	});
	await math.runMathTurn(
		owner.id,
		randomUUID(),
		'Plan both lessons',
		save({ ...emptyLearner(), coursePlans: [p] }),
	);
	const lesson = await math.openMathLesson(owner.id, p.id, 'V1-C25');
	expect(lesson.learner.coursePlans![0].lessons[0].status).toBe('paused');
	const updated = structuredClone(lesson.learner);
	updated.coursePlans![0].lessons[1].status = 'in-progress';
	await math.runMathTurn(
		lesson.id,
		randomUUID(),
		'Begin this lesson',
		save(updated),
	);
	expect((await math.listMathPlans())[0].plan.lessons[1].status).toBe(
		'in-progress',
	);
});
it('retains a general learning unit definition alongside compatible chapter IDs', async () => {
	const { coursePlanSchema } = await import('../src/lib/math-courses');
	const definition = {
		source: {
			kind: 'chapter',
			reference: 'AoPS volume 1, chapter 5, sections 5.1–5.4',
		},
		scope: 'Integer operations and remainders; exclude extensions',
		prerequisites: ['Division'],
		assessment: 'One integrated independent remainder task with explanation',
	};
	const p = plan();
	Object.assign(p.lessons[0], { definition });
	expect(coursePlanSchema.parse(p).lessons[0]).toHaveProperty(
		'definition',
		definition,
	);
});
it('marks a stale background save failed without retrying the model indefinitely', async () => {
	setup();
	const agent = await import('../src/lib/server/agent');
	const owner = await math.createMathSession();
	const learner = { ...emptyLearner(), coursePlans: [plan()] };
	await math.runMathTurn(owner.id, randomUUID(), 'Plan', save(learner));
	const lesson = await math.openMathLesson(owner.id, 'integers', 'V1-C05');
	let release!: (value: string) => void;
	const profile = vi.spyOn(agent, 'runAgent').mockImplementation(
		() =>
			new Promise((r) => {
				release = r;
			}),
	);
	try {
		await math.runMathTurn(
			lesson.id,
			randomUUID(),
			'The remainder is 2.',
			async (_op, _data, _schema, requestId, options) => {
				const tool = options.agent
					.createTools({
						requestId,
						connection: {
							service: 'custom',
							protocol: 'openai-completions',
							modelId: 'fixture',
							models: ['fixture'],
						} as any,
					})
					.find((t) => t.name === 'complete_lesson')!;
				await tool.execute(
					{ planId: 'integers', courseId: 'V1-C05' },
					{} as any,
					BACKGROUND_CONTEXT,
				);
				return 'Assessment submitted.';
			},
		);
		await vi.waitFor(() => expect(profile).toHaveBeenCalledTimes(1), {
			timeout: 10000,
		});
		const updated = structuredClone(learner);
		updated.coursePlans[0].lessons[0].phase = 'practice';
		await math.runMathTurn(
			owner.id,
			randomUUID(),
			'Continue practicing',
			save(updated),
		);
		const completed = structuredClone(learner);
		const l = completed.coursePlans[0].lessons[0];
		l.status = 'completed';
		l.phase = 'report';
		l.report = {
			summary: 'Independent explanation',
			nextStep: 'Delayed review',
		};
		l.attempts.push({
			id: 'done',
			objectiveIds: ['remainders'],
			exercise: '17 mod 5',
			studentAnswer: 'The remainder is 2.',
			support: 'independent',
			kind: 'explanation',
			result: 'correct',
			feedback: 'Explains remainder',
		});
		release(JSON.stringify({ learner: completed }));
		await vi.waitFor(
			async () =>
				expect((await math.getMathSession(lesson.id)).profileUpdate).toBe(
					'failed',
				),
			{ timeout: 10000 },
		);
		for (let i = 0; i < 3; i++) await math.getMathSession(lesson.id);
		expect(profile).toHaveBeenCalledTimes(1);
		expect((await math.listMathPlans())[0].plan.lessons[0].phase).toBe(
			'practice',
		);
	} finally {
		profile.mockRestore();
	}
}, 20000);
it('loads real teaching and source tools in Pi and restores the bound transcript across turns', async () => {
	setup();
	vi.stubEnv('PI_API_KEY', '');
	const { createServer } = await import('node:http');
	const { saveConnection, selectConnection } =
		await import('../src/lib/server/providers-store');
	const learner = {
		...emptyLearner(),
		background: 'Grade 10',
		coursePlans: [plan()],
	};
	const captured: any[] = [];
	const deltas = [
		{ name: 'save_learning_checkpoint', args: { learner } },
		{ reply: 'Plan saved.' },
		{ name: 'course_skill', args: { skill: 'teaching' } },
		{ name: 'aops_read', args: { chapterId: 'V1-C05', section: '5.4' } },
		{ reply: 'What is 17 mod 5? Try independently.' },
		{ reply: 'Your answer is retained in this lesson.' },
	];
	const server = createServer(async (req, res) => {
		let body = '';
		for await (const chunk of req) body += chunk;
		captured.push(JSON.parse(body));
		const step = deltas[captured.length - 1];
		const delta = step?.name
			? {
					role: 'assistant',
					tool_calls: [
						{
							index: 0,
							id: `tool-${captured.length}`,
							type: 'function',
							function: {
								name: step.name,
								arguments: JSON.stringify(step.args),
							},
						},
					],
				}
			: { role: 'assistant', content: step?.reply ?? 'Fixture finished.' };
		const chunk = (delta: unknown, finish_reason: string | null) => ({
			id: 'plan-fixture',
			object: 'chat.completion.chunk',
			created: 1,
			model: 'fixture',
			choices: [{ index: 0, delta, finish_reason }],
		});
		res.writeHead(200, { 'Content-Type': 'text/event-stream' });
		res.end(
			`data: ${JSON.stringify(chunk(delta, null))}\n\ndata: ${JSON.stringify(chunk({}, step?.name ? 'tool_calls' : 'stop'))}\n\ndata: [DONE]\n\n`,
		);
	});
	await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
	try {
		const connection = saveConnection(
			{
				name: 'Isolated plan fixture',
				service: 'custom',
				authMode: 'api_key',
				baseUrl: `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`,
				modelId: 'fixture',
				models: ['fixture'],
				protocol: 'openai-completions',
			},
			'fixture-key',
		);
		selectConnection(connection.id);
		const owner = await math.createMathSession();
		await math.runMathTurn(
			owner.id,
			randomUUID(),
			'I am in Grade 10. Make a plan.',
		);
		expect((await math.listMathPlans())[0].plan.id).toBe('integers');
		const lesson = await math.openMathLesson(owner.id, 'integers', 'V1-C05');
		await math.runMathTurn(lesson.id, randomUUID(), 'Begin my bound lesson.');
		const restored = await math.openMathLesson(owner.id, 'integers', 'V1-C05');
		await math.runMathTurn(restored.id, randomUUID(), 'The remainder is 2.');
		expect(restored.id).toBe(lesson.id);
		expect(captured).toHaveLength(6);
		const firstLesson = captured[2];
		expect(
			firstLesson.messages
				.filter((m: any) => m.role === 'system')
				.map((m: any) => m.content)
				.join('\n'),
		).toContain('BOUND LESSON');
		const input = JSON.parse(
			firstLesson.messages.filter((m: any) => m.role === 'user').at(-1).content,
		);
		expect(input.data).toMatchObject({
			learner,
			lessonContext: lesson.lessonContext,
		});
		expect(
			captured[3].messages.find((m: any) => m.role === 'tool').content,
		).toContain('aops-course-teaching');
		expect(
			captured[4].messages.filter((m: any) => m.role === 'tool').at(-1).content,
		).toContain('Modular Arithmetic');
		expect(
			captured[5].messages.some(
				(m: any) => m.role === 'assistant' && m.content?.includes('17 mod 5'),
			),
		).toBe(true);
		expect((await math.getMathSession(lesson.id)).messages).toHaveLength(4);
		expect((await math.getMathSession(lesson.id)).title).toBe('Integers');
	} finally {
		server.closeAllConnections();
		await new Promise<void>((r) => server.close(() => r()));
	}
}, 30000);
it('keeps plans browsable after an opened unstarted lesson is removed and retains its conversation', async () => {
	setup();
	const owner = await math.createMathSession();
	const p = plan();
	p.lessons.push({
		...structuredClone(p.lessons[0]),
		courseId: 'V1-C25',
		title: 'Special topics',
	});
	await math.runMathTurn(
		owner.id,
		randomUUID(),
		'Plan both',
		save({ ...emptyLearner(), coursePlans: [p] }),
	);
	const lesson = await math.openMathLesson(owner.id, p.id, 'V1-C25');
	const next = structuredClone(p);
	next.lessons.pop();
	next.revision++;
	next.changeReason = 'Narrow scope';
	await math.runMathTurn(
		owner.id,
		randomUUID(),
		'Remove the unstarted extension',
		save({ ...emptyLearner(), coursePlans: [next] }),
	);
	const { load } = await import('../src/routes/math/plans/+page.server');
	const data = await load({ setHeaders: () => {} } as any);
	expect(data.failure).toBe('');
	expect(data.plans).toHaveLength(1);
	expect(await math.getMathSession(lesson.id)).toMatchObject({
		id: lesson.id,
		lessonUnavailable: true,
		messages: [],
	});
	await expect(
		math.runMathTurn(
			lesson.id,
			randomUUID(),
			'Continue',
			async () => 'must not run',
		),
	).rejects.toThrow('no longer');
});
it('refreshes the authoritative checkpoint through a tool when retrying an interrupted lesson', async () => {
	setup();
	const owner = await math.createMathSession();
	const learner = {
		...emptyLearner(),
		background: 'Grade 10',
		coursePlans: [plan()],
	};
	await math.runMathTurn(owner.id, randomUUID(), 'Plan', save(learner));
	const lesson = await math.openMathLesson(owner.id, 'integers', 'V1-C05');
	const id = randomUUID();
	await expect(
		math.runMathTurn(lesson.id, id, 'Continue', async () => {
			throw Error('offline');
		}),
	).rejects.toThrow('offline');
	const latest = structuredClone(learner);
	latest.background = 'Grade 11';
	await math.runMathTurn(
		owner.id,
		randomUUID(),
		'I am now in Grade 11',
		save(latest),
	);
	await math.runMathTurn(
		lesson.id,
		id,
		'Continue',
		async (_op, _data, _schema, requestId, options) => {
			const tool = options.agent
				.createTools({
					requestId,
					connection: {
						service: 'custom',
						protocol: 'openai-completions',
						modelId: 'fixture',
						models: ['fixture'],
					} as any,
				})
				.find((t) => t.name === 'get_learning_checkpoint');
			expect(tool).toBeDefined();
			const result = await tool!.execute({}, {} as any, BACKGROUND_CONTEXT);
			const current = JSON.parse((result.output![0] as { text: string }).text);
			expect(current.learner.background).toBe('Grade 11');
			return save(current.learner)(_op, _data, _schema, requestId, options);
		},
	);
	expect((await math.getMathSession(lesson.id)).learner.background).toBe(
		'Grade 11',
	);
});
it('revises a plan incrementally without regenerating or overwriting its saved attempts', async () => {
	setup();
	const owner = await math.createMathSession();
	const learner = { ...emptyLearner(), coursePlans: [plan()] };
	const attempts = Array.from({ length: 40 }, (_, i) => ({
		id: `history-${i}`,
		objectiveIds: ['remainders'],
		exercise: `Original exercise ${i}`,
		studentAnswer: `Original answer ${i}`,
		support: 'hinted' as const,
		kind: 'routine' as const,
		result: 'partial' as const,
		feedback: 'Needs independent assessment',
	}));
	learner.coursePlans[0].lessons[0].attempts = attempts;
	await math.runMathTurn(
		owner.id,
		randomUUID(),
		attempts.map((a) => a.studentAnswer).join('\n'),
		save(learner),
	);
	const updates = {
		plans: [
			{
				id: 'integers',
				revision: 2,
				changeReason: 'Declare the scope and criteria',
				lessons: [
					{
						courseId: 'V1-C05',
						objectives: [
							{
								id: 'remainders',
								description: 'Explain remainders with a division identity',
								masteryCriteria: 'Give an independent explanation',
							},
						],
					},
				],
			},
		],
	};
	await math.runMathTurn(
		owner.id,
		randomUUID(),
		'Update my plan and retain all original evidence',
		async (_op, _data, _schema, requestId, options) => {
			const tool = options.agent
				.createTools({
					requestId,
					connection: {
						service: 'custom',
						modelId: 'fixture',
						models: ['fixture'],
						protocol: 'openai-completions',
					} as any,
				})
				.find((t) => t.name === 'save_learning_checkpoint')!;
			await tool.execute({ updates }, {} as any, BACKGROUND_CONTEXT);
			return 'Plan updated.';
		},
	);
	const saved = (await math.getMathSession(owner.id)).learner.coursePlans![0];
	expect(saved.revision).toBe(2);
	expect(saved.lessons[0].attempts).toEqual(attempts);
	expect(saved.lessons[0].objectives[0].description).toContain(
		'division identity',
	);
	expect(JSON.stringify(updates).length).toBeLessThan(
		JSON.stringify(learner).length / 10,
	);
});
it('resumes an interrupted native planning turn and saves only its changed fields', async () => {
	setup();
	vi.stubEnv('PI_API_KEY', '');
	const { createServer } = await import('node:http');
	const { saveConnection, selectConnection } =
		await import('../src/lib/server/providers-store');
	const owner = await math.createMathSession();
	const learner = { ...emptyLearner(), coursePlans: [plan()] };
	await math.runMathTurn(
		owner.id,
		randomUUID(),
		'Create my plan',
		save(learner),
	);
	let available = false,
		savedTool = false;
	const requests: any[] = [];
	const updates = {
		plans: [
			{
				id: 'integers',
				revision: 2,
				changeReason: 'Narrowed objective',
				lessons: [
					{
						courseId: 'V1-C05',
						objectives: [
							{
								id: 'remainders',
								description: 'Explain a remainder using division',
								masteryCriteria: 'Give an independent explanation',
							},
						],
					},
				],
			},
		],
	};
	const server = createServer(async (req, res) => {
		let body = '';
		for await (const c of req) body += c;
		requests.push(JSON.parse(body));
		if (!available) {
			res.writeHead(400, { 'Content-Type': 'application/json' });
			res.end('{"error":{"message":"isolated interrupted request"}}');
			return;
		}
		const delta = !savedTool
			? {
					role: 'assistant',
					tool_calls: [
						{
							index: 0,
							id: 'incremental-save',
							type: 'function',
							function: {
								name: 'save_learning_checkpoint',
								arguments: JSON.stringify({ updates }),
							},
						},
					],
				}
			: { role: 'assistant', content: 'Your revised plan is saved.' };
		const finish = !savedTool ? 'tool_calls' : 'stop';
		savedTool = true;
		const chunk = (delta: unknown, finish_reason: string | null) =>
			JSON.stringify({
				id: 'retry-plan-fixture',
				object: 'chat.completion.chunk',
				created: 1,
				model: 'fixture',
				choices: [{ index: 0, delta, finish_reason }],
			});
		res.writeHead(200, { 'Content-Type': 'text/event-stream' });
		res.end(
			`data: ${chunk(delta, null)}\n\ndata: ${chunk({}, finish)}\n\ndata: [DONE]\n\n`,
		);
	});
	await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
	try {
		const connection = saveConnection(
			{
				name: 'Isolated incremental retry',
				service: 'custom',
				authMode: 'api_key',
				baseUrl: `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`,
				modelId: 'fixture',
				models: ['fixture'],
				protocol: 'openai-completions',
			},
			'fixture-key',
		);
		selectConnection(connection.id);
		const id = randomUUID();
		const message = 'Revise only the criteria and save my existing plan.';
		await expect(math.runMathTurn(owner.id, id, message)).rejects.toThrow();
		expect((await math.getMathSession(owner.id)).pending?.id).toBe(id);
		available = true;
		selectConnection(null);
		const result = await math.runMathTurn(owner.id, id, message);
		expect(result.pending).toBeNull();
		expect(result.messages.filter((m) => m.content === message)).toHaveLength(
			1,
		);
		expect(result.learner.coursePlans![0].revision).toBe(2);
		expect(
			requests
				.at(-1)
				.tools.find((t: any) => t.function.name === 'save_learning_checkpoint')
				.function.parameters.properties.updates,
		).toBeDefined();
		expect(
			requests
				.at(-1)
				.messages.find(
					(m: any) =>
						m.role === 'tool' && m.tool_call_id === 'incremental-save',
				).content,
		).toContain('saved');
	} finally {
		server.closeAllConnections();
		await new Promise<void>((r) => server.close(() => r()));
	}
}, 20000);
it('rejects incremental rewrites of original evidence and accepts idempotent attempt additions', async () => {
	const { applyCheckpointSave } =
		await import('../src/lib/server/math/checkpoint');
	const learner = { ...emptyLearner(), coursePlans: [plan()] };
	const attempt = {
		id: 'original',
		objectiveIds: ['remainders'],
		exercise: '17 mod 5',
		studentAnswer: '2',
		support: 'hinted' as const,
		kind: 'routine' as const,
		result: 'correct' as const,
		feedback: 'Correct with a hint',
	};
	learner.coursePlans[0].lessons[0].attempts = [attempt];
	const input = (attempts: unknown[]) => ({
		updates: {
			plans: [{ id: 'integers', lessons: [{ courseId: 'V1-C05', attempts }] }],
		},
	});
	expect(() =>
		applyCheckpointSave(
			input([{ ...attempt, support: 'independent' }]),
			learner,
		),
	).toThrow('immutable');
	expect(
		applyCheckpointSave(input([attempt]), learner).coursePlans![0].lessons[0]
			.attempts,
	).toEqual([attempt]);
	expect(learner.coursePlans[0].lessons[0].attempts).toEqual([attempt]);
});
