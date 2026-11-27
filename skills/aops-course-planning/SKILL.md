---
name: aops-course-planning
description: Create or revise an AoPS learning plan, synchronize historical progress, or adapt an unfinished lesson to updated teaching rules.
---

# Plan learning units

A lesson is a unit with its own scope, objectives and completion criteria. Sources may be chapters, selected sections, papers or problem collections. In the current Mr. Kane adapter, use one selected AoPS chapter per lesson and its catalog courseId. Other groupings require adapter support.

## Define the plan

1. Reuse the student's goal, background, time budget and demonstrated knowledge. Use `course_catalog` for routes and locators; optional branches are not prerequisites. Diagnose only uncertainties affecting placement.
2. Retrieve sources and define each lesson:
   - Scope, source locators and exclusions.
   - Observable objectives and prerequisites, including needed repair.
   - Assessment task types and `masteryCriteria` for each objective. State what independent work must demonstrate; include reasoning or transfer where the objective requires it.
3. Put scope in the lesson title/objectives, source and prerequisite details in objective descriptions and the working plan, and completion requirements in each objective's `masteryCriteria`. Show the sequence and personalized coverage: summaries for demonstrated targets, detailed teaching for unfamiliar targets and repair for partial understanding.
4. If asked to begin, load teaching. Otherwise end with the starting point.

## Revise or synchronize

Use the saved checkpoint plus later conversation. Preserve plan/domain IDs, objective IDs, attempts, assistance levels, reports and completed targets. Increment revision and explain changes to scope, order or criteria. Put new targets after completion in a subsequent plan. Keep domains in separate plans.

Map historical answers to equivalent objectives with exact excerpts and original assistance levels. Mark missing evidence unverified. Load assessment before deciding completion or waiver.

When adopting updated rules in an unfinished lesson, explicitly revise its criteria and personalized coverage. Reconcile the outstanding task: retain it for an unresolved uncertainty, or explain its replacement or retirement. Plain “continue” resumes teaching without requesting this revision.

End with the revised scope, recovered progress and next action. Synchronization alone stops here; if also asked to continue, load teaching. Keep working revisions in the conversation until the host's completion checkpoint persists them; reorganization alone does not trigger `complete_lesson`.
