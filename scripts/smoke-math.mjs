import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
const dir = mkdtempSync(join(tmpdir(), 'kane-math-production-'));
const root = 'http://127.0.0.1:4182';
let app;
let calls = 0;
const learner = {
	background: 'Grade 10',
	goal: 'Build confidence in algebra and number theory',
	weeklyTime: '3 hours',
	reportedKnowledge: ['Linear equations'],
	strengths: [],
	gaps: [],
	observations: [],
};
const model = createServer(async (req, res) => {
	if (req.url === '/v1/models') {
		res.setHeader('Content-Type', 'application/json');
		res.end(JSON.stringify({ data: [{ id: 'fixture', created: 1 }] }));
		return;
	}
	let body = '';
	for await (const c of req) body += c;
	const parsed = JSON.parse(body);
	calls++;
	const context = JSON.parse(
		parsed.messages.find((m) => m.role === 'user').content,
	).data;
	const first = context.messages.filter((m) => m.role === 'user').length === 1;
	const answer = {
		reply: first
			? 'We can build from what you already know. **Algebra and number theory** share a useful foundation: clear reasoning about equations and integers.\n\nBefore making your plan, let’s try one small question:\n\n$$2x+3=11$$\n\nWhat would you do first, and why? There’s no need to rush.'
			: 'Subtracting 3 from both sides preserves the equality:\n\n$$2x=8,\\qquad x=4.$$\n\nThat is a useful starting point for **AoPS Volume 1, section 3.2**. Next, we can connect equations to divisibility and remainders. How much time would you like to spend on each topic?',
		learner: {
			...learner,
			...(!first
				? {
						strengths: ['Solves a linear equation by preserving equality'],
						observations: [
							'Explained subtracting 3 from both sides in the diagnostic.',
						],
					}
				: {}),
		},
	};
	const delta =
		calls === 1
			? {
					role: 'assistant',
					tool_calls: [
						{
							index: 0,
							id: 'read-math',
							type: 'function',
							function: {
								name: 'aops_read',
								arguments: '{"chapterId":"V1-C03","section":"3.2"}',
							},
						},
					],
				}
			: { role: 'assistant', content: JSON.stringify(answer) };
	res.writeHead(200, { 'Content-Type': 'text/event-stream' });
	const chunk = (delta, finish_reason) => ({
		id: 'math-smoke',
		object: 'chat.completion.chunk',
		created: 1,
		model: 'fixture',
		choices: [{ index: 0, delta, finish_reason }],
	});
	res.end(
		`data: ${JSON.stringify(chunk(delta, null))}\n\ndata: ${JSON.stringify(chunk({}, calls === 1 ? 'tool_calls' : 'stop'))}\n\ndata: [DONE]\n\n`,
	);
});
await new Promise((r) => model.listen(0, '127.0.0.1', r));
async function launch() {
	app = spawn(process.execPath, ['build'], {
		cwd: process.cwd(),
		env: {
			...process.env,
			PI_API_KEY: '',
			MR_KANE_DATA_DIR: dir,
			HOST: '127.0.0.1',
			PORT: '4182',
			ORIGIN: root,
		},
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	await new Promise((resolve, reject) => {
		const timeout = setTimeout(
			() => reject(new Error('Startup timeout')),
			10000,
		);
		app.stdout.on('data', (b) => {
			if (b.toString().includes('Listening on')) {
				clearTimeout(timeout);
				resolve();
			}
		});
		app.once('exit', (code) => {
			clearTimeout(timeout);
			reject(new Error(`Exited ${code}`));
		});
	});
}
async function stop() {
	if (app && app.exitCode === null) {
		const p = new Promise((r) => app.once('exit', r));
		app.kill();
		await p;
	}
}
async function post(path, body) {
	const response = await fetch(root + path, {
		method: 'POST',
		headers: { origin: root, 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	});
	const value = await response.json();
	assert.ok(response.ok, JSON.stringify(value));
	return value;
}
try {
	await launch();
	await post('/api/ai/settings', {
		action: 'save',
		connection: {
			name: 'Local Math test provider',
			service: 'custom',
			authMode: 'api_key',
			baseUrl: `http://127.0.0.1:${model.address().port}/v1`,
			modelId: 'fixture',
			apiKey: 'synthetic-test-key',
			protocol: 'openai-completions',
		},
	});
	const session = await post('/api/math/sessions', {});
	const requestId = randomUUID();
	const turn = {
		requestId,
		message:
			'I am in Grade 10. I know linear equations and want a plan for algebra and number theory. I can study 3 hours a week.',
	};
	const first = await post(`/api/math/chat/${session.id}`, turn);
	assert.equal(first.learner.background, 'Grade 10');
	assert.equal(first.messages.length, 2);
	assert.equal(calls, 2);
	await stop();
	await launch();
	const replay = await post(`/api/math/chat/${session.id}`, turn);
	assert.equal(replay.messages.length, 2);
	assert.equal(calls, 2);
	const next = await post(`/api/math/chat/${session.id}`, {
		requestId: randomUUID(),
		message: 'Subtract 3 from both sides, then divide by 2. x = 4.',
	});
	assert.equal(next.messages.length, 4);
	assert.equal(next.learner.strengths.length, 1);
	assert.equal(calls, 3);
	const foreign = await fetch(root + '/api/math/sessions', {
		headers: { origin: 'https://foreign.test' },
	});
	assert.equal(foreign.status, 403);
	const image = await fetch(
		root + '/api/math/library/volume-1-the-basics/assets/pdf-page-031.png',
	);
	assert.equal(image.headers.get('content-type'), 'image/png');
	console.log(
		'Math production smoke: tools, profile, restart, replay, source images and access checks passed.',
	);
	if (process.argv.includes('--serve')) {
		console.log(`Local UI fixture: ${root}/math?session=${session.id}`);
		await new Promise((r) => {
			process.once('SIGINT', r);
			process.once('SIGTERM', r);
		});
	}
} finally {
	await stop();
	model.closeAllConnections();
	await new Promise((r) => model.close(r));
	rmSync(dir, { recursive: true, force: true });
}
