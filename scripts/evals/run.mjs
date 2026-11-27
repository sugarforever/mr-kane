import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { checkOutcome } from './checks.mjs';
const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
process.chdir(root);
const args = process.argv.slice(2);
function option(name, fallback) {
	const i = args.indexOf(name);
	return i < 0 ? fallback : args[i + 1];
}
const suitePath = resolve(
	option('--suite', 'scripts/evals/math-profile.cases.json'),
);
const suite = JSON.parse(await readFile(suitePath, 'utf8'));
const adapters = {
	'math-profile': {
		module: '/scripts/evals/math-profile.ts',
		check: checkOutcome,
	},
};
const adapter = adapters[suite.adapter];
if (suite.version !== 1 || !adapter)
	throw Error('Unsupported evaluation suite.');
const selected = suite.cases
	.filter((c) => !args.includes('--case') || c.id === option('--case'))
	.map((c) => ({
		...c,
		initial: { ...suite.defaults?.initial, ...c.initial },
	}));
if (!selected.length) throw Error('No matching cases.');
if (selected.some((c) => !/^[a-z0-9][a-z0-9-]{0,79}$/.test(c.id)))
	throw Error('Case IDs must be safe lowercase names.');
if (args.includes('--list')) {
	for (const c of selected) console.log(`${c.id}: ${c.description}`);
	process.exit(0);
}
if (!process.env.DEEPSEEK_API_KEY) throw Error('DEEPSEEK_API_KEY is required.');
const repeat = Number(option('--repeat', '1'));
if (!Number.isInteger(repeat) || repeat < 1 || repeat > 5)
	throw Error('--repeat must be between 1 and 5.');
const model = option('--model', 'deepseek-flash');
const baseUrl = process.env.MR_KANE_EVAL_BASE_URL ?? 'https://api.deepseek.com';
const output = resolve(option('--output-dir', '.eval-runs'));
await mkdir(output, { recursive: true, mode: 0o700 });
const dir = await mkdtemp(join(output, 'math-profile-'));
const metadata = {
	workingTreeDiffHash: createHash('sha256')
		.update(
			execFileSync('git', ['diff', 'HEAD', '--', 'src', 'skills'], {
				encoding: 'utf8',
			}),
		)
		.digest('hex'),
	model,
	baseUrl,
	createdAt: new Date().toISOString(),
	commit: execFileSync('git', ['rev-parse', 'HEAD'], {
		encoding: 'utf8',
	}).trim(),
	suiteHash: createHash('sha256')
		.update(await readFile(suitePath))
		.digest('hex'),
	repeat,
};
await writeFile(join(dir, 'metadata.json'), JSON.stringify(metadata, null, 2));
console.log(
	`Live eval: ${model}; ${selected.length * repeat} trials; results: ${dir}`,
);
const results = [];
let activeWorker;
for (const signal of ['SIGINT', 'SIGTERM'])
	process.once(signal, () => {
		activeWorker?.kill('SIGKILL');
		process.exit(130);
	});
trials: for (let trial = 1; trial <= repeat; trial++)
	for (const scenario of selected) {
		const caseDir = join(dir, `${scenario.id}-${trial}`);
		await mkdir(caseDir, { mode: 0o700 });
		const caseFile = join(caseDir, 'input.json');
		// Keep expected outcomes in the parent process, outside the model's inputs.
		await writeFile(
			caseFile,
			JSON.stringify(
				{ id: scenario.id, initial: scenario.initial, turns: scenario.turns },
				null,
				2,
			),
		);
		console.log(`Running ${scenario.id} (${trial}/${repeat})`);
		const child = spawn(
			process.execPath,
			[
				'scripts/evals/worker.mjs',
				caseFile,
				caseDir,
				model,
				baseUrl,
				adapter.module,
			],
			{
				cwd: root,
				env: {
					...process.env,
					MR_KANE_DATA_DIR: join(caseDir, 'data'),
					MR_KANE_EVAL_RUN: '1',
					PI_API_KEY: '',
				},
				stdio: ['ignore', 'pipe', 'pipe'],
			},
		);
		activeWorker = child;
		let log = '';
		const collect = (data) => {
			log = (log + data.toString()).slice(-100000);
		};
		child.stdout.on('data', collect);
		child.stderr.on('data', collect);
		const timeout = setTimeout(() => child.kill('SIGKILL'), 360000);
		const exit = await new Promise((resolve, reject) => {
			child.once('error', reject);
			child.once('exit', (code, signal) => resolve({ code, signal }));
		});
		clearTimeout(timeout);
		activeWorker = undefined;
		await writeFile(
			join(caseDir, 'worker.log'),
			log.replaceAll(process.env.DEEPSEEK_API_KEY, '<REDACTED>'),
		);
		const observed = await readFile(join(caseDir, 'observed.json'), 'utf8')
			.then(JSON.parse)
			.catch(() => null);
		const error = observed
			? null
			: await readFile(join(caseDir, 'error.json'), 'utf8')
					.then(JSON.parse)
					.catch(() => ({ error: `Worker exited: ${JSON.stringify(exit)}` }));
		const checks = observed ? adapter.check(scenario.expected, observed) : [];
		const result = {
			verdict: error
				? error.kind === 'model-output'
					? 'fail'
					: 'error'
				: checks.every((c) => c.pass)
					? 'pass'
					: 'fail',
			id: scenario.id,
			trial,
			expected: scenario.expected,
			observed,
			checks,
			error,
			pass: !!observed && checks.every((c) => c.pass),
		};
		results.push(result);
		await writeFile(
			join(dir, 'results.json'),
			JSON.stringify({ metadata, results }, null, 2),
		);
		console.log(
			`${result.verdict.toUpperCase()} ${scenario.id}${error ? `: ${error.error}` : ''}${
				checks.some((c) => !c.pass)
					? `: ${checks
							.filter((c) => !c.pass)
							.map((c) => c.name)
							.join(', ')}`
					: ''
			}`,
		);
		if (
			error?.modelErrors?.some((message) => /\b(401|402|403)\b/.test(message))
		) {
			console.log(error.modelErrors.join('\n'));
			console.log(
				'Stopping: provider access/billing error. Remaining cases were not evaluated.',
			);
			break trials;
		}
	}
console.log(
	`${results.filter((r) => r.verdict === 'pass').length} passed, ${results.filter((r) => r.verdict === 'fail').length} failed, ${results.filter((r) => r.verdict === 'error').length} errors. Results: ${dir}/results.json`,
);
process.exitCode = results.every((r) => r.pass) ? 0 : 1;
