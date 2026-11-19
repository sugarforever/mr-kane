# IrMO collection audit — 19 November 2026

This is maintainer documentation. It is deliberately outside the tutor-facing skill and is not loaded into the coaching prompt.

## Identity and naming

The module concerns the **Irish Mathematical Olympiad (IrMO)** national final. Round 2 contains two papers; it does not mean Paper 2. It is not the International Mathematical Olympiad, British Mathematical Olympiad, Junior IrMO, PRISM, school Round 1, enrichment-centre entry tests, or later squad team-selection tests.

Evidence checked:

- [IrMO organiser homepage](https://www.irmo.ie/): identifies the national final, enrichment centres and subsequent squad/selection tests. It says Round 1 is not a prerequisite for final participation. Its next-final notice lists 23 January 2027. Do not turn old papers into current entry rules.
- [Irish Mathematical Trust competition page](https://www.irishmathstrust.com/competitions): says the competition has run in two rounds since 2011. Its current and historical scheduling copy is mixed (September/January alongside November), so dates must come from the actual papers.
- [Organiser's 2013 IMO report](https://www.irmo.ie/IMO2013report.pdf): explicitly says school Round 1 was introduced in **November 2011**. The May 2011 final predates that. Accordingly, the module labels 2011 as `predecessor-final`; the 2012–2026 finals are `round-2`. We do not infer that a school round and final share a calendar-year label.
- [Organiser past-paper page](https://www.irmo.ie/problems.html): links to the UCD compendium, plus 2009 Paper 1/2 solutions. Its link label says “1988–2023”, but the target actually contains **1988–2026**, with an October 2026 preface. The target contents, not the stale anchor text, establish coverage.
- [Mark Dukes's UCD archive](https://maths.ucd.ie/~dukes/irmo.html): describes the compendium as all papers from 1988–2026. [Downloaded PDF](https://maths.ucd.ie/~dukes/Irish_Maths_Olympiad_Compendium.pdf), compiled by Mark Dukes, University College Dublin.

A search snippet from a [Ghent mirror index](https://cage.ugent.be/~hvernaev/olympiad.html) appeared to associate 1995–1999 “second round” papers with Ireland. Inspection of the actual headings places those rounds under **Niels Abels Contest**, not Ireland. They were excluded. The Irish entry links annual papers, not evidence of earlier school Round 2. Secondary mirrors, paywalled collections and search summaries were not used to transcribe the questions.

## Coverage and missing material

| Interval | Status | Material in module |
| --- | --- | --- |
| 1988–2010 | Predecessor national finals, available in UCD compendium | Original PDF retained for provenance and official archive linked; not indexed/transcribed as Round 2 |
| 2011 | May final before first school Round 1 in November | 2 predecessor practice papers, 10 questions |
| 2012–2026 | National finals following introduction of school Round 1 | 30 Round 2 papers, 150 questions; both papers every year |
| 2027 | Future final at collection date | No questions collected; no invented paper |

There are **no missing final years in 2012–2026 in this source**. This establishes coverage of the collected national-final interval, not every historical local trial, school contest or unpublished variant. We do not claim globally complete historical Round 2 coverage beyond this evidence. No answer key is claimed. The compendium's selected hints and its index are not imported into tutor answers.

The machine-readable `manifest.json` records all 32 paper identities, dates, PDF/printed page numbers, original question numbers, source hash and file hashes. `skills/irmo-study/references/catalog.json` maps 160 stable question IDs to their reviewed Markdown and scans. Original numbering is Q1–5 for Paper 1 and Q6–10 for Paper 2. Questions are never silently renumbered 1–5 on the second paper.

## Access and reuse status

The UCD archive and PDF were publicly accessible, without login, payment or a displayed acceptance step. They were retrieved through the organiser's actual link. An initial guessed `www.maths.ucd.ie` hostname failed certificate validation; the linked `maths.ucd.ie` hostname succeeded with ordinary certificate verification. A direct curl request to the organiser homepage returned CloudFront 403; the web search/open tool could read the public organiser pages. No security check, paywall or authentication was bypassed.

**No explicit open-content licence or blanket redistribution permission was found on the archive page or in the PDF. Public availability is not a licence.** Copyright/attribution remains with the respective problem authors and the compendium author. The retained source and adapted statements support the requested local study collection; this audit does not certify a legal basis for general republication. Public distribution or commercial deployment of the bundled collection requires a rights decision/permission appropriate to that use. No contact was sent to the authors and no permission is claimed. The source PDF is preserved unchanged, with its attribution. The application links the official archive and exact source page and identifies topic/AoPS mappings as editorial. No third-party solutions, commercial textbook solutions or access-restricted material were copied.

## Extraction and review

The working text was obtained using local Poppler `pdftotext -layout`; it was a drafting aid, not accepted as accurate formula extraction. The 160 statements were manually rewritten as uncompressed Markdown with editable `$...$`/`$$...$$` LaTeX. Wording is condensed in places while retaining mathematical conditions, original identifiers, all subparts and requested conclusions. Paper dates and source offsets were checked against headers. PDF pages 54–85 correspond to printed pages 50–81. All 32 pages were rendered to 1600-pixel PNGs; every question has a source-page reference.

Direct visual equation checks included PDF pages 55, 57, 58, 60, 63, 64, 65, 67, 71, 72, 74, 75, 78, 81, 83 and 84. Important decisions/corrections:

| Question | Review outcome in source Markdown |
| --- | --- |
| 2012 P2 Q8 | Restored the entire square on the left and the 2/a coefficient on the right |
| 2013 P1 Q2 | Corrected a lossy draft denominator to **the 2012th root of 2013**, `\frac{1}{\sqrt[2012]{2013}}`; 2012 is a root index, not a multiplier |
| 2014 P1 Q5 | Restored the normalising sum, subscripts and both rational sums |
| 2015 P2 Q7/Q10 | Preserved `2^n` and `2^{n-j}`, binomial coefficient and quantifiers |
| 2016 P1 Q5 | Bound is `3\sqrt{11}`, not a cube root |
| 2016 P2 Q9 | Reconstructed both nested fractions, cube roots 252/2/63 and outer cube from the rendered page |
| 2017 P2 Q6/Q9/Q10 | Preserved exponential powers, asymmetric exponents and power of the entire sum |
| 2020 P1 Q5 | Preserved each seventh-root scope and all six denominators |
| 2021 P1 Q3 | Source really says `n+T(n)=10n`; retained it, without inventing an exponent |
| 2021 P2 Q8 | Normalised source's malformed `P ≠= C` to `P\ne C` |
| 2021 P2 Q9 | Restored outer absolute-value bars around `AB/3-3ab`, then subtraction of `3ab` outside the bars |
| 2021 P2 Q10 | Bound is `\sqrt{2}/20` |
| 2023 P1 Q4 | Restored square on `(xy-1)` and full argument of the function |
| 2024 P2 Q6 | Both binomial coefficients and exponent `2^m` checked |
| 2024 P2 Q9 | Compendium repeats side BC for M. Corrected M's side to **AC**: in a nondegenerate parallelogram ALKM with A,L on AB and K on BC, M must lie on the line through A parallel to LK, namely AC. This is an editorial mathematical correction, not a claim of an organiser-issued erratum. Original PDF is unchanged |
| 2025 P2 Q6 | Retained exponents `2025^3` and `2025^4` |
| 2026 P1 Q1/Q2 | Restored the whole sum under the factor 1/4 and the four powers of 2 |

The source figures for 2012 Q10, 2013 Q7, 2017 Q4, 2020 Q4, 2023 Q2 and 2025 Q2 remain linked. At this version they are retained as complete source pages, preserving labels/context; the UI and vision tool can inspect them. We do not claim every transcription has received a second independent visual comparison or every problem has been solved. The independent code review does not certify transcription accuracy.

Tests cover year/paper/question counts, unique IDs, stage labels, existence of all source assets, validity of all mapped AoPS chapter/section references, rendering of every LaTeX expression, and regression checks for the most error-prone reviewed expressions. These checks catch structural/rendering regressions; they do not prove mathematical equivalence to the original.

## Maintenance

Edit `skills/irmo-study/references/papers/YYYY.md` to fix a statement. Rebuild metadata with `node scripts/build-irmo-catalog.mjs`; `--check` verifies it is current. The generator reads reviewed Markdown, not PDFs. It also derives searchable statement words, so titles, IDs, topics, names and remembered wording can locate a question without loading all statements into the tutor prompt. Topic tags and AoPS links are suggested foundation routes, not official syllabus labels or verified solution dependencies. New years require a retrieved released paper, date/identity checks, source asset and provenance updates. Keep extraction/rights audits here, outside tutor-facing content.
