Read 02_assumptions-and-risks.md, 03_requirements.md, 04_architecture.md, 05_dev-plan.md in order.
After reading 05_dev-plan.md, follow the milestone links:
- Parse the Milestone Registry to find the milestone with the highest semver that has status **released** (compare version numbers, e.g. v0.3 > v0.2 > v0.1) and read its file
- If a milestone has status **in progress**, read its file too
Produce a structured audit with three sections:
1. Contradictions — places where documents conflict with each other
2. Unresolved assumptions — anything marked ⚠️ ASSUMPTION or left implicit
3. Gaps — information required by a later document that no earlier document provides

Do not fix anything.

# Workflow

1. Analyze the documents
2. if 0 problems (don't count cosmetics) exit
3. otherwise:
   1. Write the result into docs/06_review.md with a checklist at the bottom to track progress
   2. Create a task list (TaskCreate for each issue)
   3. Start fixing them (involve the user for any decisions/clarifications/doubts), for each item:
      * (TaskUpdate in_progress)
      * Use AskUserQuestion for any decision or clarification needed
      * Provide solution
      * Update the related documents (outside 06_review.md). We do not want to find the same problem next iteration.
      * Update 06_review.md checklist
      * (TaskUpdate completed)
   4. if the checklist is done:
      * delete docs/06_review.md
      * commit the changes
      * go to 1
