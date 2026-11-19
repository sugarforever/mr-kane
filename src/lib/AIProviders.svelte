<script lang="ts">
	import * as Icons from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';

	import { NativeSelect } from '$lib/components/ui/native-select/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';

	import { onMount, onDestroy } from 'svelte';
	import SearchSettings from '#lib/SearchSettings.svelte';
	import SpeechSettings from '$lib/SpeechSettings.svelte';
	import type {
		AISettings,
		CatalogEntry,
		PublicConnection,
		AuthMode,
		Protocol,
	} from '#lib/ai-types';
	import type { AuthView } from '#lib/server/provider-auth';
	let { onsettings }: { onsettings: (settings: AISettings) => void } = $props();
	let settings: AISettings = $state({ providers: [], defaultProviderId: null });
	let entries: CatalogEntry[] = $state([]);
	let busy = $state(false);
	let section = $state('models');
	let loaded = $state(false);
	let loading = $state(true);
	let loadError = $state('');
	let speechStatus = $state('Loading…');
	let searchStatus = $state('Loading…');
	let pendingRemoval = $state('');
	let showKey = $state(false);
	let drawer: HTMLDialogElement;
	const defaultConnection = $derived(
		settings.providers.find((p) => p.id === settings.defaultProviderId),
	);
	$effect(() => {
		if (!drawer) return;
		if (editing && !drawer.open) drawer.showModal();
		else if (!editing && drawer.open) drawer.close();
	});
	let message = $state('');
	let editing = $state(false);
	let id = $state('');
	let name = $state('');
	let service = $state('openai-codex');
	let authMode: AuthMode = $state('oauth');
	let baseUrl = $state('');
	let apiKey = $state('');
	let modelId = $state('');
	let protocol: Protocol = $state('openai-completions');
	let models: string[] = $state([]);
	let verified = $state(false);
	let auth: AuthView | null = $state(null);
	let answer = $state('');
	let polling = false;
	let timer: ReturnType<typeof setInterval> | undefined;
	let popup: Window | null = null;
	let openedUrl = '';
	let stopped = false;
	const entry = $derived(entries.find((p) => p.id === service));
	async function request(path: string, body?: unknown) {
		const response = await fetch(
			path,
			body
				? {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify(body),
					}
				: { cache: 'no-store' },
		);
		const result = await response.json();
		if (!response.ok)
			throw new Error(result.message ?? 'The request did not finish.');
		return result;
	}
	function apply(value: AISettings & { catalog?: CatalogEntry[] }) {
		settings = value;
		if (value.catalog) entries = value.catalog;
		onsettings({
			providers: value.providers,
			defaultProviderId: value.defaultProviderId,
		});
	}
	async function refresh() {
		loading = true;
		loadError = '';
		try {
			apply(await request('/api/ai/settings'));
			loaded = true;
		} catch (e) {
			loadError =
				e instanceof Error ? e.message : 'Settings could not be loaded.';
		} finally {
			loading = false;
		}
	}
	onMount(() => {
		void refresh();
		timer = setInterval(() => {
			void poll();
		}, 1500);
		const focus = () => {
			void refresh();
			void poll();
		};
		window.addEventListener('focus', focus);
		return () => window.removeEventListener('focus', focus);
	});
	onDestroy(() => {
		stopped = true;
		clearInterval(timer);
	});
	function invalidate() {
		verified = false;
		models = [];
		modelId = '';
		message = '';
	}
	function setService(value: string) {
		message = '';
		service = value;
		const p = entries.find((x) => x.id === value);
		authMode = p?.oauth ? 'oauth' : 'api_key';
		baseUrl = p?.baseUrl ?? 'http://localhost:11434/v1';
		apiKey = '';
		auth = null;
		protocol = 'openai-completions';
		models = p?.models.map((m) => m.id) ?? [];
		modelId = models[0] ?? '';
		verified = authMode === 'oauth';
		if (!id) name = p?.name ?? 'Local model';
	}
	function edit(p?: PublicConnection) {
		editing = true;
		showKey = false;
		message = '';
		auth = null;
		answer = '';
		openedUrl = '';
		id = p?.id ?? '';
		if (p) {
			name = p.name;
			service = p.service;
			authMode = p.authMode;
			baseUrl = p.baseUrl;
			modelId = p.modelId;
			models = p.models;
			verified = true;
			apiKey = '';
			protocol = p.protocol;
		} else setService('openai-codex');
	}
	const fields = () => ({
		...(id ? { id } : {}),
		name,
		service,
		authMode,
		baseUrl,
		apiKey,
		modelId,
		protocol,
	});
	async function discover() {
		busy = true;
		message = '';
		try {
			const result = await request('/api/ai/discover', fields());
			models = result.models;
			modelId = models.includes(modelId) ? modelId : models[0];
			verified = true;
			message = 'Connection verified. Choose a model, then save.';
		} catch (e) {
			verified = false;
			models = [];
			modelId = '';
			message =
				e instanceof Error ? e.message : 'Could not verify this connection.';
		} finally {
			busy = false;
		}
	}
	async function save() {
		if (!verified) {
			message = 'Test this connection before saving.';
			return false;
		}
		busy = true;
		try {
			const result = await request('/api/ai/settings', {
				action: 'save',
				connection: fields(),
			});
			id = result.connectionId;
			apiKey = '';
			apply(result);
			message =
				authMode === 'oauth'
					? 'Connection saved. Sign in to connect your account.'
					: 'Connection saved.';
			return true;
		} catch (e) {
			message =
				e instanceof Error ? e.message : 'Could not save this connection.';
			return false;
		} finally {
			busy = false;
		}
	}
	async function select(p: PublicConnection) {
		busy = true;
		try {
			apply(
				await request('/api/ai/settings', {
					action: 'select',
					id: p.id,
					modelId: p.modelId,
				}),
			);
			message = 'Default model updated. This applies to new requests.';
		} catch (e) {
			message =
				e instanceof Error ? e.message : 'Could not change the default.';
		} finally {
			busy = false;
		}
	}
	async function remove(p: PublicConnection) {
		busy = true;
		try {
			apply(await request('/api/ai/settings', { action: 'remove', id: p.id }));
			if (id === p.id) {
				editing = false;
				id = '';
				auth = null;
			}
			message = 'Connection removed. Existing learning records are kept.';
		} catch (e) {
			message =
				e instanceof Error ? e.message : 'Could not remove this connection.';
		} finally {
			busy = false;
		}
	}
	async function login(method: 'browser' | 'device_code' = 'browser') {
		popup?.close();
		popup =
			method === 'browser'
				? window.open(
						'about:blank',
						'mr-kane-sign-in',
						'popup,width=520,height=720',
					)
				: null;
		openedUrl = '';
		if (!(await save())) {
			popup?.close();
			return;
		}
		busy = true;
		try {
			const result = await request('/api/ai/auth', {
				action: 'start',
				id,
				method,
			});
			auth = result.flow;
			message =
				'Complete sign-in on the official provider page. This app never asks for your account password.';
			await poll();
		} catch (e) {
			popup?.close();
			message = e instanceof Error ? e.message : 'Could not start sign-in.';
		} finally {
			busy = false;
		}
	}
	async function poll() {
		if (stopped || polling || !id || authMode !== 'oauth') return;
		polling = true;
		const currentId = id;
		try {
			const result = await request(
				`/api/ai/auth?id=${encodeURIComponent(currentId)}`,
			);
			if (stopped || id !== currentId) return;
			auth = result.flow;
			settings.providers = settings.providers.map((p) =>
				p.id === currentId ? result.connection : p,
			);
			onsettings({
				providers: settings.providers,
				defaultProviderId: settings.defaultProviderId,
			});
			const event = auth?.events.findLast((e) => e.type === 'auth_url');
			if (
				event?.type === 'auth_url' &&
				popup &&
				!popup.closed &&
				event.url !== openedUrl
			) {
				const url = new URL(event.url);
				if (url.protocol === 'https:') {
					popup.location.href = url.href;
					openedUrl = event.url;
				}
			}
			if (auth?.status === 'connected') {
				popup?.close();
				message =
					'Account connected. Your credentials are saved on this server.';
			}
		} catch {
			/* Preserve current login state during a transient network failure. */
		} finally {
			polling = false;
		}
	}
	async function authAction(
		action: 'answer' | 'cancel' | 'disconnect',
		value = answer,
	) {
		busy = true;
		try {
			const result = await request('/api/ai/auth', {
				action,
				id,
				flowId: auth?.id,
				promptId: auth?.prompt?.id,
				value,
			});
			auth = result.flow;
			answer = '';
			if (action !== 'answer') {
				popup?.close();
				await refresh();
				message =
					action === 'disconnect'
						? 'Account disconnected.'
						: 'Sign-in cancelled.';
			}
		} catch (e) {
			message =
				e instanceof Error
					? e.message
					: 'The login step could not be completed.';
		} finally {
			busy = false;
		}
	}
