import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { z } from 'zod';
const root = resolve('skills/aops-study');
type Chapter = {
	id: string;
	volume: number;
	chapter: number;
	title: string;
	path: string;
	subjects: string[];
	printed_pages: number[];
	pdf_pages: number[];
	sections: { id: string; title: string; line: number; printed_page: number }[];
	problems: number[];
};
let catalog: Promise<Chapter[]> | undefined;
export const mathCatalog = (): Promise<Chapter[]> =>
	(catalog ??= readFile(join(root, 'references/catalog.json'), 'utf8').then(
		JSON.parse,
	));
export async function searchMathLibrary(query: string) {
	const terms = query
		.toLowerCase()
		.split(/[^\p{L}\p{N}]+/u)
		.filter(Boolean);
	return (await mathCatalog())
		.flatMap((c) => {
			const candidates = [
				{ id: '', title: c.title + ' ' + c.subjects.join(' ') },
				...c.sections,
			];
			return candidates
				.filter((s) => terms.every((t) => s.title.toLowerCase().includes(t)))
				.map((s) => ({
					chapterId: c.id,
					title: c.title,
					section: s.id || undefined,
					topic: s.title,
				}));
		})
		.slice(0, 35);
}
export const passageSchema = z
	.object({
		chapterId: z.string().regex(/^V[12]-C\d{2}$/),
		section: z
			.string()
			.regex(/^\d+\.\d+(?:\.\d+)?$/)
			.optional(),
		page: z.number().int().positive().optional(),
		problem: z.number().int().positive().optional(),
	})
	.strict()
	.refine(
		(x) =>
			[x.section, x.page, x.problem].filter((x) => x !== undefined).length <= 1,
		'Choose one section, page or problem.',
	);
export async function readMathPassage(raw: z.input<typeof passageSchema>) {
	const input = passageSchema.parse(raw);
	const c = (await mathCatalog()).find((c) => c.id === input.chapterId);
	if (!c) throw new Error('Chapter not found.');
	const lines = (await readFile(join(root, c.path), 'utf8')).split('\n');
	let start = 0,
		end = lines.length;
	if (input.section) {
		const sec = c.sections.find((s) => s.id === input.section);
		if (!sec) throw new Error('Section not found.');
		start = sec.line - 1;
		end =
			c.sections.find(
				(s) =>
					s.line - 1 > start &&
					s.id.split('.').length <= sec.id.split('.').length,
			)?.line ?? lines.length + 1;
		end--;
	}
	if (input.page !== undefined) {
		start = lines.findIndex((l) => l === `## Printed page ${input.page}`);
		if (start < 0) throw new Error('Page not found.');
		end = lines.findIndex(
			(l, i) => i > start && l.startsWith('## Printed page '),
		);
		if (end < 0) end = lines.length;
	}
	if (input.problem !== undefined) {
		start = lines.findIndex((l) =>
			new RegExp(`^\\s*${input.problem}\\.\\s`).test(l),
		);
		if (start < 0) throw new Error('Problem not found.');
		end = lines.findIndex(
			(l, i) =>
				i > start && (/^\s*\d{1,3}\.\s/.test(l) || l.startsWith('### ')),
		);
		if (end < 0) end = lines.length;
	}
	let page = c.printed_pages[0];
	for (const l of lines.slice(0, start + 1)) {
		const m = l.match(/^## Printed page (\d+)/);
		if (m) page = +m[1];
	}
	let text = lines.slice(start, end).join('\n');
	const truncated = text.length > 18000;
	text = text.slice(0, 18000);
	const pages = new Set([page]);
	for (const m of text.matchAll(/^## Printed page (\d+)/gm)) pages.add(+m[1]);
	const volume = c.path.split('/')[2];
	const scans = [...pages].map(
		(p) =>
			`/api/math/library/${volume}/assets/pdf-page-${String(p + c.pdf_pages[0] - c.printed_pages[0]).padStart(3, '0')}.png`,
	);
	text = text.replace(
		/\]\(\.\.\/assets\/([^)]+)\)/g,
		`](/api/math/library/${volume}/assets/$1)`,
	);
	return {
		chapterId: c.id,
		title: c.title,
		printedPage: page,
		content: text,
		truncated,
		scans,
	};
}
