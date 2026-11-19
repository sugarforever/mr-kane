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
let releaseReply;
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
	const isIrmo = context.messages
		.filter((m) => m.role === 'user')
		.at(-1)
		?.content.includes('IRMO-2024-P2-Q6');
	const toolText = parsed.messages
		.filter((m) => m.role === 'tool')
		.map((m) => m.content)
		.join('\n');
	const needIrmo = isIrmo && !toolText.includes('IRMO-2024-P2-Q6');
	const needAops = isIrmo && !needIrmo && !toolText.includes('pdf-page-');
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
	if (isIrmo) {
		assert.ok(parsed.tools.some((t) => t.function.name === 'irmo_read'));
		assert.ok(parsed.tools.some((t) => t.function.name === 'aops_read'));
		answer.reply =
			'Let’s work on **IrMO 2024, Paper 2, Question 6**.\n\n$$\\binom{n}{1}+\\binom{n}{3}=2^m.$$\n\nThe binomial coefficient $\\binom{n}{3}$ counts ways to choose three objects from $n$. Start by writing it as $n(n-1)(n-2)/6$. What happens when you try $n=3$ and $n=4$?\n\nFor the foundations, we can revisit **AoPS Volume 1, section 5.1 (Divisibility)** and then binomial coefficients. [Original question](https://maths.ucd.ie/~dukes/Irish_Maths_Olympiad_Compendium.pdf#page=81).';
		answer.learner.goal = 'Prepare for Irish Mathematical Olympiad Round 2';
	}
	const delta =
		calls === 1 || needIrmo || needAops
			? {
					role: 'assistant',
					tool_calls: [
						{
							index: 0,
							id: 'read-math',
							type: 'function',
							function: {
								name: needIrmo ? 'irmo_read' : 'aops_read',
								arguments: needIrmo
									? JSON.stringify({ id: 'IRMO-2024-P2-Q6' })
									: needAops
										? JSON.stringify({ chapterId: 'V1-C05', section: '5.1' })
										: '{"chapterId":"V1-C03","section":"3.2"}',
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
	if (calls === 2) {
		const gate = new Promise((resolve) => {
			releaseReply = resolve;
		});
		const text = JSON.stringify(answer);
		res.write(
			`data: ${JSON.stringify(chunk({ role: 'assistant', content: text.slice(0, 60) }, null))}\n\n`,
		);
		await gate;
		res.end(
			`data: ${JSON.stringify(chunk({ content: text.slice(60) }, null))}\n\ndata: ${JSON.stringify(chunk({}, 'stop'))}\n\ndata: [DONE]\n\n`,
		);
		return;
	}
	res.end(
		`data: ${JSON.stringify(chunk(delta, null))}\n\ndata: ${JSON.stringify(chunk({}, calls === 1 || needIrmo || needAops ? 'tool_calls' : 'stop'))}\n\ndata: [DONE]\n\n`,
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
async function streamPost(path, body) {
	const response = await fetch(root + path, {
		method: 'POST',
		headers: {
			origin: root,
			'Content-Type': 'application/json',
			Accept: 'application/x-ndjson',
		},
		body: JSON.stringify(body),
	});
	assert.ok(response.ok);
	assert.ok(
		response.headers.get('Content-Type').includes('application/x-ndjson'),
	);
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let pending = '',
		sawPartial = false;
	try {
		for (;;) {
			const { value, done } = await reader.read();
			assert.ok(!done, 'Expected a complete event');
			pending += decoder.decode(value, { stream: true });
			let newline;
			while ((newline = pending.indexOf('\n')) >= 0) {
				const line = pending.slice(0, newline);
				pending = pending.slice(newline + 1);
				if (!line.trim()) continue;
				const event = JSON.parse(line);
				if (event.type === 'error') throw new Error(event.message);
				if (event.type === 'progress' && event.reply) {
					assert.equal(event.learner, undefined);
					sawPartial = true;
					releaseReply();
				}
				if (event.type === 'complete') {
					assert.ok(sawPartial, 'Reply must stream before completion');
					return event.session;
				}
			}
		}
	} finally {
		releaseReply?.();
		await reader.cancel();
	}
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
	const first = await streamPost(`/api/math/chat/${session.id}`, turn);
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
	const irmoList = await (
		await fetch(root + '/api/math/irmo?year=2024&paper=2')
	).json();
	assert.equal(irmoList.questions.length, 5);
	const question = await (
		await fetch(root + '/api/math/irmo?id=IRMO-2024-P2-Q6')
	).json();
	assert.ok(question.content.includes('\\binom{n}{3}'));
	const irmoTurn = await post(`/api/math/chat/${session.id}`, {
		requestId: randomUUID(),
		message:
			'Help me study IRMO-2024-P2-Q6 and its AoPS prerequisites. I can study 3 hours a week.',
	});
	assert.ok(irmoTurn.messages.at(-1).content.includes('IrMO 2024'));
	assert.equal(calls, 6);
	const source = await fetch(root + question.scanUrl);
	assert.equal(source.headers.get('content-type'), 'image/png');
	const blocked = await fetch(root + '/api/math/irmo?year=2024', {
		headers: { origin: 'https://foreign.test' },
	});
	assert.equal(blocked.status, 403);
	console.log(
		'Math production smoke: incremental HTTP streaming, AoPS and IrMO tools, question browsing, profile, restart, replay, source images and access checks passed.',
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
