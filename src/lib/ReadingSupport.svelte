<script lang="ts">
	import type { Language } from '$lib/languages';
	import * as Icons from '@lucide/svelte';
	import { onMount, type Snippet } from 'svelte';
	import type { ReadingUnit } from '$lib/reading-levels';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Popover from '$lib/components/ui/popover/index.js';
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
		language: Language;
		unit?: ReadingUnit;
		recording: boolean;
		children: Snippet<[Snippet<[string, number]>]>;
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

<div class="reading-controls-layout">
	<div class="reading-controls" role="group" aria-label="Reading controls">
		<div class="playback-controls">
			<Button
				class="listen-control"
				aria-busy={playback === 'loading'}
				disabled={!speechAvailable || recording || playback === 'loading'}
				aria-label={recording
					? 'Stop recording before listening'
					: playback === 'playing'
						? 'Pause reading'
						: playback === 'paused'
							? 'Resume reading'
							: audioError
								? 'Retry reading audio'
								: 'Listen to reading text'}
				onclick={() => {
					if (!speechAvailable || recording) return;
					if (playback === 'playing') player?.pause();
					else if (playback === 'paused') player?.resume();
					else if (playback === 'idle') void player?.play(text, Number(rate));
				}}
				>{#if playback === 'loading'}<Icons.LoaderCircle
						aria-hidden="true"
					/>Loading
				{:else if playback === 'playing'}<Icons.Pause aria-hidden="true" />Pause
				{:else if playback === 'paused'}<Icons.Play aria-hidden="true" />Resume
				{:else if recording}<Icons.Mic aria-hidden="true" />Recording
				{:else if audioError}<Icons.RotateCcw
						aria-hidden="true"
					/>Retry{:else}<Icons.Play aria-hidden="true" />Listen{/if}</Button
			>
			<Button
				variant="outline"
				class="stop-control"
				size="icon"
				disabled={playback === 'idle'}
				title="Stop"
				aria-label="Stop reading"
				onclick={() => player?.stop()}
				><Icons.Square aria-hidden="true" /></Button
			>
		</div>
		<div class="reading-preferences">
			<div class="speed-control" role="group" aria-label="Reading speed">
				{#each [{ value: '0.8', label: 'Slow' }, { value: '1', label: 'Normal' }] as speed}
					<button
						type="button"
						disabled={playback !== 'idle'}
						aria-pressed={rate === speed.value}
						onclick={() => (rate = speed.value)}>{speed.label}</button
					>
				{/each}
			</div>
			{#if language !== 'en'}
				<Button
					variant="ghost"
					class="english-control"
					onclick={toggleEnglish}
					aria-pressed={showEnglish}
					aria-expanded={showEnglish}
					aria-controls={comparisonId}
					title={showEnglish
						? 'Hide English translation'
						: 'Show English translation'}
				>
					English <span class="english-switch" aria-hidden="true"
						><span></span></span
					>
				</Button>
			{/if}
		</div>
		<Popover.Root>
			<Popover.Trigger
				class="audio-info"
				aria-label="Audio information"
				title="Audio information"
				><Icons.Info aria-hidden="true" size={18} /></Popover.Trigger
			>
			<Popover.Content align="end" class="max-w-[calc(100vw-2rem)]">
				<Popover.Title>Audio</Popover.Title>
				<Popover.Description>{speechDescription}</Popover.Description>
				<p class="text-sm">
					Generated audio is cached. Changing voice or speed creates a separate
					version.
				</p>
			</Popover.Content>
		</Popover.Root>
	</div>
</div>
<p class="sr-only" role="status">
	{recording
		? 'Stop recording before listening.'
		: playback === 'loading'
			? 'Preparing audio.'
			: playback === 'playing'
				? 'Playing reading text.'
				: playback === 'paused'
					? 'Playback paused.'
					: ''}
</p>
{#if !speechAvailable && speechDescription !== 'Loading speech settings…'}
	<p class="audio-unavailable" role="status">
		Audio unavailable. <a href="/?tab=providers">Speech settings</a>
	</p>
{/if}
{#snippet listen(item: string, index: number)}
	<Button
		variant="ghost"
		size="icon"
		class="inline-flex align-middle ml-1 text-muted-foreground"
		disabled={!speechAvailable || recording}
		onclick={() => {
			if (speechAvailable && !recording) void player?.play(item, Number(rate));
		}}
		aria-label={`Listen to ${unit === 'words' ? 'word or phrase' : unit === 'sentences' ? 'sentence' : 'paragraph'} ${index + 1}`}
		title="Listen"><Icons.Volume2 aria-hidden="true" /></Button
	>
{/snippet}
{#if audioError}<Alert.Root role="alert" class="my-2">{audioError}</Alert.Root
	>{/if}
<div class={showEnglish ? 'grid gap-6 md:grid-cols-2' : ''}>
	<div class="min-w-0">{@render children(listen)}</div>
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

<style>
	.reading-controls-layout {
		container-type: inline-size;
		margin: 1rem 0 1.5rem;
	}
	.reading-controls {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px;
		border: 1px solid var(--border);
		border-radius: 14px;
		background: var(--background);
	}
	.playback-controls,
	.reading-preferences {
		display: flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
	}
	.reading-preferences {
		gap: 10px;
		padding-left: 10px;
		border-left: 1px solid var(--separator);
	}
	.reading-controls :global(.listen-control) {
		min-width: 116px;
		height: 44px;
		border-radius: 10px;
	}
	.reading-controls :global(.stop-control),
	.reading-controls :global(.audio-info) {
		width: 44px;
		height: 44px;
		flex: none;
		border: 1px solid var(--border);
		border-radius: 10px;
	}
	.reading-controls :global(.audio-info) {
		display: grid;
		place-items: center;
		margin-left: auto;
		background: var(--background);
		color: var(--foreground);
		cursor: pointer;
	}
	.speed-control {
		display: flex;
		border: 1px solid var(--border);
		border-radius: 10px;
		overflow: hidden;
	}
	.speed-control button {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		min-width: 64px;
		min-height: 42px;
		padding: 0 12px;
		font-size: 14px;
		font-weight: 600;
		background: var(--background);
		color: var(--foreground);
		cursor: pointer;
	}
	.speed-control button[aria-pressed='true'] {
		background: var(--foreground);
		color: var(--background);
	}
	.speed-control button[aria-pressed='true']::before {
		content: '';
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--brand-accent);
	}
	.speed-control button:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.reading-controls :global(.english-control) {
		height: 44px;
		gap: 8px;
		padding: 0 12px;
		border: 1px solid var(--border);
		border-radius: 10px;
	}
	.english-switch {
		display: flex;
		align-items: center;
		width: 32px;
		height: 20px;
		padding: 2px;
		border: 1px solid var(--border);
		border-radius: 12px;
		background: var(--background);
	}
	.english-switch span {
		width: 14px;
		height: 14px;
		border: 1px solid var(--border);
		border-radius: 50%;
		background: var(--background);
	}
	:global(.english-control[aria-pressed='true']) .english-switch {
		background: var(--brand-accent);
	}
	:global(.english-control[aria-pressed='true']) .english-switch span {
		margin-left: auto;
		background: var(--foreground);
	}
	.reading-controls :global(button:focus-visible) {
		outline: 2px solid var(--foreground);
		outline-offset: 2px;
	}
	.speed-control button:focus-visible {
		outline: 2px solid var(--foreground);
		outline-offset: -4px;
	}
	.speed-control button[aria-pressed='true']:focus-visible {
		outline-color: var(--brand-accent);
	}
	.audio-unavailable {
		margin: -1rem 0 1rem;
		font-size: 12px;
		color: var(--muted-foreground);
	}
	.audio-unavailable a {
		text-decoration: underline;
	}
	@container (max-width: 620px) {
		.reading-controls {
			display: grid;
			grid-template-columns: minmax(0, 1fr) 44px;
			gap: 6px;
		}
		.playback-controls {
			grid-column: 1;
		}
		.reading-controls :global(.listen-control) {
			flex: 1;
			min-width: 0;
		}
		.reading-controls :global(.audio-info) {
			grid-column: 2;
			grid-row: 1;
		}
		.reading-preferences {
			grid-column: 1/-1;
			grid-row: 2;
			padding: 0;
			border: 0;
			gap: 6px;
		}
		.speed-control {
			flex: 1;
		}
		.speed-control button {
			flex: 1;
			min-width: 0;
			padding: 0 8px;
		}
		.reading-controls :global(.english-control) {
			flex: none;
		}
	}
</style>
