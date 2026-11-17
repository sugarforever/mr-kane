import { z } from 'zod';
export const selectionLimit = 4000;
export const translationInput = z
	.object({
		language: z.enum(['ga', 'es']),
		text: z.string().trim().min(1).max(selectionLimit),
	})
	.strict();
export const translationOutput = z.object({
	english: z.string().trim().min(1).max(16000),
});
// Never fall back to another language or a network voice.
export function matchingVoice<
	T extends { lang: string; localService: boolean },
>(voices: T[], language: 'ga' | 'es'): T | undefined {
	return voices.find(
		(v) =>
			v.localService &&
			v.lang.toLowerCase().replaceAll('_', '-').split('-')[0] === language,
	);
}
export function readingSelection(
	selection: Selection | null,
	element: HTMLElement,
): string {
	if (!selection || selection.isCollapsed || selection.rangeCount !== 1)
		return '';
	const range = selection.getRangeAt(0);
	if (
		!element.contains(range.startContainer) ||
		!element.contains(range.endContainer)
	)
		return '';
	return selection.toString().trim();
}

export const passageInput = z
	.object({
		language: z.enum(['ga', 'es']),
		text: z.string().trim().min(1).max(12000),
	})
	.strict()
	.refine(
		(value) => passageParagraphs(value.text).length <= 100,
		'Use up to 100 paragraphs.',
	);
export const passageOutput = z.object({
	paragraphs: z.array(z.string().trim().min(1).max(16000)).min(1).max(100),
});
export function passageParagraphs(text: string) {
	return text
		.trim()
		.split(/\n\s*\n/)
		.filter(Boolean);
}
export function parsePassageTranslation(value: unknown, source: string) {
	const parsed = passageOutput.parse(value);
	if (
		parsed.paragraphs.length !== passageParagraphs(source).length ||
		parsed.paragraphs.join('\n\n').length > 24000
	)
		throw new Error('The translation did not match the reading passage.');
	return parsed.paragraphs;
}
