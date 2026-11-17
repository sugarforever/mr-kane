import { expect, it } from 'vitest';
import { compareReading, spokenWords } from '../src/lib/reading-feedback';
it('ignores case and punctuation while retaining accents and word order', () => {
	expect(
		compareReading('¡Hola, Ana!', 'hola ana').every(
			(w) => w.type === 'matched',
		),
	).toBe(true);
	expect(spokenWords('D’ól mé uisce.')).toEqual(["d'ól", 'mé', 'uisce']);
	expect(compareReading('sí', 'si')[0].type).toBe('different');
});
it('aligns missing, substituted, and extra words instead of shifting all later words', () => {
	expect(compareReading('Vivo en una casa', 'vivo una casa')).toContainEqual({
		type: 'missing',
		expected: 'en',
	});
	expect(
		compareReading('Me gusta el parque', 'me gusta la casa'),
	).toContainEqual({ type: 'different', expected: 'parque', heard: 'casa' });
	expect(compareReading('Hola Ana', 'hola hola ana')).toContainEqual({
		type: 'extra',
		heard: 'hola',
	});
});
it('does not judge empty recognition as reading mistakes and bounds comparison work', () => {
	expect(compareReading('Hola', '')).toEqual([]);
	expect(() => compareReading('word '.repeat(801), 'word')).toThrow('too long');
});
