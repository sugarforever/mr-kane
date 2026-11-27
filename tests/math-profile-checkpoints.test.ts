import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { emptyLearner } from '../src/lib/math';
import {
	createMathSession,
	getMathSession,
	runMathTurn,
} from '../src/lib/server/math/study';
import * as agent from '../src/lib/server/agent';
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import { defineDocFamily } from '@earendil-works/pi-durable';
import type { ToolExecutionApi } from '@earendil-works/pi-durable';

let dir = '';
afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
	if (dir) rmSync(dir, { recursive: true, force: true });
});
function setup() {
	dir = mkdtempSync(join(tmpdir(), 'math-checkpoint-'));
	vi.stubEnv('MR_KANE_DATA_DIR', dir);
}
const completion = { planId: 'integers', courseId: 'V1-C05' };
function completeReply(
	reply: string,
): NonNullable<Parameters<typeof runMathTurn>[3]> {
	return async (_op, _data, schema, requestId, options) => {
		expect(schema).toBeUndefined();
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
			.find((t) => t.name === 'complete_lesson')!;
		expect(tool).toBeDefined();
		await tool.execute(completion, {} as ToolExecutionApi, BACKGROUND_CONTEXT);
		return reply;
	};
}
function completedLearner() {
	return {
		...emptyLearner(),
		background: 'Grade 10',
		coursePlans: [
			{
				id: 'integers',
				domain: 'number-theory',
				title: 'Integers',
				revision: 1,
				changeReason: 'Initial plan',
				lessons: [
					{
						courseId: 'V1-C05',
						title: 'Integers',
						status: 'completed',
						phase: 'report',
						objectives: [
							{ id: 'residues', description: 'Compute and explain remainders' },
						],
						attempts: [
							{
								id: 'a1',
								objectiveIds: ['residues'],
								exercise: '12 mod 5',
								studentAnswer: 'The remainder is 2.',
								support: 'independent',
								kind: 'routine',
								result: 'correct',
								feedback: 'Correct',
							},
							{
								id: 'a2',
								objectiveIds: ['residues'],
								exercise: 'Explain 17 mod 5',
								studentAnswer: '17 = 3 times 5 plus 2.',
								support: 'independent',
								kind: 'explanation',
								result: 'correct',
								feedback: 'Correct explanation',
							},
						],
						report: {
							summary: 'Independent application and explanation.',
							nextStep: 'Congruences',
						},
					},
				],
			},
		],
	};
}
it('accepts a reply without a learner and preserves profile even if an old response includes one', async () => {
	setup();
	const profile = vi.spyOn(agent, 'runAgent');
	const s = await createMathSession();
	await runMathTurn(
		s.id,
		randomUUID(),
		'I am in Grade 10.',
		async () => 'Let us begin.',
	);
	await runMathTurn(s.id, randomUUID(), 'A hint?', async () =>
		JSON.stringify({ reply: 'Try dividing.', learner: completedLearner() }),
	);
	const saved = await getMathSession(s.id);
	expect(saved.learner).toEqual(emptyLearner());
	expect(saved.messages).toHaveLength(4);
	expect(profile).not.toHaveBeenCalled();
});
it('finishes chat before consolidation, permits another turn, and commits only the learner once', async () => {
	setup();
	let release!: (value: string) => void;
	const profile = vi.spyOn(agent, 'runAgent').mockImplementation(
		() =>
			new Promise((r) => {
				release = r;
			}),
	);
	const s = await createMathSession();
	const id = randomUUID();
	const result = await runMathTurn(
		s.id,
		id,
		'The remainder is 2. 17 = 3 times 5 plus 2.',
		completeReply('Lesson complete.'),
	);
	expect(result.pending).toBeNull();
	expect(result.learner).toEqual(emptyLearner());
	await vi.waitFor(() => expect(profile).toHaveBeenCalledTimes(1));
	const after = await runMathTurn(
		s.id,
		randomUUID(),
		'Next lesson please',
		async () => 'Let us start congruences.',
	);
	expect(after.messages).toHaveLength(4);
	release(JSON.stringify({ learner: completedLearner() }));
	await vi.waitFor(async () =>
		expect((await getMathSession(s.id)).learner.background).toBe('Grade 10'),
	);
	const saved = await getMathSession(s.id);
	expect(saved.messages).toEqual(after.messages);
	expect(saved.pending).toBeNull();
	await runMathTurn(
		s.id,
		id,
		'The remainder is 2. 17 = 3 times 5 plus 2.',
		async () => {
			throw Error('must not regenerate');
		},
	);
	await runMathTurn(
		s.id,
		randomUUID(),
		'Confirm the completed lesson',
		completeReply('Already completed.'),
	);
	expect(profile).toHaveBeenCalledTimes(1);
	expect(profile.mock.calls[0][1]).toMatchObject({ messages: result.messages });
});

