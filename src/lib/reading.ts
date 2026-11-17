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
