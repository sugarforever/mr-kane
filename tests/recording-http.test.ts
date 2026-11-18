import type { RequestEvent } from '@sveltejs/kit';
import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
	POST as postHandler,
	GET as getHandler,
} from '../src/routes/api/recordings/+server';
import {
	PATCH as patchHandler,
	DELETE as deleteHandler,
} from '../src/routes/api/recordings/[id]/+server';
import { GET as audioHandler } from '../src/routes/api/recordings/[id]/audio/+server';
import {
	recordingAccess,
	recordingBody,
} from '../src/lib/server/recording-http';
import { demoPractice } from '../src/lib/demo';
import { defaultProfile } from '../src/lib/domain';
const POST = (e: RequestEvent) =>
	postHandler(e as Parameters<typeof postHandler>[0]);
const GET = (e: RequestEvent) =>
	getHandler(e as Parameters<typeof getHandler>[0]);
const PATCH = (e: RequestEvent) =>
	patchHandler(e as Parameters<typeof patchHandler>[0]);
const DELETE = (e: RequestEvent) =>
	deleteHandler(e as Parameters<typeof deleteHandler>[0]);
const audioGET = (e: RequestEvent) =>
	audioHandler(e as Parameters<typeof audioHandler>[0]);
const event = (request: Request, eventUrl = url) =>
	({ request, url: eventUrl, params: { id: metadata.id } }) as RequestEvent & {
		params: { id: string };
	};
const url = new URL('http://localhost:5173/api/recordings');
const previous = process.env.MR_KANE_DATA_DIR;
let dir: string;
afterEach(() => {
	if (previous === undefined) delete process.env.MR_KANE_DATA_DIR;
	else process.env.MR_KANE_DATA_DIR = previous;
	if (dir) rmSync(dir, { recursive: true, force: true });
});
const metadata = {
	id: 'http-recording',
	practice: {
		...demoPractice({
			profile: defaultProfile,
			mode: 'speaking',
			sourceType: 'daily',
			material: '',
		}),
		id: 'practice',
		profile: defaultProfile,
		mode: 'speaking',
		origin: 'demo',
		createdAt: '2026-11-18',
	},
	duration: 5,
	createdAt: '2026-11-18',
	note: '',
	targetText: 'Hola',
};
function upload(
	details: unknown = metadata,
	audio = new Blob(['bytes'], { type: 'audio/webm' }),
) {
	const form = new FormData();
	form.set('details', JSON.stringify(details));
	form.set('audio', audio, 'recording');
	return new Request(url, {
		method: 'POST',
		headers: { origin: url.origin },
		body: form,
	});
}
it('uploads durable audio, lists metadata without bytes, patches, replays and deletes', async () => {
	dir = mkdtempSync(join(tmpdir(), 'recording-http-'));
	process.env.MR_KANE_DATA_DIR = dir;
	expect(await (await POST(event(upload()))).json()).toEqual({
		id: metadata.id,
	});
	const listing = await GET(event(new Request(url)));
	expect(listing.headers.get('cache-control')).toBe('no-store');
	expect(await listing.json()).toEqual([metadata]);
	const patched = await PATCH(
		event(
			new Request(url, {
				method: 'PATCH',
				headers: { origin: url.origin, 'content-type': 'application/json' },
				body: JSON.stringify({ note: 'Try again' }),
			}),
		),
	);
	expect((await patched.json()).note).toBe('Try again');
	await POST(event(upload()));
	const audio = await audioGET(event(new Request(url)));
	expect(audio.headers.get('content-type')).toBe('audio/webm');
	expect(await audio.text()).toBe('bytes');
	const range = await audioGET(
		event(new Request(url, { headers: { range: 'bytes=1-3' } })),
	);
	expect(range.status).toBe(206);
	expect(range.headers.get('content-range')).toBe('bytes 1-3/5');
	expect(await range.text()).toBe('yte');
	expect(
		(
			await audioGET(
				event(new Request(url, { headers: { range: 'bytes=100-200' } })),
			)
		).status,
	).toBe(416);
	expect((await (await GET(event(new Request(url)))).json())[0].note).toBe(
		'Try again',
	);
	await DELETE(
		event(
			new Request(url, { method: 'DELETE', headers: { origin: url.origin } }),
		),
	);
	await expect(async () =>
		audioGET(event(new Request(url))),
	).rejects.toHaveProperty('status', 404);
	await expect(POST(event(upload()))).rejects.toMatchObject({ status: 409 });
});
it('rejects foreign origins for reads and writes and missing write origins', async () => {
	for (const method of ['GET', 'POST', 'PATCH', 'DELETE'])
		expect(() =>
			recordingAccess(
				new Request(url, {
					method,
					headers: { origin: 'https://foreign.example' },
				}),
				url,
			),
		).toThrow();
	expect(() =>
		recordingAccess(
			new Request(url, { headers: { 'sec-fetch-site': 'cross-site' } }),
			url,
		),
	).toThrow();
	expect(() =>
		recordingAccess(new Request(url, { method: 'DELETE' }), url),
	).toThrow();
	await expect(
		POST(event(upload(), new URL('http://foreign.example'))),
	).rejects.toMatchObject({ status: 403 });
});
it('rejects malformed metadata, empty or non-audio uploads and bounds streamed bytes', async () => {
	dir = mkdtempSync(join(tmpdir(), 'recording-validation-'));
	process.env.MR_KANE_DATA_DIR = dir;
	for (const request of [
		upload({ ...metadata, duration: -1 }),
		upload(metadata, new Blob([], { type: 'audio/webm' })),
		upload(metadata, new Blob(['x'], { type: 'text/html' })),
	])
		await expect(POST(event(request))).rejects.toHaveProperty('status');
	await expect(
		recordingBody(new Request(url, { method: 'POST', body: 'too long' }), 3),
	).rejects.toMatchObject({ status: 413 });
	expect(await (await GET(event(new Request(url)))).json()).toEqual([]);
});
