import { createServer } from 'vite';
import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { modelErrors } from './diagnostics.mjs';
const [caseFile, runDir, model, baseUrl, adapterModule] = process.argv.slice(2);
// Capture only model input content and tool names, never auth headers or reasoning.
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
	const url = input instanceof Request ? input.url : String(input);
	if (url.startsWith(baseUrl) && typeof init?.body === 'string') {
		try {
			const body = JSON.parse(init.body);
			if (body.messages)
				await appendFile(
					join(runDir, 'requests.jsonl'),
					JSON.stringify({
						model: body.model,
						system: body.messages.filter((m) =>
							['system', 'developer'].includes(m.role),
						),
						lastUser: body.messages.filter((m) => m.role === 'user').at(-1),
						tools: body.tools?.map((t) => t.function?.name),
					}) + '\n',
				);
		} catch {
			/* Instrumentation must not change provider behavior. */
		}
	}
	return originalFetch(input, init);
};
const server = await createServer({
	configFile: false,
	root: process.cwd(),
	logLevel: 'error',
	resolve: { alias: { $lib: resolve('src/lib') } },
	cacheDir: join(runDir, 'vite-cache'),
	server: { middlewareMode: true, watch: null },
	appType: 'custom',
});
let exitCode = 0;
try {
	const scenario = JSON.parse(await readFile(caseFile, 'utf8'));
	const adapter = await server.ssrLoadModule(adapterModule);
	const observed = await adapter.runScenario(scenario, runDir, {
		model,
		baseUrl,
	});
	const failures = await modelErrors(
		join(runDir, 'data'),
		process.env.DEEPSEEK_API_KEY,
	);
	if (observed.profileStatus === 'failed' && failures.length)
		throw new Error('Background provider failure');
	await writeFile(
		join(runDir, 'observed.json'),
		JSON.stringify(observed, null, 2),
	);
} catch (error) {
	const message = String(error?.message ?? error).replaceAll(
		process.env.DEEPSEEK_API_KEY ?? '<missing-key>',
		'<REDACTED>',
	);
	const failures = await modelErrors(
		join(runDir, 'data'),
		process.env.DEEPSEEK_API_KEY,
	);
	await writeFile(
		join(runDir, 'error.json'),
		JSON.stringify(
			{
				error: message,
				modelErrors: failures,
				kind: failures.length
					? 'provider'
					: error?.status === 502
						? 'model-output'
						: 'runtime',
			},
			null,
			2,
		),
	);
	exitCode = 2;
} finally {
	await server.close();
}
// Stop any failed/pending background work at the per-case process boundary.
process.exit(exitCode);
