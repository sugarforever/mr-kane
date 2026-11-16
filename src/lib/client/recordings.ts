import type { Practice } from '#lib/domain';
export type Recording = {
	id: string;
	practice: Practice;
	blob: Blob;
	duration: number;
	createdAt: string;
	note: string;
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
export async function saveRecording(recording: Recording) {
	await transaction('readwrite', (s) => s.put(recording));
}
export async function listRecordings(): Promise<Recording[]> {
	return (await transaction<Recording[]>('readonly', (s) => s.getAll())).sort(
		(a, b) => b.createdAt.localeCompare(a.createdAt),
	);
}
export async function deleteRecording(id: string) {
	await transaction('readwrite', (s) => s.delete(id));
}
