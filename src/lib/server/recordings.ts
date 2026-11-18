import { createHash } from 'node:crypto';
import { database } from './providers-store';
import {
	recordingDetailsSchema,
	recordingPatchSchema,
	recordingAudioLimit,
	recordingTypes,
	type RecordingDetails,
} from '#lib/recording-details';
export class RecordingConflict extends Error {}
function open() {
	const db = database();
	db.exec(`CREATE TABLE IF NOT EXISTS recordings(id TEXT PRIMARY KEY, details TEXT NOT NULL, audio BLOB NOT NULL, mime TEXT NOT NULL, fingerprint TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS deleted_recordings(id TEXT PRIMARY KEY);`);
	return db;
}
export function putRecording(input: unknown, audio: Uint8Array, mime: string) {
	const details = recordingDetailsSchema.parse(input);
	if (
		!audio.length ||
		audio.length > recordingAudioLimit ||
		!recordingTypes.has(mime.split(';')[0].trim())
	)
		throw new Error('Use an audio recording up to 20 MB.');
	const { note, speechCheck, ...snapshot } = details;
	const fingerprint = createHash('sha256')
		.update(JSON.stringify(snapshot))
		.update(mime)
		.update(audio)
		.digest('hex');
	const db = open();
	try {
		db.exec('BEGIN IMMEDIATE');
		if (
			db.prepare('SELECT id FROM deleted_recordings WHERE id=?').get(details.id)
		)
			throw new RecordingConflict(
				'This recording was deleted from history. Its browser backup has been kept.',
			);
		const existing = db
			.prepare('SELECT fingerprint FROM recordings WHERE id=?')
			.get(details.id) as { fingerprint: string } | undefined;
		if (existing && existing.fingerprint !== fingerprint)
			throw new RecordingConflict(
				'A different recording already uses this ID. The browser original has been kept.',
			);
		if (!existing)
			db.prepare('INSERT INTO recordings VALUES (?,?,?,?,?)').run(
				details.id,
				JSON.stringify(details),
				audio,
				mime,
				fingerprint,
			);
		db.exec('COMMIT');
	} finally {
		db.close();
	}
	return details.id;
}
export function listRecordingDetails(): RecordingDetails[] {
	const db = open();
	try {
		return (
			db.prepare('SELECT details FROM recordings').all() as {
				details: string;
			}[]
		)
			.map((r) => recordingDetailsSchema.parse(JSON.parse(r.details)))
			.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
	} finally {
		db.close();
	}
}
export function getRecording(id: string) {
	const db = open();
	try {
		const row = db
			.prepare('SELECT details,audio,mime FROM recordings WHERE id=?')
			.get(id) as
			{ details: string; audio: Uint8Array; mime: string } | undefined;
		return row
			? {
					details: recordingDetailsSchema.parse(JSON.parse(row.details)),
					audio: row.audio,
					mime: row.mime,
				}
			: undefined;
	} finally {
		db.close();
	}
}
export function patchRecordingDetails(
	id: string,
	input: unknown,
): RecordingDetails | undefined {
	const patch = recordingPatchSchema.parse(input);
	const db = open();
	try {
		db.exec('BEGIN IMMEDIATE');
		const row = db
			.prepare('SELECT details FROM recordings WHERE id=?')
			.get(id) as { details: string } | undefined;
		const details = row
			? recordingDetailsSchema.parse({ ...JSON.parse(row.details), ...patch })
			: undefined;
		if (details)
			db.prepare('UPDATE recordings SET details=? WHERE id=?').run(
				JSON.stringify(details),
				id,
			);
		db.exec('COMMIT');
		return details;
	} finally {
		db.close();
	}
}
export function removeRecording(id: string) {
	const db = open();
	try {
		db.exec('BEGIN IMMEDIATE');
		db.prepare('DELETE FROM recordings WHERE id=?').run(id);
		db.prepare('INSERT OR IGNORE INTO deleted_recordings VALUES (?)').run(id);
		db.exec('COMMIT');
	} finally {
		db.close();
	}
}
