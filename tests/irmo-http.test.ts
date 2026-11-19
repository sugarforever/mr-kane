import { expect, it } from 'vitest';
import { GET as image } from '../src/routes/api/math/library/[...path]/+server';
it('lets students browse and read without an AI connection while enforcing access boundaries', async () => {
	const { GET } = await import('../src/routes/api/math/irmo/+server');
	const call = (query: string, headers: Record<string, string> = {}) => {
		const url = new URL(`http://localhost/api/math/irmo${query}`);
		return GET({ url, request: new Request(url, { headers }) } as any);
	};
	const list = await (
		await call('?year=2024&paper=2&topic=number-theory')
	).json();
	expect(list.questions.map((q: any) => q.id)).toEqual([
		'IRMO-2024-P2-Q6',
		'IRMO-2024-P2-Q7',
	]);
	const q = await (await call('?id=IRMO-2024-P2-Q6')).json();
	expect(q.content).toContain('\\binom{n}{3}');
	expect(q.aops.length).toBeGreaterThan(0);
	expect(q.scanUrl).toContain('/api/math/library/irmo/');
	await expect(call('?id=IRMO-2024-P1-Q6')).rejects.toMatchObject({
		status: 404,
	});
	await expect(call('?id=../../.env')).rejects.toMatchObject({ status: 400 });
	await expect(call('?paper=3')).rejects.toMatchObject({ status: 400 });
	await expect(
		call('?year=2024', { origin: 'https://elsewhere.test' }),
	).rejects.toMatchObject({ status: 403 });
});
it('serves competition scans using the same protected image endpoint', async () => {
	const url = new URL(
		'http://localhost/api/math/library/irmo/assets/page-81.png',
	);
	const response = await image({
		url,
		request: new Request(url),
		params: { path: 'irmo/assets/page-81.png' },
	} as any);
	expect(response.headers.get('content-type')).toBe('image/png');
	expect(
		Buffer.from(await response.arrayBuffer())
			.subarray(1, 4)
			.toString(),
	).toBe('PNG');
	await expect(
		image({
			url,
			request: new Request(url),
			params: { path: 'irmo/assets/page-01.png' },
		} as any),
	).rejects.toMatchObject({ status: 404 });
});
