<script lang="ts">
	import * as Icons from '@lucide/svelte';
	import { onMount, type Snippet } from 'svelte';
	import { readingItems, type ReadingUnit } from '$lib/reading-levels';
	import { Button } from '$lib/components/ui/button/index.js';
	import { NativeSelect } from '$lib/components/ui/native-select/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { parsePassageTranslation } from '$lib/reading';
	import { cachedPassage, cachePassage } from '$lib/client/passage-cache';
	import {
		createSpeechPlayback,
		type SpeechPlaybackState,
	} from '$lib/client/speech-playback';
	let {
		text,
		language,
		unit,
		recording,
		children,
	}: {
		text: string;
		language: 'ga' | 'es';
		unit?: ReadingUnit;
		recording: boolean;
		children: Snippet;
	} = $props();
	let showEnglish = $state(false);
	let paragraphs = $state<string[]>([]);
	let loading = $state(false);
	let error = $state('');
	let cacheNotice = $state('');
	let audioError = $state('');
	let speechAvailable = $state(false);
	let speechDescription = $state('Loading speech settings…');
	let playback = $state<SpeechPlaybackState>('idle');
	let rate = $state('1');
	let player: ReturnType<typeof createSpeechPlayback> | undefined;
	let controller: AbortController | undefined;
	let version = 0;
	const comparisonId = $props.id();
	onMount(() => {
		if (unit === 'words' || unit === 'sentences') rate = '0.8';
		player = createSpeechPlayback(
			language,
			(state, message) => {
				playback = state;
				audioError = message ?? '';
			},
			(info) => {
				speechAvailable = info.available;
				speechDescription = info.description;
			},
		);
		return () => {
			version++;
			controller?.abort();
			player?.dispose();
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
		><Icons.Languages aria-hidden="true" />{showEnglish
			? 'Hide English'
			: 'Show English'}</Button
	>
	<Button
		variant="outline"
		disabled={!speechAvailable || recording || playback !== 'idle'}
		onclick={() => {
			if (speechAvailable && !recording) void player?.play(text, Number(rate));
		}}
		><Icons.Volume2 aria-hidden="true" />{unit === 'words' ||
		unit === 'sentences'
			? 'Listen to all items'
			: 'Listen to passage'}</Button
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
			size="icon"
			title={playback === 'paused' ? 'Resume' : 'Pause'}
			aria-label={playback === 'paused' ? 'Resume' : 'Pause'}
			disabled={playback === 'loading'}
			onclick={() =>
				playback === 'paused' ? player?.resume() : player?.pause()}
			>{#if playback === 'paused'}<Icons.Play
					aria-hidden="true"
				/>{:else}<Icons.Pause aria-hidden="true" />{/if}</Button
		>
		<Button
			variant="outline"
			onclick={() => player?.stop()}
			size="icon"
			title="Stop"
			aria-label="Stop"><Icons.Square aria-hidden="true" /></Button
		>
	{/if}
</div>
<p class="fineprint">
	Generated audio is cached for repeat listening. Changing the voice or speed
	creates a separate version.
</p>
<p class="fineprint" role="status">
	{recording
		? 'Stop recording before listening to the passage.'
		: speechDescription}{playback === 'paused'
		? ' Playback paused.'
		: playback === 'playing'
			? ' Playing the original reading text.'
			: ''}
</p>
{#if unit === 'words' || unit === 'sentences'}
	<div class="my-4 space-y-2" aria-label="Listen and repeat one item at a time">
		<p class="fineprint">
			Listen to one item, repeat it, then move to the next. Use Slow if you need
			more time.
		</p>
		{#each readingItems(text) as item, index}<div
				class="flex flex-wrap items-center gap-3 rounded-lg border p-3"
			>
				<span lang={language} class="flex-1 whitespace-pre-wrap">{item}</span
				><Button
					variant="outline"
					disabled={!speechAvailable || recording}
					onclick={() => {
						if (speechAvailable && !recording)
							void player?.play(item, Number(rate));
					}}
					aria-label={`Listen to item ${index + 1}`}
					size="icon"
					title="Listen to item"><Icons.Volume2 aria-hidden="true" /></Button
				>
			</div>{/each}
	</div>
{/if}
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
					}}
					size="icon"
					title="Cancel translation"
					aria-label="Cancel translation"><Icons.X aria-hidden="true" /></Button
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
					><Icons.RefreshCw aria-hidden="true" />Try translation again</Button
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
