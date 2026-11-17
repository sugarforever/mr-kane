import { expect, it } from 'vitest';
import { readInput } from '../src/lib/server/http';
const url = new URL('http://localhost:5173/api/practice');
it('accepts same-origin JSON and rejects a foreign origin before reading a body', async () => {
	const request = (origin: string) =>
		new Request(url, {
			method: 'POST',
			headers: { origin, 'Content-Type': 'application/json' },
			body: '{"mode":"writing"}',
		});
	expect(await readInput(request(url.origin), url)).toEqual({
		mode: 'writing',
	});
	await expect(
		readInput(request('https://elsewhere.example'), url),
	).rejects.toMatchObject({ status: 403 });
});
it('bounds the bytes actually received, even without a content-length header', async () => {
	const oversized = new Request(url, {
		method: 'POST',
		headers: { origin: url.origin, 'Content-Type': 'application/json' },
		body: JSON.stringify({ text: 'x'.repeat(80001) }),
	});
	await expect(readInput(oversized, url)).rejects.toMatchObject({
		status: 413,
	});
});
it('rejects malformed JSON instead of treating it as an empty practice', async () => {
	const request = new Request(url, {
		method: 'POST',
		headers: { origin: url.origin, 'Content-Type': 'application/json' },
		body: '{',
	});
	await expect(readInput(request, url)).rejects.toMatchObject({ status: 400 });
});
