# Reading history validation

Captured from the local dev server using an isolated data directory and synthetic Spanish and Irish recordings. The audio is a generated silent WAV; the saved speech feedback is a fixture. No real learner audio or provider credentials appear in these screenshots.

- `reading-history-navigation.png`: discoverable main navigation link.
- `reading-history-replay.png`: dated recording list, replay controls and reading target.
- `reading-history-filter.png`: Irish language filter and recording detail.
- `reading-history-feedback.png`: existing feedback and edited listening note after a reload.

Browser checks exercised navigation, playback, original-script disclosure, note saving, reload persistence, and language filtering. Automated tests cover server persistence, import safety, access protection and deletion. Microphone hardware and live paid speech-provider requests were not used.

## Math study

`math-study-welcome.png` shows the desktop welcome screen and study entry points. `math-study-chat.png` shows tutoring with rendered equations and the saved learner profile. `math-study-profile.png` shows the responsive learner profile in a production Math fixture using a synthetic local model and a fictional Grade 10 student. It demonstrates saved learner information and observed strengths, not an evaluation of a live model's tutoring quality.

## Irish Mathematical Olympiad module

Captured from the production build using `node scripts/smoke-math.mjs --serve`, an isolated temporary SQLite directory, a synthetic local model, and a fictional Grade 10 learner. No real learner records, credentials or paid model requests were used.

- `irmo-library.png`: year 2024, Paper 2, number-theory filters; original Q6/Q7 identities.
- `irmo-question.png`: readable source-grounded question and rendered binomial equation, with suggested AoPS foundations.
- `irmo-mobile.png`: the same question at 390 × 844, including coaching action, provenance links and prerequisite references.

Browser checks exercised combined filters, ID search, empty search/clear action, question preview, diagram loading (2013 P2 Q7), browsing with no AI connection, disabled coaching without a connection, and selected-question handoff into the chat composer. At the phone breakpoint document width and scroll width both measured 390 pixels. The screenshots show interface/integration behavior, not an evaluation of a live model's mathematical reasoning. Corpus coverage and reuse status are recorded separately in `docs/irmo/collection-audit.md`.
