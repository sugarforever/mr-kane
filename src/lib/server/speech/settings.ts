import { z } from 'zod';
import { database, connections, readCredential } from '../providers-store';
import { transcriptionKey } from '../transcription';
import {
	speechCatalog,
	defaultSpeechSettings,
	speechSettingsSchema,
	type SpeechSettings,
	type PublicSpeechSettings,
} from '$lib/speech';
export function readSpeechSettings(): SpeechSettings {
	const db = database();
	try {
		const row = db
			.prepare("SELECT value FROM metadata WHERE key='speech-settings'")
			.get() as { value: string } | undefined;
		return row
			? speechSettingsSchema.parse(JSON.parse(row.value))
			: structuredClone(defaultSpeechSettings);
	} finally {
		db.close();
	}
}
export function speechKey(provider: 'openai' | 'minimax') {
	const saved = readCredential(`speech:${provider}`);
	if (saved?.type === 'api_key' && saved.key) return saved.key;
	if (provider === 'openai') return transcriptionKey();
	const connection = connections().find(
		(p) =>
			p.service === 'minimax' &&
			p.authMode === 'api_key' &&
			p.baseUrl.replace(/\/$/, '') === 'https://api.minimax.io/v1',
	);
	const key = connection && readCredential(connection.credentialSlot);
	if (key?.type === 'api_key' && key.key) return key.key;
	return process.env.MINIMAX_API_KEY?.trim() || undefined;
}
export function saveSpeechSettings(value: unknown, apiKeys: unknown = {}) {
	const settings = speechSettingsSchema.parse(value);
	const keys = z
		.object({
			openai: z.string().trim().max(8192).nullable().optional(),
			minimax: z.string().trim().max(8192).nullable().optional(),
		})
		.strict()
		.parse(apiKeys);
	const db = database();
	try {
		db.exec('BEGIN IMMEDIATE');
		db.prepare(
			"INSERT OR REPLACE INTO metadata VALUES ('speech-settings',?)",
		).run(JSON.stringify(settings));
		for (const provider of ['openai', 'minimax'] as const) {
			const key = keys[provider];
			if (key === null)
				db.prepare('DELETE FROM credentials WHERE slot=?').run(
					`speech:${provider}`,
				);
			else if (key)
				db.prepare('INSERT OR REPLACE INTO credentials VALUES (?,?)').run(
					`speech:${provider}`,
					JSON.stringify({ type: 'api_key', key }),
				);
		}
		db.exec('COMMIT');
	} catch (error) {
		db.exec('ROLLBACK');
		throw error;
	} finally {
		db.close();
	}
}
export function publicSpeechSettings(): PublicSpeechSettings {
	return {
		settings: readSpeechSettings(),
		catalog: speechCatalog,
		configured: {
			browser: true,
			openai: !!speechKey('openai'),
			minimax: !!speechKey('minimax'),
		},
	};
}
