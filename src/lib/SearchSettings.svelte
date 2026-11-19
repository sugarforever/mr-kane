<script lang="ts">
	import * as Icons from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';

	import { Label } from '$lib/components/ui/label/index.js';

	import { onMount } from 'svelte';
	let {
		onstatus = (_value: string) => {},
	}: { onstatus?: (value: string) => void } = $props();
	let savedProvider = $state('exa');
	let loaded = $state(false);
	let loading = $state(false);
	let loadError = $state('');
	let configured = $state(false);
	let showKey = $state(false);
	let provider = $state('exa'),
		apiKey = $state(''),
		message = $state(''),
		busy = $state(false);
	async function call(body?: unknown) {
		const r = await fetch(
			'/api/ai/search',
			body
				? {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify(body),
					}
				: { cache: 'no-store' },
		);
		const value = await r.json();
		if (!r.ok) throw new Error(value.message || 'Search unavailable.');
		return value;
	}
	async function load() {
		loading = true;
		loadError = '';
		try {
			const value = await call();
			provider = savedProvider = value.provider;
			configured = value.configured;
			loaded = true;
		} catch {
			loadError = 'Search settings could not be loaded.';
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
			const value = await call({ provider, apiKey });
			savedProvider = value.provider;
			configured = value.configured;
			apiKey = '';
			message = 'Search settings saved.';
		} catch (e) {
			message = (e as Error).message;
		} finally {
			busy = false;
		}
	}
	async function test() {
		busy = true;
		message = '';
		try {
			const value = await call({ action: 'test' });
			message = `Search connected · ${value.count} sources found.`;
		} catch (e) {
			message = (e as Error).message;
		} finally {
			busy = false;
		}
	}
	const dirty = $derived(provider !== savedProvider || !!apiKey);
	$effect(() =>
		onstatus(
			!loaded
				? loadError
					? 'Unavailable'
					: 'Loading…'
				: dirty
					? 'Unsaved changes'
					: configured
						? 'Ready · ' + savedProvider
						: 'Needs API key',
		),
	);
</script>

<div class="settings-section-heading">
	<div>
		<h2>Web search</h2>
		<p>
			Find real sources for reading and writing practice, with any connected
			text model.
		</p>
	</div>
	<span class="settings-status"
		>{dirty ? 'Unsaved changes' : configured ? 'Ready' : 'Not configured'}</span
	>
</div>
{#if loading}<p role="status">Loading search settings…</p>{/if}
{#if loadError}<div class="settings-load-error" role="alert">
		<p>{loadError}</p>
		<Button variant="outline" onclick={load} disabled={loading}
			>Retry loading search settings</Button
		>
	</div>{/if}
<form
	class="settings-form"
	onsubmit={(event) => {
		event.preventDefault();
		void save();
	}}
>
	<fieldset disabled={!loaded || busy} class="settings-fieldset">
		<legend>Search provider</legend>
		<p class="settings-help">
			Choose the service that finds sources for your lessons.
		</p>
		<div class="search-provider-options">
			{#each [{ id: 'exa', name: 'Exa', note: 'Find articles and ideas by meaning.' }, { id: 'tavily', name: 'Tavily', note: 'Search with summaries for AI.' }, { id: 'brave', name: 'Brave Search', note: 'An independent web search index.' }] as item}
				<label class:selected={provider === item.id}
					><input
						type="radio"
						name="search-provider"
						value={item.id}
						bind:group={provider}
					/><span><strong>{item.name}</strong><small>{item.note}</small></span
					></label
				>
			{/each}
		</div>
		<Label
			>{provider === 'exa' ? 'Exa API key · optional' : 'Search API key'}<Input
				type={showKey ? 'text' : 'password'}
				bind:value={apiKey}
				autocomplete="new-password"
				placeholder="Leave blank to keep the saved key"
			/></Label
		>
		<button
			type="button"
			class="settings-reveal"
			aria-pressed={showKey}
			onclick={() => (showKey = !showKey)}
			>{showKey ? 'Hide key' : 'Show key'}</button
		>
		<p class="settings-help">
			Keys stay on this server. Search receives your scene and interests;
			sources are kept with your practice.
		</p>
		<Button
			type="button"
			variant="outline"
			onclick={test}
			disabled={busy || dirty}
			><Icons.PlugZap aria-hidden="true" />Test saved connection</Button
		>
		{#if dirty}<p class="settings-help">
				Save your changes before testing the connection.
			</p>{/if}
	</fieldset>
	<div class="settings-savebar">
		<span
			>{dirty
				? 'You have unsaved changes'
				: loaded
					? 'Search settings are saved'
					: 'Search settings unavailable'}</span
		>
		<div>
			<Button
				type="button"
				variant="outline"
				disabled={!dirty || busy}
				onclick={() => {
					provider = savedProvider;
					apiKey = '';
					message = '';
				}}>Discard</Button
			><Button
				type="submit"
				class="primary"
				disabled={!loaded || busy || !dirty}
				><Icons.Save aria-hidden="true" />{busy
					? 'Working…'
					: 'Save search settings'}</Button
			>
		</div>
	</div>
</form>
{#if message}<p role="status" class="notice">{message}</p>{/if}
<details class="settings-details">
	<summary>How search data is handled</summary>
	<p>
		Mr. Kane uses the search service selected here. Your recordings and writing
		are not sent to search. Avoid personal details in interests. ChatGPT
		subscription sign-in does not expose the ChatGPT app's built-in Search here.
		Exa can work without a key; other services require one. Provider limits and
		billing depend on your account.
	</p>
</details>
