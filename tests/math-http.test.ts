import { afterEach, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GET as image } from '../src/routes/api/math/library/[...path]/+server';
import { POST as create } from '../src/routes/api/math/sessions/+server';
import { GET as session } from '../src/routes/api/math/sessions/[id]/+server';
let dir = '';
afterEach(() => {
	vi.unstubAllEnvs();
	if (dir) rmSync(dir, { recursive: true, force: true });
});
it('protects saved conversations from cross-origin access and rejects malformed IDs', async () => {
	dir = mkdtempSync(join(tmpdir(), 'math-http-'));
	vi.stubEnv('MR_KANE_DATA_DIR', dir);
	vi.stubEnv('PI_API_KEY', '');
	const url = new URL('http://localhost/api/math/sessions');
	await expect(
		create({
			url,
			request: new Request(url, {
				method: 'POST',
				headers: {
					origin: 'https://elsewhere.test',
					'Content-Type': 'application/json',
				},
				body: '{}',
			}),
		} as any),
	).rejects.toMatchObject({ status: 403 });
	const response = await create({
		url,
		request: new Request(url, {
			method: 'POST',
			headers: { origin: url.origin, 'Content-Type': 'application/json' },
			body: '{}',
		}),
	} as any);
	expect(response.status).toBe(201);
	const saved = await response.json();
	expect(saved.learner.background).toBe('');
	await expect(
		session({
			url,
			params: { id: saved.id },
			request: new Request(url, {
				headers: { 'sec-fetch-site': 'cross-site' },
			}),
		} as any),
	).rejects.toThrow();
	await expect(
		session({
			url,
			params: { id: '../other' },
			request: new Request(url),
		} as any),
	).rejects.toThrow();
});
it('serves bundled PNG source pages but never arbitrary paths', async () => {
	const url = new URL('http://localhost/api/math/library/source');
	const request = new Request(url);
	const response = await image({
		url,
		request,
		params: { path: 'volume-1-the-basics/assets/pdf-page-056.png' },
	} as any);
	expect(response.headers.get('content-type')).toBe('image/png');
	expect(
		Buffer.from(await response.arrayBuffer())
			.subarray(1, 4)
			.toString(),
	).toBe('PNG');
	await expect(
		image({ url, request, params: { path: '../../.env' } } as any),
	).rejects.toMatchObject({ status: 404 });
});
