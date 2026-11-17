# Experimental recorded-reading feedback

Use OpenAI file transcription after recording (user explicitly selected OpenAI API, replacing the initial browser-recognition approach). Keep ChatGPT subscription OAuth for existing text coaching; never reuse it as an audio API credential.

1. Reuse a stored official OpenAI API key or OPENAI_API_KEY. Bound same-origin raw audio uploads to 20 MB, validate ga/es and browser recording MIME, set timeout and return safe errors. Use the currently documented gpt-transcribe endpoint and languages[] hint. Send no expected answer prompt.
2. Preserve local recording before requesting transcription. Allow automatic checking, retry/cancel, and one-word/sentence target selection. Store transcript and target with the original recording without schema migration.
3. Compare word sequences locally with bounded edit-distance alignment. Show English feedback for matching, possibly missing, substituted and extra recognised words. Empty or failed recognition does not imply bad reading; no pronunciation score.
4. Update privacy text: checking uploads audio through the server to OpenAI. Local-only recording remains available. Verify upload validation, key isolation, empty/error transcripts, word alignment, legacy audio persistence, type checks and build. Browser/microphone automation remains blocked by the earlier security policy.

Official API reference consulted: https://developers.openai.com/api/docs/guides/speech-to-text
Subscription route excludes audio input/transcription: https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations
