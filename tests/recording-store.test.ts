import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { demoPractice } from '../src/lib/demo';
import { defaultProfile } from '../src/lib/domain';
import {
	putRecording,
	getRecording,
	listRecordingDetails,
	patchRecordingDetails,
	removeRecording,
} from '../src/lib/server/recordings';
const original = process.env.MR_KANE_DATA_DIR;
let dir: string;
afterEach(() => {
	process.env.MR_KANE_DATA_DIR = original;
	if (original === undefined) delete process.env.MR_KANE_DATA_DIR;
	if (dir) rmSync(dir, { recursive: true, force: true });
});
it('stores audio and snapshots durably, imports once, patches without revival and deletes together', () => {
	dir = mkdtempSync(join(tmpdir(), 'reading-history-'));
	process.env.MR_KANE_DATA_DIR = dir;
	const metadata = {
		id: 'take-1',
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
		duration: 3,
		createdAt: '2026-11-18T10:00:00Z',
		note: '',
		targetText: 'Hola',
	};
	putRecording(metadata, Buffer.from('audio bytes'), 'audio/webm');
	expect(Buffer.from(getRecording(metadata.id)!.audio).toString()).toBe(
		'audio bytes',
	);
	expect(listRecordingDetails()[0].practice.script).toBe(
		metadata.practice.script,
	);
	patchRecordingDetails(metadata.id, { note: 'Second sentence' });
	patchRecordingDetails(metadata.id, {
		speechCheck: { transcript: 'Hola', status: 'complete' },
	});
	putRecording(metadata, Buffer.from('audio bytes'), 'audio/webm');
	expect(getRecording(metadata.id)!.details.note).toBe('Second sentence');
	expect(getRecording(metadata.id)!.details.speechCheck?.transcript).toBe(
		'Hola',
	);
	expect(() =>
		putRecording(
			{ ...metadata, targetText: 'Different' },
			Buffer.from('different bytes'),
			'audio/webm',
		),
	).toThrow();
	removeRecording(metadata.id);
	expect(getRecording(metadata.id)).toBeUndefined();
	expect(patchRecordingDetails(metadata.id, { note: 'late' })).toBeUndefined();
	expect(listRecordingDetails()).toEqual([]);
	expect(() =>
		putRecording(metadata, Buffer.from('audio bytes'), 'audio/webm'),
	).toThrow('deleted');
});
