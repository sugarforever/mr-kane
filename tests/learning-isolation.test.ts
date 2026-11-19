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
const servers: Server[] = [];
let dir = '';
afterEach(async () => {
	for (const server of servers) {
		server.closeAllConnections();
		await new Promise<void>((r) => server.close(() => r()));
	}
	servers.length = 0;
	vi.unstubAllEnvs();
	if (dir) rmSync(dir, { recursive: true, force: true });
});
it('isolates an interrupted session from a second endpoint with the same provider and model IDs', async () => {
	dir = mkdtempSync(join(tmpdir(), 'learning-isolation-'));
	vi.stubEnv('MR_KANE_DATA_DIR', dir);
	vi.stubEnv('PI_API_KEY', '');
	let finishA = false,
		prompt = 'Teacher A';
	const requestsA: any[] = [],
		requestsB: any[] = [];
	async function provider(name: string, requests: any[], ready: () => boolean) {
		const server = createServer(async (req, res) => {
			let body = '';
			for await (const c of req) body += c;
			requests.push(JSON.parse(body));
			res.writeHead(200, { 'Content-Type': 'text/event-stream' });
			res.flushHeaders();
			if (!ready()) return;
			const chunk = (delta: unknown, finish_reason: string | null) =>
				JSON.stringify({
					id: 'isolation-fixture',
					object: 'chat.completion.chunk',
					created: 1,
					model: 'fixture',
					choices: [{ index: 0, delta, finish_reason }],
				});
			res.end(
				`data: ${chunk({ role: 'assistant', content: JSON.stringify({ reply: `Lesson ${name}`, learner: { era: name } }) }, null)}\n\ndata: ${chunk({}, 'stop')}\n\ndata: [DONE]\n\n`,
			);
		});
		servers.push(server);
		await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
		return saveConnection(
			{
				name,
				service: 'custom',
				authMode: 'api_key',
				baseUrl: `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`,
				modelId: 'fixture',
				models: ['fixture'],
				protocol: 'openai-completions',
			},
			`key-${name}`,
		);
	}
	const connectionA = await provider('A', requestsA, () => finishA),
		connectionB = await provider('B', requestsB, () => true);
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
			loadPrompt: async () => prompt,
			createTools: () => [],
			execution: { maxTurns: 1, streamTimeoutMs: 5000, timeoutMs: 150 },
		},
	});
	const a = await study.createSession(),
		b = await study.createSession(),
		idA = randomUUID();
	selectConnection(connectionA.id);
	await expect(
		study.runTurn(a.id, idA, 'Private question A'),
	).rejects.toThrow();
	expect((await study.getSession(a.id)).pending?.id).toBe(idA);
	const interruptedCalls = requestsA.length;
	prompt = 'Teacher B';
	selectConnection(connectionB.id);
	const savedB = await study.runTurn(b.id, randomUUID(), 'Private question B');
	expect(savedB.learner.era).toBe('B');
	expect(requestsA).toHaveLength(interruptedCalls);
	expect(
		requestsB.every((r) => !JSON.stringify(r).includes('Private question A')),
	).toBe(true);
	finishA = true;
	const savedA = await study.runTurn(a.id, idA, 'Private question A');
	expect(savedA.learner.era).toBe('A');
	expect(savedA.messages).toHaveLength(2);
	const resumed = requestsA.at(-1);
	expect(JSON.stringify(resumed.messages)).toContain('Teacher A');
	expect(JSON.stringify(resumed.messages)).not.toContain('Teacher B');
	expect(JSON.stringify(resumed.messages)).not.toContain('Private question B');
	expect(requestsB).toHaveLength(1);
}, 20000);
