import { randomUUID } from 'node:crypto';
import { createModels } from '@earendil-works/pi-ai/models';
import type { AuthEvent, AuthPrompt } from '@earendil-works/pi-ai';
import {
	dataDir,
	readConnection,
	rotateSlot,
	credentialStore,
	publicConnection,
} from './providers-store';
import { nativeProvider } from './providers-models';
type Prompt = Omit<AuthPrompt, 'signal'> & {
	id: string;
	type: AuthPrompt['type'];
	options?: readonly { id: string; label: string; description?: string }[];
};
export type AuthView = {
	id: string;
	status: 'pending' | 'connected' | 'failed' | 'cancelled';
	events: AuthEvent[];
	prompt?: Prompt;
	message?: string;
};
type Flow = {
	view: AuthView;
	controller: AbortController;
	slot: string;
	answer?: (v: string) => void;
};
const state = globalThis as typeof globalThis & {
	__kaneAuth?: Map<string, Flow>;
};
const flows = (state.__kaneAuth ??= new Map<string, Flow>());
const flowKey = (id: string) => `${dataDir()}:${id}`;
function provider(id: string) {
	const p = readConnection(id);
	if (!p || p.authMode !== 'oauth')
		throw new Error('Choose an account-login connection first.');
	return p;
}
export function authStatus(id: string) {
	const p = provider(id),
		f = flows.get(flowKey(id));
	return {
		connection: publicConnection(p),
		flow: f && f.slot === p.credentialSlot ? structuredClone(f.view) : null,
	};
}
export function cancelLogin(id: string) {
	const f = flows.get(flowKey(id));
	if (f) {
		f.controller.abort();
		f.view.status = 'cancelled';
		f.view.events = [];
		delete f.view.prompt;
		delete f.answer;
	}
}
export async function disconnect(id: string) {
	cancelLogin(id);
	const p = provider(id);
	await credentialStore(p.credentialSlot).delete(p.service);
	rotateSlot(id);
	return authStatus(id);
}
export function startLogin(
	id: string,
	method: 'browser' | 'device_code' = 'browser',
) {
	const p = provider(id);
	cancelLogin(id);
	const rotated = rotateSlot(id);
	const controller = new AbortController();
	const f: Flow = {
		controller,
		slot: rotated.credentialSlot,
		view: { id: randomUUID(), status: 'pending', events: [] },
	};
	flows.set(flowKey(id), f);
	const store = credentialStore(f.slot);
	const models = createModels({
		credentials: {
			...store,
			async modify(pid, fn, options) {
				return store.modify(
					pid,
					async (current) => {
						controller.signal.throwIfAborted();
						if (readConnection(id)?.credentialSlot !== f.slot)
							throw new Error('Connection changed.');
						return fn(current);
					},
					options,
				);
			},
		},
		authContext: {
			async env() {
				return undefined;
			},
			async fileExists() {
				return false;
			},
		},
	});
	models.setProvider(nativeProvider(p.service));
	const timer = setTimeout(() => controller.abort(), 15 * 60 * 1000);
	timer.unref();
	void models
		.login(
			p.service,
			'oauth',
			{
				signal: controller.signal,
				notify(event) {
					if (!controller.signal.aborted)
						f.view.events = [...f.view.events.slice(-19), event];
				},
				prompt(prompt) {
					if (
						p.service === 'openai-codex' &&
						prompt.type === 'select' &&
						prompt.options.some((o) => o.id === method)
					)
						return Promise.resolve(method);
					return new Promise<string>((accept, reject) => {
						const { signal, ...safe } = prompt;
						const id = randomUUID();
						f.view.prompt = { ...safe, id };
						const cleanup = () => {
							controller.signal.removeEventListener('abort', abort);
							signal?.removeEventListener('abort', abort);
							if (f.view.prompt?.id === id) {
								delete f.view.prompt;
								delete f.answer;
							}
						};
						const abort = () => {
							cleanup();
							reject(new Error('Login cancelled.'));
						};
						f.answer = (value) => {
							cleanup();
							accept(value);
						};
						controller.signal.addEventListener('abort', abort, { once: true });
						signal?.addEventListener('abort', abort, { once: true });
						if (controller.signal.aborted || signal?.aborted) abort();
					});
				},
			},
			{ agentName: 'Mr. Kane' },
		)
		.then(
			() => {
				f.view.status = 'connected';
				f.view.events = [];
			},
			() => {
				f.view.status = controller.signal.aborted ? 'cancelled' : 'failed';
				f.view.events = [];
				f.view.message = controller.signal.aborted
					? 'Login cancelled. You can start again.'
					: 'Sign-in failed. Check your account and try connecting again.';
			},
		)
		.finally(() => {
			clearTimeout(timer);
			delete f.view.prompt;
			delete f.answer;
		});
	return authStatus(id);
}
export function answerLogin(
	id: string,
	flowId: string,
	promptId: string,
	value: string,
) {
	provider(id);
	const f = flows.get(flowKey(id));
	if (
		!f ||
		f.view.id !== flowId ||
		f.view.prompt?.id !== promptId ||
		!f.answer ||
		value.length > 16384
	)
		throw new Error('This login step has expired. Refresh and try again.');
	f.answer(value);
	return authStatus(id);
}
