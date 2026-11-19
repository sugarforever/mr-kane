# Real-model Math validation — 19 November 2026

Validated the local Vite server with the configured **gpt-6.1-sol / OpenAI Codex** connection. These were real provider calls through the application's session/chat HTTP endpoints, with results inspected in the browser. An isolated temporary SQLite directory held copied provider settings and fictional learners; existing learner history was untouched. No credentials are included in these artifacts.

## Coverage and assessment

Nine distinct use cases, followed by six fresh geometry retests, produced **22 completed conversation turns**. Two initial timeout attempts were retried with their original request IDs; their failures remain in the transcript. Successful responses took approximately **9.8–78.1 seconds** in this run, with at most two requests in parallel. This is observed latency, not a benchmark.

| Case | Student and demand | Assessment |
| --- | --- | --- |
| novice-hints | Age 12; first hint, unfamiliar definition, feedback | Explained the runcible construction and checked a proposed step without giving away the original solution. Required previously established runcible inputs. |
| specific-full-solution | Confident proof writer; complete 2024 P2 Q6 solution | Correct exhaustive divisibility argument and positive pairs `(2,1), (3,2), (4,3), (8,6), (24,11)`. Independently checked the proof and supplemented it with enumeration through n=100000. |
| foundations-and-diagnosis | Year 9; missing division/remainder prerequisite | Concrete grouping explanation, checked quotient/remainder answers, then offered a harder question without its answer. |
| deep-study-then-practice | Age 16; build a system around symmetric identities | Connected p, q, r, power sums and cubic roots; linked retrieved AoPS material; supplied practice, caught an invalid expansion, checked corrected work, and offered transfer practice without a solution. |
| time-bounded-preparation | Fifth year; six weeks at three hours/week | Feasible 18-hour plan, diagnostic, foundations, review and stretch work. Self-reported knowledge was distinguished from demonstrated skill. |
| precise-inequality | Advanced student; full 2021 P2 Q9 proof | Preserved the source's absolute-value scope. Substitution and triangle bound establish a stronger inequality, hence the requested one. |
| ambiguous-numbering | “Paper 2 question 1”, explicitly first on that paper | Correctly selected original Q6 and gave a hint. |
| aops-only-continuity | Beginner; only AoPS V1 section 5.4 | Stayed on modular arithmetic, explained cancellation restrictions with a counterexample, and offered original practice without forcing IrMO content. |
| diagram-grounding | Age 14; inspect source and give first hint | **Initial mathematical error:** correctly described columns, then incorrectly called vertical AD a diagonal move. Retained as failure evidence. |
| diagram-recheck-1 through -5 | Five fresh repeats after guidance change | All called `irmo_read` and `irmo_image`, described the source layout correctly, used valid AE or AC moves, and withheld counts/full solutions. |
| diagram-recheck-6 | Experienced student; full enumeration and completeness | Correct coordinates, cyclic vertex lists, areas/counts and exhaustive side-vector/placement argument: 5 area-1, 4 area-2, 2 area-5 squares, total 11. |

The symmetric-identity practice answers were independently checked: 14 and 36 for the first power-sum exercise, 98 for the fourth-power exercise, and a well-posed harder reciprocal-sum exercise with answer 129/100. The model identified the missing mixed terms in the deliberately invalid cube expansion. Learner records credited demonstrated answers and retained uncertainty where a derivation had not been independently shown.

AoPS citation spot checks confirmed V1 Chapter 7 Problem 151 (printed p72), V2 Chapter 13 Example 13-4, V1 Exercise 11-14, and V2 Exercise 14-4 against the local text. This was not an exhaustive exercise-by-exercise audit of every plan reference.

## Changes prompted by failures

**Long responses:** the extensive lesson and preparation plan initially returned HTTP 502 at the 60-second overall wait. Durable traces showed successful retrieval followed by unfinished generation. Math now has a 120-second per-stream limit and a 180-second overall wait; other coaches retain their existing limits. The original request IDs recovered successfully. The resulting sessions contained exactly 8 and 2 messages respectively, with no duplicate retry messages.

A regression test exercises the actual Math turn with a local streaming fixture: a response delayed 65 seconds completes, while a stalled response remains bounded and leaves its pending turn recoverable. Fake time makes this test fast; the live lesson independently demonstrated a successful response beyond one minute.

**Diagram consistency:** IrMO coaching guidance now requires coordinates and checking displacements, equal side lengths, perpendicularity and available vertices before giving grid-square hints. The five repeated hints and one full solution passed manual mathematical review. Independently enumerating four-point subsets by their six squared distances confirmed the 11-square result. This guidance reduces the observed failure; it does not make model-generated geometry infallible.

## Verification and evidence

- `npm test`: **136 tests in 30 files passed**.
- `npm run check`: **0 errors, 0 warnings**.
- `npm run build`: passed.
- `node scripts/smoke-math.mjs`: passed AoPS/IrMO tools, browsing, profile, restart/replay, images and access checks.
- Browser inspection confirmed real replies, rendered notation, profile updates and the corrected geometry hint.

[Transcripts](transcripts.json) preserve prompts, replies, timings, initial failures and fictional learner records. [Tool traces](tool-traces.json) contain only tool names/arguments, excluding internal reasoning and credentials. Screenshots: [beginner explanation](beginner-feedback.png), [practice feedback](practice-feedback.png), [corrected geometry hint](geometry-hint.png).

This is a small qualitative evaluation on one configured model, not a statistical accuracy measurement or a verified solution bank. It found real defects, and the fixes passed the checks above. Other models, longer histories and unseen problems remain untested.
