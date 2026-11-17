export type AuthMode = 'api_key' | 'oauth' | 'none';
export type Protocol =
	| 'openai-completions'
	| 'openai-responses'
	| 'anthropic-messages'
	| 'google-generative-ai';
export type Connection = {
	id: string;
	name: string;
	service: string;
	authMode: AuthMode;
	baseUrl: string;
	modelId: string;
	models: string[];
	protocol: Protocol;
	credentialSlot: string;
};
export type PublicConnection = Omit<Connection, 'credentialSlot'> & {
	connected: boolean;
	expiresAt?: number;
};
export type AISettings = {
	providers: PublicConnection[];
	defaultProviderId: string | null;
};
export type CatalogEntry = {
	id: string;
	name: string;
	baseUrl: string;
	oauth: boolean;
	apiKey: boolean;
	models: { id: string; name: string }[];
};
