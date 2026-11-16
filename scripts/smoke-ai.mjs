import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const dir = mkdtempSync(join(tmpdir(), 'kane-production-'));
const root = 'http://127.0.0.1:4173';
let app;
let turns = 0;
let seenFirst;
const firstSeen = new Promise((r) => (seenFirst = r));
const content = {
	title: 'A real place',
	prompt: 'Describe a place you know.',
	script: 'Hay un parque cerca de mi casa.',
	vocabulary: ['parque · park'],
	focus: 'Present tense',
	sourceNote: 'Everyday observation.',
};
const model = createServer(async (req, res) => {
	if (req.url === '/v1/models') {
		res.setHeader('Content-Type', 'application/json');
		res.end(JSON.stringify({ data: [{ id: 'fixture', created: 1 }] }));
		return;
	}
	if (req.url === '/v1/chat/completions') {
		turns++;
		if (turns === 1) {
			seenFirst();
			return;
		}
		res.writeHead(200, { 'Content-Type': 'text/event-stream' });
		res.end(
			'data: ' +
				JSON.stringify({
					id: 'x',
					object: 'chat.completion.chunk',
					created: 1,
					model: 'fixture',
					choices: [
						{
							index: 0,
							delta: { role: 'assistant', content: JSON.stringify(content) },
							finish_reason: null,
						},
					],
				}) +
				'\n\ndata: ' +
				JSON.stringify({
					id: 'x',
					object: 'chat.completion.chunk',
					created: 1,
					model: 'fixture',
					choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
				}) +
				'\n\ndata: [DONE]\n\n',
		);
		return;
	}
	res.writeHead(404);
	res.end();
});
await new Promise((r) => model.listen(0, '127.0.0.1', r));
const baseUrl = `http://127.0.0.1:${model.address().port}/v1`;
async function launch() {
	app = spawn(process.execPath, ['build'], {
		cwd: process.cwd(),
		env: {
			...process.env,
			PI_API_KEY: '',
			MR_KANE_DATA_DIR: dir,
			HOST: '127.0.0.1',
			PORT: '4173',
			ORIGIN: root,
		},
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	await new Promise((resolve, reject) => {
		let out = '';
		const timeout = setTimeout(
			() => reject(new Error('Startup timed out')),
			10000,
		);
		app.stdout.on('data', (b) => {
			out += b;
			if (out.includes('Listening on')) {
				clearTimeout(timeout);
				resolve();
			}
		});
		app.once('exit', (code) => {
			clearTimeout(timeout);
			reject(new Error('App exited ' + code));
		});
	});
}
async function stop(signal = 'SIGTERM') {
	if (!app || app.exitCode !== null) return;
	const exited = new Promise((r) => app.once('exit', r));
	app.kill(signal);
	await exited;
}
async function post(path, body, id) {
	const r = await fetch(root + path, {
		method: 'POST',
		headers: {
			origin: root,
			'Content-Type': 'application/json',
			...(id ? { 'x-request-id': id } : {}),
		},
		body: JSON.stringify(body),
	});
	const json = await r.json();
	return { status: r.status, value: json };
}
try {
	await launch();
	const save = await post('/api/ai/settings', {
		action: 'save',
		connection: {
			name: 'Smoke test',
			service: 'custom',
			authMode: 'api_key',
			baseUrl,
			modelId: 'fixture',
			apiKey: 'synthetic-secret',
			protocol: 'openai-completions',
		},
	});
	assert.equal(save.status, 200);
	assert.ok(!JSON.stringify(save.value).includes('synthetic-secret'));
	console.log(
		'Production settings save, model discovery, and secret redaction: OK',
	);
	const input = {
		profile: {
			language: 'es',
			ageGroup: 'Middle school',
			level: 'A2',
			interests: 'Parks',
			vocabulary: '',
			grammar: '',
		},
		mode: 'writing',
		sourceType: 'daily',
		research: false,
		material: '',
	};
	const original = post('/api/practice', input, 'restart-smoke').catch(
		() => null,
	);
	await firstSeen;
	await stop('SIGKILL');
	await original;
	await launch();
	const resumed = await post('/api/practice', input, 'restart-smoke');
	assert.equal(resumed.status, 200, JSON.stringify(resumed.value));
	assert.equal(resumed.value.origin, 'pi');
	assert.equal(resumed.value.title, 'A real place');
	assert.equal(turns, 2);
	const replay = await post('/api/practice', input, 'restart-smoke');
	assert.equal(replay.status, 200);
	assert.equal(turns, 2);
	console.log('SIGKILL recovery and idempotent production replay: OK');
	const foreign = await fetch(root + '/api/ai/settings', {
		method: 'POST',
		headers: {
			origin: 'https://foreign.example',
			'Content-Type': 'application/json',
		},
		body: '{}',
	});
	assert.equal(foreign.status, 403);
	console.log('Production origin enforcement: OK');
} finally {
	await stop();
	model.closeAllConnections();
	await new Promise((r) => model.close(r));
	rmSync(dir, { recursive: true, force: true });
}
