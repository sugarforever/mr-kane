import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GET, POST } from '../src/routes/api/learning/+server';
let dir = '';
afterEach(() => {
	vi.unstubAllEnvs();
	if (dir) rmSync(dir, { recursive: true, force: true });
});
it('requires same-origin writes, rejects invalid commands and returns private persisted state', async () => {
	dir = mkdtempSync(join(tmpdir(), 'learning-http-'));
	vi.stubEnv('MR_KANE_DATA_DIR', dir);
	const url = new URL('http://localhost/api/learning');
	const req = (origin: string, body: unknown) => ({
		url,
		request: new Request(url, {
			method: 'POST',
			headers: { origin, 'content-type': 'application/json' },
			body: JSON.stringify(body),
		}),
	});
	await expect(
		POST(
			req('http://evil.test', {
				type: 'draft.put',
				practiceId: 'a',
				text: 'Hola',
			}) as any,
		),
	).rejects.toMatchObject({ status: 403 });
	await expect(
		POST(
			req(url.origin, { type: 'draft.put', practiceId: 'a', text: 22 }) as any,
		),
	).rejects.toMatchObject({ status: 400 });
	await POST(
		req(url.origin, {
			type: 'draft.put',
			practiceId: 'a',
			text: 'Hola',
		}) as any,
	);
	const response = await GET({ url, request: new Request(url) } as any);
	expect(response.headers.get('cache-control')).toBe('no-store');
	expect((await response.json()).drafts.a).toBe('Hola');
});
