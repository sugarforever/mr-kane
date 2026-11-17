import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync, closeSync, openSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { builtinProviders } from '@earendil-works/pi-ai/providers/all';
import type { Credential, CredentialStore } from '@earendil-works/pi-ai';
import type { Connection, AISettings, PublicConnection } from '#lib/ai-types';
export function dataDir() {
	const dir = resolve(process.env.MR_KANE_DATA_DIR || 'data');
	mkdirSync(dir, { recursive: true, mode: 0o700 });
	chmodSync(dir, 0o700);
	return dir;
}
export function database() {
	const path = join(dataDir(), 'settings.sqlite');
	closeSync(openSync(path, 'a', 0o600));
	chmodSync(path, 0o600);
	const db = new DatabaseSync(path);
	db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;
 CREATE TABLE IF NOT EXISTS connections(id TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS credentials(slot TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS credential_locks(slot TEXT PRIMARY KEY,owner TEXT NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,hash TEXT NOT NULL,snapshot TEXT NOT NULL);`);
	return db;
}
export function readCredential(slot: string): Credential | undefined {
	const db = database();
	try {
		const row = db
			.prepare('SELECT value FROM credentials WHERE slot=?')
			.get(slot) as { value: string } | undefined;
		return row ? JSON.parse(row.value) : undefined;
	} finally {
		db.close();
	}
}
function writeCredential(slot: string, c: Credential) {
	const db = database();
	try {
		db.prepare('INSERT OR REPLACE INTO credentials VALUES (?,?)').run(
			slot,
			JSON.stringify(c),
		);
	} finally {
		db.close();
	}
}
export async function locked<T>(
	slot: string,
	fn: () => Promise<T>,
	signal?: AbortSignal,
): Promise<T> {
	const db = database(),
		owner = randomUUID();
	const deadline = Date.now() + 45000;
	try {
		for (;;) {
			signal?.throwIfAborted();
			if (Date.now() > deadline)
				throw new Error('Credential storage is busy. Please retry.');
			const now = Date.now();
			if (
				db
					.prepare(
						'INSERT INTO credential_locks VALUES (?,?,?) ON CONFLICT(slot) DO UPDATE SET owner=excluded.owner,expires=excluded.expires WHERE credential_locks.expires < ?',
					)
					.run(slot, owner, now + 15000, now).changes
			)
				break;
			await new Promise((r) => setTimeout(r, 30));
		}
		const timer = setInterval(() => {
			db.prepare(
				'UPDATE credential_locks SET expires=? WHERE slot=? AND owner=?',
			).run(Date.now() + 15000, slot, owner);
		}, 4000);
		timer.unref();
		try {
			return await fn();
		} finally {
			clearInterval(timer);
			db.prepare('DELETE FROM credential_locks WHERE slot=? AND owner=?').run(
				slot,
				owner,
			);
		}
	} finally {
		db.close();
	}
}
export function credentialStore(slot: string): CredentialStore {
	return {
		async read() {
			return readCredential(slot);
		},
		async list() {
			const c = readCredential(slot);
			return c ? [{ providerId: slot, type: c.type }] : [];
		},
		async modify(_id, fn, options) {
			return locked(
				slot,
				async () => {
					const next = await fn(readCredential(slot));
					options?.signal?.throwIfAborted();
					if (next) writeCredential(slot, next);
					return next ?? readCredential(slot);
				},
				options?.signal,
			);
		},
		async delete(_id, options) {
			await locked(
				slot,
				async () => {
					const db = database();
					try {
						db.prepare('DELETE FROM credentials WHERE slot=?').run(slot);
					} finally {
						db.close();
					}
				},
				options?.signal,
			);
		},
	};
}
function seed() {
	const db = database();
	try {
		db.exec('BEGIN IMMEDIATE');
		if (
			!db.prepare("SELECT value FROM metadata WHERE key='initialized'").get()
		) {
			if (
				process.env.PI_PROVIDER &&
				process.env.PI_MODEL &&
				process.env.PI_API_KEY
			) {
				const id = 'environment',
					slot = randomUUID();
				const p: Connection = {
					id,
					name: 'Environment connection',
					service: process.env.PI_PROVIDER,
					authMode: 'api_key',
					baseUrl:
						builtinProviders().find((p) => p.id === process.env.PI_PROVIDER)
							?.baseUrl ?? '',
					modelId: process.env.PI_MODEL,
					models: [process.env.PI_MODEL],
					protocol: 'openai-completions',
					credentialSlot: slot,
				};
				db.prepare('INSERT INTO connections VALUES (?,?)').run(
					id,
					JSON.stringify(p),
				);
				db.prepare('INSERT INTO credentials VALUES (?,?)').run(
					slot,
					JSON.stringify({ type: 'api_key', key: process.env.PI_API_KEY }),
				);
				db.prepare("INSERT INTO metadata VALUES ('default',?)").run(id);
			}
			db.prepare("INSERT INTO metadata VALUES ('initialized','yes')").run();
		}
		db.exec('COMMIT');
	} catch (e) {
		db.exec('ROLLBACK');
		throw e;
	} finally {
		db.close();
	}
}
export function connections(): Connection[] {
	seed();
	const db = database();
	try {
		return (
			db.prepare('SELECT value FROM connections ORDER BY rowid').all() as {
				value: string;
			}[]
		).map((r) => JSON.parse(r.value));
	} finally {
		db.close();
	}
}
export function readConnection(id: string) {
	return connections().find((p) => p.id === id);
}
export function defaultConnection() {
	seed();
	const db = database();
	try {
		const row = db
			.prepare("SELECT value FROM metadata WHERE key='default'")
			.get() as { value: string } | undefined;
		return row ? readConnection(row.value) : undefined;
	} finally {
		db.close();
	}
}
export function publicConnection(p: Connection): PublicConnection {
	const {
		credentialSlot,
		id,
		name,
		service,
		authMode,
		baseUrl,
		modelId,
		models,
		protocol,
	} = p;
	const safe = {
		id,
		name,
		service,
		authMode,
		baseUrl,
		modelId,
		models,
		protocol,
	};
	const c = readCredential(credentialSlot);
	return {
		...safe,
		connected:
			p.authMode === 'none' ||
			(p.authMode === 'oauth'
				? c?.type === 'oauth'
				: c?.type === 'api_key' && !!c.key),
		...(c?.type === 'oauth' ? { expiresAt: c.expires } : {}),
	};
}
export function publicSettings(): AISettings {
	return {
		providers: connections().map(publicConnection),
		defaultProviderId: defaultConnection()?.id ?? null,
	};
}
export function saveConnection(
	input: Omit<Connection, 'id' | 'credentialSlot'> & { id?: string },
	key?: string,
): PublicConnection {
	const old = input.id ? readConnection(input.id) : undefined;
	if (input.id && !old) throw new Error('Connection no longer exists.');
	const same =
		old &&
		old.service === input.service &&
		old.authMode === input.authMode &&
		old.baseUrl === input.baseUrl;
	if (
		input.authMode === 'api_key' &&
		!key &&
		(!same || !readCredential(old!.credentialSlot))
	)
		throw new Error('Enter an API key for this connection.');
	const p: Connection = {
		name: input.name,
		service: input.service,
		authMode: input.authMode,
		baseUrl: input.baseUrl,
		modelId: input.modelId,
		models: [...input.models],
		protocol: input.protocol,
		id: old?.id ?? randomUUID(),
		credentialSlot: same && !key ? old!.credentialSlot : randomUUID(),
	};
	const selected = defaultConnection();
	const db = database();
	try {
		db.exec('BEGIN IMMEDIATE');
		db.prepare('INSERT OR REPLACE INTO connections VALUES (?,?)').run(
			p.id,
			JSON.stringify(p),
		);
		if (key)
			db.prepare('INSERT INTO credentials VALUES (?,?)').run(
				p.credentialSlot,
				JSON.stringify({ type: 'api_key', key }),
			);
		if (!old && !selected)
			db.prepare("INSERT OR REPLACE INTO metadata VALUES ('default',?)").run(
				p.id,
			);
		db.exec('COMMIT');
	} catch (e) {
		db.exec('ROLLBACK');
		throw e;
	} finally {
		db.close();
	}
	return publicConnection(p);
}
export function selectConnection(id: string | null, modelId?: string) {
	const p = id ? readConnection(id) : undefined;
	if (id && (!p || !p.models.includes(modelId ?? p.modelId)))
		throw new Error('Select a model from this connection.');
	const db = database();
	try {
		if (p) {
			p.modelId = modelId ?? p.modelId;
			db.prepare('UPDATE connections SET value=? WHERE id=?').run(
				JSON.stringify(p),
				id!,
			);
		}
		db.prepare("INSERT OR REPLACE INTO metadata VALUES ('default',?)").run(
			id ?? '',
		);
	} finally {
		db.close();
	}
}
export function rotateSlot(id: string) {
	const p = readConnection(id);
	if (!p) throw new Error('Connection not found.');
	p.credentialSlot = randomUUID();
	const db = database();
	try {
		db.prepare('UPDATE connections SET value=? WHERE id=?').run(
			JSON.stringify(p),
			id,
		);
	} finally {
		db.close();
	}
	return p;
}
export function removeConnection(id: string) {
	const db = database();
	try {
		db.prepare('DELETE FROM connections WHERE id=?').run(id);
		db.prepare("DELETE FROM metadata WHERE key='default' AND value=?").run(id);
	} finally {
		db.close();
	}
}
