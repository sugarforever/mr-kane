import { z } from 'zod';
export const readingUnitSchema = z.enum([
	'words',
	'sentences',
	'paragraph',
	'article',
]);
export type ReadingUnit = z.infer<typeof readingUnitSchema>;
export const readingUnits: {
	value: ReadingUnit;
	label: string;
	description: string;
}[] = [
	{
		value: 'words',
		label: 'Words and phrases',
		description: '3–6 words or short phrases. Listen and repeat one at a time.',
	},
	{
		value: 'sentences',
		label: 'Sentences',
		description: '2–4 short sentences. Practise one sentence at a time.',
	},
	{
		value: 'paragraph',
		label: 'Paragraph',
		description: 'One short paragraph with connected ideas.',
	},
	{
		value: 'article',
		label: 'Article',
		description: 'A complete short article with several paragraphs.',
	},
];
export function readingItems(script: string) {
	return script
		.trim()
		.split(/\n\s*\n|\n/)
		.map((s) => s.trim())
		.filter(Boolean);
}
export function validateReadingScript(
	script: string,
	unit: ReadingUnit,
	selectedWordCount?: number,
) {
	const items = readingItems(script);
	const count = (text: string) => text.split(/\s+/).length;
	const paragraphs = script.trim().split(/\n\s*\n/);
	const singleSentence = (text: string) =>
		(text.match(/[.!?。！？]+(?=[\s"’”']|$)/g) ?? []).length <= 1;
	const minWords = selectedWordCount ? Math.min(3, selectedWordCount) : 3;
	const valid =
		unit === 'words'
			? items.length >= minWords &&
				items.length <= 12 &&
				items.every((s) => count(s) <= 8 && singleSentence(s))
			: unit === 'sentences'
				? items.length >= 2 &&
					items.length <= 5 &&
					items.every((s) => count(s) <= 40 && singleSentence(s))
				: unit === 'paragraph'
					? paragraphs.length === 1 && count(script) <= 200
					: paragraphs.length >= 2 &&
						paragraphs.length <= 5 &&
						count(script) <= 600;
	if (!script.trim() || !valid)
		throw new Error(
			'The generated reading did not match the selected training unit. Please retry.',
		);
}