it.each(['missing evidence', 'wrong lesson', 'invalid schema'])(
	'rejects %s without changing the profile or blocking chat',
	async (failure) => {
		setup();
		const bad = completedLearner();
		if (failure === 'missing evidence')
			bad.coursePlans[0].lessons[0].attempts[0].studentAnswer =
				'Invented answer';
		if (failure === 'wrong lesson') bad.coursePlans[0].id = 'another-plan';
		const profile = vi
			.spyOn(agent, 'runAgent')
			.mockResolvedValue(
				JSON.stringify({ learner: failure === 'invalid schema' ? {} : bad }),
			);
		const s = await createMathSession();
		await runMathTurn(
			s.id,
			randomUUID(),
			'The remainder is 2. 17 = 3 times 5 plus 2.',
			completeReply('Assessment finished.'),
		);
		await vi.waitFor(async () =>
			expect((await getMathSession(s.id)).profileUpdate).toBe('failed'),
		);
		expect(profile).toHaveBeenCalledTimes(3);
		expect(new Set(profile.mock.calls.map((c) => c[3])).size).toBe(3);
		const next = await runMathTurn(
			s.id,
			randomUUID(),
			'Explain again',
			async () => 'Of course.',
		);
		expect(next.pending).toBeNull();
		expect(next.learner).toEqual(emptyLearner());
		expect(next.messages).toHaveLength(4);
	},
);

it('retries a transient consolidation failure using the same conversation boundary', async () => {
	setup();
	const profile = vi
		.spyOn(agent, 'runAgent')
		.mockRejectedValueOnce(new Error('offline'))
		.mockResolvedValue(JSON.stringify({ learner: completedLearner() }));
	const s = await createMathSession();
	const result = await runMathTurn(
		s.id,
		randomUUID(),
		'The remainder is 2. 17 = 3 times 5 plus 2.',
		completeReply('Lesson complete.'),
	);
	await vi.waitFor(async () =>
		expect((await getMathSession(s.id)).learner.background).toBe('Grade 10'),
	);
	expect(profile).toHaveBeenCalledTimes(2);
	expect(profile.mock.calls[0][1]).toEqual(profile.mock.calls[1][1]);
	expect((profile.mock.calls[1][1] as any).messages).toEqual(result.messages);
	expect((await getMathSession(s.id)).profileUpdate).toBeUndefined();
});

it('allows a fresh completion assessment after exhausted retries and supersedes the failed job', async () => {
	setup();
	const profile = vi
		.spyOn(agent, 'runAgent')
		.mockResolvedValue(JSON.stringify({ learner: completedLearner() }));
	const s = await createMathSession();
	await runMathTurn(
		s.id,
		randomUUID(),
		'Please assess my lesson',
		completeReply('Assessment.'),
	);
	await vi.waitFor(async () =>
		expect((await getMathSession(s.id)).profileUpdate).toBe('failed'),
	);
	expect(profile).toHaveBeenCalledTimes(3);
	await runMathTurn(
		s.id,
		randomUUID(),
		'Assess again without new evidence',
		completeReply('Assessment.'),
	);
	await vi.waitFor(async () => {
		expect(profile).toHaveBeenCalledTimes(6);
		expect((await getMathSession(s.id)).profileUpdate).toBe('failed');
	});
	await runMathTurn(
		s.id,
		randomUUID(),
		'The remainder is 2. 17 = 3 times 5 plus 2.',
		completeReply('Now the evidence is complete.'),
	);
	await vi.waitFor(async () =>
		expect((await getMathSession(s.id)).learner.background).toBe('Grade 10'),
	);
	expect(profile).toHaveBeenCalledTimes(7);
	expect((await getMathSession(s.id)).profileUpdate).toBeUndefined();
});

