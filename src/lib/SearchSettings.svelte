<script lang="ts">
	import * as Icons from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';

	import { NativeSelect } from '$lib/components/ui/native-select/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Card from '$lib/components/ui/card/index.js';

	import { onMount } from 'svelte';
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
	onMount(() => {
		call()
			.then((value) => {
				provider = value.provider;
			})
			.catch(() => {
				message = 'Search settings could not be loaded.';
			});
	});
	async function save() {
		busy = true;
		message = '';
		try {
			await call({ provider, apiKey });
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
</script>

<Card.Root class="panel" style="margin-top:24px;padding:24px">
	<Card.Header class="px-0 pt-0"
		><div class="eyebrow">REAL SOURCES FOR NEW IDEAS</div>
		<Card.Title>Web search</Card.Title>
		<Card.Description>
			Works with every connected model, including ChatGPT subscription models.
			Search runs before material generation; sources are saved with the
			practice.
		</Card.Description></Card.Header
	>
	<Label class=" block"
		>Search service<NativeSelect class="w-full" bind:value={provider}
			><option value="exa">Exa MCP · free limited access without a key</option
			><option value="tavily">Tavily · API key required</option><option
				value="brave">Brave Search · API key required</option
			></NativeSelect
		></Label
	>
	<Label class=" block"
		>{provider === 'exa' ? 'Optional Exa API key' : 'Search API key'}<Input
			type="password"
			bind:value={apiKey}
			autocomplete="off"
			placeholder="Leave blank to keep the saved key"
		/></Label
	>
	<p class="fineprint">
		Exa works without a key at a free rate limit. Tavily offers 1,000 free
		credits/month. Brave offers $5 monthly credit and requires a card. Provider
		limits can change. Save changes before testing.
	</p>
	<Button variant="default" class="primary" onclick={save} disabled={busy}
		><Icons.Save aria-hidden="true" />Save search settings</Button
	>
	<Button variant="outline" class="secondary" onclick={test} disabled={busy}
		><Icons.Save aria-hidden="true" />Test saved connection</Button
	>
	{#if message}<p role="status">{message}</p>{/if}
	<p class="fineprint">
		ChatGPT's built-in Search belongs to the ChatGPT app. Signing in with a
		subscription does not automatically expose that tool here. Mr. Kane uses the
		search service selected above. Search receives your scene and interests;
		recordings and writing are not sent to it. Avoid personal details in
		interests.
	</p>
</Card.Root>
