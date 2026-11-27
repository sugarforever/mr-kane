---
name: aops-course-assessment
description: Assess lesson completion, readiness for a next activity, remediation, placement waiver, or historical progress.
---

# Assess learning evidence

Read the saved learner and later conversation. Apply [completion criteria](references/completion.md), supplied as `completionCriteria` by `course_skill`.

For each objective identify the applicable criterion, supporting attempts, assistance and unresolved uncertainty. Distinguish unassessed, partial, assisted and independently demonstrated understanding using the existing support/result fields. Reassess disputed answers without rewriting original attempts.

## Decide

- Complete: all objectives meet the completion criteria. Give a concise summary and next step, then call `complete_lesson` with planId/courseId.
- Partial: select a check or repair for the unresolved objective.
- Ready for the next activity: its prerequisites are supported; retain other gaps. This is not a completion status. Pause the current lesson explicitly if moving to another formal lesson.
- Waived: report the placement rationale for omitting scope. Demonstrated mastery is assessed as completion instead.
- Paused: retain the phase and outstanding task.

## Report

Identify source scope and each objective's criterion, exact evidence excerpts, assistance and uncertainty. Explain the decision and recommend the next task, repair or delayed review. Use the same criteria for historical synchronization; load planning if the unfinished plan needs revision.
