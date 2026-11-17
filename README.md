# Mr. Kane

A small, English-language learning companion built with SvelteKit, Pi Durable, and pi-ai. Practise Irish or Spanish through writing, reading aloud, and keeping a record of what you learn.

## UI components

The interface uses owned [shadcn-svelte](https://shadcn-svelte.com/) Nova components with Tailwind CSS 4 and Bits UI. Shared components live in `src/lib/components/ui`; `components.json` configures the registry and aliases. The cream and green theme is defined in `src/app.css`. Buttons, form controls, cards, badges, alerts, checkboxes, tabs, collapsibles, separators, recording progress and the practice shelf scroll area share these components. Native audio controls remain for browser playback support.

To add another component, run `npx shadcn-svelte@latest add <component>`. Vite includes the `$lib` alias and an explicit stylesheet alias for `tw-animate-css` to support the Vite 8 resolver.

## Run locally

Use Node.js 22.19 or newer (tested with Node.js 26).

```sh
npm ci
npm run dev
```

Open the Local URL printed by Vite, usually http://127.0.0.1:5173.

Without model configuration, the app clearly shows **Demo mode**. You can explore fixed A2 daily-life and science samples, write and save versions, turn your writing into a reading script, and record yourself. Demo mode does not generate personalised tasks or pretend to provide AI feedback.

## AI Providers

Open **AI Providers → Add provider**. You can save multiple named connections and choose a default connection from the header. Each connection stores its own selected model.

### ChatGPT subscription

Choose **OpenAI Codex · ChatGPT subscription**, select a model, and click **Sign in with ChatGPT**. The app saves the connection and opens the official sign-in flow. Complete account authorisation yourself. A blocked popup leaves an official sign-in link; **Having trouble signing in?** offers device-code login when the browser cannot reach the server callback. Pi's browser callback uses localhost:1455. Pending login expires after 15 minutes; completed credentials survive a server restart.

Model access and usage limits depend on your account. A ChatGPT subscription login is separate from an OpenAI API key. Other account-login choices are supplied by Pi; OAuth does not necessarily mean subscription billing.

### API keys and local models

Choose a native provider, enter its key, then **Test connection & discover models**. Choose an available model and save. Saving verifies the connection again, and failures retain the previous saved configuration. An empty key field preserves the saved key only when the provider, authentication mode and endpoint stay the same. Key-bearing requests never follow redirects.

For Ollama or LM Studio, choose **Custom endpoint**, select **No key · local endpoint**, and enter the OpenAI-compatible base URL, such as `http://localhost:11434/v1` or `http://localhost:1234/v1`. Custom endpoints can also use API keys. Advanced protocol choices include Chat Completions, Responses, Anthropic Messages and Google Generative AI.

Native models use Pi's catalog metadata and native protocols. Discovered models absent from the catalog use conservative fallback limits of 32,768 context / 4,096 output tokens; these are compatibility values, not measured server capacity. Subscription choices use the installed catalog. This MVP does not expose advanced cloud credential chains or arbitrary model-capability overrides.

### Web search

Open **AI Providers → Web search**. Exa MCP is the default and works without a key within its free rate limit. An optional Exa API key is supported. Tavily and Brave Search can be selected with their own API keys. Blank key fields keep that service's saved key. Save before testing; testing performs one real search using the saved service and its quota. Keys stay in the private server database.

Search works with every model connection, including ChatGPT subscription models. ChatGPT's built-in Search belongs to the ChatGPT application; subscription OAuth does not automatically expose that hosted tool through Pi. Mr. Kane currently uses its configured independent search service, not OpenAI's hosted Search API.

The host performs a bounded research step before calling Pi, rather than leaving source retrieval to the model's discretion. This guarantees news requests cannot silently skip search. The scene, target-language exam context, date for news, and up to 200 characters of learner interests form the query; pasted text, vocabulary targets, submissions and recordings are not sent to search. Avoid personal information in interests. Four source links, dates when available and excerpts of up to 1,800 characters each are persisted in the durable request snapshot before model generation. Practice records include these sources, retrieval date and query; reading and writing views expose the links. Replayed requests reuse their evidence. An interruption during the search itself can repeat that search; no claim of exactly-once external calls is made.

Search failures stop generation when research is requested. News cannot fall back to model memory. Excerpts are untrusted data; the teaching skill asks for supported, paraphrased facts and age-appropriate topics. Search results are not fact-checked or guaranteed suitable: this MVP still needs teacher review before classroom use. Source cards show the research context, not sentence-level verification.

Published service allowances checked on 2026-11-16: [Exa MCP](https://exa.ai/docs/get-started/exa-mcp) has free rate-limited search/fetch without a key; [Tavily](https://www.tavily.com/pricing) offers 1,000 API credits/month without a card; [Brave](https://api-dashboard.search.brave.com/documentation/resources/help-feedback) offers $5 monthly credit and requires a card. [Serper](https://serper.dev/) advertises 2,500 signup queries without a card; it is not integrated. [SearXNG](https://github.com/searxng/searxng) is self-hostable free software, with hosting/operation costs; it is not integrated. Quotas and terms can change.

### Durable coaching requests

Each coaching request runs in a Pi Durable SQLite session with the teaching skill, selected connection and model captured at admission. Switching the default or editing a connection affects new requests. There are no coding tools, shell tools, ambient skills or ambient credentials in the learner runtime.

Request identifiers are persisted in the browser. After a lost connection or server restart, **Resume request** reopens the same task instead of issuing duplicate work. Pi checkpoints and stored answers survive process interruption. Generation permits one bounded retry, with a 60-second model wait deadline after the bounded search step and a two-request per-process concurrency limit. A completed request is replayed without calling the model again. Recovery starts when the learner resumes; this version is not an always-running background worker. Dismissing the browser notice does not cancel a request already running on the server. Terminal failures require a new request.

The host supplies `skills/language-coach/SKILL.md` as the durable teaching instruction. Use English for explanations; reading scripts, student quotations and suggested revisions use the target language. Profile preferences constrain task generation; they are not a calibrated proficiency assessment.

### Optional environment bootstrap

Existing `.env` configuration is imported once into a named connection when a new private data directory is first opened:

```dotenv
PI_PROVIDER=anthropic
PI_MODEL=claude-sonnet-4-5
PI_API_KEY=your-provider-key
```

Subsequent changes belong in AI Providers; changing `.env` does not overwrite saved settings. Choose **Demo mode** in the header to use the fixed samples. `MR_KANE_DATA_DIR` selects a dedicated private data directory (default `data/`). Use a separate directory per installation.

## What the MVP does

- Maintains separate Irish and Spanish learning preferences: school stage, CEFR level, interests, vocabulary, and grammar.
- Generates writing and reading-aloud material for everyday life, science, nature, news, and exam-inspired themes, adapted to interests, level, vocabulary and grammar.
- Saves writing versions. AI feedback quotes must match the submitted text; feedback has hints and optional suggested revisions, without scores.
- Collects feedback points in Review notes, with a manual reviewed state.
- Records up to five minutes of audio per take, with playback, downloads, deletion, original-script snapshots, and listening notes.

Pasted material is optional for every scene. News always searches before generation; search is optional (enabled by default) for other scenes. Exam practice is labelled exam-inspired unless the retrieved/supplied source establishes a specific paper. Today is a learner-initiated recommendation screen, not a background push service.

Recordings are saved locally. Optional reading checks send audio and language to the selected STT provider and compare the transcript against the reading target; this is not a pronunciation score. Microphone access requires localhost or HTTPS and a browser supporting MediaRecorder.

## Storage and privacy

Drafts, learning records and text backups use localStorage; audio blobs and original-script snapshots use IndexedDB. They stay in the current browser without cross-device sync. Clearing site data removes them. Export text backups from My learning profile, and download audio individually from the Reading room. Backup import is not implemented yet.

AI inputs, research evidence, responses and captured request configuration are also stored in the private server data directory for recovery. Search keys, provider credentials and OAuth refresh tokens are stored server-side in SQLite and are never returned by settings/status endpoints. SQLite credential leases serialize token rotation across runtimes. The data directory is mode 0700 and database files are 0600; secrets are not encrypted at rest. Back up this directory securely. Replacing credentials keeps retired slots for already admitted request recovery. Removing a connection does not erase the request archive or its captured credentials. Disconnect removes the current OAuth slot; revoke provider-side access in the provider account when needed.

Profile preferences, supplied material and writing submitted for AI feedback are sent to the selected provider. Audio stays local unless the learner enables a reading check; that sends the recording and language to the selected speech-to-text provider through the server. Transcripts and comparisons are saved with the local recording. Configure speech providers in AI Providers → Speech settings; ChatGPT subscription OAuth alone does not enable audio APIs. The application binds to loopback for development and has no multi-user authentication. Add authentication, user isolation, quotas and deployment controls before public hosting.

## Checks and production build

```sh
npm test
npm run check
npm run build
HOST=127.0.0.1 ORIGIN=http://127.0.0.1:3000 npm start
```

The Node adapter produces `build/`. Run it from the repository root so the bundled skill is available at `skills/language-coach/SKILL.md`. Keep that directory alongside the build when packaging. `.env` is optional and is loaded by the dev/start commands; production environment variables also work.

Tests cover request limits and origin checks, input/output validation, writing history, audio persistence, connection isolation, secret redaction, model discovery, the real Pi wire path, persisted result replay, and upstream Codex device authentication/refresh with synthetic external responses.

`npm run test:smoke:ai` builds and runs an isolated local provider/application fixture on port 4173. It kills the app with SIGKILL during generation, restarts it with the same data, resumes the original request, and checks replay does not make another model call. It uses synthetic credentials and deletes only its own temporary test directory. No paid model account is used. Real account eligibility and microphone hardware still require user/device verification.

Speech recognition and synthesis use independent provider/model selections. OpenAI recognition defaults to `gpt-transcribe`; MiniMax uses `asr-1.0` with WAV conversion. Set `BODY_SIZE_LIMIT=21M` when running the production Node adapter to allow audio requests above its default body limit; the app route still enforces 20 MB. Audio is forwarded in memory and is not stored on the server by this route. Transcription API usage requires its own API access and billing.


### Speech provider extension points

`src/lib/speech.ts` defines the public capability/model/language/voice catalog and validated settings. `src/lib/server/speech/contracts.ts` defines `SpeechToTextProvider` and `TextToSpeechProvider`; implementations live in `providers.ts`, and `service.ts` resolves the saved choice and credential. Add a provider implementation and its catalog entries, then add a protocol test. Feature components use `client/speech-service.ts` for recognition and `client/speech-playback.ts` for all playback, including exclusive playback and microphone cancellation.

Dedicated keys are private server credentials, never returned by Settings APIs. Precedence is dedicated speech key, matching saved API-provider connection, environment fallback (`OPENAI_API_KEY` / `MINIMAX_API_KEY`). No automatic provider fallback occurs when a model, language or key is unavailable. Browser-local TTS remains the default. MiniMax STT/TTS and remote OpenAI TTS are available for Spanish; Irish playback requires a matching local voice. OpenAI file TTS models are compatibility options with the documented January 6, 2027 shutdown; a future Realtime adapter belongs behind the same interface, not in feature components.

### Agent speech tools

`src/lib/server/speech/tools.ts` exposes `speech_to_text` and `text_to_speech` as Pi tools over the same provider services used by the UI. Provider/model/voice selection stays in Speech settings; tools never accept API keys, URLs, or filesystem paths. Reading assessment remains a separate workflow.

- `speech_to_text({ artifactId, language })` returns `{ status, transcript, message? }`.
- `text_to_speech({ text, language, rate? })` returns `{ artifactId, mimeType, bytes, expiresAt }`. It uses the configured remote voice; local browser voices cannot create a server audio file. Text is limited to 4,000 characters per call.
- Language is `ga` or `es`, subject to the selected provider's support. Provider calls receive the agent cancellation signal. Interrupted calls are not automatically replayed, to avoid duplicate billable requests.

Audio artifacts are private server files (20 MB maximum), scoped to an application request ID. They expire after 24 hours and are deleted on expired reads or the next artifact creation. Upload audio with `POST /api/speech/artifacts?requestId=REQUEST_ID` (binary audio body, matching Origin, audio Content-Type). Retrieve it with `GET /api/speech/artifacts/ARTIFACT_ID?requestId=REQUEST_ID`. These endpoints follow the app's existing single-user deployment model.

Server workflows opt into the tool-enabled coach with `runCoach(operation, data, outputSchema, requestId, { speechTools: true })`. Include uploaded artifact IDs in `data` using that same `requestId`. Tool-enabled requests allow up to four model turns; existing text-only workflows keep their single-turn behavior. For direct programmatic use, install `createSpeechTools(requestId)` into a Pi registry and pass the returned tool objects to the agent. Audio bytes never enter the model transcript. Tool artifacts must already use a format accepted by the selected STT model; WAV-only models reject WebM/MP4 uploads with conversion guidance.
