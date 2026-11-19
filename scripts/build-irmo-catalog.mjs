// Rebuild metadata from the reviewed Markdown, never from lossy PDF text.
import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('../skills/irmo-study/', import.meta.url);
const aops = JSON.parse(
	await readFile(
		new URL('../skills/aops-study/references/catalog.json', import.meta.url),
		'utf8',
	),
);
const routes = {
	'number-theory': [
		['V1-C05', '5.1'],
		['V1-C05', '5.4'],
		['V2-C23', '23.1'],
	],
	algebra: [
		['V1-C07', '7.1'],
		['V2-C13', '13.3'],
	],
	geometry: [['V1-C11', '11.6'], ['V1-C14'], ['V2-C04', '4.1']],
	inequalities: [['V1-C22'], ['V2-C14', '14.2'], ['V2-C14', '14.3']],
	combinatorics: [['V1-C25'], ['V1-C28', '28.5'], ['V2-C15', '15.1']],
	sequences: [
		['V1-C24', '24.5'],
		['V2-C16', '16.4'],
	],
};
const questions = [];
for (let year = 2011; year <= 2026; year++) {
	const path = `references/papers/${year}.md`;
	const text = await readFile(new URL(path, root), 'utf8');
	const date = text.split('\n')[0].split(' · ')[1];
	const matches = [...text.matchAll(/^## Q(\d+) \| ([^\n|]+) \| ([^\n]+)$/gm)];
	if (matches.length !== 10)
		throw new Error(`Expected 10 questions in ${year}`);
	for (let i = 0; i < matches.length; i++) {
		const m = matches[i],
			number = +m[1],
			paper = number <= 5 ? 1 : 2;
		const content = text
			.slice(m.index + m[0].length, matches[i + 1]?.index)
			.trim();
		const topics = m[3].split(', ');
		const links = topics.flatMap((t) => routes[t] ?? []);
		if (/function/i.test(m[2]))
			links.push(['V1-C21', '21.3'], ['V2-C07', '7.3']);
		if (/polynomial/i.test(m[2])) links.push(['V2-C06', '6.3']);
		if (/binomial/i.test(m[2])) links.push(['V2-C15', '15.5']);
		if (/linear system/i.test(m[2])) links.unshift(['V1-C03', '3.3']);
		if (/area/i.test(m[2])) links.push(['V1-C15', '15.2']);
		const ids = new Set();
		const prerequisites = links
			.filter((x) => {
				const key = x.join(':');
				if (ids.has(key)) return false;
				ids.add(key);
				return true;
			})
			.map(([chapterId, section]) => {
				const c = aops.find((c) => c.id === chapterId);
				const s = section
					? c?.sections.find((s) => s.id === section)
					: undefined;
				if (!c || (section && !s))
					throw new Error(`Missing prerequisite ${chapterId} ${section}`);
				return {
					chapterId,
					...(section ? { section } : {}),
					title: s?.title ?? c.title,
				};
			});
		const pdfPage = 54 + (year - 2011) * 2 + paper - 1;
		questions.push({
			id: `IRMO-${year}-P${paper}-Q${number}`,
			year,
			stage: year === 2011 ? 'predecessor-final' : 'round-2',
			paper,
			number,
			date,
			title: m[2].trim(),
			topics,
			aops: prerequisites,
			path,
			scan: `references/assets/page-${pdfPage}.png`,
			pdfPage,
			printedPage: pdfPage - 4,
			hasDiagram: content.includes('!['),
			keywords: [
				...new Set(content.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []),
			].join(' '),
		});
	}
}
const catalog = {
	name: 'Irish Mathematical Olympiad · Round 2 / national final',
	years: Array.from({ length: 16 }, (_, i) => 2011 + i),
	coverage:
		'32 national-final papers, 160 questions: Round 2 finals from 2012–2026 (30 papers, 150 questions), plus the May 2011 predecessor final (2 papers, 10 questions). School Round 1 began in November 2011. Earlier national finals (1988–2010) remain in the source archive. No missing final year within 2012–2026; the 2027 final is not collected.',
	source: {
		title: 'The Irish Mathematical Olympiads Compendium 1988–2026',
		author: 'Mark Dukes, University College Dublin',
		url: 'https://maths.ucd.ie/~dukes/Irish_Maths_Olympiad_Compendium.pdf',
		archive: 'https://maths.ucd.ie/~dukes/irmo.html',
	},
	topics: Object.keys(routes),
	questions,
};
const json = JSON.stringify(catalog, null, 2) + '\n';
const dest = new URL('references/catalog.json', root);
if (process.argv.includes('--check')) {
	if ((await readFile(dest, 'utf8')) !== json)
		throw new Error(
			'IrMO catalog is out of date. Run node scripts/build-irmo-catalog.mjs',
		);
} else await writeFile(dest, json);
console.log(
	`${questions.length} questions, ${catalog.years.length} years; catalog ${process.argv.includes('--check') ? 'verified' : 'written'}.`,
);
