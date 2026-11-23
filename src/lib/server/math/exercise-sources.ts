import { irmoCatalog, readIrmo } from './irmo';
import { mathCatalog, readMathPassage } from './aops';
import type { ExerciseSource } from './exercises';
const aopsSource: ExerciseSource = {
	id: 'aops',
	title: 'The Art of Problem Solving, Volumes 1 and 2',
	async catalog() {
		return (await mathCatalog()).flatMap((c) =>
			c.problems.map((number) => ({
				id: `AOPS-${c.id}-P${number}`,
				source: 'aops',
				title: `AoPS Volume ${c.volume}, Chapter ${c.chapter}: ${c.title}, Problem ${number}`,
				topics: c.subjects.map((t) =>
					t === 'counting-probability' ? 'combinatorics' : t,
				),
				chapterIds: [c.id],
				keywords: c.sections.map((s) => s.title).join(' '),
				difficulty: null,
				hasDiagram: null,
			})),
		);
	},
	async read(id) {
		const match = /^AOPS-(V[12]-C\d{2})-P(\d+)$/.exec(id);
		if (!match) throw new Error('Invalid AoPS exercise ID.');
		const passage = await readMathPassage({
			chapterId: match[1],
			problem: Number(match[2]),
		});
		return {
			content: passage.content,
			sourceUrl: passage.scans[0],
			scans: passage.scans,
			citation: `AoPS ${match[1]}, Problem ${match[2]}, printed page ${passage.printedPage}`,
			truncated: passage.truncated,
		};
	},
};
export const exerciseSources: ExerciseSource[] = [
	{
		id: 'irmo',
		title: 'Irish Mathematical Olympiad collected questions',
		async catalog() {
			return (await irmoCatalog()).questions.map((q) => ({
				id: q.id,
				source: 'irmo',
				title: `IrMO ${q.year}, Paper ${q.paper}, Q${q.number}: ${q.title}`,
				topics: q.topics,
				chapterIds: q.aops.map((a) => a.chapterId),
				keywords: `${q.keywords} ${q.aops.map((a) => a.title).join(' ')}`,
				difficulty: null,
				hasDiagram: q.hasDiagram,
			}));
		},
		async read(id) {
			const q = await readIrmo(id);
			return { content: q.content, sourceUrl: q.source, scans: [q.scanUrl] };
		},
	},
	aopsSource,
];
