Implement the dev plan recursively

Read in order:
1. docs/03_requirements.md
2. docs/04_architecture.md
3. docs/05_dev-plan.md

Generate executable code
Generate unit tests

Do not change requirements or architecture.

# Workflow

1. Analyze the documents
2. In 05_dev-plan.md check for the next pending implementations in the `Dev Plan` section
3. If no pending implementations, stop
4. otherwise:
   1. Pick the next implementation
   2. Create a git branch (name rules: between ~5 and ~30 chars, common naming best practices)
   3. Think about how to properly integrate it in the existing codebase
   4. Split it into atomic tasks (TaskCreate for each)
   5. For each task:
      * (TaskUpdate in_progress)
      * Use AskUserQuestion for any decision or clarification needed
      * Implement the test
      * Implement the code
      * Run the tests
      * Iterate implementation until tests pass
      * Merge git branch into main
      * Update the `Dev Plan` in 05_dev-plan.md
      * (TaskUpdate completed)
   6. Go to "1. Analyze the documents"

# Required skills
typescript-expert/SKILL.md
