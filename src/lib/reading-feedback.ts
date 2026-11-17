export type WordDifference = {
	type: 'matched' | 'missing' | 'different' | 'extra';
	expected?: string;
	heard?: string;
};
export function spokenWords(text: string) {
	return (
		text
			.normalize('NFC')
			.toLocaleLowerCase()
			.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)
			?.map((word) => word.replaceAll('’', "'")) ?? []
	);
}
export function compareReading(
	expected: string,
	transcript: string,
): WordDifference[] {
	const a = spokenWords(expected),
		b = spokenWords(transcript);
	if (!b.length) return [];
	if (a.length > 800 || b.length > 800)
		throw new Error(
			'This reading is too long for a word comparison. Try a shorter recording.',
		);
	const rows = Array.from(
		{ length: a.length + 1 },
		() => new Uint16Array(b.length + 1),
	);
	for (let i = 0; i <= a.length; i++) rows[i][0] = i;
	for (let j = 0; j <= b.length; j++) rows[0][j] = j;
	for (let i = 1; i <= a.length; i++)
		for (let j = 1; j <= b.length; j++)
			rows[i][j] = Math.min(
				rows[i - 1][j] + 1,
				rows[i][j - 1] + 1,
				rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
			);
	const output: WordDifference[] = [];
	let i = a.length,
		j = b.length;
	while (i || j) {
		if (
			i &&
			j &&
			rows[i][j] === rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
		) {
			output.push({
				type: a[i - 1] === b[j - 1] ? 'matched' : 'different',
				expected: a[--i],
				heard: b[--j],
			});
		} else if (i && rows[i][j] === rows[i - 1][j] + 1)
			output.push({ type: 'missing', expected: a[--i] });
		else output.push({ type: 'extra', heard: b[--j] });
	}
	return output.reverse();
}
