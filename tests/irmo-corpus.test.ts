import { expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import katex from 'katex';
const root = 'skills/irmo-study';
it('accounts for all collected years, both papers and original question numbering', async () => {
	const data = JSON.parse(
		await readFile(join(root, 'references/catalog.json'), 'utf8'),
	);
	expect(data.years).toEqual(Array.from({ length: 16 }, (_, i) => 2011 + i));
	expect(data.questions).toHaveLength(160);
	expect(new Set(data.questions.map((q: any) => q.id)).size).toBe(160);
	const aops = JSON.parse(
		await readFile('skills/aops-study/references/catalog.json', 'utf8'),
	);
	for (const year of data.years) {
		const questions = data.questions.filter((q: any) => q.year === year);
		expect(questions.map((q: any) => q.number)).toEqual([
			1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
		]);
		for (const q of questions) {
			expect(q.stage).toBe(year === 2011 ? 'predecessor-final' : 'round-2');
			expect(q.paper).toBe(q.number <= 5 ? 1 : 2);
			expect(q.id).toBe(`IRMO-${year}-P${q.paper}-Q${q.number}`);
			expect(q.topics.length).toBeGreaterThan(0);
			expect(q.aops.length).toBeGreaterThan(0);
			for (const link of q.aops) {
				const chapter = aops.find((c: any) => c.id === link.chapterId);
				expect(chapter).toBeDefined();
				if (link.section)
					expect(chapter.sections.some((s: any) => s.id === link.section)).toBe(
						true,
					);
			}
			expect(
				(await readFile(join(root, q.scan))).subarray(1, 4).toString(),
			).toBe('PNG');
		}
	}
});
it('renders every transcribed equation and retains each referenced diagram', async () => {
	for (let year = 2011; year <= 2026; year++) {
		const text = await readFile(`${root}/references/papers/${year}.md`, 'utf8');
		expect(text.match(/^## Q\d+ /gm)).toHaveLength(10);
		expect(text).not.toMatch(/[\x00-\x08\x0b\x0e-\x1f]/);
		for (const m of text.matchAll(/\$\$([\s\S]*?)\$\$|\$([^$\n]+)\$/g)) {
			expect(() =>
				katex.renderToString(m[1] ?? m[2], { throwOnError: true }),
			).not.toThrow();
		}
		for (const m of text.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g))
			await readFile(join(root, 'references/papers', m[1]));
	}
});
it('preserves reviewed nested radicals, absolute values and corrected geometry', async () => {
	const paper = async (y: number) =>
		readFile(`${root}/references/papers/${y}.md`, 'utf8');
	expect(await paper(2013)).toContain('\\frac{1}{\\sqrt[2012]{2013}}');
	expect(await paper(2016)).toContain(
		'\\frac{251}{\\frac{1}{\\sqrt[3]{252}-5\\sqrt[3]{2}}-10\\sqrt[3]{63}}',
	);
	expect(await paper(2021)).toContain('\\left|\\frac{AB}{3}-3ab\\right|-3ab');
	expect(await paper(2024)).toContain('BC,AB,AC');
});
