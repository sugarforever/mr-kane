---
name: aops-course-planning
description: Create or revise a personalized AoPS learning plan, reconcile existing progress, or adopt updated teaching rules in an unfinished lesson.
---

# Plan learning units

A lesson is a learning unit that can be scheduled, assessed and completed independently. Its source may be a chapter, selected sections, a paper or a collection of problems. Define the unit from the student's goal, rather than equating source structure with learning requirements.

## Define a lesson

For each unit establish:
- Scope and source locators, including exclusions.
- Observable knowledge and skill objectives.
- Prerequisites and how missing prerequisites will be repaired.
- Assessment tasks or task types mapped to objectives, distinguishing independent evidence from assistance.
- Completion criteria appropriate to each objective, including reasoning or transfer where needed.

The current Mr. Kane adapter stores one selected AoPS chapter per lesson, using catalog courseIds. This is the current default and storage boundary: describe selected scope in the title/objectives and sources, prerequisites and assessment in objective descriptions and the working plan. Store each objective's completion requirement in optional `masteryCriteria`. Paper-based or multi-chapter units require a future adapter; do not invent unsupported courseIds.

## Create

1. Reuse the student's background, goal, time budget and existing evidence. Use `course_catalog` for routes and locators; order includes optional branches. Diagnose only uncertainties affecting placement.
2. Retrieve sources, choose the sequence and define the units above. Select criteria before evaluating completion. A complete independent task can cover several objectives; avoid an automatic two-task quota when declared criteria suffice.
3. Reuse stable plan/objective IDs. Show the route and personal scope: detailed teaching for unfamiliar targets, summaries for demonstrated targets, targeted repair for partial understanding. Self-report informs placement but remains distinct from observed evidence.
4. If asked to begin, load teaching; otherwise finish with the starting point.

## Revise, synchronize or adopt updated rules

Read the saved learner checkpoint together with subsequent conversation. Preserve plan/domain IDs, objective IDs, original answers, assistance levels, reports and completed targets. Increment revision and state the reason when scope, objective criteria or order changes. New targets after completion belong in a subsequent plan.

For an unfinished existing lesson, map actual attempts to objectives, retain demonstrated knowledge and identify only unresolved gaps. Adopt explicit masteryCriteria through a visible plan revision, not an implicit relaxation after a failed check. Older objectives without criteria retain the legacy completion default until revised. Load assessment before declaring completion or waiver.

Reconcile the outstanding task: retain it when it answers a remaining uncertainty; replace or retire it with a brief reason when equivalent evidence already exists or a different check is needed. Synchronization alone does not begin teaching. If the student asks to adopt the new approach and continue, summarize the adapted scope briefly and load teaching immediately. A plain continue resumes the current task using current guidance; it does not request a full plan revision.

Keep domains in separate plans. Reuse evidence for equivalent objectives with provenance and assistance intact. Keep the working plan in the conversation; the host persists learner checkpoints only on lesson completion. A rules update or reorganization does not itself call `complete_lesson`.
