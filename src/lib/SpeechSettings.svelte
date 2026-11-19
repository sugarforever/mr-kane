<script lang="ts">
	import * as Icons from '@lucide/svelte';
	import { onMount } from 'svelte';
	import {
		defaultSpeechSettings,
		speechCatalog,
		type SpeechSettings,
		type PublicSpeechSettings,
		type SpeechCapability,
		type SpeechProviderId,
	} from '$lib/speech';
	import { fetchSpeechSettings } from '$lib/client/speech-service';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { NativeSelect } from '$lib/components/ui/native-select/index.js';

	import * as Alert from '$lib/components/ui/alert/index.js';
	let {
		onstatus = (_value: string) => {},
	}: { onstatus?: (value: string) => void } = $props();
	let saved = $state('');
	let loading = $state(true);
	let showKeys = $state({ openai: false, minimax: false });
	let settings = $state<SpeechSettings>(structuredClone(defaultSpeechSettings));
	let configured = $state<PublicSpeechSettings['configured']>({});
	let keys = $state({ openai: '', minimax: '' });
	let clearKeys = $state({ openai: false, minimax: false });
	let miniVoices = $state<{ id: string; label: string }[]>([]);
	let voicesLoading = $state(false);
	let voicesMessage = $state('');
	let voiceRequest = 0;
	async function loadVoices() {
		const version = ++voiceRequest;
		voicesLoading = true;
		voicesMessage = '';
		miniVoices = [];
		try {
			const enteredKey = clearKeys.minimax ? '' : keys.minimax.trim();
			const response = await fetch(
				'/api/speech/voices?region=' +
					(settings.minimaxRegion ?? 'international'),
				enteredKey
					? {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({
								key: enteredKey,
								region: settings.minimaxRegion ?? 'international',
							}),
						}
					: { cache: 'no-store' },
			);
			const value = await response.json();
			if (!response.ok)
				throw new Error(value.message || 'Could not load MiniMax voices.');
			if (version !== voiceRequest) return;
			miniVoices = value.voices;
			if (!miniVoices.length)
				voicesMessage = 'No voices were returned for this account.';
			if (
				settings.tts.provider === 'minimax' &&
				!settings.tts.voice &&
				miniVoices.length
			)
				settings.tts.voice = miniVoices[0].id;
		} catch (e) {
			if (version !== voiceRequest) return;
			voicesMessage =
				e instanceof Error ? e.message : 'Could not load MiniMax voices.';
		} finally {
			if (version === voiceRequest) voicesLoading = false;
		}
	}
	let busy = $state(false);
	let ready = $state(false);
	let message = $state('');
	function choose(capability: SpeechCapability, id: SpeechProviderId) {
		const provider = speechCatalog.find((p) => p.id === id)!;
		const model = provider[capability][0].id;
		if (capability === 'stt') settings.stt = { provider: id, model };
		else
			settings.tts = {
				provider: id,
				model,
				voice:
					id === 'minimax' ? (miniVoices[0]?.id ?? '') : provider.voices[0],
			};
	}
	function changeRegion(region: 'china' | 'international') {
		settings.minimaxRegion = region;
		keys.minimax = '';
		clearKeys.minimax = false;
		settings.tts.voice =
			settings.tts.provider === 'minimax' ? '' : settings.tts.voice;
		configured.minimax =
			!!configured[
				region === 'china' ? 'minimaxChina' : 'minimaxInternational'
			];
		void loadVoices();
	}
	async function load() {
		loading = true;
		message = '';
		try {
			const value = await fetchSpeechSettings();
			settings = value.settings;
			saved = JSON.stringify(settings);
			configured = value.configured;
			ready = true;
			void loadVoices();
		} catch (e) {
			message =
				e instanceof Error ? e.message : 'Speech settings could not load.';
		} finally {
			loading = false;
		}
	}
	onMount(() => {
		void load();
	});
	async function save() {
		busy = true;
		message = '';
		try {
			const response = await fetch('/api/speech/settings', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					settings,
					apiKeys: {
						openai: clearKeys.openai ? null : keys.openai || undefined,
						minimax: clearKeys.minimax ? null : keys.minimax || undefined,
					},
				}),
			});
			const value = await response.json();
			if (!response.ok)
				throw new Error(value.message || 'Speech settings could not save.');
			settings = value.settings;
			saved = JSON.stringify(settings);
			configured = value.configured;
			keys = { openai: '', minimax: '' };
			clearKeys = { openai: false, minimax: false };
			void loadVoices();
			message =
				'Speech settings saved. New playback and reading checks will use these choices.';
			window.dispatchEvent(new Event('mr-kane-speech-settings'));
		} catch (e) {
			message =
				e instanceof Error ? e.message : 'Speech settings could not save.';
		} finally {
			busy = false;
		}
	}
	const dirty = $derived(
		ready &&
			(JSON.stringify(settings) !== saved ||
				!!keys.openai ||
				!!keys.minimax ||
				clearKeys.openai ||
				clearKeys.minimax),
	);
	$effect(() =>
		onstatus(
			!ready
				? loading
					? 'Loading…'
					: 'Unavailable'
				: dirty
					? 'Unsaved changes'
					: !configured[settings.stt.provider] ||
						  (settings.tts.provider !== 'browser' &&
								!configured[settings.tts.provider])
						? 'Needs audio key'
						: 'Configured',
		),
	);
