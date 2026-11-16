import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import {
	saveRecording,
	listRecordings,
	deleteRecording,
} from '../src/lib/client/recordings';
import { demoPractice } from '../src/lib/demo';
import { defaultProfile } from '../src/lib/domain';
it('persists audio bytes, the original script and self-review notes across reads', async () => {
	const practice = {
		...demoPractice({
			profile: defaultProfile,
			mode: 'speaking',
			sourceType: 'daily',
			material: '',
		}),
		id: 'p',
		profile: defaultProfile,
		mode: 'speaking' as const,
		origin: 'demo' as const,
		createdAt: '2026-11-16',
	};
	const audio = {
		id: 'r',
		practice,
		blob: new Blob(['synthetic audio'], { type: 'audio/webm' }),
		duration: 3,
		createdAt: '2026-11-16',
		note: '',
	};
	await saveRecording(audio);
	practice.script = 'changed after recording';
	let saved = (await listRecordings())[0];
	expect(await saved.blob.text()).toBe('synthetic audio');
	expect(saved.practice.script).toContain('Después de las clases');
	await saveRecording({ ...saved, note: '再练第二句' });
	expect((await listRecordings())[0].note).toBe('再练第二句');
	await deleteRecording('r');
	expect(await listRecordings()).toEqual([]);
});
