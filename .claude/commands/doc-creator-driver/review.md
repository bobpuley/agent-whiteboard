Read 02_assumptions-and-risks.md , 03_requirements.md , 04_architecture-and-plan.md in order.
Produce a structured audit with three sections:
1. Contradictions — places where documents conflict with each other
2. Unresolved assumptions — anything marked ⚠️ ASSUMPTION or left implicit
3. Gaps — information required by a later document that no earlier document provides

Do not fix anything.

# Workflow

1. Analyze the documents
2. if 0 problems (don't count cosmetics) exit
3. otherwise:
   1. Write the result into a docs/05_review.md with a checklist to the bottom to handle progress
   2. Create a task list (TaskCreate)
   3. Start fixing them (involve the user for any decisions/clarifications/doubts), for each item:
      *  (TaskUpdate in_progress)
      * provide solution (interacting with the user if required)
      * updated the related documents (outside the 05_review.md). We do not want to find the same problem next iteration.
      * update the 05_review.md and the checklist
      * (TaskUpdate completed)
   4. if the checklist is done:
      * delete docs/05_review.md
      * commit the changes
      * go to 1
