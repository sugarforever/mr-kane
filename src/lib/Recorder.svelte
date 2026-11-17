<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';

	import { Label } from '$lib/components/ui/label/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';

	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Progress } from '$lib/components/ui/progress/index.js';

	import { onMount, onDestroy } from 'svelte';
	import type { Practice } from '#lib/domain';
	import {
		saveRecording,
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
	let recordings: Recording[] = $state([]);
	let urls: Record<string, string> = $state({});
	let recording = $state(false);
	let starting = $state(false);
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
			const list = await listRecordings();
			if (disposed) return;
			Object.values(urls).forEach(URL.revokeObjectURL);
			recordings = list;
			urls = Object.fromEntries(
				list.map((r) => [r.id, URL.createObjectURL(r.blob)]),
			);
		} catch {
			message =
				'Could not open recording storage. Check your browser privacy and storage settings.';
		}
	}
	onMount(() => {
		void refresh();
	});
	onDestroy(() => {
		disposed = true;
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
			message = 'Recording saved in this browser.';
			await refresh();
		} catch {
			message =
				'Your recording could not be saved. Download a backup below, or try saving again.';
		}
	}
	async function start() {
		if (!practice || recording || starting || pending) return;
		if (
			!navigator.mediaDevices?.getUserMedia ||
			typeof MediaRecorder === 'undefined'
		) {
			message =
				'Recording is unavailable. Use localhost or HTTPS in a browser that supports audio recording.';
			return;
		}
		const snapshot = structuredClone($state.snapshot(practice));
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
			recorder.onstop = () => {
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
					return;
				}
				pending = {
					id: crypto.randomUUID(),
					practice: snapshot,
					blob,
					duration: Math.max(1, Math.round((Date.now() - started) / 1000)),
					createdAt: new Date().toISOString(),
					note: '',
				};
				pendingUrl = URL.createObjectURL(blob);
				void persist();
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
			const next = { ...r, note: value };
			await saveRecording(next);
			recordings = recordings.map((x) => (x.id === r.id ? next : x));
		} catch {
			message = 'Your listening note could not be saved. Please try again.';
		}
	}
	const time = (s: number) =>
		`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
</script>

<div class="record-controls">
	<div>
		<strong>Read it out loud</strong>
		<p>
			Audio stays in this browser. No uploads or pronunciation judgments. Up to
			5 minutes per recording.
		</p>
	</div>
	{#if recording}<Button
			variant="destructive"
			class="record active"
			onclick={stop}>■ Stop recording <span>{time(seconds)}</span></Button
		>{:else}<Button
			variant="default"
			class="record"
			onclick={start}
			disabled={!practice || starting || !!pending}
			>{starting ? 'Opening microphone…' : '● Start recording'}</Button
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
{#if pending}<Card.Root class="audio-card">
		<strong>Unsaved recording</strong><audio controls src={pendingUrl}
		></audio><Button variant="ghost" onclick={persist}>Try saving again</Button
		><a href={pendingUrl} download="mr-kane-recording">Download backup</a>
	</Card.Root>{/if}
<div class="section-heading">
	<h3>My recordings</h3>
	<span>Listen back. Try again.</span>
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
				onclick={() => remove(r.id)}>Delete recording</Button
			>
		</div>
	</Card.Root>
{:else}<div class="empty">
		No recordings yet. Pick a script, read it aloud, and listen back.
	</div>{/each}