</script>

<div class="settings-section-heading">
	<div>
		<h2>Speech & voices</h2>
		<p>Choose how Mr. Kane listens to your reading and reads text aloud.</p>
	</div>
	<span class="settings-status"
		>{dirty ? 'Unsaved changes' : 'Independent of text AI'}</span
	>
</div>
<div class="settings-speech">
	{#if loading}<p role="status">Loading speech settings…</p>{/if}
	{#if !ready}<Button variant="outline" onclick={load} disabled={loading}
			><Icons.RefreshCw aria-hidden="true" />Reload speech settings</Button
		>{/if}
	<form
		onsubmit={(event) => {
			event.preventDefault();
			void save();
		}}
		class="settings-form"
	>
		<Label
			>MiniMax region<NativeSelect
				value={settings.minimaxRegion ?? 'international'}
				disabled={!ready || busy}
				onchange={(event) =>
					changeRegion(event.currentTarget.value as 'china' | 'international')}
				><option value="international">International · api.minimax.io</option>
				<option value="china">Mainland China · api.minimaxi.com</option>
			</NativeSelect></Label
		>
		<p class="fineprint">
			Applies to MiniMax recognition, synthesis and voices. Each region uses its
			own API key and account.
		</p>
		{#each ['stt', 'tts'] as capability}{@const kind =
				capability as SpeechCapability}{@const provider = speechCatalog.find(
				(p) => p.id === settings[kind].provider,
			)!}
			<fieldset
				disabled={!ready || busy}
				class="settings-fieldset speech-capability"
			>
				<legend class="px-2 font-semibold"
					>{kind === 'stt' ? 'Speech recognition' : 'Reading voice'}</legend
				>
				<Label
					>Provider<NativeSelect
						value={settings[kind].provider}
						onchange={(e) =>
							choose(kind, e.currentTarget.value as SpeechProviderId)}
						>{#each speechCatalog.filter((p) => p[kind].length) as item}<option
								value={item.id}>{item.label}</option
							>{/each}</NativeSelect
					></Label
				>
				<Label
					>Model<NativeSelect bind:value={settings[kind].model}
						>{#each provider[kind] as model}<option value={model.id}
								>{model.label}</option
							>{/each}</NativeSelect
					></Label
				>
				{#if kind === 'tts'}<Label
						>Voice<NativeSelect
							bind:value={settings.tts.voice}
							disabled={provider.id === 'minimax' && voicesLoading}
							>{#if provider.id === 'minimax'}
								{#if !settings.tts.voice}<option value=""
										>{voicesLoading
											? 'Loading voices…'
											: 'Choose a voice'}</option
									>{/if}
								{#if settings.tts.voice && !miniVoices.some((v) => v.id === settings.tts.voice)}<option
										value={settings.tts.voice}
										>{settings.tts.voice} · saved selection</option
									>{/if}
								{#each miniVoices as voice}<option value={voice.id}
										>{voice.label}</option
									>{/each}
							{:else}{#each provider.voices as voice}<option value={voice}
										>{provider.voiceLabels?.[voice] ?? voice}</option
									>{/each}{/if}</NativeSelect
						></Label
					>{/if}
				<p class="settings-help">{provider.note}</p>
				{#if provider.id !== 'browser' && !configured[provider.id]}
					<p class="fineprint">
						Add a {provider.label} audio API key below before using this provider.
						{#if provider.id === 'minimax'}Then refresh voices, choose a voice
							and save settings.{/if}
					</p>
				{/if}
				{#if kind === 'tts' && provider.id === 'minimax'}
					<Button
						type="button"
						variant="outline"
						disabled={voicesLoading}
						onclick={loadVoices}
						><Icons.RefreshCw aria-hidden="true" />{voicesLoading
							? 'Loading voices…'
							: 'Refresh voices'}</Button
					>
					{#if voicesMessage}<p role="status" class="fineprint">
							{voicesMessage}
						</p>{/if}
					<p class="fineprint">
						<a
							href={settings.minimaxRegion === 'china'
								? 'https://platform.minimaxi.com'
								: 'https://www.minimax.io/audio/text-to-speech'}
							target="_blank"
							rel="noreferrer">Explore MiniMax voices</a
						>. The selected voice applies to new playback in supported languages
						after saving.
					</p>
				{/if}
			</fieldset>
		{/each}
		{#each ['openai', 'minimax'] as item}{@const id = item as
				'openai' | 'minimax'}
			<div class="settings-audio-key">
				<Label
					>{id === 'openai' ? 'OpenAI' : 'MiniMax'} audio API key · {configured[
						id
					]
						? 'key available'
						: 'not configured'}<Input
						type={showKeys[id] ? 'text' : 'password'}
						autocomplete="new-password"
						bind:value={keys[id]}
						disabled={!ready || busy || clearKeys[id]}
						placeholder="Leave blank to keep the existing key"
						maxlength={8192}
					/></Label
				>
				<button
					type="button"
					class="settings-reveal"
					aria-pressed={showKeys[id]}
					onclick={() => (showKeys[id] = !showKeys[id])}
					>{showKeys[id] ? 'Hide key' : 'Show key'}</button
				>
				<Button
					type="button"
					variant="ghost"
					disabled={!ready || busy}
					onclick={() => (clearKeys[id] = !clearKeys[id])}
					><Icons.Trash2 aria-hidden="true" />{clearKeys[id]
						? 'Keep dedicated key'
						: 'Remove dedicated key on save'}</Button
				>
			</div>
		{/each}
		<details class="settings-details">
			<summary>How speech keys and data are handled</summary>
			<p>
				Keys stay on this server. Dedicated speech keys take priority, followed
				by matching saved API-provider connections, then environment variables.
				Removing a dedicated key allows those fallbacks again. A key being
				available does not verify billing or model access. Remote reading voices
				send learning text; recognition sends your recording and language to the
				selected provider. Local browser voices upload nothing.
			</p>
		</details>
		<div class="settings-savebar">
			<span
				>{dirty
					? 'You have unsaved changes'
					: ready
						? 'Speech settings are saved'
						: 'Speech settings unavailable'}</span
			>
			<div>
				<Button
					type="button"
					variant="outline"
					disabled={!dirty || busy}
					onclick={() => {
						settings = JSON.parse(saved);
						configured.minimax =
							!!configured[
								settings.minimaxRegion === 'china'
									? 'minimaxChina'
									: 'minimaxInternational'
							];
						message = '';
						keys = { openai: '', minimax: '' };
						clearKeys = { openai: false, minimax: false };
						void loadVoices();
					}}>Discard</Button
				><Button
					type="submit"
					class="primary"
					disabled={!ready || busy || !dirty}
					><Icons.Save aria-hidden="true" />{busy
						? 'Saving…'
						: 'Save speech settings'}</Button
				>
			</div>
		</div>
	</form>
	{#if message}<Alert.Root role="status">{message}</Alert.Root>{/if}
</div>
