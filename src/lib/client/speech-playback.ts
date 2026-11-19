import { languageNames } from '$lib/languages';
import { speechAudio } from './speech-audio';
import { matchingVoice } from '$lib/reading';
import {
	speechModel,
	type SpeechLanguage,
	type PublicSpeechSettings,
} from '$lib/speech';
import { createPassageSpeech } from './passage-speech';
import { fetchSpeechSettings } from './speech-service';
export type SpeechPlaybackState = 'idle' | 'loading' | 'playing' | 'paused';
export type SpeechAvailability = { available: boolean; description: string };
// Every playback implementation participates, so selected text and passages cannot overlap.
const players = new Set<() => void>();
export function remoteSpeechSegments(text: string) {
	const result: string[] = [];
	let rest = text.trim();
	while (rest.length > 3500) {
		const space = rest.lastIndexOf(' ', 3500);
		const end = space > 0 ? space : 3500;
		result.push(rest.slice(0, end));
		rest = rest.slice(end).trim();
	}
	if (rest) result.push(rest);
	return result;
}
export function createSpeechPlayback(
	language: SpeechLanguage,
	changed: (state: SpeechPlaybackState, error?: string) => void,
	availability: (value: SpeechAvailability) => void,
) {
	let settings: PublicSpeechSettings | undefined;
	let request: AbortController | undefined;
	let generation = 0;
	let disposed = false;
	let audio: HTMLAudioElement | undefined;
	let url = '';
	let queue: string[] = [];
	const native =
		window.speechSynthesis && typeof SpeechSynthesisUtterance !== 'undefined'
			? createPassageSpeech(window.speechSynthesis, changed)
			: undefined;
	function releaseAudio() {
		if (audio) {
			audio.onended = null;
			audio.onerror = null;
			audio.pause();
			audio.removeAttribute('src');
			audio.load();
		}
		audio = undefined;
		if (url) URL.revokeObjectURL(url);
		url = '';
	}
	function stop() {
		generation++;
		request?.abort();
		request = undefined;
		queue = [];
		releaseAudio();
		native?.stop();
		changed('idle');
	}
	function describe() {
		if (!settings) return;
		const choice = settings.settings.tts;
		if (choice.provider === 'browser') {
			const voice =
				native && matchingVoice(window.speechSynthesis.getVoices(), language);
			availability({
				available: !!voice,
				description: voice
					? `Local browser voice: ${voice.name} (${voice.lang}). No text is uploaded.`
					: `No matching local ${languageNames[language]} voice is available. Choose a compatible voice provider in Speech settings.`,
			});
		} else {
			const supported = speechModel(
				'tts',
				choice.provider,
				choice.model,
			).languages.includes(language);
			availability({
				available: supported && !!settings.configured[choice.provider],
				description: !supported
					? 'This speech model does not list Irish support. Choose a matching local device voice in Speech settings.'
					: !settings.configured[choice.provider]
						? `Add a ${choice.provider} API key in Speech settings.`
						: `AI-generated speech · ${choice.provider} / ${choice.model} / ${choice.voice}. Text is sent to this provider; voice quality varies.`,
			});
		}
	}
	async function refresh() {
		try {
			const value = await fetchSpeechSettings();
			if (disposed) return;
			settings = value;
			describe();
		} catch (e) {
			if (!disposed)
				availability({
					available: false,
					description:
						e instanceof Error ? e.message : 'Speech settings unavailable.',
				});
		}
	}
	async function playNext(
		rate: number,
		version: number,
		choice: PublicSpeechSettings['settings']['tts'],
	) {
		const segment = queue.shift();
		if (!segment || disposed || version !== generation) {
			if (version === generation) changed('idle');
			return;
		}
		request = new AbortController();
		changed('loading');
		try {
			const blob = await speechAudio({
				text: segment,
				language,
				rate,
				minimaxRegion: settings?.settings.minimaxRegion,
				...choice,
			});
			if (disposed || version !== generation) return;
			releaseAudio();
			url = URL.createObjectURL(blob);
			audio = new Audio(url);
			audio.onended = () => {
				if (version !== generation) return;
				releaseAudio();
				void playNext(rate, version, choice);
			};
			audio.onerror = () => {
				if (version !== generation) return;
				stop();
				changed('idle', 'Generated audio could not play. Please retry.');
			};
			await audio.play();
			if (version === generation) changed('playing');
		} catch (e) {
			if (version === generation && !disposed) {
				const cancelled = request?.signal.aborted;
				stop();
				if (!cancelled)
					changed(
						'idle',
						e instanceof Error
							? e.message
							: 'Speech could not play. Please retry.',
					);
			}
		}
	}
	async function play(text: string, rate = 1) {
		for (const other of players) other();
		stop();
		const version = generation;
		changed('loading');
		try {
			const latest = await fetchSpeechSettings();
			if (disposed || version !== generation) return;
			settings = latest;
			describe();
			const choice = latest.settings.tts;
			if (choice.provider === 'browser') {
				const voice =
					native && matchingVoice(window.speechSynthesis.getVoices(), language);
				if (!voice || !native)
					throw new Error('No matching local language voice is available.');
				native.play(text, voice, rate);
			} else {
				if (
					!speechModel('tts', choice.provider, choice.model).languages.includes(
						language,
					)
				)
					throw new Error(
						'The selected speech provider does not support Irish in this app.',
					);
				queue = remoteSpeechSegments(text);
				await playNext(rate, version, choice);
			}
		} catch (e) {
			if (!disposed && version === generation) {
				stop();
				changed(
					'idle',
					e instanceof Error ? e.message : 'Speech could not play.',
				);
			}
		}
	}
	const settingsChanged = () => {
		stop();
		void refresh();
	};
	const hidden = () => {
		if (document.hidden) stop();
	};
	players.add(stop);
	window.addEventListener('mr-kane-recording-start', stop);
	window.addEventListener('mr-kane-speech-settings', settingsChanged);
	window.speechSynthesis?.addEventListener('voiceschanged', describe);
	document.addEventListener('visibilitychange', hidden);
	void refresh();
	return {
		play,
		stop,
		pause() {
			if (audio) {
				audio.pause();
				changed('paused');
			} else native?.pause();
		},
		resume() {
			if (audio) {
				const currentAudio = audio;
				const version = generation;
				const current = () =>
					!disposed && generation === version && audio === currentAudio;
				void currentAudio
					.play()
					.then(() => {
						if (current()) changed('playing');
					})
					.catch(() => {
						if (!current()) return;
						stop();
						changed('idle', 'Playback could not resume.');
					});
			} else native?.resume();
		},
		dispose() {
			disposed = true;
			stop();
			native?.dispose();
			players.delete(stop);
			window.removeEventListener('mr-kane-recording-start', stop);
			window.removeEventListener('mr-kane-speech-settings', settingsChanged);
			window.speechSynthesis?.removeEventListener('voiceschanged', describe);
			document.removeEventListener('visibilitychange', hidden);
		},
	};
}
