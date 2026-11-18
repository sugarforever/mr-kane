import { speechCheckSchema, type SpeechCheck } from './speech-recognition';
import { practiceSchema, type Practice } from '#lib/domain';
export type Recording = {
	id: string;
	practice: Practice;
	blob: Blob;
	duration: number;
	createdAt: string;
	note: string;
	targetText?: string;
	speechCheck?: SpeechCheck;
};
function open(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open('mr-kane-audio', 1);
		request.onupgradeneeded = () =>
			request.result.createObjectStore('recordings', { keyPath: 'id' });
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
		request.onblocked = () =>
			reject(new Error('Recording storage is blocked by another tab.'));
	});
}
async function transaction<T>(
	mode: IDBTransactionMode,
	action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
	const db = await open();
	return new Promise((resolve, reject) => {
		const tx = db.transaction('recordings', mode);
		const request = action(tx.objectStore('recordings'));
		tx.oncomplete = () => {
			db.close();
			resolve(request.result);
		};
		tx.onerror = () => {
			db.close();
			reject(tx.error);
		};
		tx.onabort = () => {
			db.close();
			reject(tx.error ?? new Error('Saving was cancelled.'));
		};
	});
}
function storageRecording(recording: Recording): Recording {
	// IndexedDB cannot clone Svelte state proxies. Copy each persisted field and
	// parse nested learning data into plain objects while keeping audio bytes intact.
	return {
		id: recording.id,
		practice: practiceSchema.parse(recording.practice),
		blob: recording.blob,
		duration: recording.duration,
		createdAt: recording.createdAt,
		note: recording.note,
		...(recording.targetText !== undefined
			? { targetText: recording.targetText }
			: {}),
		...(recording.speechCheck !== undefined
			? { speechCheck: speechCheckSchema.parse(recording.speechCheck) }
			: {}),
	};
}
export async function saveRecording(recording: Recording) {
	const value = storageRecording(recording);
	await transaction('readwrite', (s) => s.put(value));
}
export async function listRecordings(): Promise<Recording[]> {
	return (await transaction<Recording[]>('readonly', (s) => s.getAll())).sort(
		(a, b) => b.createdAt.localeCompare(a.createdAt),
	);
}
export async function deleteRecording(id: string) {
	await transaction('readwrite', (s) => s.delete(id));
}

export async function patchRecording(
	id: string,
	patch: Partial<Pick<Recording, 'note' | 'speechCheck'>>,
): Promise<Recording | undefined> {
	const db = await open();
	return new Promise((resolve, reject) => {
		const tx = db.transaction('recordings', 'readwrite');
		const store = tx.objectStore('recordings');
		const request = store.get(id);
		let updated: Recording | undefined;
		request.onsuccess = () => {
			if (!request.result) return; // Never recreate a recording deleted while transcription was running.
			updated = storageRecording({
				...(request.result as Recording),
				...patch,
			});
			store.put(updated);
		};
		tx.oncomplete = () => {
			db.close();
			resolve(updated);
		};
		tx.onerror = () => {
			db.close();
			reject(tx.error);
		};
		tx.onabort = () => {
			db.close();
			reject(tx.error ?? new Error('Updating the recording was cancelled.'));
		};
	});
}
