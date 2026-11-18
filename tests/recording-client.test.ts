import 'fake-indexeddb/auto';
import { afterEach, expect, it, vi } from 'vitest';
import * as legacy from '../src/lib/client/legacy-recordings';
import {
	importBrowserRecordings,
	saveRecording,
} from '../src/lib/client/recordings';
import { demoPractice } from '../src/lib/demo';
import { defaultProfile } from '../src/lib/domain';
afterEach(() => vi.unstubAllGlobals());
it('retains browser originals after successful, repeated and failed imports', async () => {
	const practice = {
		...demoPractice({
			profile: defaultProfile,
			mode: 'speaking',
			sourceType: 'daily',
			material: '',
		}),
		id: 'practice',
		profile: defaultProfile,
		mode: 'speaking' as const,
		origin: 'demo' as const,
		createdAt: '2026-11-18',
	};
	const recording = {
		id: 'legacy-import',
		practice,
		blob: new Blob(['bytes'], { type: 'audio/webm' }),
		duration: 2,
		createdAt: '2026-11-18',
		note: 'original',
	};
	await legacy.saveRecording(recording);
	const fetch = vi
		.fn()
		.mockResolvedValue(
			new Response(JSON.stringify({ id: recording.id }), { status: 200 }),
		);
	vi.stubGlobal('fetch', fetch);
	expect((await importBrowserRecordings()).saved).toBe(1);
	expect((await importBrowserRecordings()).saved).toBe(1);
	fetch.mockResolvedValue(new Response('offline', { status: 503 }));
	expect((await importBrowserRecordings()).failed).toHaveLength(1);
	expect(
		(await legacy.listRecordings()).find((r) => r.id === recording.id)?.note,
	).toBe('original');
	await expect(saveRecording(recording)).rejects.toThrow();
	await legacy.deleteRecording(recording.id);
});
