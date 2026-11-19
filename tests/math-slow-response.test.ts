import { afterEach, expect, it, vi } from 'vitest';
import { createServer, type ServerResponse, type Server } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setImmediate } from 'node:timers/promises';
import {
	saveConnection,
	selectConnection,
} from '../src/lib/server/providers-store';
import {
	createMathSession,
	getMathSession,
	runMathTurn,
} from '../src/lib/server/math/study';
import { emptyLearner } from '../src/lib/math';
let server: Server | undefined;
let dir = '';
afterEach(async () => {
	vi.useRealTimers();
	vi.restoreAllMocks();
	server?.closeAllConnections();
	if (server) await new Promise<void>((r) => server!.close(() => r()));
	server = undefined;
	vi.unstubAllEnvs();
	if (dir) rmSync(dir, { recursive: true, force: true });
});
it.each([
	{
		label: 'allows an extensive lesson beyond one minute',
		delay: 65000,
		shouldFinish: true,
	},
	{
		label: 'still bounds a stalled model and preserves its pending turn',
		delay: 185000,
		shouldFinish: false,
	},
])(
	'$label',
	async ({ delay, shouldFinish }) => {
		dir = mkdtempSync(join(tmpdir(), 'math-slow-'));
		vi.stubEnv('MR_KANE_DATA_DIR', dir);
		vi.stubEnv('PI_API_KEY', '');
		let response: ServerResponse | undefined;
		let ready!: () => void;
		const received = new Promise<void>((r) => {
			ready = r;
		});
		server = createServer(async (req, res) => {
			for await (const _ of req) {
				/* Consume the request before exposing the live stream. */
			}
			res.writeHead(200, { 'Content-Type': 'text/event-stream' });
			res.flushHeaders();
			response = res;
			ready();
		});
		await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
		const port = (server.address() as { port: number }).port;
		const connection = saveConnection(
			{
				name: 'Slow lesson fixture',
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
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		// Node's native AbortSignal.timeout does not use Vitest's clock. Preserve its
		// cancellation semantics with the fake clock so this exercises real SDK waits.
		vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
			const controller = new AbortController();
			setTimeout(
				() => controller.abort(new DOMException('Timed out', 'TimeoutError')),
				ms,
			);
			return controller.signal;
		});
		const session = createMathSession();
		let settled = false;
		const turn = runMathTurn(
			session.id,
			randomUUID(),
			'Teach me symmetric identities thoroughly.',
		);
		// Observe rejection immediately so the expected red phase has no unhandled rejection.
		const observed = turn.then(
			(value) => ({ value, error: null }),
			(error) => ({ value: null, error }),
		);
		void observed.then(() => {
			settled = true;
		});
		await received;
		await setImmediate();
		await vi.advanceTimersByTimeAsync(delay);
		const completedEarly = settled;
		const answer = JSON.stringify({
			reply: 'Here is the completed lesson on symmetric identities.',
			learner: emptyLearner(),
		});
		const chunk = (delta: unknown, finish_reason: string | null) => ({
			id: 'slow-lesson',
			object: 'chat.completion.chunk',
			created: 1,
			model: 'fixture',
			choices: [{ index: 0, delta, finish_reason }],
		});
		response!.end(
			`data: ${JSON.stringify(chunk({ role: 'assistant', content: answer }, null))}\n\ndata: ${JSON.stringify(chunk({}, 'stop'))}\n\ndata: [DONE]\n\n`,
		);
		vi.useRealTimers();
		const result = await observed;
		expect(completedEarly).toBe(!shouldFinish);
		if (shouldFinish) {
			expect(result.error).toBeNull();
			expect(result.value?.messages.at(-1)?.content).toContain(
				'completed lesson',
			);
		} else {
			expect(result.error).toBeTruthy();
			expect(getMathSession(session.id).pending).not.toBeNull();
			expect(getMathSession(session.id).messages).toHaveLength(0);
		}
	},
	10000,
);
