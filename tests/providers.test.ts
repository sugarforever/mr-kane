import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	saveConnection,
	publicSettings,
	selectConnection,
	removeConnection,
	readConnection,
	credentialStore,
	readCredential,
} from '../src/lib/server/providers-store';
const dirs: string[] = [];
function setup() {
	const dir = mkdtempSync(join(tmpdir(), 'kane-provider-'));
	dirs.push(dir);
	vi.stubEnv('MR_KANE_DATA_DIR', dir);
	vi.stubEnv('PI_API_KEY', '');
}
afterEach(() => {
	vi.unstubAllEnvs();
	for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
it('persists separate connections and never returns secrets in public settings', async () => {
	setup();
	const a = saveConnection(
		{
			name: 'First',
			service: 'custom',
			authMode: 'api_key',
			baseUrl: 'http://127.0.0.1:11434/v1',
			modelId: 'small',
			models: ['small'],
			protocol: 'openai-completions',
		},
		'private-alpha',
	);
	const b = saveConnection({
		name: 'Second',
		service: 'custom',
		authMode: 'none',
		baseUrl: 'http://127.0.0.1:1234/v1',
		modelId: 'local',
		models: ['local'],
		protocol: 'openai-completions',
	});
	selectConnection(b.id, 'local');
	expect(publicSettings().defaultProviderId).toBe(b.id);
	expect(JSON.stringify(publicSettings())).not.toContain('private-alpha');
	expect(readCredential(readConnection(a.id)!.credentialSlot)?.type).toBe(
		'api_key',
	);
	expect(publicSettings().providers).toHaveLength(2);
	expect(() => selectConnection(a.id, 'not-in-catalog')).toThrow();
});
it('preserves a blank key only for the same endpoint, and retains old credential snapshots', () => {
	setup();
	const a = saveConnection(
		{
			name: 'First',
			service: 'custom',
			authMode: 'api_key',
			baseUrl: 'http://localhost:11434/v1',
			modelId: 'small',
			models: ['small'],
			protocol: 'openai-completions',
		},
		'old-key',
	);
	const original = readConnection(a.id)!;
	saveConnection({ ...original, name: 'Renamed' }, '');
	expect(readConnection(a.id)!.credentialSlot).toBe(original.credentialSlot);
	expect(() =>
		saveConnection({ ...original, baseUrl: 'https://other.example/v1' }, ''),
	).toThrow();
	saveConnection(original, 'new-key');
	expect(readCredential(original.credentialSlot)).toMatchObject({
		key: 'old-key',
	});
	expect(readCredential(readConnection(a.id)!.credentialSlot)).toMatchObject({
		key: 'new-key',
	});
});
it('serializes simultaneous credential rotation and persists the updated token', async () => {
	setup();
	const store = credentialStore('test-slot');
	await store.modify('x', async () => ({
		type: 'oauth',
		access: 'initial',
		refresh: 'r',
		expires: 1,
	}));
	await Promise.all([
		store.modify('x', async (c) => {
			await new Promise((r) => setTimeout(r, 15));
			return { ...c!, access: 'next' } as any;
		}),
		store.modify('x', async (c) => {
			expect(c).toMatchObject({ access: 'next' });
			return { ...c!, access: 'final' } as any;
		}),
	]);
	expect(await credentialStore('test-slot').read('x')).toMatchObject({
		access: 'final',
	});
});
it('removing the selected connection returns to demo mode without selecting another account', () => {
	setup();
	const a = saveConnection({
		name: 'Local',
		service: 'custom',
		authMode: 'none',
		baseUrl: 'http://localhost:11434/v1',
		modelId: 'small',
		models: ['small'],
		protocol: 'openai-completions',
	});
	removeConnection(a.id);
	expect(publicSettings().defaultProviderId).toBeNull();
	expect(publicSettings().providers).toEqual([]);
});
it('rejects secret-bearing extra properties from the public configuration projection', () => {
	setup();
	const input = {
		name: 'Keyed',
		service: 'custom',
		authMode: 'api_key' as const,
		baseUrl: 'http://localhost:1234/v1',
		modelId: 'small',
		models: ['small'],
		protocol: 'openai-completions' as const,
		apiKey: 'form-secret',
	};
	saveConnection(input, 'form-secret');
	expect(JSON.stringify(publicSettings())).not.toContain('form-secret');
});
