import { expect, it } from 'vitest';
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import {
	createMathTools,
	mathSystemPrompt,
} from '../src/lib/server/math/library';
const api = {} as import('@earendil-works/pi-durable').ToolExecutionApi;
async function run(name: string, args: unknown) {
	const tool = createMathTools().find((t) => t.name === name);
	expect(tool, `${name} must be available to the math agent`).toBeDefined();
	const result = await tool!.execute(args, api, BACKGROUND_CONTEXT);
	const block = result.output!.find((x) => x.type === 'text') as {
		text: string;
	};
	return JSON.parse(block.text);
}
it('finds grounded exercises by course topic and excludes previously assigned questions', async () => {
	const first = await run('exercise_search', { topic: 'algebra', limit: 3 });
	expect(first.exercises).toHaveLength(3);
	expect(first.total).toBeGreaterThan(3);
	const id = first.exercises[0].id;
	const next = await run('exercise_search', {
		topic: 'algebra',
		excludeIds: [id],
		limit: 3,
	});
	expect(next.exercises.map((x: any) => x.id)).not.toContain(id);
	expect(next.total).toBe(first.total - 1);
	expect(first.exercises[0].difficulty).toBeNull();
	const read = await run('exercise_read', { id });
	expect(read.content.length).toBeGreaterThan(20);
	expect(read.sourceUrl).toMatch(/^https:\/\//);
});
it('supports chapter matching, source discovery and honest empty results', async () => {
	const sources = await run('exercise_sources', {});
	expect(sources.sources.some((x: any) => x.id === 'irmo')).toBe(true);
	const result = await run('exercise_search', {
		chapterId: 'V1-C05',
		limit: 5,
	});
	expect(result.exercises.length).toBeGreaterThan(0);
	expect(
		result.exercises.every((x: any) => x.chapterIds.includes('V1-C05')),
	).toBe(true);
	expect(
		(await run('exercise_search', { source: 'unavailable' })).exercises,
	).toEqual([]);
	expect((await run('exercise_read', { id: '../../.env' })).error).toBeTruthy();
});
it('instructs the coach to retrieve exercises for practice and withhold solutions during tests', async () => {
	const prompt = await mathSystemPrompt();
	expect(prompt).toContain('exercise_search');
	expect(prompt).toContain('independent attempt');
	expect(prompt).toContain('Unknown difficulty');
	expect(prompt).toContain(
		'Proactively assign relevant practice as the default teaching behavior',
	);
	expect(prompt).toContain('Do not wait for the student to ask for exercises');
	expect(prompt).toContain('Respect an explicit request to skip practice');
});

it('accepts an additional dataset without changing the agent tools', async () => {
	const { createExerciseTools } =
		await import('../src/lib/server/math/exercises');
	const tools = createExerciseTools([
		{
			id: 'future',
			title: 'Future dataset',
			async catalog() {
				return [
					{
						id: 'future:1',
						source: 'future',
						title: 'A new exercise',
						topics: ['algebra'],
						chapterIds: [],
						keywords: 'linear',
						difficulty: null,
						hasDiagram: false,
					},
				];
			},
			async read() {
				return {
					content: 'Solve x + 1 = 3.',
					sourceUrl: 'https://example.org/problem/1',
					scans: [],
				};
			},
		},
	]);
	const search = await tools
		.find((t) => t.name === 'exercise_search')!
		.execute({ source: 'future', query: 'linear' }, api, BACKGROUND_CONTEXT);
	expect(JSON.stringify(search)).toContain('future:1');
	const read = await tools
		.find((t) => t.name === 'exercise_read')!
		.execute({ id: 'future:1' }, api, BACKGROUND_CONTEXT);
	expect(JSON.stringify(read)).toContain('Solve x + 1 = 3.');
});

it('searches both existing sources and reads a numbered AoPS exercise', async () => {
	const sources = await run('exercise_sources', {});
	expect(sources.sources.map((s: any) => s.id)).toContain('aops');
	const mixed = await run('exercise_search', { topic: 'algebra', limit: 4 });
	expect(new Set(mixed.exercises.map((q: any) => q.source)).size).toBe(2);
	const found = await run('exercise_search', {
		source: 'aops',
		chapterId: 'V1-C07',
		query: '151',
	});
	expect(found.exercises.map((q: any) => q.id)).toContain('AOPS-V1-C07-P151');
	const read = await run('exercise_read', { id: 'AOPS-V1-C07-P151' });
	expect(read.content).toContain('x^6 + y^6');
	expect(read.content).not.toMatch(/\n152\. /);
	expect(read.scans[0]).toMatch(/^\/api\/math\/library\//);
	expect(read.citation).toContain('printed page 72');
	expect(
		(await run('exercise_read', { id: 'AOPS-V1-C07-P99999' })).error,
	).toBeTruthy();
});