</script>

<div class="settings-workspace">
	<header class="settings-heading">
		<div class="eyebrow">YOUR WORKSPACE</div>
		<h1>Settings</h1>
		<p>
			Choose what powers your explanations, voice and search. Each part is set
			up and saved on its own.
		</p>
	</header>
	<div class="settings-layout">
		<nav class="settings-nav" aria-label="Settings sections">
			{#each [{ id: 'models', label: 'AI models', icon: Icons.Sparkles, status: loading ? 'Loading…' : loadError ? 'Unavailable' : defaultConnection?.connected ? 'Ready · ' + defaultConnection.name : 'Choose a model' }, { id: 'speech', label: 'Speech & voices', icon: Icons.Volume2, status: speechStatus }, { id: 'search', label: 'Web search', icon: Icons.Globe, status: searchStatus }] as item}
				<button
					type="button"
					class:active={section === item.id}
					aria-current={section === item.id ? 'page' : undefined}
					aria-controls={'settings-' + item.id}
					onclick={() => (section = item.id)}
				>
					<span class="settings-nav-icon"><item.icon size={21} /></span>
					<span><strong>{item.label}</strong><small>{item.status}</small></span>
				</button>
			{/each}
			<p class="settings-nav-note">
				Your text model, speech and search connect independently. Change one
				without changing the others.
			</p>
		</nav>
		<div class="settings-content">
			<div id="settings-models" hidden={section !== 'models'}>
				<div class="settings-section-heading">
					<div>
						<h2>AI models</h2>
						<p>
							Connect your favourite models, then choose one for new practice.
						</p>
					</div>
					<Button
						class="primary"
						onclick={() => edit()}
						disabled={busy || !loaded}
						><Icons.Plus aria-hidden="true" />Add provider</Button
					>
				</div>
				{#if loading && !loaded}<p role="status" class="settings-loading">
						Loading your connections…
					</p>{/if}
				{#if loadError}<div class="settings-load-error" role="alert">
						<p>{loadError}</p>
						<Button variant="outline" onclick={refresh} disabled={loading}
							>Retry loading connections</Button
						>
					</div>{/if}
				{#if defaultConnection}
					<div class="settings-default">
						<Icons.Star size={20} aria-hidden="true" />
						<div>
							<Label for="settings-default-model">Default model</Label>
							<NativeSelect
								id="settings-default-model"
								value={JSON.stringify([
									defaultConnection.id,
									defaultConnection.modelId,
								])}
								disabled={busy}
								onchange={(event) => {
									const [providerId, selectedModel] = JSON.parse(
										event.currentTarget.value,
									);
									const provider = settings.providers.find(
										(p) => p.id === providerId,
									);
									if (provider)
										void select({ ...provider, modelId: selectedModel });
								}}
							>
								{#each settings.providers.filter((p) => p.connected || p.id === defaultConnection.id) as provider}
									<optgroup label={provider.name}>
										{#each Array.from(new Set( [provider.modelId, ...provider.models] )) as model}
											<option value={JSON.stringify([provider.id, model])}
												>{model}</option
											>
										{/each}
									</optgroup>
								{/each}
							</NativeSelect>
							<small>{defaultConnection.name} · Used for new requests</small>
						</div>
						<Badge class="chip"
							>{defaultConnection.connected
								? 'Ready'
								: 'Sign-in required'}</Badge
						>
					</div>
				{/if}
				{#if loaded}<h3 class="settings-list-heading">
						Connected providers <span>{settings.providers.length}</span>
					</h3>{/if}
				{#if message}<Alert.Root class="notice" role="status"
						>{message}</Alert.Root
					>{/if}
				<div class="provider-layout">
					<section class="provider-list" aria-label="Connected providers">
						{#if loaded}
							{#each settings.providers as p}<Card.Root
									class="panel provider-card"
									data-selected={id === p.id && editing}
								>
									<div class="spread">
										<div>
											<span class="provider-symbol"
												>{p.service === 'openai-codex'
													? '◈'
													: p.service === 'custom'
														? '⌘'
														: '✳'}</span
											><strong>{p.name}</strong>
										</div>
										{#if settings.defaultProviderId === p.id}<Badge class="chip"
												>Default</Badge
											>{/if}
									</div>
									<p class="model-name">{p.modelId}</p>
									<small class:connected={p.connected}
										>{p.connected
											? p.authMode === 'oauth'
												? 'Account connected'
												: p.authMode === 'none'
													? 'No key required'
													: 'Credential saved'
											: 'Sign-in required'} · {p.service}</small
									>
									<div class="provider-actions">
										<Button
											variant="outline"
											class="secondary"
											onclick={() => edit(p)}
											disabled={busy}
											size="icon"
											title="Manage"
											aria-label={'Manage ' + p.name}
											><Icons.Settings2 aria-hidden="true" /></Button
										><Button
											variant="ghost"
											class="text-button"
											onclick={() => select(p)}
											disabled={busy ||
												!p.connected ||
												settings.defaultProviderId === p.id}
											><Icons.Check aria-hidden="true" />Use by default</Button
										><Button
											variant="destructive"
											class="text-button danger"
											onclick={() => (pendingRemoval = p.id)}
											disabled={busy}
											size="icon"
											title="Remove"
											aria-label="Remove"
											><Icons.Trash2 aria-hidden="true" /></Button
										>
									</div>
									{#if pendingRemoval === p.id}<div
											class="settings-remove-confirm"
											role="group"
											aria-label={'Remove ' + p.name + '?'}
										>
											<p>
												Remove {p.name}? Your learning records will be kept.
											</p>
											<Button
												variant="destructive"
												disabled={busy}
												onclick={async () => {
													await remove(p);
													pendingRemoval = '';
												}}>Remove provider</Button
											><Button
												variant="outline"
												disabled={busy}
												onclick={() => (pendingRemoval = '')}
												>Keep provider</Button
											>
										</div>{/if}
								</Card.Root>{:else}<Card.Root class="panel empty">
									<span class="empty-symbol">◈</span>
									<h2>Bring your favourite model</h2>
									<p>
										Connect ChatGPT with your account, or add a provider with an
										API key.
									</p>
									<Button
										variant="default"
										class="primary"
										onclick={() => edit()}
										><Icons.Plus aria-hidden="true" />Add your first provider</Button
									>
								</Card.Root>{/each}
						{/if}
						<details class="settings-details">
							<summary>How keys and data are handled</summary>
							<p>
								Keys and tokens stay on this server, outside browser storage.
								Back up the private data directory. This app is intended for
								local use. A saved credential does not verify billing or model
								access.
							</p>
						</details>
					</section>
				</div>
			</div>
			<div id="settings-speech" hidden={section !== 'speech'}>
				<SpeechSettings onstatus={(value) => (speechStatus = value)} />
			</div>
			<div id="settings-search" hidden={section !== 'search'}>
				<SearchSettings onstatus={(value) => (searchStatus = value)} />
			</div>
		</div>
	</div>
	<dialog
		bind:this={drawer}
		class="settings-drawer"
		aria-labelledby="provider-editor-title"
		onclose={() => {
			editing = false;
			apiKey = '';
			showKey = false;
		}}
		oncancel={(event) => {
			if (busy) event.preventDefault();
		}}
	>
		{#if editing}<Card.Root class="panel provider-editor">
				<div class="spread">
					<div>
						<div class="eyebrow">AI MODELS · CONNECTION</div>
						<h2 id="provider-editor-title">
							{id ? 'Manage connection' : 'Add a text model'}
						</h2>
					</div>
					<Button
						variant="ghost"
						class="text-button"
						onclick={() => (editing = false)}
						disabled={busy}
						size="icon"
						title="Close"
						aria-label="Close"><Icons.X aria-hidden="true" /></Button
					>
				</div>
				{#if message}<Alert.Root role="status">{message}</Alert.Root>{/if}
				<Label class=" block"
					>Connection name<Input
						bind:value={name}
						maxlength={80}
						disabled={busy}
					/></Label
				>
				<Label class=" block"
					>Provider<NativeSelect
						class="w-full"
						value={service}
						onchange={(e) => setService(e.currentTarget.value)}
						disabled={busy || auth?.status === 'pending'}
						><optgroup label="Subscriptions & account sign-in"
							>{#each entries.filter((p) => p.oauth) as p}<option value={p.id}
									>{p.name}{p.id === 'openai-codex'
										? ' · ChatGPT subscription'
										: ''}</option
								>{/each}</optgroup
						><optgroup label="API providers"
							>{#each entries.filter((p) => !p.oauth) as p}<option value={p.id}
									>{p.name}</option
								>{/each}</optgroup
						><option value="custom">Custom endpoint · Ollama / LM Studio</option
						></NativeSelect
					></Label
				>
				{#if service === 'custom' || (entry?.oauth && entry.apiKey)}<Label
						class=" block"
						>Authentication<NativeSelect
							class="w-full"
							value={authMode}
							onchange={(e) => {
								authMode = e.currentTarget.value as AuthMode;
								apiKey = '';
								models =
									authMode === 'oauth'
										? (entry?.models.map((m) => m.id) ?? [])
										: [];
								modelId = models[0] ?? '';
								verified = authMode === 'oauth';
								auth = null;
							}}
							disabled={busy || auth?.status === 'pending'}
							>{#if entry?.oauth}<option value="oauth"
									>Sign in with account</option
								>{/if}<option value="api_key">API key</option
							>{#if service === 'custom'}<option value="none"
									>No key · local endpoint</option
								>{/if}</NativeSelect
						></Label
					>{/if}
				{#if authMode !== 'oauth'}<Label class=" block"
						>Base URL<Input
							value={baseUrl}
							oninput={(e) => {
								baseUrl = e.currentTarget.value;
								invalidate();
							}}
							placeholder="https://api.example.com/v1"
							disabled={busy}
						/></Label
					>{#if service === 'custom'}<Label class=" block"
							>API protocol<NativeSelect
								class="w-full"
								bind:value={protocol}
								onchange={invalidate}
								disabled={busy}
								><option value="openai-completions"
									>OpenAI-compatible Chat Completions</option
								><option value="openai-responses">OpenAI Responses</option
								><option value="anthropic-messages">Anthropic Messages</option
								><option value="google-generative-ai"
									>Google Generative AI</option
								></NativeSelect
							></Label
						>{/if}{#if authMode === 'api_key'}<Label class=" block"
							>API key<Input
								type={showKey ? 'text' : 'password'}
								value={apiKey}
								oninput={(e) => {
									apiKey = e.currentTarget.value;
									invalidate();
								}}
								autocomplete="new-password"
								placeholder={id
									? 'Leave blank to keep the saved key'
									: 'Enter your provider API key'}
								disabled={busy}
							/></Label
						><button
							type="button"
							class="settings-reveal"
							aria-pressed={showKey}
							onclick={() => (showKey = !showKey)}
							>{showKey ? 'Hide key' : 'Show key'}</button
						>{/if}<Button
						variant="outline"
						class="secondary"
						onclick={discover}
						disabled={busy}
						><Icons.PlugZap aria-hidden="true" />{busy
							? 'Checking…'
							: 'Test connection & discover models'}</Button
					>{:else}<p class="fineprint">
						Sign in directly on the official provider page. Available models and
						usage limits depend on your account.
					</p>{/if}
				{#if models.length}<Label class="model-field block"
						>Model<NativeSelect
							class="w-full"
							bind:value={modelId}
							disabled={busy}
							>{#each models as model}<option value={model}>{model}</option
								>{/each}</NativeSelect
						></Label
					>{/if}
				<div class="provider-actions">
					<Button
						variant="default"
						class="primary"
						onclick={save}
						disabled={busy ||
							!name.trim() ||
							!modelId ||
							!verified ||
							auth?.status === 'pending'}
						><Icons.Save aria-hidden="true" />Save connection</Button
					>{#if authMode === 'oauth'}<Button
							variant="outline"
							class="secondary"
							onclick={() => login()}
							disabled={busy || !name.trim() || auth?.status === 'pending'}
							><Icons.LogIn aria-hidden="true" />{service === 'openai-codex'
								? 'Sign in with ChatGPT'
								: 'Connect account'}</Button
						>{/if}
				</div>
				{#if authMode === 'oauth' && id}<Card.Root class="auth-panel">
						{#if auth?.status === 'pending'}<strong
								>Waiting for account authorisation</strong
							>{#each auth.events as event}{#if event.type === 'auth_url'}<p>
										<a
											href={event.url}
											target="_blank"
											rel="noopener noreferrer"
											class="auth-link">Open official sign-in page ↗</a
										>
									</p>
									{#if event.instructions}<p>
											{event.instructions}
										</p>{/if}{:else if event.type === 'device_code'}<p>
										Your device code
									</p>
									<code class="device-code">{event.userCode}</code>
									<p>
										<a
											class="auth-link"
											href={event.verificationUri}
											target="_blank"
											rel="noopener noreferrer"
											>Authorise on the official page ↗</a
										>
									</p>{:else if event.type === 'info' || event.type === 'progress'}<p
									>
										{event.message}
									</p>{/if}{/each}
							{#if auth.prompt}<Label class=" block"
									>{auth.prompt
										.message}{#if auth.prompt.type === 'select'}<NativeSelect
											class="w-full"
											bind:value={answer}
											><option value="">Choose a method</option
											>{#each auth.prompt.options ?? [] as option}<option
													value={option.id}>{option.label}</option
												>{/each}</NativeSelect
										>{:else}<Input
											type={auth.prompt.type === 'secret' ? 'password' : 'text'}
											bind:value={answer}
											autocomplete="off"
											placeholder="Paste the requested code or redirect URL"
										/>{/if}</Label
								><Button
									variant="outline"
									class="secondary"
									onclick={() => authAction('answer')}
									disabled={busy || !answer}
									><Icons.ArrowRight aria-hidden="true" />Continue</Button
								>{/if}
							<Button
								variant="ghost"
								class="text-button"
								onclick={() => authAction('cancel')}
								disabled={busy}
								><Icons.X aria-hidden="true" />Cancel sign-in</Button
							>
						{:else if settings.providers.find((p) => p.id === id)?.connected}<p
								class="connected"
							>
								Account connected. Your sign-in is refreshed automatically.
							</p>
							<Button
								variant="destructive"
								class="text-button danger"
								onclick={() => authAction('disconnect')}
								disabled={busy}
								><Icons.Trash2 aria-hidden="true" />Disconnect account</Button
							>{:else if auth?.message}<p>{auth.message}</p>{/if}
						{#if service === 'openai-codex' && auth?.status !== 'pending'}<Collapsible.Root
							>
								<Collapsible.Trigger
									>Having trouble signing in?</Collapsible.Trigger
								><Collapsible.Content>
									<p>
										Use a device code when the browser callback cannot reach
										this server.
									</p>
									<Button
										variant="outline"
										class="secondary"
										onclick={() => login('device_code')}
										disabled={busy}
										><Icons.LogIn aria-hidden="true" />Sign in with a device
										code</Button
									>
								</Collapsible.Content></Collapsible.Root
							>{/if}
					</Card.Root>{/if}
			</Card.Root>{/if}
	</dialog>
</div>
