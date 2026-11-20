import { expect, it } from 'vitest';
import { resultTop } from '../src/lib/selection-layout';

it('keeps outward results inside either viewport edge', () => {
	expect(resultTop(-100, 160, 800)).toBe(12);
	expect(resultTop(750, 160, 800)).toBe(628);
	expect(resultTop(320, 160, 800)).toBe(320);
});
