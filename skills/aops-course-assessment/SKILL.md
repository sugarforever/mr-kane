---
name: aops-course-assessment
description: Assess AoPS chapter evidence for completion, placement waiver, remediation, pause, or historical synchronization.
---

# Assess learning evidence

Use the saved learner plus subsequent conversation evidence. Apply [completion criteria](references/completion.md), supplied as `completionCriteria` by `course_skill`.

## Decide

- Complete: summarize the chapter evidence and next step, then call `complete_lesson` with the planId and courseId. Teaching may advance.
- Partial: identify the unresolved objective and one targeted check or remediation action. Add a check only for a remaining uncertainty.
- Waived: explain the placement evidence and rationale for omitting the chapter. Waiver is distinct from completion.
- Paused: summarize progress, the current phase and the outstanding task for resumption.

## Report

Identify the source chapter, each objective's evidence status, and the relevant attempts with a short interpretation. Distinguish independent, hinted, demonstrated and unverified work. Recommend the next chapter, targeted remediation or delayed review; state uncertainty where evidence is missing.

Apply the same criteria to historical synchronization and disputed assessments. Re-evaluate the cited attempt while preserving the student's original answer and assistance level.