it('serializes profile generation across sessions without blocking their chat turns', async () => {
	setup();
	let release!: (value: string) => void;
	const profile = vi
		.spyOn(agent, 'runAgent')
		.mockImplementationOnce(
			() =>
				new Promise((r) => {
					release = r;
				}),
		)
		.mockResolvedValue(JSON.stringify({ learner: completedLearner() }));
	const a = await createMathSession(),
		b = await createMathSession();
	const message = 'The remainder is 2. 17 = 3 times 5 plus 2.';
	const generate = completeReply('Complete.');
	await runMathTurn(a.id, randomUUID(), message, generate);
	await vi.waitFor(() => expect(profile).toHaveBeenCalledTimes(1));
	await runMathTurn(b.id, randomUUID(), message, generate);
	expect(profile).toHaveBeenCalledTimes(1);
	expect((await getMathSession(b.id)).pending).toBeNull();
	release(JSON.stringify({ learner: completedLearner() }));
	await vi.waitFor(async () =>
		expect((await getMathSession(b.id)).learner.background).toBe('Grade 10'),
	);
	expect(profile).toHaveBeenCalledTimes(2);
	expect(profile.mock.calls.every((c) => c[5]?.waitForCapacity)).toBe(true);
});

it('does not trigger updates from completion prose or JSON fields without a tool call', async () => {
	setup();
	const profile = vi.spyOn(agent, 'runAgent');
	const s = await createMathSession();
	await runMathTurn(
		s.id,
		randomUUID(),
		'Am I done?',
		async () => 'This lesson is complete.',
	);
	await runMathTurn(s.id, randomUUID(), 'Confirm', async () =>
		JSON.stringify({ reply: 'Complete.', lessonCompletion: completion }),
	);
	expect((await getMathSession(s.id)).profileUpdate).toBeUndefined();
	expect(profile).not.toHaveBeenCalled();
});
it('retains a tool request through a failed reply and queues it exactly once on retry', async () => {
	setup();
	const profile = vi
		.spyOn(agent, 'runAgent')
		.mockResolvedValue(JSON.stringify({ learner: completedLearner() }));
	const s = await createMathSession(),
		id = randomUUID();
	const message = 'The remainder is 2. 17 = 3 times 5 plus 2.';
	await expect(
		runMathTurn(s.id, id, message, async (...args) => {
			await completeReply('Complete.')(...args);
			throw Error('interrupted');
		}),
	).rejects.toThrow('interrupted');
	expect(profile).not.toHaveBeenCalled();
	await runMathTurn(s.id, id, message, async () => 'Lesson complete.');
	await vi.waitFor(async () =>
		expect((await getMathSession(s.id)).learner.background).toBe('Grade 10'),
	);
	expect(profile).toHaveBeenCalledTimes(1);
});
it('deduplicates repeated completion tool calls within one turn', async () => {
	setup();
	const profile = vi
		.spyOn(agent, 'runAgent')
		.mockResolvedValue(JSON.stringify({ learner: completedLearner() }));
	const s = await createMathSession();
	await runMathTurn(
		s.id,
		randomUUID(),
		'The remainder is 2. 17 = 3 times 5 plus 2.',
		async (...args) => {
			await completeReply('Complete.')(...args);
			await completeReply('Complete.')(...args);
			return 'Lesson complete.';
		},
	);
	await vi.waitFor(async () =>
		expect((await getMathSession(s.id)).learner.background).toBe('Grade 10'),
	);
	expect(profile).toHaveBeenCalledTimes(1);
});

it('finishes a JSON completion turn admitted before the Markdown upgrade', async () => {
	setup();
	const profile = vi
		.spyOn(agent, 'runAgent')
		.mockResolvedValue(JSON.stringify({ learner: completedLearner() }));
	const s = await createMathSession(),
		id = randomUUID();
	const message = 'The remainder is 2. 17 = 3 times 5 plus 2.';
	await expect(
		runMathTurn(s.id, id, message, async () => {
			throw Error('offline');
		}),
	).rejects.toThrow('offline');
	const Legacy = defineDocFamily<
		{ turns: Record<string, { replyFormat?: 'markdown' }> },
		string
	>({
		kind: 'app.study',
		version: 1,
		scope: 'session',
		family: true,
		initial: () => ({ turns: {} }),
		checkpointWhen: () => true,
	});
	const opened = await agent.openAgentHarness(
		join(dir, 'study/math', `${s.id}.sqlite`),
	);
	try {
		await opened.harness.commit(async (tx) => {
			delete (await tx.doc(Legacy, s.id, '')).turns[id].replyFormat;
		}, BACKGROUND_CONTEXT);
	} finally {
		await opened.harness.close(BACKGROUND_CONTEXT);
	}
	const result = await runMathTurn(s.id, id, message, async () =>
		JSON.stringify({ reply: 'Lesson complete.', lessonCompletion: completion }),
	);
	expect(result.messages.at(-1)?.content).toBe('Lesson complete.');
	await vi.waitFor(async () =>
		expect((await getMathSession(s.id)).learner.background).toBe('Grade 10'),
	);
	expect(profile).toHaveBeenCalledTimes(1);
});
