import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const directory = mkdtempSync(join(tmpdir(), 'kane-recordings-'));
const root = 'http://127.0.0.1:4178';
let app;
async function launch() {
	const environment = {
		...process.env,
		HOST: '127.0.0.1',
		PORT: '4178',
		ORIGIN: root,
		MR_KANE_DATA_DIR: directory,
	};
	delete environment.BODY_SIZE_LIMIT;
	app = spawn(process.execPath, ['scripts/start.mjs'], {
		env: environment,
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	// Exercise the production startup default rather than an operator override.
	let output = '';
	app.stdout.on('data', (b) => (output += b));
	app.stderr.on('data', (b) => (output += b));
	for (let attempt = 0; attempt < 100; attempt++) {
		if (app.exitCode !== null) throw new Error(output);
		try {
			if ((await fetch(`${root}/api/recordings`)).ok) return;
		} catch {}
		await new Promise((r) => setTimeout(r, 100));
	}
	throw new Error(`Server did not start: ${output}`);
}
async function stop() {
	if (app && app.exitCode === null) {
		const ended = once(app, 'exit');
		app.kill('SIGKILL');
		await ended;
	}
}
const profile = {
	language: 'es',
	level: 'A2',
	ageGroup: 'Middle school',
	interests: 'Nature',
	vocabulary: '',
	grammar: '',
};
const details = {
	id: 'smoke-reading',
	practice: {
		id: 'practice',
		title: 'Reading practice',
		prompt: 'Read this sentence.',
		script: 'Hola, soy Ana.',
		vocabulary: ['hola · hello'],
		focus: 'Greetings',
		sourceNote: 'Synthetic fixture',
		profile,
		mode: 'speaking',
		origin: 'demo',
		createdAt: '2026-11-18',
		sources: [],
	},
	duration: 30,
	createdAt: '2026-11-18',
	note: '',
	targetText: 'Hola, soy Ana.',
};
const audio = Buffer.alloc(1024 * 1024, 42);
async function upload() {
	const form = new FormData();
	form.set('details', JSON.stringify(details));
	form.set('audio', new Blob([audio], { type: 'audio/webm' }), 'fixture.webm');
	return fetch(`${root}/api/recordings`, {
		method: 'POST',
		headers: { origin: root },
		body: form,
	});
}
try {
	await launch();
	assert.equal((await upload()).status, 200);
	const patched = await fetch(`${root}/api/recordings/${details.id}`, {
		method: 'PATCH',
		headers: { origin: root, 'Content-Type': 'application/json' },
		body: JSON.stringify({
			note: 'Persisted after restart',
			speechCheck: { transcript: 'Hola soy Ana', status: 'complete' },
		}),
	});
	assert.equal(patched.status, 200);
	await stop();
	await launch();
	assert.equal((await upload()).status, 200);
	const list = await (await fetch(`${root}/api/recordings`)).json();
	assert.equal(list.length, 1);
	assert.equal(list[0].note, 'Persisted after restart');
	assert.equal(list[0].speechCheck.transcript, 'Hola soy Ana');
	const replay = await fetch(`${root}/api/recordings/${details.id}/audio`);
	assert.deepEqual(Buffer.from(await replay.arrayBuffer()), audio);
	const range = await fetch(`${root}/api/recordings/${details.id}/audio`, {
		headers: { range: 'bytes=0-99' },
	});
	assert.equal(range.status, 206);
	assert.equal((await range.arrayBuffer()).byteLength, 100);
	assert.equal(
		(
			await fetch(`${root}/api/recordings`, {
				headers: { origin: 'https://foreign.example' },
			})
		).status,
		403,
	);
	assert.equal(
		(
			await fetch(`${root}/api/recordings/${details.id}`, {
				method: 'DELETE',
				headers: { origin: root },
			})
		).status,
		200,
	);
	assert.equal((await upload()).status, 409);
	console.log(
		'Production recording smoke passed: 1 MiB upload, restart, retry, replay, seek, access checks and deletion.',
	);
} finally {
	await stop();
	rmSync(directory, { recursive: true, force: true });
}
