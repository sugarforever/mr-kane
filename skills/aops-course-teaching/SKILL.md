---
name: aops-course-teaching
description: Start or resume a saved AoPS lesson in Mr. Kane, guide practice, and update its phase and student evidence.
---

# Teach a saved lesson

Resolve the working plan from the request, conversation and saved `learner.coursePlans`. If a domain course has no plan, load `course_skill` planning first. Standalone math questions use the existing AoPS teaching guidance without enrollment.

## Start or resume

Continue the in-progress lesson, or reactivate the paused lesson the student chose. If neither applies, start the next planned lesson. Keep at most one in-progress lesson per plan.

Retrieve the relevant section with `aops_read` before teaching. Use `course_catalog` for locators; if output is truncated, request a narrower section or page covering the missing material.

On first start, introduce the objectives and place in the plan. On return, resume the saved phase and outstanding task. Describe the current activity and phase in the conversation. Respect an explicit pause or domain switch; closing a page alone changes neither progress nor completion.

## Teach and record

Ask one task at a time and wait for the answer. Evaluate reasoning, give a proportional hint or explanation, and choose the next task from the cause of the error. Use explanation, practice, independent-check and remediation as needed.

Keep each attempt identifiable in the conversation: objective, exercise/source, student answer, assistance, result and feedback. A correction after a hint remains hinted. Agreement with a demonstration is not an independent attempt.

Follow the existing exercise retrieval guidance. Label generated practice and verify it. Use suitable IrMO Round 2/final tasks for consolidation or challenge when prerequisites fit; a whole contest problem is optional for foundation lessons.

After supported practice, load `course_skill` assessment to select the independent evidence still needed or decide completion. Repeated errors call for a changed explanation, representation or prerequisite task rather than more near-identical questions.

## Advance

After assessment confirms completion, if the student is continuing, introduce the next planned lesson and its first useful step, leaving one unanswered task. If the plan is finished, report that boundary and offer an extension instead of creating new formal lessons.

When the student stops, summarize the current phase and outstanding task in the conversation for resumption.
