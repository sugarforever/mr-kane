# Reading history validation

Captured from the local dev server using an isolated data directory and synthetic Spanish and Irish recordings. The audio is a generated silent WAV; the saved speech feedback is a fixture. No real learner audio or provider credentials appear in these screenshots.

- `reading-history-navigation.png`: discoverable main navigation link.
- `reading-history-replay.png`: dated recording list, replay controls and reading target.
- `reading-history-filter.png`: Irish language filter and recording detail.
- `reading-history-feedback.png`: existing feedback and edited listening note after a reload.

Browser checks exercised navigation, playback, original-script disclosure, note saving, reload persistence, and language filtering. Automated tests cover server persistence, import safety, access protection and deletion. Microphone hardware and live paid speech-provider requests were not used.
