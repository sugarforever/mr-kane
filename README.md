# Mr. Kane

A learning companion built with SvelteKit, Pi Durable, and pi-ai. Practise Irish, Spanish, English or Japanese through writing and reading aloud, or study math through an adaptive AoPS conversation.

## Math study

Open **Math** from the main navigation, or visit `/math`. Math currently uses **The Art of Problem Solving, Volume 1: The Basics** and **Volume 2: And Beyond**. The complete study skill, 56 chapter Markdown documents, section catalog and source images are included uncompressed in `skills/aops-study/`; no Downloads folder or personal skill installation is required.

Choose a connected AI provider, then ask a question, explore the curriculum, request a study plan or use **Find my starting point**. The coach starts learning about the student's background, goals, previous topics and available time through conversation. It can propose a short diagnostic and adapt from the student's work. The **Learning plan** panel distinguishes reported knowledge from observed strengths and topics to work on. On smaller screens, open the panel using the header button. Correct its understanding at any time in chat.

Open **Learning plan** to start a domain plan (number theory, algebra, geometry, or counting/probability), continue a saved lesson, or **Organize plan and sync progress** from the existing conversation. The same actions work through chat. Each chapter is one lesson in this MVP and can span multiple visits. Plans, objectives, phase, actual answer excerpts and reports are saved under the conversation's learner record; a new conversation does not share those plans.

Three repository skills cooperate through the math agent: `aops-course-planning` creates/revises plans and reconciles history, `aops-course-teaching` guides lessons and practice, and `aops-course-assessment` evaluates evidence and writes reports. The agent loads these on demand with `course_skill`; `course_catalog` returns recommended domain routes and the existing textbook's section locators. Textbook content stays in its current files and is retrieved while teaching. No separate SQL migration or student data inside shared skill files is required.

Completed lessons require a report and independently correct routine plus explanation/transfer evidence for every objective. The server checks source excerpts against actual student messages and rejects lost saved plans; mathematical correctness and whether assistance was needed remain agent judgements. Hinted work, placement waivers and paused lessons remain distinct from completion. Historical sync preserves uncertainty instead of inferring completed lessons from topic changes. The persisted conversation holds plans and intermediate progress. Only a newly completed lesson triggers profile consolidation; hints, planning, pauses, waivers and partial assessments do not. The reply completes first so chatting can continue while the profile updates in the background. Completion jobs are saved atomically with the reply, deduplicated by plan/chapter, retried up to three times, and resumed on server startup or session access. Failed updates leave the existing profile and conversation intact and show a nonblocking status. Saved course plans therefore reflect the last successful completion checkpoint.

Each Math conversation keeps its own messages and learner profile in the private server SQLite database. Reloading or selecting a saved conversation restores that context. New conversations start with a fresh learner profile. Model context uses the native Pi conversation history with automatic compaction, plus the last saved learner checkpoint; the complete conversation remains persisted. Pending turns can be retried with their original request ID, or edited as a new request. Retried completed requests reuse their archived result instead of making another model call.

The Math runtime automatically loads the AoPS skill, curriculum and teaching guidance, plus the full chapter overview. Bounded `aops_search` and `aops_read` tools load relevant sections, pages and problems as needed. `aops_image` supplies source-page images for models whose catalog declares image support; text-only models receive source links and must ask about unclear diagrams. Chat supports Markdown, LaTeX and local source images. The agent receives the last saved learner checkpoint with each turn, rather than treating each message as a new student. Math does not load the language-coach prompt or run web research by default.

Math needs a connected model; there is no simulated tutoring mode. Conversation messages, learner records and retrieved book passages (or source images when requested with a vision model) are sent to the selected AI provider. Math follows this app's existing single-user, local-server deployment model.

`npm run test:smoke:math` builds and runs an isolated production fixture on port 4182. It verifies real Pi tool execution, completion-only background profile updates, restart recovery, replay without another model call, source-image delivery and origin protection using a synthetic local provider. It does not call a paid account and removes its temporary data directory.

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

