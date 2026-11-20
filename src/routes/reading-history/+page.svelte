<script lang="ts">
	import { languages, languageNames } from '$lib/languages';
	import * as Icons from '@lucide/svelte';
	import { onMount, onDestroy, untrack } from 'svelte';
	import ReadingFeedback from '$lib/ReadingFeedback.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { NativeSelect } from '$lib/components/ui/native-select/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import type { RecordingDetails } from '$lib/recording-details';
	import {
		listRecordingDetails,
		recordingAudioUrl,
		recordingBlob,
		patchRecording,
		deleteRecording,
	} from '$lib/client/recordings';
	import { transcribeSpeech } from '$lib/client/speech-service';
	let recordings: RecordingDetails[] = $state([]);
	let language = $state('all');
	let selectedId = $state('');
	let loading = $state(true);
	let busy = $state(false);
	let checking = $state(false);
	let message = $state('');
	let note = $state('');
	let deleteReady = $state(false);
	let controller: AbortController | undefined;
	let disposed = false;
	const visible = $derived(
		recordings.filter(
			(r) => language === 'all' || r.practice.profile.language === language,
		),
	);
	const selected = $derived(visible.find((r) => r.id === selectedId));
	const selectionKey = $derived(selected?.id ?? '');
	$effect(() => {
		void selectionKey;
		untrack(() => {
			note = selected?.note ?? '';
			deleteReady = false;
		});
	});
	const time = (s: number) =>
		`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
	async function refresh() {
		loading = true;
		try {
			const list = await listRecordingDetails();
			if (!disposed) recordings = list;
		} catch (e) {
			if (!disposed)
				message =
					e instanceof Error ? e.message : 'Could not load reading history.';
		} finally {
			if (!disposed) loading = false;
		}
	}
	onMount(() => {
		void refresh();
	});
	onDestroy(() => {
		disposed = true;
		controller?.abort();
	});
	async function saveNote(item: RecordingDetails) {
		busy = true;
		message = '';
		try {
			const updated = await patchRecording(item.id, { note });
			if (!updated)
				throw new Error('This recording was deleted. Reload history.');
			recordings = recordings.map((r) => (r.id === updated.id ? updated : r));
			message = 'Listening note saved.';
		} catch (e) {
			message = e instanceof Error ? e.message : 'Note could not be saved.';
		} finally {
			busy = false;
		}
	}
	async function remove(item: RecordingDetails) {
		busy = true;
		try {
			await deleteRecording(item.id);
			recordings = recordings.filter((r) => r.id !== item.id);
			selectedId = '';
			message = 'Recording and audio deleted from server history.';
		} catch (e) {
			message = e instanceof Error ? e.message : 'Could not delete recording.';
		} finally {
			busy = false;
		}
	}
	async function check(item: RecordingDetails) {
		busy = true;
		checking = true;
		controller = new AbortController();
		message = 'Transcribing your recording…';
		try {
			const blob = await recordingBlob(item.id);
			const speechCheck = await transcribeSpeech(
				blob,
				item.practice.profile.language,
				controller.signal,
			);
			if (disposed) return;
			const updated = await patchRecording(item.id, { speechCheck });
			if (!updated)
				throw new Error('This recording was deleted. Feedback was not saved.');
			recordings = recordings.map((r) => (r.id === updated.id ? updated : r));
			message = 'Reading feedback saved.';
		} catch (e) {
			if (!disposed)
				message = controller.signal.aborted
					? 'Reading check cancelled. Your recording is kept.'
					: e instanceof Error
						? e.message
						: 'Reading check failed. Your recording is kept.';
		} finally {
			if (!disposed) {
				busy = false;
				checking = false;
			}
		}
	}
</script>

<svelte:head
	><title>Reading history · Mr. Kane</title><meta
		name="robots"
		content="noindex"
	/></svelte:head
>
<main class="mx-auto max-w-6xl space-y-6 p-6 md:p-10">
	<a href="/" class="underline">← Back to practice</a>
	<header class="space-y-2">
		<h1 class="text-3xl font-semibold">Reading history</h1>
		<p>
			Listen again, review your script and feedback, and plan your next
			practice.
		</p>
		<p class="text-sm text-muted-foreground">
			Recordings and practice details are stored on this server until you delete
			them.
		</p>
	</header>
	<div class="flex flex-wrap gap-4">
		<Label
			>Language<NativeSelect bind:value={language} disabled={busy}
				><option value="all">All languages</option
				>{#each languages as entry}<option value={entry.value}
						>{languageNames[entry.value]}</option
					>{/each}</NativeSelect
			></Label
		>
		<Button
			variant="outline"
			onclick={refresh}
			disabled={busy || loading}
			size="icon"
			title="Reload history"
			aria-label="Reload history"><Icons.RefreshCw aria-hidden="true" /></Button
		>
	</div>
	{#if message}<p role="status">{message}</p>{/if}
	{#if checking}<Button
			variant="outline"
			onclick={() => controller?.abort()}
			size="icon"
			title="Cancel reading check"
			aria-label="Cancel reading check"><Icons.X aria-hidden="true" /></Button
		>{/if}
	<div class="grid gap-6 md:grid-cols-[minmax(16rem,1fr)_minmax(0,2fr)]">
		<section aria-label="Past reading practices" class="space-y-3">
			{#if loading}<p role="status">Loading history…</p>{/if}
			{#each visible as item (item.id)}
				<button
					class="w-full rounded-lg border p-4 text-left hover:bg-muted disabled:opacity-60"
					class:bg-muted={selectedId === item.id}
					aria-pressed={selectedId === item.id}
					onclick={() => {
						selectedId = item.id;
						message = '';
					}}
					disabled={busy}
				>
					<strong class="block">{item.practice.title}</strong><span
						class="text-sm"
						>{new Date(item.createdAt).toLocaleString('en-IE')} · {time(
							item.duration,
						)} · {languageNames[item.practice.profile.language]}</span
					><span class="block text-sm text-muted-foreground"
						>{item.speechCheck
							? 'Reading feedback saved'
							: 'Recording saved'}{item.note ? ' · Listening note' : ''}</span
					>
				</button>
			{:else}{#if !loading}<p class="rounded-lg border p-6">
						No recordings here yet. <a href="/" class="underline"
							>Choose a script and record a practice.</a
						>
					</p>{/if}{/each}
		</section>
		<section aria-label="Recording details">
			{#if selected}{@const item = selected}
				<Card.Root class="space-y-5 p-6">
					<h2 class="text-xl font-semibold">{item.practice.title}</h2>
					<p>
						{new Date(item.createdAt).toLocaleString('en-IE')} · {time(
							item.duration,
						)} · {item.practice.profile.level}
					</p>
					{#key item.id}<audio
							class="w-full"
							controls
							preload="metadata"
							src={recordingAudioUrl(item.id)}
						></audio>{/key}
					<a
						class="underline"
						href={recordingAudioUrl(item.id)}
						download={`mr-kane-${item.id}`}>Download audio</a
					>
					<div>
						<h3 class="font-semibold">Reading target</h3>
						<p
							class="whitespace-pre-wrap"
							lang={item.practice.profile.language}
						>
							{item.targetText ?? item.practice.script}
						</p>
					</div>
					<details>
						<summary class="cursor-pointer">Original practice script</summary>
						<p
							class="mt-3 whitespace-pre-wrap"
							lang={item.practice.profile.language}
						>
							{item.practice.script}
						</p>
					</details>
					{#if item.speechCheck}<ReadingFeedback
							check={item.speechCheck}
							expected={item.targetText ?? item.practice.script}
							language={item.practice.profile.language}
						/>{/if}
					<Button variant="outline" onclick={() => check(item)} disabled={busy}
						><Icons.RefreshCw aria-hidden="true" />{item.speechCheck
							? 'Check reading again'
							: 'Check reading with speech recognition'}</Button
					>
					<p class="text-sm text-muted-foreground">
						Reading checks send audio to your selected speech provider and may
						incur usage charges. Feedback compares recognised words, not
						pronunciation quality.
					</p>
					<Label
						>Listening note<Input
							bind:value={note}
							maxlength={1000}
							disabled={busy}
							placeholder="What would you like to practise next?"
						/></Label
					>
					<Button
						onclick={() => saveNote(item)}
						disabled={busy || note === item.note}
						><Icons.Save aria-hidden="true" />Save note</Button
					>
					<div class="border-t pt-4">
						{#if deleteReady}<p class="mb-3">
								Delete this recording, its audio and saved feedback from the
								server?
							</p>
							<Button
								variant="destructive"
								disabled={busy}
								onclick={() => remove(item)}
								><Icons.Trash2 aria-hidden="true" />Confirm delete</Button
							>
							<Button
								variant="outline"
								disabled={busy}
								onclick={() => (deleteReady = false)}
								><Icons.Check aria-hidden="true" />Keep recording</Button
							>{:else}<Button
								variant="destructive"
								disabled={busy}
								onclick={() => (deleteReady = true)}
								size="icon"
								title="Delete recording"
								aria-label="Delete recording"
								><Icons.Trash2 aria-hidden="true" /></Button
							>{/if}
					</div>
				</Card.Root>
			{:else}<p class="rounded-lg border p-6 text-muted-foreground">
					Select a past practice to replay your recording and review its
					details.
				</p>{/if}
		</section>
	</div>
</main>
