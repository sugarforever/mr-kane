import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
	readMathPassage,
	mathAssetPath,
	searchMathLibrary,
} from '../src/lib/server/math/library';
import {
	createMathSession,
	discardMathTurn,
	getMathSession,
	runMathTurn,
} from '../src/lib/server/math/study';
import { renderMathMarkdown } from '../src/lib/math-markdown';
const dirs: string[] = [];
afterEach(() => {
	vi.unstubAllEnvs();
	for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
function setup() {
	const dir = mkdtempSync(join(tmpdir(), 'kane-math-'));
	dirs.push(dir);
	vi.stubEnv('MR_KANE_DATA_DIR', dir);
}
const learner = {
	background: 'Grade 10',
	goal: 'Learn number theory',
	weeklyTime: '3 hours',
	reportedKnowledge: ['Linear equations'],
	strengths: [],
	gaps: ['Congruence notation'],
	observations: [],
};
it('loads the requested module with working web source links and rejects paths outside the library', async () => {
	const passage = await readMathPassage({
		chapterId: 'V1-C05',
		section: '5.4',
	});
	expect(passage.content).toContain('Modular Arithmetic');
	expect(passage.content).not.toContain('### 5.5');
	expect(passage.scans[0]).toMatch(/^\/api\/math\/library\//);
	expect(() => mathAssetPath('../settings.sqlite')).toThrow();
	expect(() => mathAssetPath('volume-1-the-basics/../../SKILL.md')).toThrow();
	expect(
		(await searchMathLibrary('congruences')).some(
			(x) => x.chapterId === 'V2-C23',
		),
	).toBe(true);
	await expect(
		readMathPassage({ chapterId: 'V2-C18', problem: 301 }),
	).rejects.toThrow();
});
it('retains learner background and conversation across turns and replays without another generation', async () => {
	setup();
	const session = await createMathSession();
	const firstId = randomUUID();
	let calls = 0;
	const generate = async (_op: string, data: any) => {
		calls++;
		if (calls === 2) {
			expect(data.learner.background).toBe('Grade 10');
			expect(
				data.messages.some((m: any) => m.content === 'What is a residue?'),
			).toBe(true);
		}
		return JSON.stringify({ reply: 'Let us try residues modulo 5.', learner });
	};
	await runMathTurn(session.id, firstId, 'I am in Grade 10.', generate);
	await runMathTurn(session.id, firstId, 'I am in Grade 10.', generate);
	expect(calls).toBe(1);
	await runMathTurn(session.id, randomUUID(), 'What is a residue?', generate);
	const saved = await getMathSession(session.id);
	expect(saved.learner).toEqual(learner);
	expect(saved.messages.filter((m) => m.role === 'user')).toHaveLength(2);
	expect(calls).toBe(2);
});
it('keeps failed turns retryable with original context and rejects conflicting follow-up turns', async () => {
	setup();
	const session = await createMathSession();
	const id = randomUUID();
	await expect(
		runMathTurn(session.id, id, 'Help with algebra', async () => {
			throw new Error('offline');
		}),
	).rejects.toThrow('offline');
	expect((await getMathSession(session.id)).learner.background).toBe('');
	await expect(
		runMathTurn(session.id, randomUUID(), 'Another question', async () =>
			JSON.stringify({ reply: 'ok', learner }),
		),
	).rejects.toThrow(/pending|retry/i);
	await runMathTurn(session.id, id, 'Help with algebra', async () =>
		JSON.stringify({ reply: 'What have you tried?', learner }),
	);
	expect(
		(await getMathSession(session.id)).messages.filter(
			(m) => m.role === 'user',
		),
	).toHaveLength(1);
	await expect(
		runMathTurn(session.id, id, 'Changed question', async () => ''),
	).rejects.toThrow(/different|belongs/i);
});
it('renders mathematical explanations without enabling raw HTML, script links or remote tracking images', () => {
	const html = renderMathMarkdown(
		'**Factor** $x^2-1$\n\n<script>alert(1)</script>\n\n[x](javascript:alert(1)) ![x](https://tracker.test/a.png)',
	);
	expect(html).toContain('<strong>Factor</strong>');
	expect(html).toContain('katex');
	expect(html).not.toContain('<script>');
	expect(html).not.toContain('href="javascript:');
	expect(html).not.toContain('src="https://tracker');
});

it('returns a source page image only for models with vision and bounds image access to chapter pages', async () => {
	const { createMathTools } = await import('../src/lib/server/math/library');
	const { BACKGROUND_CONTEXT } = await import('@earendil-works/chord/context');
	const api = {} as import('@earendil-works/pi-durable').ToolExecutionApi;
	const args = { chapterId: 'V1-C05', page: 42 };
	const textTool = createMathTools(false).find((t) => t.name === 'aops_image')!;
	const fallback = await textTool.execute(args, api, BACKGROUND_CONTEXT);
	expect(fallback.output?.every((x) => x.type === 'text')).toBe(true);
	const imageTool = createMathTools(true).find((t) => t.name === 'aops_image')!;
	const image = await imageTool.execute(args, api, BACKGROUND_CONTEXT);
	expect(
		image.output?.some(
			(x) =>
				x.type === 'image' &&
				x.mimeType === 'image/png' &&
				Buffer.from(x.data, 'base64').subarray(1, 4).toString() === 'PNG',
		),
	).toBe(true);
	await expect(
		imageTool.execute(
			{ chapterId: 'V1-C05', page: 999 },
			api,
			BACKGROUND_CONTEXT,
		),
	).rejects.toThrow();
});

it('allows editing a failed turn without replaying its invalid cached answer', async () => {
	setup();
	const session = await createMathSession();
	const id = randomUUID();
	await expect(
		runMathTurn(session.id, id, 'Teach me', async () => '{bad json'),
	).rejects.toThrow();
	await discardMathTurn(session.id, id);
	expect((await getMathSession(session.id)).pending).toBeNull();
	await expect(
		runMathTurn(session.id, id, 'Teach me', async () => ''),
	).rejects.toThrow(/discarded/i);
	await runMathTurn(session.id, randomUUID(), 'Teach me algebra', async () =>
		JSON.stringify({ reply: 'Let us start with equations.', learner }),
	);
	expect(
		(await getMathSession(session.id)).messages.filter(
			(m) => m.role === 'user',
		),
	).toHaveLength(1);
});

it('streams only the top-level reply across partial JSON, escapes and source lookup rounds', async () => {
	setup();
	const session = await createMathSession();
	const progress: unknown[] = [];
	await runMathTurn(
		session.id,
		randomUUID(),
		'Help me',
		async (_op, _data, _schema, _id, options) => {
			options.onProgress?.({
				text: '{"learner":{"reply":"private nested value"}',
				reading: false,
			});
			options.onProgress?.({
				text: '```json\n{"reply":"Try $x',
				reading: false,
			});
			options.onProgress?.({ text: '', reading: true });
			options.onProgress?.({
				text: '{"reply":"Line 1\\n\\"Hi\\" \\u03c0',
				reading: false,
			});
			return JSON.stringify({ reply: 'Line 1\n"Hi" π', learner });
		},
		(event) => progress.push(event),
	);
	expect(progress).toEqual([
		{ type: 'progress', reply: '', status: 'thinking' },
		{ type: 'progress', reply: 'Try $x', status: 'writing' },
		{ type: 'progress', reply: '', status: 'reading' },
		{ type: 'progress', reply: 'Line 1\n"Hi" π', status: 'writing' },
		{ type: 'progress', reply: 'Line 1\n"Hi" π', status: 'saving' },
	]);
	expect((await getMathSession(session.id)).messages.at(-1)?.content).toBe(
		'Line 1\n"Hi" π',
	);
});

it('renders new conversation links in a separate tab and rejects invalid local routes', () => {
	const path = '/math?session=12345678-1234-4234-8234-123456789abc';
	expect(renderMathMarkdown(`[Open conversation](${path})`)).toContain(
		`<a href="${path}" target="_blank" rel="noopener noreferrer">Open conversation</a>`,
	);
	for (const path of [
		'/math?session=invalid',
		'/math?session=12345678-1234-4234-8234-123456789abc&redirect=https://example.com',
		'//example.com',
		'javascript:alert(1)',
	]) {
		expect(renderMathMarkdown(`[Open](${path})`)).not.toContain('<a ');
	}
});
