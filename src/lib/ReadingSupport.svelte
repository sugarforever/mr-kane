<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { NativeSelect } from '$lib/components/ui/native-select/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { matchingVoice, parsePassageTranslation } from '$lib/reading';
	import { cachedPassage, cachePassage } from '$lib/client/passage-cache';
	import {
		createPassageSpeech,
		type PlaybackState,
	} from '$lib/client/passage-speech';
	let {
		text,
		language,
		recording,
		children,
	}: {
		text: string;
		language: 'ga' | 'es';
		recording: boolean;
		children: Snippet;
	} = $props();
	let showEnglish = $state(false);
	let paragraphs = $state<string[]>([]);
	let loading = $state(false);
	let error = $state('');
	let cacheNotice = $state('');
	let audioError = $state('');
	let voice = $state<SpeechSynthesisVoice>();
	let playback = $state<PlaybackState>('idle');
	let rate = $state('1');
	let player: ReturnType<typeof createPassageSpeech> | undefined;
	let controller: AbortController | undefined;
	let version = 0;
	const comparisonId = $props.id();
	onMount(() => {
		const synth = window.speechSynthesis;
		const updateVoices = () => {
			voice =
				synth && player
					? matchingVoice(synth.getVoices(), language)
					: undefined;
		};
		if (synth && typeof SpeechSynthesisUtterance !== 'undefined')
			player = createPassageSpeech(synth, (state, message) => {
				playback = state;
				audioError = message ?? '';
			});
		updateVoices();
		synth?.addEventListener('voiceschanged', updateVoices);
		const hidden = () => {
			if (document.hidden) player?.stop();
		};
		document.addEventListener('visibilitychange', hidden);
		return () => {
			version++;
			controller?.abort();
			player?.dispose();
			synth?.removeEventListener('voiceschanged', updateVoices);
			document.removeEventListener('visibilitychange', hidden);
		};
	});
	$effect(() => {
		if (recording) player?.stop();
	});
	async function loadEnglish() {
		if (loading || paragraphs.length) return;
		cacheNotice = '';
		error = '';
		try {
			const saved = cachedPassage(localStorage, text, language);
			if (saved) {
				paragraphs = saved;
				return;
			}
		} catch {
			cacheNotice =
				'The translation cache could not be read. Your practice records have not been changed.';
		}
		controller = new AbortController();
		const signal = controller.signal;
		const requestVersion = ++version;
		loading = true;
		try {
			const response = await fetch('/api/translate-passage', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-request-id': crypto.randomUUID(),
				},
				body: JSON.stringify({ text, language }),
				signal,
			});
			const result = await response.json();
			if (!response.ok)
				throw new Error(
					result.message || 'Translation failed. Please try again.',
				);
			if (version !== requestVersion) return;
			paragraphs = parsePassageTranslation(result, text);
			try {
				cachePassage(localStorage, text, language, paragraphs);
			} catch {
				cacheNotice =
					'Translation is available for this visit, but could not be cached in this browser.';
			}
		} catch (e) {
			if (version === requestVersion && !signal.aborted)
				error =
					e instanceof Error
						? e.message
						: 'Translation failed. Please try again.';
		} finally {
			if (version === requestVersion) loading = false;
		}
	}
	function toggleEnglish() {
		showEnglish = !showEnglish;
		if (showEnglish) void loadEnglish();
		else {
			version++;
			controller?.abort();
			loading = false;
		}
	}
</script>

<div class="flex flex-wrap items-end gap-2 my-4">
	<Button
		variant="outline"
		onclick={toggleEnglish}
		aria-expanded={showEnglish}
		aria-controls={comparisonId}
		>{showEnglish ? 'Hide English' : 'Show English'}</Button
	>
	<Button
		variant="outline"
		disabled={!voice || recording || playback !== 'idle'}
		onclick={() => {
			if (voice && !recording) player?.play(text, voice, Number(rate));
		}}>Listen to passage</Button
	>
	<Label
		>Reading speed<NativeSelect
			bind:value={rate}
			disabled={playback !== 'idle'}
			aria-label="Reading speed"
			><option value="1">Normal</option><option value="0.8">Slow</option
			></NativeSelect
		></Label
	>
	{#if playback !== 'idle'}
		<Button
			variant="outline"
			onclick={() =>
				playback === 'paused' ? player?.resume() : player?.pause()}
			>{playback === 'paused' ? 'Resume' : 'Pause'}</Button
		>
		<Button variant="outline" onclick={() => player?.stop()}>Stop</Button>
	{/if}
</div>
<p class="fineprint" role="status">
	{recording
		? 'Stop recording before listening to the passage.'
		: voice
			? `Local browser voice: ${voice.name} (${voice.lang}). Device voice quality varies; this is not a teacher recording or AI-generated audio.`
			: `Reading audio unavailable: no local ${language === 'ga' ? 'Irish' : 'Spanish'} voice was found. Install a matching device voice and reload. No substitute language voice will be used.`}{playback ===
	'paused'
		? ' Playback paused.'
		: playback === 'playing'
			? ' Playing the original passage.'
			: ''}
</p>
{#if audioError}<Alert.Root role="alert" class="my-2">{audioError}</Alert.Root
	>{/if}
<div class={showEnglish ? 'grid gap-6 md:grid-cols-2' : ''}>
	<div class="min-w-0">{@render children()}</div>
	{#if showEnglish}
		<section
			id={comparisonId}
			aria-label="English translation"
			aria-busy={loading}
			class="min-w-0 rounded-lg border bg-muted/30 p-4"
		>
			<h3 class="font-semibold">English translation</h3>
			{#if loading}<p role="status" class="my-3">Translating…</p>
				<Button
					variant="outline"
					onclick={() => {
						version++;
						controller?.abort();
						loading = false;
					}}>Cancel translation</Button
				>{/if}
			{#if error}<Alert.Root role="alert" class="my-3">{error}</Alert.Root>{/if}
			{#if paragraphs.length}<div lang="en" class="space-y-4 my-3">
					{#each paragraphs as paragraph}<p
							class="whitespace-pre-wrap break-words"
						>
							{paragraph}
						</p>{/each}
				</div>
				<p class="fineprint">AI translations may contain mistakes.</p>
			{:else if !loading}<Button variant="outline" onclick={loadEnglish}
					>Try translation again</Button
				>{/if}
			<p class="fineprint mt-3">
				Opening English sends only this passage and its language to your
				configured AI model. Requests are saved privately on this server for
				recovery. Successful translations are cached in this browser.
			</p>
			{#if cacheNotice}<p role="status" class="fineprint mt-2">
					{cacheNotice}
				</p>{/if}
		</section>
	{/if}
</div>
