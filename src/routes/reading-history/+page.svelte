<script lang="ts">
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
		importBrowserRecordings,
	} from '$lib/client/recordings';
	import {
		listRecordings as listBrowserRecordings,
		type Recording,
	} from '$lib/client/legacy-recordings';
	import { transcribeSpeech } from '$lib/client/speech-service';
	let recordings: RecordingDetails[] = $state([]);
	let browserRecordings: Recording[] = $state([]);
	let browserUrls: Record<string, string> = $state({});
	let language = $state('all');
	let source = $state('server');
	let selectedId = $state('');
	let loading = $state(true);
	let busy = $state(false);
	let checking = $state(false);
	let message = $state('');
	let importMessage = $state('');
	let failures: { id: string; title: string; message: string }[] = $state([]);
	let note = $state('');
	let deleteReady = $state(false);
	let controller: AbortController | undefined;
	let disposed = false;
	const visible = $derived(
		(source === 'server' ? recordings : browserRecordings).filter(
			(r) => language === 'all' || r.practice.profile.language === language,
		),
	);
	const selected = $derived(visible.find((r) => r.id === selectedId));
	const selectionKey = $derived(`${source}:${selected?.id ?? ''}`);
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
		void listBrowserRecordings()
			.then((list) => {
				if (disposed) return;
				browserRecordings = list;
				browserUrls = Object.fromEntries(
					list.map((r) => [r.id, URL.createObjectURL(r.blob)]),
				);
			})
			.catch(() => {
				if (!disposed)
					importMessage =
						'Browser backups could not be opened. Check browser storage permissions and try again.';
			});
	});
	onDestroy(() => {
		disposed = true;
		controller?.abort();
		Object.values(browserUrls).forEach(URL.revokeObjectURL);
	});
	async function importOld() {
		busy = true;
		importMessage = 'Importing browser recordings…';
		failures = [];
		try {
			const result = await importBrowserRecordings();
			if (disposed) return;
			failures = result.failed;
			importMessage = `${result.saved} recording(s) saved or already imported. ${result.failed.length} could not be imported. Browser originals are kept.`;
			await refresh();
		} catch (e) {
			if (!disposed)
				importMessage =
					e instanceof Error
						? e.message
						: 'Import failed. Browser originals are kept.';
		} finally {
			if (!disposed) busy = false;
		}
	}
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
			message =
				'Recording and audio deleted from server history. Any browser backup remains.';
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
	{#if browserRecordings.length || importMessage}
		<Card.Root class="p-5 space-y-3"
			><h2 class="font-semibold">Browser recording backups</h2>
			<p>
				{browserRecordings.length} recording(s) available in this browser. Import
				them to keep them on the server. Repeating an import preserves saved server
				notes and feedback. Browser originals remain available below.
			</p>
			<Button
				variant="outline"
				onclick={importOld}
				disabled={busy || !browserRecordings.length}
				>Import browser recordings</Button
			>
			{#if importMessage}<p role="status">{importMessage}</p>{/if}
			{#each failures as failure}<p class="text-sm" role="alert">
					{failure.title}: {failure.message}
				</p>{/each}
		</Card.Root>{/if}
	<div class="flex flex-wrap gap-4">
		<Label
			>Language<NativeSelect bind:value={language} disabled={busy}
				><option value="all">All languages</option><option value="ga"
					>Irish</option
				><option value="es">Spanish</option></NativeSelect
			></Label
		>
		<Label
			>Storage<NativeSelect bind:value={source} disabled={busy}
				><option value="server">Server history</option><option value="browser"
					>Browser backups ({browserRecordings.length})</option
				></NativeSelect
			></Label
		>
		<Button variant="outline" onclick={refresh} disabled={busy || loading}
			>Reload history</Button
		>
	</div>
	{#if message}<p role="status">{message}</p>{/if}
	{#if checking}<Button variant="outline" onclick={() => controller?.abort()}
			>Cancel reading check</Button
		>{/if}
	<div class="grid gap-6 md:grid-cols-[minmax(16rem,1fr)_minmax(0,2fr)]">
		<section aria-label="Past reading practices" class="space-y-3">
			{#if loading && source === 'server'}<p role="status">
					Loading history…
				</p>{/if}
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
						)} · {item.practice.profile.language === 'ga'
							? 'Irish'
							: 'Spanish'}</span
					><span class="block text-sm text-muted-foreground"
						>{item.speechCheck
							? 'Reading feedback saved'
							: 'Recording saved'}{item.note ? ' · Listening note' : ''}</span
					>
				</button>
			{:else}{#if !loading || source === 'browser'}<p
						class="rounded-lg border p-6"
					>
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
					{#key `${source}-${item.id}`}<audio
							class="w-full"
							controls
							preload="metadata"
							src={source === 'browser'
								? browserUrls[item.id]
								: recordingAudioUrl(item.id)}
						></audio>{/key}
					<a
						class="underline"
						href={source === 'browser'
							? browserUrls[item.id]
							: recordingAudioUrl(item.id)}
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
					{#if source === 'server'}
						<Button
							variant="outline"
							onclick={() => check(item)}
							disabled={busy}
							>{item.speechCheck
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
							disabled={busy || note === item.note}>Save note</Button
						>
						<div class="border-t pt-4">
							{#if deleteReady}<p class="mb-3">
									Delete this recording, its audio and saved feedback from the
									server?
								</p>
								<Button
									variant="destructive"
									disabled={busy}
									onclick={() => remove(item)}>Confirm delete</Button
								>
								<Button
									variant="outline"
									disabled={busy}
									onclick={() => (deleteReady = false)}>Keep recording</Button
								>{:else}<Button
									variant="destructive"
									disabled={busy}
									onclick={() => (deleteReady = true)}>Delete recording</Button
								>{/if}
						</div>
					{:else}<div>
							<h3 class="font-semibold">Listening note</h3>
							<p class="whitespace-pre-wrap">{item.note || 'No note saved.'}</p>
						</div>
						<p class="text-sm">
							This browser backup is read-only. Import it to edit notes and
							feedback in server history.
						</p>{/if}
				</Card.Root>
			{:else}<p class="rounded-lg border p-6 text-muted-foreground">
					Select a past practice to replay your recording and review its
					details.
				</p>{/if}
		</section>
	</div>
</main>
