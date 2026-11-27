import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/** Read model failures only; never read the credential/settings database. */
export async function modelErrors(store, secret) {
	const errors = [];
	for (const dir of ['study/math', 'requests']) {
		for (const file of await readdir(join(store, dir)).catch(() => [])) {
			if (!file.endsWith('.sqlite')) continue;
			const db = new DatabaseSync(join(store, dir, file), { readOnly: true });
			try {
				for (const { record } of db.prepare('SELECT record FROM tasks').all()) {
					const message = JSON.parse(record).state?.outcome?.error?.message;
					if (message)
						errors.push(
							secret ? message.replaceAll(secret, '<REDACTED>') : message,
						);
				}
			} finally {
				db.close();
			}
		}
	}
	return [...new Set(errors)];
}