Language request identifiers and original inputs are persisted on the server in schema-validated Pi documents (`learning.sqlite`). After a lost connection or server restart, **Resume request** reopens the same task instead of issuing duplicate work. Pi checkpoints and stored answers survive process interruption. Generation permits one bounded retry, with a 60-second model wait deadline after the bounded search step and a two-request per-process concurrency limit. A completed request is replayed without calling the model again. Recovery starts when the learner resumes; this version is not an always-running background worker. Dismissing the request notice does not cancel a request already running on the server. Terminal failures require a new request.

The host supplies `skills/language-coach/SKILL.md` as the durable teaching instruction. Use English for explanations; reading scripts, student quotations and suggested revisions use the target language. Japanese practice uses natural kana and kanji with readings in vocabulary glosses; English practice uses simpler English definitions. English study hides the redundant passage translation control. Profile preferences constrain task generation; they are not a calibrated proficiency assessment.

### Optional environment bootstrap

Existing `.env` configuration is imported once into a named connection when a new private data directory is first opened:

```dotenv
PI_PROVIDER=anthropic
PI_MODEL=claude-sonnet-4-5
PI_API_KEY=your-provider-key
```

Subsequent changes belong in AI Providers; changing `.env` does not overwrite saved settings. Choose **Demo mode** in the header to use the fixed samples. `MR_KANE_DATA_DIR` selects a dedicated private data directory (default `data/`). Use a separate directory per installation.

## What the MVP does

- Maintains separate Irish, Spanish, English and Japanese learning preferences: school stage, CEFR level, interests, vocabulary, and grammar.
- Generates writing and reading-aloud material for everyday life, science, nature, news, and exam-inspired themes, adapted to interests, level, vocabulary and grammar.
- Saves writing versions. AI feedback quotes must match the submitted text; feedback has hints and optional suggested revisions, without scores.
- Collects feedback points in Review notes, with a manual reviewed state.
- Records up to five minutes of audio per take, with playback, downloads, deletion, original-script snapshots, and listening notes.

Pasted material is optional for every scene. News always searches before generation; search is optional (enabled by default) for other scenes. Exam practice is labelled exam-inspired unless the retrieved/supplied source establishes a specific paper. Today is a learner-initiated recommendation screen, not a background push service.

Recordings are saved on the server in reading history. Optional reading checks send audio and language to the selected STT provider and compare the transcript against the reading target; this is not a pronunciation score. Microphone access requires localhost or HTTPS and a browser supporting MediaRecorder.

## Storage and privacy

Profiles, practices, writing drafts, attempts, feedback, review progress, vocabulary and pending language requests are stored in schema-validated Pi Durable documents backed by `learning.sqlite` under `MR_KANE_DATA_DIR`. The UI uses the typed `/api/learning` interface; updates target individual records rather than replacing the full notebook. Practice generation and feedback save their business results before replying, and completed requests replay the same saved result. Text backups are exported from server records. Passage translations and downloaded synthesized speech remain disposable browser caches. New reading recordings store audio bytes, original practice snapshots, reading targets, listening notes and speech feedback together in the private SQLite database (`settings.sqlite`) under `MR_KANE_DATA_DIR`. Open **Reading history** from the navigation or Reading room to replay recordings, filter by language, review details, edit notes and delete recordings. Audio is retained until explicitly deleted and does not use the expiring speech artifact store. Back up the data directory, including the SQLite WAL when the app is running, or stop the app before copying it.

### Learning record interface

`GET /api/learning` returns the schema-validated learning snapshot. Same-origin `POST /api/learning` accepts typed commands for profiles, practices, attempts, drafts, review progress, vocabulary, pending requests. Shared request/response schemas live in `src/lib/learning-records.ts`; UI callers use `src/lib/client/learning.ts`. Mutations are serialized under the backend storage lock and committed through Pi. Draft writes and notebook mutations are also ordered in the client; a failed save is reported rather than falling back to browser persistence. No new pub/sub transport or execution state machine is introduced.

