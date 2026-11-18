<script lang="ts">
	import * as Icons from '@lucide/svelte';
	import ReadingFeedback from '$lib/ReadingFeedback.svelte';
	import { transcribeSpeech } from '$lib/client/speech-service';
	import { readingItems } from '$lib/reading-levels';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { NativeSelect } from '$lib/components/ui/native-select/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';

	import { Label } from '$lib/components/ui/label/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';

	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Progress } from '$lib/components/ui/progress/index.js';

	import { onDestroy } from 'svelte';
	import type { Practice } from '#lib/domain';
	import {
		saveRecording,
		patchRecording,
		listRecordings,
		deleteRecording,
		type Recording,
	} from '#lib/client/recordings';
	let {
		practice,
		language,
		onbusy = () => {},
	}: {
		practice: Practice | null;
		language: 'ga' | 'es';
		onbusy?: (busy: boolean) => void;
	} = $props();
	let autoCheck = $state(true);
	let targetIndex = $state('all');
	let checkingId = $state('');
	let checkController: AbortController | undefined;
	let checkMessage = $state('');
	const targetItems = $derived(
		practice &&
			(practice.readingUnit === 'words' || practice.readingUnit === 'sentences')
			? readingItems(practice.script)
			: [],
	);
	$effect(() => {
		const id = practice?.id;
		void id;
		targetIndex = 'all';
	});
	async function checkReading(item: Recording) {
		if (checkingId || recording || starting) return;
		checkingId = item.id;
		checkMessage = 'Transcribing your recording with speech recognition…';
		checkController = new AbortController();
		try {
			const speechCheck = await transcribeSpeech(
				item.blob,
				item.practice.profile.language,
				checkController.signal,
			);
			const next = { ...item, speechCheck };
			if (disposed) return;
			const updated = await patchRecording(item.id, {
				speechCheck: next.speechCheck,
			});
			if (disposed) return;
			if (!updated) {
				checkMessage = 'The recording was removed. No feedback was saved.';
				return;
			}
			await refresh();
			checkMessage = 'Reading feedback saved with your recording.';
		} catch (e) {
			if (!disposed && checkController.signal.aborted)
				checkMessage = 'Reading check cancelled. Your recording is kept.';
			if (!disposed && !checkController.signal.aborted)
				checkMessage =
					e instanceof Error
						? e.message
						: 'Speech recognition failed. Your recording is kept.';
		} finally {
			if (!disposed) checkingId = '';
		}
	}
	let recordings: Recording[] = $state([]);
	let urls: Record<string, string> = $state({});
	let recording = $state(false);
	let starting = $state(false);
	let saving = $state(false);
	let seconds = $state(0);
	let message = $state('');
	let pending: Recording | null = $state(null);
	let pendingUrl = $state('');
	let recorder: MediaRecorder | undefined;
	let stream: MediaStream | undefined;
	let timer: ReturnType<typeof setInterval> | undefined;
	let started = 0;
	let disposed = false;
	async function refresh() {
		try {
			const selectedLanguage = language;
			const list = await listRecordings(selectedLanguage);
			if (disposed || language !== selectedLanguage) return;
			Object.values(urls).forEach(URL.revokeObjectURL);
			recordings = list;
			urls = Object.fromEntries(
				list.map((r) => [r.id, URL.createObjectURL(r.blob)]),
			);
		} catch {
			message = 'Could not load recordings from the server. Please try again.';
		}
	}
	$effect(() => {
		void language;
		void refresh();
	});
	onDestroy(() => {
		disposed = true;
		checkController?.abort();
		clearInterval(timer);
		if (recorder?.state === 'recording') recorder.stop();
		stream?.getTracks().forEach((t) => t.stop());
		Object.values(urls).forEach(URL.revokeObjectURL);
		if (pendingUrl) URL.revokeObjectURL(pendingUrl);
	});
	async function persist() {
		if (!pending) return;
		try {
			await saveRecording(pending);
			pending = null;
			if (pendingUrl) URL.revokeObjectURL(pendingUrl);
			pendingUrl = '';
			message = 'Recording saved to reading history on this server.';
			await refresh();
		} catch {
			message =
				'Your recording could not be saved. Download a backup below, or try saving again.';
		}
	}
	async function start() {
		if (!practice || recording || starting || pending || checkingId || saving)
			return;
		if (
			!navigator.mediaDevices?.getUserMedia ||
			typeof MediaRecorder === 'undefined'
		) {
			message =
				'Recording is unavailable. Use localhost or HTTPS in a browser that supports audio recording.';
			return;
		}
		const snapshot = structuredClone($state.snapshot(practice));
		const targetText =
			targetIndex === 'all'
				? snapshot.script
				: (readingItems(snapshot.script)[Number(targetIndex)] ??
					snapshot.script);
		const shouldCheck = autoCheck;
		window.dispatchEvent(new Event('mr-kane-recording-start'));
		window.speechSynthesis?.cancel();
		starting = true;
		message = '';
		onbusy(true);
		try {
			stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			if (disposed) {
				stream.getTracks().forEach((t) => t.stop());
				return;
			}
			const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(
				(m) => MediaRecorder.isTypeSupported(m),
			);
			recorder = new MediaRecorder(
				stream,
				mime ? { mimeType: mime } : undefined,
			);
			const chunks: BlobPart[] = [];
			recorder.ondataavailable = (e) => {
				if (e.data.size) chunks.push(e.data);
			};
			recorder.onerror = () => {
				message =
					'Recording was interrupted. Check your microphone and try again.';
				if (recorder?.state === 'recording') recorder.stop();
			};
			recorder.onstop = async () => {
				saving = true;
				clearInterval(timer);
				stream?.getTracks().forEach((t) => t.stop());
				recording = false;
				onbusy(false);
				if (disposed) return;
				const blob = new Blob(chunks, {
					type: recorder?.mimeType || 'audio/webm',
				});
				if (!blob.size) {
					message = 'No audio was captured. Please try again.';
					saving = false;
					return;
				}
				pending = {
					id: crypto.randomUUID(),
					practice: snapshot,
					blob,
					duration: Math.max(1, Math.round((Date.now() - started) / 1000)),
					createdAt: new Date().toISOString(),
					note: '',
					targetText,
				};
				pendingUrl = URL.createObjectURL(blob);
				const captured = pending;
				await persist();
				saving = false;
				if (shouldCheck && !pending && !disposed) await checkReading(captured);
			};
			recorder.start();
			started = Date.now();
			seconds = 0;
			recording = true;
			timer = setInterval(() => {
				seconds = Math.floor((Date.now() - started) / 1000);
				if (seconds >= 300) stop();
			}, 250);
		} catch {
			stream?.getTracks().forEach((t) => t.stop());
			onbusy(false);
			message =
				'Could not open the microphone. Check your device and microphone permission, then try again.';
		} finally {
			starting = false;
		}
	}
	function stop() {
		if (recorder?.state === 'recording') recorder.stop();
	}
	async function remove(id: string) {
		try {
			await deleteRecording(id);
			await refresh();
			message = 'Recording deleted.';
		} catch {
			message = 'Could not delete the recording. Please try again.';
		}
	}
	async function note(r: Recording, value: string) {
		try {
			const next = await patchRecording(r.id, { note: value });
			if (next)
				recordings = recordings.map((x) =>
					x.id === r.id ? { ...next, blob: x.blob } : x,
				);
		} catch {
			message = 'Your listening note could not be saved. Please try again.';
		}
	}
	const time = (s: number) =>
		`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
</script>

<div class="my-4 space-y-3">
	<Label class="flex items-center gap-2"
		><Checkbox
			checked={autoCheck}
			onCheckedChange={(value) => (autoCheck = value)}
			disabled={recording || starting || !!checkingId}
		/>Get reading feedback with speech recognition</Label
	>
	<p class="fineprint">
		Requires a speech provider and API key in Speech settings; provider audio
		usage is billed separately from text-model subscription access. Turn this
		off to save without sending audio to a speech provider. Feedback compares
		recognised words, not pronunciation quality.
	</p>
	{#if targetItems.length}<Label
			>What will you read?<NativeSelect
				bind:value={targetIndex}
				disabled={recording || starting || !!checkingId}
				><option value="all">All items</option
				>{#each targetItems as item, index}<option value={String(index)}
						>{index + 1}. {item}</option
					>{/each}</NativeSelect
			></Label
		>{/if}
</div>
<div class="record-controls">
	<div>
		<strong>Read it out loud</strong>
		<p>
			Recordings and practice details are saved on this server. When reading
			feedback is enabled, your audio and language are sent through this server
			to the selected speech provider for transcription. Up to 5 minutes and 20
			MB per check.
		</p>
	</div>
	{#if recording}<Button
			variant="destructive"
			class="record active"
			onclick={stop}
			><Icons.Square aria-hidden="true" />Stop recording
			<span>{time(seconds)}</span></Button
		>{:else}<Button
			variant="default"
			class="record"
			onclick={start}
			disabled={!practice || starting || saving || !!pending || !!checkingId}
			><Icons.Mic aria-hidden="true" />{starting
				? 'Opening microphone…'
				: autoCheck
					? 'Record and check reading'
					: 'Start recording'}</Button
		>{/if}
</div>
{#if recording}<Progress
		value={seconds}
		max={300}
		aria-label="Recording time used"
		class="my-4"
	/>{/if}
{#if message}<Alert.Root class="notice" role="status">{message}</Alert.Root
	>{/if}
{#if checkMessage}<Alert.Root role="status" class="my-3"
		>{checkMessage}</Alert.Root
	>{/if}
{#if checkingId}<Button
		variant="outline"
		onclick={() => checkController?.abort()}
		size="icon"
		title="Cancel reading check"
		aria-label="Cancel reading check"><Icons.X aria-hidden="true" /></Button
	>{/if}
{#if pending}<Card.Root class="audio-card">
		<strong>Unsaved recording</strong><audio controls src={pendingUrl}
		></audio><Button variant="ghost" onclick={persist}
			><Icons.Save aria-hidden="true" />Try saving again</Button
		><a href={pendingUrl} download="mr-kane-recording">Download backup</a>
	</Card.Root>{/if}
<div class="section-heading">
	<h3>Recent recordings</h3>
	<Button
		variant="link"
		href="/reading-history"
		disabled={recording || starting || saving || !!pending || !!checkingId}
		><Icons.History aria-hidden="true" />View all reading history</Button
	>
</div>
{#each recordings.filter((r) => r.practice.profile.language === language) as r (r.id)}
	<Card.Root class="audio-card">
		<div class="spread">
			<strong>{r.practice.title}</strong><small
				>{new Date(r.createdAt).toLocaleString('en-IE')} · {time(
					r.duration,
				)}</small
			>
		</div>
		<audio controls src={urls[r.id]}></audio>
		{#if r.targetText && r.targetText !== r.practice.script}<p
				class="fineprint"
			>
				Reading target:
			</p>
			<p lang={r.practice.profile.language}>{r.targetText}</p>{/if}
		<Button
			variant="outline"
			disabled={!!checkingId || recording || starting}
			onclick={() => checkReading(r)}
			><Icons.RefreshCw aria-hidden="true" />{checkingId === r.id
				? 'Checking reading…'
				: r.speechCheck
					? 'Check reading again with speech recognition'
					: 'Check reading with speech recognition'}</Button
		>
		{#if r.speechCheck}<ReadingFeedback
				check={r.speechCheck}
				expected={r.targetText ?? r.practice.script}
				language={r.practice.profile.language}
			/>{/if}
		<Collapsible.Root>
			<Collapsible.Trigger>View the original script</Collapsible.Trigger
			><Collapsible.Content>
				<p lang={language === 'ga' ? 'ga' : 'es'}>{r.practice.script}</p>
			</Collapsible.Content></Collapsible.Root
		>
		<Label class=" block"
			>Listening note<Input
				value={r.note}
				maxlength={1000}
				placeholder="Which sentence would you like to try again?"
				onchange={(e) => note(r, e.currentTarget.value)}
			/></Label
		>
		<div class="spread">
			<a
				href={urls[r.id]}
				download={`mr-kane-${r.id}.${r.blob.type.includes('mp4') ? 'm4a' : 'webm'}`}
				>Download audio ↗</a
			><Button
				variant="destructive"
				class="text-button danger"
				onclick={() => remove(r.id)}
				size="icon"
				title="Delete recording"
				aria-label="Delete recording"
				><Icons.Trash2 aria-hidden="true" /></Button
			>
		</div>
	</Card.Root>
{:else}<div class="empty">
		No recordings yet. Pick a script, read it aloud, and listen back.
	</div>{/each}
