---
name: aops-course-assessment
description: Assess recorded AoPS lesson evidence in Mr. Kane for completion, placement waiver, remediation, or a partial learning summary.
---

# Assess learning evidence

Judge each objective from actual student reasoning and assistance levels. Reading, self-report and message counts do not establish mastery.

## Decide

Completion requires independently correct routine application plus explanation or transfer on a different task for every objective. The host enforces those categories; judge whether the tasks actually cover the objective and resolve observed misconceptions. Add a check only for a remaining uncertainty.

- Sufficient evidence: explain the completed chapter, objective evidence and report in the reply, and return lessonCompletion with its stable planId and courseId. This is the only automatic profile-update trigger. The host reconstructs and validates status completed, phase report and the report in a background consolidation. Teaching may then advance.
- Partial or hinted evidence: keep status in-progress; identify the unresolved objective and one targeted check or remediation action.
- Placement supports omission: set status waived and include the diagnostic evidence and rationale in the report. Waived remains distinct from completed.
- Student stops today: set status paused; retain the current phase and include a partial report with the outstanding task.

For partial assessments, pauses and placement waivers, keep progress in the conversation and return lessonCompletion null. The saved learner is a checkpoint, so use subsequent conversation evidence when assessing. A lesson already completed in the saved learner does not need another completion signal. If profileUpdate is failed, reassess the conversation and signal completion again when the evidence supports it.

## Report

In summary, identify the source chapter, each objective's evidence status, and relevant attempt IDs with a short interpretation. Distinguish independent, hinted, demonstrated and unverified work. Set nextStep to the next chapter, targeted remediation or delayed review. State uncertainty rather than an unsupported mastery percentage or contest ranking.

Apply the same criteria to historical synchronization. For a disputed judgement, re-evaluate the cited attempt and explain the correction. Revise its evaluation rather than inventing a new attempt; preserve the student's original answer.