Legacy browser learning records and IndexedDB recordings are ignored; no migration or import is performed. The app reads persistent learning data only from the backend. Clearing browser data removes disposable caches without affecting server records. Export text backups from My learning profile; text backup import is not implemented.

AI inputs, research evidence, responses and captured request configuration are also stored in the private server data directory for recovery. Search keys, provider credentials and OAuth refresh tokens are stored server-side in SQLite and are never returned by settings/status endpoints. SQLite credential leases serialize token rotation across runtimes. The data directory is mode 0700 and database files are 0600; secrets are not encrypted at rest. Back up this directory securely. Replacing credentials keeps retired slots for already admitted request recovery. Removing a connection does not erase the request archive or its captured credentials. Disconnect removes the current OAuth slot; revoke provider-side access in the provider account when needed.

Profile preferences, supplied material and writing submitted for AI feedback are sent to the selected provider. Recorded audio is saved on this server. Enabling a reading check sends the recording and language to the selected speech-to-text provider through the server. Transcripts and comparisons are saved with the server recording. Configure speech providers in AI Providers → Speech settings; ChatGPT subscription OAuth alone does not enable audio APIs. The application binds to loopback for development and has no multi-user authentication. Add authentication, user isolation, quotas and deployment controls before public hosting.

## Checks and production build

```sh
npm test
npm run check
npm run build
HOST=127.0.0.1 ORIGIN=http://127.0.0.1:3000 npm start
```

The Node adapter produces `build/`. Run it from the repository root so the bundled skills are available at `skills/language-coach/` and `skills/aops-study/`. Keep the entire uncompressed `skills/` directory alongside the build when packaging. `.env` is optional and is loaded by the dev/start commands; production environment variables also work.

Tests cover request limits and origin checks, input/output validation, writing history, audio persistence, connection isolation, secret redaction, model discovery, the real Pi wire path, persisted result replay, and upstream Codex device authentication/refresh with synthetic external responses.

`npm run test:smoke:recordings` builds and runs an isolated production recording fixture on port 4178. It uploads 1 MiB of synthetic audio, restarts the app, retries the upload, verifies notes and feedback, replays and seeks audio, and checks access protection and deletion. It uses no speech provider and removes only its temporary data directory.

`npm run test:smoke:ai` builds and runs an isolated local provider/application fixture on port 4173. It kills the app with SIGKILL during generation, restarts it with the same data, resumes the original request, and checks replay does not make another model call. It uses synthetic credentials and deletes only its own temporary test directory. No paid model account is used. Real account eligibility and microphone hardware still require user/device verification.

Speech recognition and synthesis use independent provider/model selections. OpenAI recognition defaults to `gpt-transcribe`; MiniMax uses `asr-1.0` with WAV conversion. `npm start` defaults `BODY_SIZE_LIMIT` to `22M` for recording uploads and audio checks (an explicit environment value takes precedence). Set `BODY_SIZE_LIMIT=22M` if launching the built Node adapter directly; the app route still enforces 20 MB. Audio is forwarded in memory and is not stored on the server by this route. Transcription API usage requires its own API access and billing.

### Speech provider extension points

`src/lib/speech.ts` defines the public capability/model/language/voice catalog and validated settings. `src/lib/server/speech/contracts.ts` defines `SpeechToTextProvider` and `TextToSpeechProvider`; implementations live in `providers.ts`, and `service.ts` resolves the saved choice and credential. Add a provider implementation and its catalog entries, then add a protocol test. Feature components use `client/speech-service.ts` for recognition and `client/speech-playback.ts` for all playback, including exclusive playback and microphone cancellation.

