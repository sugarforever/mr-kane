import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { importBrowserLearning } from '../src/lib/client/learning-migration';
import {
	learningCommand,
	readLearning,
} from '../src/lib/server/learning-store';
import { defaultProfile } from '../src/lib/domain';
class Store {
	[key: string]: any;
	getItem(k: string) {
		return this[k] ?? null;
	}
	setItem(k: string, v: string) {
		this[k] = v;
	}
	removeItem(k: string) {
		delete this[k];
	}
	clear() {
		Object.keys(this).forEach((k) => delete this[k]);
	}
	key(i: number) {
		return Object.keys(this)[i] ?? null;
	}
	get length() {
		return Object.keys(this).length;
	}
}
let dir = '';
afterEach(() => {
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
	if (dir) rmSync(dir, { recursive: true, force: true });
});
function setup() {
	dir = mkdtempSync(join(tmpdir(), 'learning-migration-'));
	vi.stubEnv('MR_KANE_DATA_DIR', dir);
	vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) =>
		Response.json(
			init?.body
				? await learningCommand(JSON.parse(String(init.body)))
				: await readLearning(),
		),
	);
}
it('imports durable browser records and leaves transient translation cache intact', async () => {
	setup();
	const store = new Store();
	store.setItem('mr-kane-profiles', JSON.stringify({ es: defaultProfile }));
	store.setItem('mr-kane-draft:p', 'Hola');
	store.setItem('mr-kane-passage-translations-v2', 'cached');
	const saved = await importBrowserLearning(store);
	expect(saved.profiles.es).toEqual(defaultProfile);
	expect(saved.drafts.p).toBe('Hola');
	expect(store.getItem('mr-kane-profiles')).toBeNull();
	expect(store.getItem('mr-kane-draft:p')).toBeNull();
	expect(store.getItem('mr-kane-passage-translations-v2')).toBe('cached');
});
it('retains all originals when validation or the server fails', async () => {
	setup();
	const store = new Store();
	store.setItem('mr-kane-profiles', 'broken');
	await expect(importBrowserLearning(store)).rejects.toThrow();
	expect(store.getItem('mr-kane-profiles')).toBe('broken');
	store.setItem('mr-kane-profiles', JSON.stringify({ es: defaultProfile }));
	vi.stubGlobal('fetch', async () => {
		throw new Error('offline');
	});
	await expect(importBrowserLearning(store)).rejects.toThrow('offline');
	expect(store.getItem('mr-kane-profiles')).not.toBeNull();
});
it('does not resurrect an imported vocabulary entry after partially failed browser cleanup', async () => {
	setup();
	const store = new Store();
	store.setItem('mr-kane-draft:p', 'Hola');
	store.setItem(
		'mr-kane-vocabulary',
		JSON.stringify([
			{
				id: 'word',
				text: 'Hola',
				language: 'es',
				english: 'Hello',
				createdAt: '2026',
				reviewedAt: null,
			},
		]),
	);
	const remove = store.removeItem.bind(store);
	store.removeItem = (key: string) => {
		if (key === 'mr-kane-vocabulary') throw new Error('storage failure');
		remove(key);
	};
	await importBrowserLearning(store);
	expect(store.getItem('mr-kane-vocabulary')).not.toBeNull();
	await learningCommand({ type: 'vocabulary.delete', id: 'word' });
	store.removeItem = remove;
	await importBrowserLearning(store);
	expect((await readLearning()).vocabulary).toEqual([]);
});
