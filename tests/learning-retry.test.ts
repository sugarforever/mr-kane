import { afterEach, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
	saveConnection,
	selectConnection,
} from '../src/lib/server/providers-store';
import { createStudy } from '../src/lib/server/learning/study';
let server: Server | undefined,
	dir = '';
afterEach(async () => {
	server?.closeAllConnections();
	if (server) await new Promise<void>((r) => server!.close(() => r()));
	vi.unstubAllEnvs();
	if (dir) rmSync(dir, { recursive: true, force: true });
});
it('continues a failed native submission on retry using its frozen provider and original user input', async () => {
	dir = mkdtempSync(join(tmpdir(), 'learning-retry-'));
	vi.stubEnv('MR_KANE_DATA_DIR', dir);
	vi.stubEnv('PI_API_KEY', '');
	let available = false,
		calls = 0;
	const inputs: any[] = [];
	server = createServer(async (req, res) => {
		let body = '';
		for await (const c of req) body += c;
		const input = JSON.parse(body);
		calls++;
		inputs.push(input);
		if (!available) {
			res.writeHead(503, { 'Content-Type': 'application/json' });
			res.end('{"error":{"message":"temporarily unavailable"}}');
			return;
		}
		const chunk = (delta: unknown, finish_reason: string | null) =>
			JSON.stringify({
				id: 'retry-fixture',
				object: 'chat.completion.chunk',
				created: 1,
				model: 'fixture',
				choices: [{ index: 0, delta, finish_reason }],
			});
		res.writeHead(200, { 'Content-Type': 'text/event-stream' });
		res.end(
			`data: ${chunk({ role: 'assistant', content: '{"reply":"Recovered lesson","learner":{"era":"Roman"}}' }, null)}\n\ndata: ${chunk({}, 'stop')}\n\ndata: [DONE]\n\n`,
		);
	});
	await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
	const connection = saveConnection(
		{
			name: 'Retry fixture',
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
		emptyLearner: () => ({ era: '' }),
		answerSchema: z.object({
			reply: z.string(),
			learner: z.object({ era: z.string() }),
		}),
		agent: {
			id: 'history-v1',
			loadPrompt: async () => 'Teach history',
			createTools: () => [],
			execution: { maxTurns: 2, streamTimeoutMs: 55000, timeoutMs: 60000 },
		},
	});
	const session = await study.createSession(),
		id = randomUUID();
	await expect(study.runTurn(session.id, id, 'Teach Rome')).rejects.toThrow(
		/failed/,
	);
	expect((await study.getSession(session.id)).pending?.id).toBe(id);
	expect((await study.getSession(session.id)).messages).toEqual([]);
	const failures = calls;
	available = true;
	selectConnection(null);
	const saved = await study.runTurn(session.id, id, 'Teach Rome');
	expect(calls).toBe(failures + 1);
	expect(saved.messages.map((m) => m.content)).toEqual([
		'Teach Rome',
		'Recovered lesson',
	]);
	expect(saved.pending).toBeNull();
	expect(
		inputs.at(-1).messages.filter((m: any) => m.role === 'user'),
	).toHaveLength(1);
	expect(await study.hasRequest(id)).toBe(true);
	await study.runTurn(session.id, id, 'Teach Rome');
	expect(calls).toBe(failures + 1);
}, 20000);