Dedicated keys are private server credentials, never returned by Settings APIs. Precedence is dedicated speech key, matching saved API-provider connection, environment fallback (`OPENAI_API_KEY` / `MINIMAX_API_KEY`). No automatic provider fallback occurs when a model, language or key is unavailable. Browser-local TTS remains the default. MiniMax STT/TTS support Spanish, English and Japanese ([recognition](https://platform.minimax.io/docs/api-reference/speech-to-text), [synthesis](https://platform.minimax.io/docs/api-reference/speech-t2a-http)); remote OpenAI TTS supports Spanish, English and Japanese ([supported languages](https://developers.openai.com/api/docs/guides/text-to-speech)); Irish playback requires a matching local voice. OpenAI file TTS models are compatibility options with the documented January 6, 2027 shutdown; a future Realtime adapter belongs behind the same interface, not in feature components.

### Agent speech tools

`src/lib/server/speech/tools.ts` exposes `speech_to_text` and `text_to_speech` as Pi tools over the same provider services used by the UI. Provider/model/voice selection stays in Speech settings; tools never accept API keys, URLs, or filesystem paths. Reading assessment remains a separate workflow.

- `speech_to_text({ artifactId, language })` returns `{ status, transcript, message? }`.
- `text_to_speech({ text, language, rate? })` returns `{ artifactId, mimeType, bytes, expiresAt }`. It uses the configured remote voice; local browser voices cannot create a server audio file. Text is limited to 4,000 characters per call.
- Language is `ga`, `es`, `en` or `ja`, subject to the selected provider's support. Provider calls receive the agent cancellation signal. Interrupted calls are not automatically replayed, to avoid duplicate billable requests.

Audio artifacts are private server files (20 MB maximum), scoped to an application request ID. They expire after 24 hours and are deleted on expired reads or the next artifact creation. Upload audio with `POST /api/speech/artifacts?requestId=REQUEST_ID` (binary audio body, matching Origin, audio Content-Type). Retrieve it with `GET /api/speech/artifacts/ARTIFACT_ID?requestId=REQUEST_ID`. These endpoints follow the app's existing single-user deployment model.

Server workflows opt into the tool-enabled coach with `runCoach(operation, data, outputSchema, requestId, { speechTools: true })`. Include uploaded artifact IDs in `data` using that same `requestId`. Tool-enabled requests allow up to four model turns; existing text-only workflows keep their single-turn behavior. For direct programmatic use, install `createSpeechTools(requestId)` into a Pi registry and pass the returned tool objects to the agent. Audio bytes never enter the model transcript. Tool artifacts must already use a format accepted by the selected STT model; WAV-only models reject WebM/MP4 uploads with conversion guidance.

MiniMax speech supports International (`api.minimax.io`) and Mainland China (`api.minimaxi.com`) regions in Speech settings. The selected region applies to STT, TTS and voice discovery; each region stores its own dedicated key. Existing settings and keys remain international. Mainland China environment fallback uses `MINIMAX_CN_API_KEY`; international uses `MINIMAX_API_KEY`. [MiniMax mainland API console](https://solutions.minimaxi.com/debug/speech).

### Course-related dataset exercises

The math coach has source-independent `exercise_sources`, `exercise_search`, and
`exercise_read` tools covering registered book and competition datasets, alongside the existing source-specific tools. During a lesson,
the coach proactively assigns relevant practice after explanations and worked
examples, waits for the student’s attempt, and adapts from feedback. Students
can also explicitly request practice or an independent test, or skip practice.
The coach can search by topic,
keywords or suggested AoPS prerequisite chapter, read the original statement,
and cite its source. Practice uses progressive hints; tests request an independent
attempt before feedback. Previously assigned IDs can be excluded using the current
conversation history (this is not a cross-conversation attempt database).

The registered adapters cover AoPS numbered exercises and the collected IrMO
questions. Unfiltered search interleaves sources so one large catalog does not
hide the others. To add another local dataset, implement `ExerciseSource` and
register it in `src/lib/server/math/exercise-sources.ts`; keep globally unique,
stable exercise IDs.
Adapters provide topic/chapter metadata, bounded statements and source/scan URLs.
Suggested prerequisites are candidate matches, not verified difficulty ratings.
No verified answer key or calibrated difficulty is assumed. Selection is currently
lexical with topic/chapter filtering, not semantic search. No lesson completion or
report generation is added by this feature.
