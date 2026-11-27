import { afterEach, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
let dir = '';
let server: Server | undefined;
afterEach(async () => {
	server?.closeAllConnections();
	if (server) await new Promise<void>((r) => server!.close(() => r()));
	if (dir) await rm(dir, { recursive: true, force: true });
});
it.each([200, 402, 'background-402', 'empty-output'])(
	'isolates real runtime data and reports provider HTTP %s correctly',
	async (status) => {
		dir = await mkdtemp(join(tmpdir(), 'kane-eval-runner-'));
		const sentinel = join(dir, 'development-sentinel');
		await writeFile(sentinel, 'must remain unchanged');
		let calls = 0;
		server = createServer(async (req, res) => {
			let body = '';
			for await (const data of req) body += data;
			const payload = JSON.parse(
				JSON.parse(body)
					.messages.filter((m: any) => m.role === 'user')
					.at(-1).content,
			);
			calls++;
			if (
				status === 402 ||
				(status === 'background-402' &&
					payload.operation === 'math-lesson-profile')
			) {
				res.writeHead(402, { 'Content-Type': 'application/json' });
				res.end(
					JSON.stringify({
						error: {
							message: 'Insufficient Balance',
							type: 'insufficient_balance_error',
						},
					}),
				);
				return;
			}
			res.writeHead(200, { 'Content-Type': 'text/event-stream' });
			const chunk = (delta: unknown, finish_reason: string | null) => ({
				id: 'eval-fixture',
				object: 'chat.completion.chunk',
				created: 1,
				model: 'fixture',
				choices: [{ index: 0, delta, finish_reason }],
			});
			const complete = status === 'background-402' && calls === 1;
			const delta = complete
				? {
						role: 'assistant',
						tool_calls: [
							{
								index: 0,
								id: 'complete-1',
								type: 'function',
								function: {
									name: 'complete_lesson',
									arguments: JSON.stringify({
										planId: 'integer-foundations',
										courseId: 'V1-C05',
									}),
								},
							},
						],
					}
				: {
						role: 'assistant',
						content:
							status === 'empty-output' ? ' ' : 'We will continue next time.',
					};
			res.end(
				`data: ${JSON.stringify(chunk(delta, null))}\n\ndata: ${JSON.stringify(chunk({}, complete ? 'tool_calls' : 'stop'))}\n\ndata: [DONE]\n\n`,
			);
		});
		await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
		const port = (server.address() as { port: number }).port;
		const output = join(dir, 'results');
		const child = spawn(
			process.execPath,
			[
				'scripts/evals/run.mjs',
				'--case',
				status === 'background-402' ? 'independent-completion' : 'pause',
				'--output-dir',
				output,
			],
			{
				env: {
					...process.env,
					DEEPSEEK_API_KEY: 'synthetic-eval-secret',
					MR_KANE_EVAL_BASE_URL: `http://127.0.0.1:${port}/v1`,
					MR_KANE_DATA_DIR: join(dir, 'development'),
				},
				stdio: ['ignore', 'pipe', 'pipe'],
			},
		);
		let log = '';
		child.stdout.on('data', (b) => (log += b));
		child.stderr.on('data', (b) => (log += b));
		const timeout = setTimeout(() => child.kill('SIGTERM'), 15000);
		const code = await new Promise<number | null>((r, reject) => {
			child.once('error', reject);
			child.once('exit', r);
		});
		clearTimeout(timeout);
		expect(log).not.toContain('synthetic-eval-secret');
		expect(await readFile(sentinel, 'utf8')).toBe('must remain unchanged');
		expect(await readdir(dir)).not.toContain('development');
		const [run] = await readdir(output);
		const results = JSON.parse(
			await readFile(join(output, run, 'results.json'), 'utf8'),
		);
		expect(results.results[0].verdict).toBe(
			status === 200 ? 'pass' : status === 'empty-output' ? 'fail' : 'error',
		);
		expect(code).toBe(status === 200 ? 0 : 1);
		expect(calls).toBeGreaterThan(0);
		const caseDir = join(
			output,
			run,
			status === 'background-402' ? 'independent-completion-1' : 'pause-1',
		);
		expect(
			JSON.parse(await readFile(join(caseDir, 'trace.json'), 'utf8')).chat,
		).toBeInstanceOf(Array);
		expect(
			JSON.parse(await readFile(join(caseDir, 'session.json'), 'utf8')).before
				.learner,
		).toBeDefined();
		if (status === 402 || status === 'background-402')
			expect(results.results[0].error.modelErrors.join('\n')).toContain(
				'Insufficient Balance',
			);
	},
	20000,
);
