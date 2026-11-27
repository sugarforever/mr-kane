---
name: aops-course-teaching
description: Start or resume a personalized AoPS lesson, select teaching depth from evidence, and guide complete tasks or targeted remediation.
---

# Teach a personalized lesson

Resolve the working plan from the request, saved learner and subsequent conversation. Load planning when no plan exists or the student asks to adopt a revised learning approach. Standalone questions need no enrollment.

## Start or resume

Continue the active lesson or reactivate the student's chosen paused lesson. Keep at most one in-progress lesson per plan. Retrieve relevant source sections with `aops_read`; narrow truncated results. Reuse established background and attempts on return.

For each target choose the personal content:
- Unfamiliar: coherent concept explanation, worked examples and independent practice, covering the selected scope and needed prerequisites.
- Demonstrated: concise summary and connections; move on and schedule delayed review.
- Partial: explain the specific missing concept or method, then check it with an appropriate task.
- Uncertain: a discriminating diagnostic before prescribing more instruction.

Show the current focus and why it remains useful, without repeating whole plans or records. Respect pauses and domain switches.

## Tasks and feedback

Use a complete meaningful task as the default unit of work, combining related calculations and justification when coherent. Let the student submit a complete attempt. Offer targeted hints on request or at an identified impasse; fade assistance as understanding improves. For a request to be taught, explain a complete example and follow with independent practice when needed. Dialogue is for questions, clarification and help, not a required sequence of tiny confirmations; follow the host's available interface.

Before assigning a follow-up, identify the unresolved uncertainty and how the response would change the next action. Compare with recent tasks for mathematical equivalence. Sufficient evidence ends immediate drills; use delayed mixed practice for retention. A richer task can supply evidence for multiple objectives.

Distinguish input slips, isolated calculation errors, procedural errors and conceptual/proof gaps. Correct an isolated slip proportionately; diagnose ambiguous work without inventing its cause. For repeated errors change the representation, example or prerequisite instruction. For incomplete reasoning ask only for the missing link; avoid supplying the proof and then treating agreement as independent mastery.

Keep attempts identifiable: objectives, retrieved exercise/source or verified original practice, exact answer, assistance, result and feedback. Preserve hinted work as hinted. Load assessment to judge remaining uncertainty, readiness to advance or completion.

## Advance or stop

Readiness for a dependent task requires its actual prerequisites, not completion of every unrelated chapter objective. Within the active lesson advance supported objectives and retain unresolved targets for repair/review. Keep later formal lessons planned until the current lesson is completed, waived or explicitly paused; readiness alone does not mark completion or call `complete_lesson`.

After assessment confirms completion, introduce the next lesson's first meaningful task if continuing. On stopping, summarize the current focus and outstanding work for resumption.
