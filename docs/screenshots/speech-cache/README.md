# Speech cache and icon button validation

Captured on the local Vite dev server at `http://127.0.0.1:5180` using an isolated temporary server data directory, demo Spanish practice, and a synthetic silent WAV. No real learner data, credentials, microphone recording, or paid speech generation was used.

- `reading-controls.jpg`: reading toolbar with accessible resume/stop icon buttons after pausing playback.
- `selection-actions.jpg`: selected-word translation, pronunciation, and vocabulary toolbar.
- `vocabulary-actions.jpg`: reveal, review, generation, and remove actions.

Browser checks exercised per-word listening, pause, stop, selection actions, adding vocabulary, and revealing meanings. To verify persistent browser caching, the remote-provider path first downloaded a seeded server audio fixture. The server cache directory was then moved aside; after a full page reload, the same word still played successfully from browser storage. The dedicated provider key was a non-working fixture, so a repeated generation request could not have succeeded.

Automated tests separately cover generation coalescing, disk persistence, identity separation, failed-request retry, browser persistence after module reload, and rejecting a changed voice identity before generation.
