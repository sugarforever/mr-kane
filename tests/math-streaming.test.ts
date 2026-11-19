import { afterEach, expect, it, vi } from 'vitest';
import { createServer, type Server, type ServerResponse } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
	saveConnection,
	selectConnection,
} from '../src/lib/server/providers-store';
import {
	createMathSession,
	getMathSession,
} from '../src/lib/server/math/study';
import { emptyLearner } from '../src/lib/math';
import { POST } from '../src/routes/api/math/chat/[id]/+server';

let server: Server | undefined;
let dir = '';
let release: (() => void) | undefined;
afterEach(async () => {
	release?.();
	server?.closeAllConnections();
	if (server) await new Promise<void>((r) => server!.close(() => r()));
	server = undefined;
	vi.unstubAllEnvs();
	if (dir) rmSync(dir, { recursive: true, force: true });
});
function delta(
	res: ServerResponse,
	content: string,
	finish_reason: string | null = null,
) {
	res.write(
		`data: ${JSON.stringify({ id: 'stream-fixture', object: 'chat.completion.chunk', created: 1, model: 'fixture', choices: [{ index: 0, delta: { content }, finish_reason }] })}\n\n`,
	);
}
async function setup(suffix?: string) {
	dir = mkdtempSync(join(tmpdir(), 'math-stream-'));
	vi.stubEnv('MR_KANE_DATA_DIR', dir);
	vi.stubEnv('PI_API_KEY', '');
	let calls = 0;
	const gate = new Promise<void>((r) => {
		release = r;
	});
	server = createServer(async (req, res) => {
		for await (const _ of req) {
			/* consume request */
		}
		calls++;
		res.writeHead(200, { 'Content-Type': 'text/event-stream' });
		delta(res, '{"reply":"Try $x');
		await gate;
		delta(
			res,
			suffix ??
				'^2$\\nNext step: \\"factor\\".","learner":' +
					JSON.stringify(emptyLearner()) +
					'}',
		);
		delta(res, '', 'stop');
		res.end('data: [DONE]\n\n');
	});
	await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
	const port = (server.address() as { port: number }).port;
	const connection = saveConnection(
		{
			name: 'Streaming fixture',
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
	const session = createMathSession();
	const turn = { requestId: randomUUID(), message: 'Help me factor' };
	async function post(stream = true) {
		const url = new URL(`http://localhost/api/math/chat/${session.id}`);
		return POST({
			url,
			params: { id: session.id },
			request: new Request(url, {
				method: 'POST',
				headers: {
					origin: url.origin,
					'Content-Type': 'application/json',
					...(stream ? { Accept: 'application/x-ndjson' } : {}),
				},
				body: JSON.stringify(turn),
			}),
		} as any);
	}
	return { session, post, calls: () => calls };
}
async function until(
	reader: ReadableStreamDefaultReader<Uint8Array>,
	predicate: (event: any) => boolean,
) {
	const decoder = new TextDecoder();
	let pending = '';
	for (;;) {
		const chunk = await reader.read();
		if (chunk.done) throw new Error('Stream ended before expected event');
		pending += decoder.decode(chunk.value, { stream: true });
		let newline;
		while ((newline = pending.indexOf('\n')) >= 0) {
			const line = pending.slice(0, newline);
			pending = pending.slice(newline + 1);
			if (!line.trim()) continue;
			const event = JSON.parse(line);
			if (predicate(event)) return event;
		}
	}
}
it('delivers partial reply before generation finishes, then saves once and supports JSON replay', async () => {
	const { session, post, calls } = await setup();
	const response = await post();
	expect(response.headers.get('Content-Type')).toContain(
		'application/x-ndjson',
	);
	const reader = response.body!.getReader();
	try {
		const progress = await until(
			reader,
			(e) => e.type === 'progress' && e.reply,
		);
		expect(progress.reply).toBe('Try $x');
		expect(progress).not.toHaveProperty('learner');
		expect(getMathSession(session.id).messages).toHaveLength(0);
		release!();
		const complete = await until(reader, (e) => e.type === 'complete');
		expect(complete.session.messages.at(-1).content).toBe(
			'Try $x^2$\nNext step: "factor".',
		);
		expect(getMathSession(session.id)).toEqual(complete.session);
		expect(complete.session.pending).toBeNull();
		const replay = await (await post(false)).json();
		expect(replay.messages).toHaveLength(2);
		expect(calls()).toBe(1);
	} finally {
		release!();
		await reader.cancel();
	}
}, 10000);
it('reports invalid completion as a stream error and keeps the turn retryable', async () => {
	const { session, post } = await setup(' ends here","learner":{}}');
	const response = await post();
	const reader = response.body!.getReader();
	try {
		await until(reader, (e) => e.type === 'progress' && e.reply);
		release!();
		const failure = await until(reader, (e) => e.type === 'error');
		expect(failure.message).toMatch(/incomplete|retry/i);
		expect(getMathSession(session.id).pending).not.toBeNull();
		expect(getMathSession(session.id).messages).toHaveLength(0);
	} finally {
		release!();
		await reader.cancel();
	}
}, 10000);
it('continues saving after a streaming client disconnects', async () => {
	const { session, post, calls } = await setup();
	const response = await post();
	const reader = response.body!.getReader();
	await until(reader, (e) => e.type === 'progress' && e.reply);
	await reader.cancel();
	release!();
	await vi.waitFor(() =>
		expect(getMathSession(session.id).messages).toHaveLength(2),
	);
	const replay = await (await post(false)).json();
	expect(replay.pending).toBeNull();
	expect(calls()).toBe(1);
}, 10000);
