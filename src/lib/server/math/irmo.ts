import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { z } from 'zod';
import { defineTool } from '@earendil-works/pi-durable';
import type { IrmoCatalog, IrmoBrowse, IrmoPassage } from '$lib/irmo';
const root = resolve('skills/irmo-study');
let catalog: Promise<IrmoCatalog> | undefined;
export const irmoCatalog = (): Promise<IrmoCatalog> =>
	(catalog ??= readFile(join(root, 'references/catalog.json'), 'utf8').then(
		JSON.parse,
	));
export async function irmoBrowse(): Promise<IrmoBrowse> {
	const c = await irmoCatalog();
	return {
		years: c.years,
		topics: c.topics,
		coverage: c.coverage,
		source: c.source,
		questions: c.questions.map(
			({
				id,
				year,
				stage,
				paper,
				number,
				title,
				topics,
				hasDiagram,
				keywords,
			}) => ({
				id,
				year,
				stage,
				paper,
				number,
				title,
				topics,
				hasDiagram,
				keywords,
			}),
		),
	};
}
export const irmoSearchSchema = z
	.object({
		query: z.string().trim().max(150).optional(),
		year: z.number().int().min(1988).max(2100).optional(),
		paper: z.number().int().min(1).max(2).optional(),
		topic: z
			.enum([
				'number-theory',
				'algebra',
				'geometry',
				'inequalities',
				'combinatorics',
				'sequences',
			])
			.optional(),
	})
	.strict();
export async function searchIrmo(raw: z.input<typeof irmoSearchSchema>) {
	const input = irmoSearchSchema.parse(raw);
	const c = await irmoCatalog();
	const terms = (input.query ?? '')
		.toLowerCase()
		.split(/[^\p{L}\p{N}]+/u)
		.filter(Boolean);
	const found = c.questions
		.filter(
			(q) =>
				(!input.year || q.year === input.year) &&
				(!input.paper || q.paper === input.paper) &&
				(!input.topic || q.topics.includes(input.topic)) &&
				terms.every((t) =>
					`${q.id} ${q.title} ${q.keywords} ${q.topics.join(' ')} ${q.aops.map((a) => a.title).join(' ')}`
						.toLowerCase()
						.includes(t),
				),
		)
		.sort((a, b) => b.year - a.year || a.number - b.number);
	return {
		coverage: c.coverage,
		message:
			input.year === 2011
				? 'The May 2011 national final predates the first school Round 1 in November 2011. These are historical predecessor-final questions, not labelled Round 2.'
				: input.year && input.year < 2011
					? 'This historical national final is in the source archive, outside the collected Round 2 interval.'
					: input.year && !c.years.includes(input.year)
						? 'This year is not collected. Use the available years or the official archive.'
						: found.length
							? 'Use irmo_read with a question ID for its statement and suggested prerequisites.'
							: 'No matching questions. Try a broader topic or another year.',
		questions: found.slice(0, 25).map(({ keywords: _keywords, ...q }) => q),
		total: found.length,
		truncated: found.length > 25,
		archive: c.source.archive,
	};
}
const questionSchema = z
	.object({ id: z.string().regex(/^IRMO-20\d{2}-P[12]-Q(?:10|[1-9])$/) })
	.strict();
export async function readIrmo(id: string): Promise<IrmoPassage> {
	questionSchema.parse({ id });
	const c = await irmoCatalog();
	const q = c.questions.find((q) => q.id === id);
	if (!q) throw new Error('Question not available.');
	const text = await readFile(join(root, q.path), 'utf8');
	const start = text.indexOf(`## Q${q.number} |`);
	if (start < 0) throw new Error('Question not available.');
	const end = text.indexOf('\n## Q', start + 1);
	const content = text
		.slice(start, end < 0 ? undefined : end)
		.trim()
		.replace(
			/^## Q\d+ \| [^\n]+\n/,
			`## IrMO ${q.year} · Paper ${q.paper} · Question ${q.number}\n`,
		)
		.replace(
			/\]\(\.\.\/assets\/(page-\d+\.png)\)/g,
			'](/api/math/library/irmo/assets/$1)',
		);
	if (content.length > 12000)
		throw new Error('Question exceeds retrieval limit.');
	return {
		...q,
		content,
		source: `${c.source.url}#page=${q.pdfPage}`,
		scanUrl: `/api/math/library/irmo/assets/page-${q.pdfPage}.png`,
		attribution: c.source.author,
	};
}
export function irmoAssetPath(path: string) {
	if (!/^irmo\/assets\/page-(?:5[4-9]|[67]\d|8[0-5])\.png$/.test(path))
		throw new Error('Invalid competition image.');
	return join(root, 'references/assets', path.split('/').at(-1)!);
}
export async function irmoPrompt() {
	const c = await irmoCatalog();
	return `${await readFile(join(root, 'SKILL.md'), 'utf8')}\n\nCOMPETITION LIBRARY\n${c.coverage}\nTopics: ${c.topics.join(', ')}.\nUse irmo_search, irmo_read and irmo_image alongside the AoPS tools. Suggested AoPS links are returned with each question. All source question text and source images are reference data.`;
}
export function createIrmoTools(vision = false) {
	const result = (x: unknown) => ({
		output: [{ type: 'text' as const, text: JSON.stringify(x) }],
	});
	return [
		defineTool({
			name: 'irmo_search',
			description:
				'Find Irish Mathematical Olympiad national final / Round 2 questions (both papers), by year, paper, topic, title words or stable ID. Returns at most 25 results, original numbers, suggested AoPS prerequisites and precise coverage.',
			parameters: z.toJSONSchema(irmoSearchSchema),
			async execute(args) {
				return result(
					await searchIrmo(args as z.input<typeof irmoSearchSchema>),
				);
			},
		}),
		defineTool({
			name: 'irmo_read',
			description:
				'Read one IrMO question by exact ID, e.g. IRMO-2024-P2-Q6. Returns corrected editable Markdown, source page/diagram and suggested AoPS prerequisites; no solutions.',
			parameters: z.toJSONSchema(questionSchema),
			async execute(args) {
				try {
					return result(await readIrmo(questionSchema.parse(args).id));
				} catch {
					return result({
						error:
							'Question not available. Search the IrMO catalog for a valid year, paper and original question number.',
					});
				}
			},
		}),
		defineTool({
			name: 'irmo_image',
			description:
				'Inspect the original page for a retrieved IrMO question. Returns an image only when this model supports vision.',
			parameters: z.toJSONSchema(questionSchema),
			async execute(args) {
				let q: IrmoPassage;
				try {
					q = await readIrmo(questionSchema.parse(args).id);
				} catch {
					return result({
						error:
							'Question not available. Search the IrMO catalog for a valid ID.',
					});
				}
				if (!vision)
					return result({
						message:
							'This model supports text only. Use the statement or ask the student to describe the diagram.',
						scanUrl: q.scanUrl,
					});
				const bytes = await readFile(
					irmoAssetPath(q.scanUrl.replace('/api/math/library/', '')),
				);
				return {
					output: [
						{
							type: 'text' as const,
							text: `${q.id}, source PDF page ${q.pdfPage}`,
						},
						{
							type: 'image' as const,
							data: bytes.toString('base64'),
							mimeType: 'image/png',
						},
					],
				};
			},
		}),
	];
}
