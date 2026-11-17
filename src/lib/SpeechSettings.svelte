<script lang="ts">
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
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	let settings = $state<SpeechSettings>(structuredClone(defaultSpeechSettings));
	let configured = $state<PublicSpeechSettings['configured']>({});
	let keys = $state({ openai: '', minimax: '' });
	let clearKeys = $state({ openai: false, minimax: false });
	let busy = $state(false);
	let ready = $state(false);
	let message = $state('');
	function choose(capability: SpeechCapability, id: SpeechProviderId) {
		const provider = speechCatalog.find((p) => p.id === id)!;
		const model = provider[capability][0].id;
		if (capability === 'stt') settings.stt = { provider: id, model };
		else settings.tts = { provider: id, model, voice: provider.voices[0] };
	}
	async function load() {
		try {
			const value = await fetchSpeechSettings();
			settings = value.settings;
			configured = value.configured;
			ready = true;
		} catch (e) {
			message =
				e instanceof Error ? e.message : 'Speech settings could not load.';
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
			configured = value.configured;
			keys = { openai: '', minimax: '' };
			clearKeys = { openai: false, minimax: false };
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
</script>

<Card.Root class="panel my-6">
	<h2>Speech settings</h2>
	<p>
		Choose speech recognition and reading voices independently from your text AI
		model.
	</p>
	{#if !ready}<Button variant="outline" onclick={load}
			>Reload speech settings</Button
		>{/if}
	<form
		onsubmit={(event) => {
			event.preventDefault();
			void save();
		}}
		class="space-y-4 my-4"
	>
		{#each ['stt', 'tts'] as capability}{@const kind =
				capability as SpeechCapability}{@const provider = speechCatalog.find(
				(p) => p.id === settings[kind].provider,
			)!}
			<fieldset
				disabled={!ready || busy}
				class="rounded-lg border p-4 space-y-3"
			>
				<legend class="px-2 font-semibold"
					>{kind === 'stt'
						? 'Speech to text · reading feedback'
						: 'Text to speech · reading aloud'}</legend
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
						>Voice<NativeSelect bind:value={settings.tts.voice}
							>{#each provider.voices as voice}<option value={voice}
									>{provider.voiceLabels?.[voice] ?? voice}</option
								>{/each}</NativeSelect
						></Label
					>{/if}
				<p class="fineprint">{provider.note}</p>
				{#if provider.id !== 'browser' && !configured[provider.id]}
					<p class="fineprint">
						Add a {provider.label} audio API key below before using this provider.
					</p>
				{/if}
				{#if kind === 'tts' && provider.id === 'minimax'}
					<p class="fineprint">
						<a
							href="https://www.minimax.io/audio/text-to-speech"
							target="_blank"
							rel="noreferrer">Explore MiniMax voices</a
						>. The selected voice applies to new Spanish playback after saving.
					</p>
				{/if}
			</fieldset>
		{/each}
		{#each ['openai', 'minimax'] as item}{@const id = item as
				'openai' | 'minimax'}
			<div class="space-y-2">
				<Label
					>{id === 'openai' ? 'OpenAI' : 'MiniMax'} audio API key · {configured[
						id
					]
						? 'key available'
						: 'not configured'}<Input
						type="password"
						autocomplete="new-password"
						bind:value={keys[id]}
						disabled={!ready || busy || clearKeys[id]}
						placeholder="Leave blank to keep the existing key"
						maxlength={8192}
					/></Label
				>
				<Button
					type="button"
					variant="ghost"
					disabled={!ready || busy}
					onclick={() => (clearKeys[id] = !clearKeys[id])}
					>{clearKeys[id]
						? 'Keep dedicated key'
						: 'Remove dedicated key on save'}</Button
				>
			</div>
		{/each}
		<p class="fineprint">
			Keys stay on this server. Dedicated speech keys take priority, followed by
			matching saved API-provider connections, then environment variables.
			Removing a dedicated key allows those fallbacks again. A key being
			available does not verify billing or model access. Remote TTS sends
			learning text; STT sends your recording and language to the selected
			provider. Local browser TTS uploads nothing.
		</p>
		<Button type="submit" disabled={!ready || busy}
			>{busy ? 'Saving…' : 'Save speech settings'}</Button
		>
	</form>
	{#if message}<Alert.Root role="status">{message}</Alert.Root>{/if}
</Card.Root>
