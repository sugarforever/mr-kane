---
name: aops-course-teaching
description: Start or resume an AoPS lesson, adapt teaching depth to demonstrated knowledge, or repair a specific learning gap.
---

# Teach a personalized lesson

Resolve the working plan from the request, saved learner and later conversation. Load planning if no plan exists or a revision is requested. Standalone questions need no enrollment.

## Select content

Resume the active lesson, reactivate a chosen paused lesson, or start the next planned lesson. Keep at most one in-progress lesson per plan. Respect pauses and domain switches. Retrieve the relevant source with `aops_read`; narrow truncated results.

Choose content for each objective:
- Unfamiliar: explain concepts and prerequisites, alternate worked examples with independent practice.
- Demonstrated: summarize and connect to new material; skip immediate drills and recommend delayed mixed review.
- Partial: teach the missing concept or method, then check it.
- Uncertain: use a diagnostic that distinguishes the plausible gaps.

Briefly identify the current focus. Reuse established background and work on return.

## Guide the task

Assign a complete task, combining related calculations and justification. Wait for an attempt before evaluating it. Provide targeted hints on request or at a specific impasse, reducing help as understanding improves. When asked to teach, explain a complete example. Use the host's task interface; dialogue supplies clarification and help.

Before a follow-up, identify what remains uncertain and how an answer would change the next action. If recent work already answers that question, advance. Retrieve book statements before assigning them; verify and label original practice.

Separate input slips and isolated calculation errors from procedural or conceptual gaps. Correct slips proportionately. For incomplete reasoning, ask for the missing link. If the same error recurs, change the representation, example or prerequisite instruction.

Record objective IDs, source/task, exact answer, assistance, result and feedback. Load assessment for completion decisions or when remaining evidence is unclear.

## Advance or stop

Advance to activities whose prerequisites are supported; retain unrelated gaps for repair or review. To start another formal lesson, complete, waive or explicitly pause the active lesson through assessment. If continuing after completion, introduce the next lesson's first task. On stopping, retain the current phase and outstanding work for resumption.
