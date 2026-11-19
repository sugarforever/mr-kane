import { expect, it } from 'vitest';
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
const api = {} as import('@earendil-works/pi-durable').ToolExecutionApi;
import { readFile } from 'node:fs/promises';
import {
	createMathTools,
	mathSystemPrompt,
	mathAssetPath,
} from '../src/lib/server/math/library';

it('adds grounded competition tools alongside the existing AoPS tools', async () => {
	const tools = createMathTools();
	expect(tools.map((t) => t.name)).toEqual(
		expect.arrayContaining([
			'aops_read',
			'aops_search',
			'aops_image',
			'irmo_search',
			'irmo_read',
			'irmo_image',
		]),
	);
	const prompt = await mathSystemPrompt();
	expect(prompt).toContain('Round 2');
	expect(prompt).not.toContain('AoPS only for now');
	expect(prompt).not.toContain('extraction warning');
});

it('retrieves original Q6 in Paper 2 with source and AoPS prerequisites, without leaking adjacent questions', async () => {
	const tool = createMathTools().find((t) => t.name === 'irmo_read');
	expect(tool).toBeDefined();
	const result = await tool!.execute(
		{ id: 'IRMO-2024-P2-Q6' },
		api,
		BACKGROUND_CONTEXT,
	);
	const text = JSON.stringify(result);
	expect(text).toContain('\\\\binom{n}{1}');
	expect(text).toContain('\\\\binom{n}{3}');
	expect(text).toContain('2^m');
	expect(text).toContain('https://maths.ucd.ie/');
	expect(text).toContain('V1-C');
	expect(text).not.toContain('game of coins');
});

it('searches by year, paper, topic and exact ID, and reports unavailable years honestly', async () => {
	const tool = createMathTools().find((t) => t.name === 'irmo_search');
	expect(tool).toBeDefined();
	const run = async (args: unknown) =>
		JSON.stringify(await tool!.execute(args, api, BACKGROUND_CONTEXT));
	expect(await run({ year: 2026, topic: 'number-theory' })).toContain(
		'IRMO-2026-P2-Q7',
	);
	expect(await run({ query: 'IRMO-2016-P2-Q9' })).toContain('IRMO-2016-P2-Q9');
	expect(await run({ year: 2026, query: 'Aisling Brendan' })).toContain(
		'IRMO-2026-P2-Q6',
	);
	expect(await run({ year: 2027 })).toContain('not collected');
	expect(await run({ year: 2010 })).toContain('historical');
});

it('fails closed for invented question IDs and traversal; image tools respect model capabilities', async () => {
	const tools = createMathTools(false);
	const read = tools.find((t) => t.name === 'irmo_read');
	expect(read).toBeDefined();
	expect(
		JSON.stringify(
			await read!.execute({ id: 'IRMO-2024-P1-Q6' }, api, BACKGROUND_CONTEXT),
		),
	).toContain('not available');
	expect(() => mathAssetPath('irmo/assets/../../.env')).toThrow();
	const image = tools.find((t) => t.name === 'irmo_image')!;
	expect(
		JSON.stringify(
			await image.execute({ id: 'IRMO-2013-P2-Q7' }, api, BACKGROUND_CONTEXT),
		),
	).toContain('text only');
	const visual = createMathTools(true).find((t) => t.name === 'irmo_image')!;
	const result = await visual.execute(
		{ id: 'IRMO-2013-P2-Q7' },
		api,
		BACKGROUND_CONTEXT,
	);
	expect(result.output?.some((x: any) => x.type === 'image')).toBe(true);
	const bytes = await readFile(mathAssetPath('irmo/assets/page-59.png'));
	expect(bytes.subarray(1, 4).toString()).toBe('PNG');
});
