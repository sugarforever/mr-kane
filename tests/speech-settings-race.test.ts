import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveSpeechSettings } from '../src/lib/server/speech/settings';
import { generateSpeech } from '../src/lib/server/speech/service';
let dir = '';
afterEach(() => {
	vi.unstubAllEnvs();
	if (dir) rmSync(dir, { recursive: true, force: true });
});
it('rejects a stale browser voice identity before generating or caching audio', async () => {
	dir = mkdtempSync(join(tmpdir(), 'speech-race-'));
	vi.stubEnv('MR_KANE_DATA_DIR', dir);
	saveSpeechSettings(
		{
			stt: { provider: 'openai', model: 'gpt-transcribe' },
			tts: { provider: 'openai', model: 'tts-1', voice: 'coral' },
		},
		{ openai: 'fixture' },
	);
	await expect(
		generateSpeech('Hola', 'es', 1, undefined, {
			provider: 'openai',
			model: 'tts-1',
			voice: 'alloy',
		}),
	).rejects.toThrow('Speech settings changed');
});
