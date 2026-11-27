---
name: aops-course-assessment
description: Evaluate lesson objectives against declared criteria for completion, readiness, targeted repair, placement waiver, or historical synchronization.
---

# Assess learning evidence

Use the saved learner plus subsequent conversation and [completion criteria](references/completion.md), supplied as `completionCriteria` by `course_skill`. Assess each objective against its declared masteryCriteria; use the legacy default when absent.

Map actual independent work to targets. Distinguish unassessed, partial, assisted and independently demonstrated understanding in the report using existing attempt support/result fields. A wrong answer may reflect a slip, method error or conceptual gap; resolve material uncertainty rather than inferring a missing concept from correctness alone. An all-correct diagnostic establishes completion only when coverage, reasoning and independence meet every target's criteria.

## Decide

- Complete: every target meets its criteria. Give a concise personalized summary and next step, then call `complete_lesson` with planId/courseId. Prior independent knowledge can satisfy the same criteria without repeated teaching.
- Partial: identify the unresolved target and a discriminating check or targeted repair. Reuse sufficient evidence and retire redundant checks.
- Ready to advance: prerequisites for the next activity are supported, while other targets remain incomplete. Record outstanding repair/review; readiness alone is not formal lesson completion.
- Waived: explain why scope is omitted from the plan and the placement evidence. Waiver remains distinct from mastery-based completion.
- Paused: retain the current phase and outstanding work for resumption.

## Report

Identify source scope, each target's evidence and criterion, assistance and uncertainties. Cite original student excerpts. Recommend advancement, targeted repair or delayed review. Reading, tutor demonstrations and prompted agreement show exposure, not independent mastery. Re-solving a demonstrated problem does not alone establish transfer.

Apply the same standards to historical synchronization and disputed assessments. Preserve original attempts and assistance when re-evaluating; describe any explicit plan revision rather than silently changing criteria.
