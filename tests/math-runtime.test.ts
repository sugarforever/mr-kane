import { afterEach, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
	saveConnection,
	selectConnection,
} from '../src/lib/server/providers-store';
import type { MathProgress } from '../src/lib/math-stream';
import { createMathSession, runMathTurn } from '../src/lib/server/math/study';
let server: Server | undefined;
let dir = '';
afterEach(async () => {
	if (server) await new Promise<void>((r) => server!.close(() => r()));
	server = undefined;
	vi.unstubAllEnvs();
	if (dir) rmSync(dir, { recursive: true, force: true });
});
it('runs an AoPS retrieval tool through Pi and keeps math context separate from language coaching', async () => {
	dir = mkdtempSync(join(tmpdir(), 'kane-math-wire-'));
	vi.stubEnv('MR_KANE_DATA_DIR', dir);
	vi.stubEnv('PI_API_KEY', '');
	let requests = 0;
	const learner = {
		background: 'Grade 10',
		goal: 'Number theory',
		weeklyTime: '',
		reportedKnowledge: [],
		strengths: [],
		gaps: ['Remainders'],
		observations: [],
	};
	server = createServer(async (req, res) => {
		let body = '';
		for await (const c of req) body += c;
		const parsed = JSON.parse(body);
		requests++;
		const system = parsed.messages
			.filter((m: any) => m.role === 'system')
			.map((m: any) => m.content)
			.join('\n');
		expect(system).toContain('CURRENT conversation');
		expect(system).toContain('AoPS');
		expect(system).not.toContain('Irish and Spanish language coach');
		expect(parsed.tools.some((t: any) => t.function.name === 'aops_read')).toBe(
			true,
		);
		if (requests === 2) {
			const tool = parsed.messages.find((m: any) => m.role === 'tool');
			expect(tool.content).toContain('Modular Arithmetic');
			expect(tool.content).toContain('/api/math/library/');
		}
		if (requests === 3) {
			const input = JSON.parse(
				parsed.messages.filter((m: any) => m.role === 'user').at(-1).content,
			);
			expect(input.data.learner.background).toBe('Grade 10');
			expect(
				parsed.messages.some(
					(m: any) =>
						m.role === 'user' && m.content.includes('I am in Grade 10'),
				),
			).toBe(true);
		}
		const delta =
			requests === 1
				? {
						role: 'assistant',
						tool_calls: [
							{
								index: 0,
								id: 'read-1',
								type: 'function',
								function: {
									name: 'aops_read',
									arguments: '{"chapterId":"V1-C05","section":"5.4"}',
								},
							},
						],
					}
				: {
						role: 'assistant',
						content: JSON.stringify({
							reply:
								'A residue is a remainder. What is the remainder of 12 divided by 5?',
							learner,
						}),
					};
		res.writeHead(200, { 'Content-Type': 'text/event-stream' });
		const chunk = (delta: unknown, finish_reason: string | null) => ({
			id: 'math-fixture',
			object: 'chat.completion.chunk',
			created: 1,
			model: 'fixture',
			choices: [{ index: 0, delta, finish_reason }],
		});
		res.end(
			`data: ${JSON.stringify(chunk(delta, null))}\n\ndata: ${JSON.stringify(chunk({}, requests === 1 ? 'tool_calls' : 'stop'))}\n\ndata: [DONE]\n\n`,
		);
	});
	await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
	const port = (server.address() as { port: number }).port;
	const connection = saveConnection(
		{
			name: 'Math fixture',
			service: 'custom',
			authMode: 'api_key',
			baseUrl: `http://127.0.0.1:${port}/v1`,
			modelId: 'fixture',
			models: ['fixture'],
			protocol: 'openai-completions',
		},
		'fixture-key',
	);
	selectConnection(connection.id);
	const session = await createMathSession();
	const id = randomUUID();
	const progress: MathProgress[] = [];
	const first = await runMathTurn(
		session.id,
		id,
		'I am in Grade 10',
		undefined,
		(event) => progress.push(event),
	);
	expect(progress.some((event) => event.status === 'reading')).toBe(true);
	expect(progress.every((event) => !event.reply.includes('read-1'))).toBe(true);
	expect(first.learner.background).toBe('Grade 10');
	expect(first.messages.at(-1)?.content).toContain('remainder');
	await runMathTurn(session.id, id, 'I am in Grade 10');
	expect(requests).toBe(2);
	await runMathTurn(session.id, randomUUID(), 'I think it is 2');
	expect(requests).toBe(3);
}, 20000);
