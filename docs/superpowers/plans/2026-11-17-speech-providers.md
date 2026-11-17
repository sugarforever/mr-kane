# Speech provider interfaces

Introduce independent STT and TTS contracts, a capability/model registry and durable private settings. Preserve existing text-provider choices, audio recordings, transcript comparison and local browser pronunciation defaults.

1. Shared speech types/schema and catalog: STT OpenAI current/compatibility models, MiniMax asr-1.0; TTS browser local, OpenAI Speech API compatibility models, MiniMax 2.8 models. Enforce per-capability models, voices and ga/es support. MiniMax and remote TTS do not claim Irish support.
2. Persist independent selections and dedicated provider API keys using private settings SQLite. Reuse existing official provider API-key connections before environment fallback. Never use OAuth for audio or silently switch a selected provider. Return only configuration booleans to clients.
3. Server adapters implement transcribe/synthesize with provider-specific wire formats, fixed endpoints, timeouts, bounded responses and safe typed errors. MiniMax STT requires WAV; client decodes existing browser recordings to mono WAV where needed. APIs keep same-origin and upload bounds.
4. Speech settings UI under AI Providers: independent provider/model selectors, TTS voice, protected key entry with retain/clear semantics, clear capability disclosures. Existing selections survive reload.
5. Shared client speech service routes recorder checks and all playback (passage, item, selected text) through selected implementations. Support browser-local or generated audio, loading/cancel/pause/resume/stop, exclusive playback, microphone priority and URL cleanup. Settings changes take effect without reload.
6. Verify registry/settings persistence/key precedence and isolation, both provider wire formats, audio conversion, cancellation and integration routes. Keep previous regression tests. Run all tests/check/build and test configured OpenAI with synthetic text/audio. MiniMax mocked unless credentials are available.

Sources: OpenAI speech-to-text and text-to-speech guides; MiniMax speech-to-text and synchronous T2A HTTP API references, fetched 2026-11-17. OpenAI Speech API compatibility models have documented Jan 6 2027 sunset; catalog labels this instead of pretending the replacement Realtime model uses the same endpoint.
