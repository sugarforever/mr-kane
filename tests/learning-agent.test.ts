import { afterEach, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { defineTool } from '@earendil-works/pi-durable';
import type { AgentDefinition } from '../src/lib/server/agent';
import {
	saveConnection,
	selectConnection,
	database,
} from '../src/lib/server/providers-store';
import { createStudy } from '../src/lib/server/learning/study';
import { readStudyStream } from '../src/lib/study-stream';
import { studyResponse } from '../src/lib/server/learning/stream';
import { randomUUID } from 'node:crypto';
let server: Server | undefined;
let dir = '';
afterEach(async () => {
	server?.closeAllConnections();
	if (server) await new Promise<void>((r) => server!.close(() => r()));
	server = undefined;
	vi.unstubAllEnvs();
	if (dir) rmSync(dir, { recursive: true, force: true });
});
it('runs a non-math subject through the real runtime, tools, sessions and stream transport with replay isolation', async () => {
	dir = mkdtempSync(join(tmpdir(), 'learning-agent-'));
	vi.stubEnv('MR_KANE_DATA_DIR', dir);
	vi.stubEnv('PI_API_KEY', '');
	let calls = 0;
	let toolCalls = 0;
	const definition: AgentDefinition = {
		id: 'history-v1',
		loadPrompt: async () => 'Teach history using archive evidence.',
		execution: { maxTurns: 3, streamTimeoutMs: 55000, timeoutMs: 60000 },
		createTools: () => [
			defineTool({
				name: 'archive_read',
				description: 'Read a historical source',
				parameters: z.object({}),
				execute: async () => {
					toolCalls++;
					return {
						output: [
							{ type: 'text', text: 'Rome became a republic in 509 BCE.' },
						],
					};
				},
			}),
		],
	};
	server = createServer(async (req, res) => {
		let body = '';
		for await (const c of req) body += c;
		const input = JSON.parse(body);
		calls++;
		const system = input.messages
			.filter((m: any) => m.role === 'system')
			.map((m: any) => m.content)
			.join('\n');
		expect(system).toContain('Teach history using archive evidence.');
		expect(system).not.toMatch(/AoPS|Irish and Spanish/);
		expect(input.tools.map((t: any) => t.function.name)).toEqual([
			'archive_read',
		]);
		if (calls === 3) {
			const users = input.messages.filter((m: any) => m.role === 'user');
			expect(users).toHaveLength(2);
			expect(users[0].content).toContain('Teach me Rome');
			expect(
				input.messages.some(
					(m: any) =>
						m.role === 'assistant' &&
						m.content?.includes('Consider the Roman republic.'),
				),
			).toBe(true);
			const current = JSON.parse(users[1].content);
			expect(current.data.messages).toEqual([
				{ role: 'user', content: 'What changed next?' },
			]);
			expect(current.data.learner).toEqual({ era: 'Roman' });
		}
		if (calls === 2)
			expect(
				input.messages.find((m: any) => m.role === 'tool').content,
			).toContain('509 BCE');
		if (calls === 5) {
			expect(
				input.messages.some((m: any) => m.content?.includes('private invalid')),
			).toBe(false);
			expect(
				input.messages.some(
					(m: any) =>
						m.role === 'user' &&
						m.content.includes('Consider the Roman republic.'),
				),
			).toBe(true);
		}
		const delta =
			calls === 1
				? {
						role: 'assistant',
						tool_calls: [
							{
								index: 0,
								id: 'private-archive-call',
								type: 'function',
								function: { name: 'archive_read', arguments: '{}' },
							},
						],
					}
				: {
						role: 'assistant',
						content:
							calls === 4
								? '{"reply":"private invalid","learner":{}}'
								: '{"reply":"Consider the Roman republic.","learner":{"era":"Roman"}}',
					};
		const chunk = (delta: unknown, finish_reason: string | null) =>
			JSON.stringify({
				id: 'history-fixture',
				object: 'chat.completion.chunk',
				created: 1,
				model: 'fixture',
				choices: [{ index: 0, delta, finish_reason }],
			});
		res.writeHead(200, { 'Content-Type': 'text/event-stream' });
		res.end(
			`data: ${chunk(delta, null)}\n\ndata: ${chunk({}, calls === 1 ? 'tool_calls' : 'stop')}\n\ndata: [DONE]\n\n`,
		);
	});
	await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
	const connection = saveConnection(
		{
			name: 'History fixture',
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
	const study = createStudy({
		namespace: 'history',
		title: 'History',
		operation: 'history-chat',
		agent: definition,
		emptyLearner: () => ({ era: '' }),
		answerSchema: z.object({
			reply: z.string(),
			learner: z.object({ era: z.string() }),
		}),
	});
	const session = await study.createSession();
	const requestId = randomUUID();
	const progress: string[] = [];
	const result = await readStudyStream<
		Awaited<ReturnType<typeof study.getSession>>
	>(
		studyResponse(
			(onProgress) =>
				study.runTurn(
					session.id,
					requestId,
					'Teach me Rome',
					undefined,
					onProgress,
				),
			() => 'History failed',
		),
		(event) => progress.push(event.reply),
	);
	expect(result.learner).toEqual({ era: 'Roman' });
	expect(result.messages.at(-1)?.content).toBe('Consider the Roman republic.');
	expect(
		progress.every(
			(p) => !p.includes('private-archive-call') && !p.includes('learner'),
		),
	).toBe(true);
	expect(toolCalls).toBe(1);
	await study.runTurn(session.id, requestId, 'Teach me Rome');
	expect(calls).toBe(2);
	await study.runTurn(session.id, randomUUID(), 'What changed next?');
	expect(calls).toBe(3);
	const failedId = randomUUID();
	await expect(
		study.runTurn(session.id, failedId, 'An invalid response'),
	).rejects.toThrow(/incomplete/);
	const beforeDiscard = await study.getSession(session.id);
	expect(beforeDiscard.messages).toHaveLength(4);
	expect(beforeDiscard.learner).toEqual({ era: 'Roman' });
	await expect(
		study.runTurn(session.id, failedId, 'An invalid response'),
	).rejects.toThrow(/incomplete/);
	expect(calls).toBe(4);
	await study.discardTurn(session.id, failedId);
	await study.runTurn(session.id, randomUUID(), 'Try a new question');
	expect(calls).toBe(5);
	const db = database();
	try {
		expect(
			db
				.prepare(
					"SELECT name FROM sqlite_master WHERE name IN ('history_sessions','history_turns')",
				)
				.all(),
		).toEqual([]);
		expect(db.prepare('SELECT id FROM jobs').all()).toEqual([]);
	} finally {
		db.close();
	}
});
