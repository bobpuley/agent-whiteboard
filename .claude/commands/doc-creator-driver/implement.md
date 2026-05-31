Implement the dev plan recursively

Read in order:
1. docs/03_requirements.md
2. docs/04_architecture-and-plan.md

Generate executable code
Generate unit tests

Do not change requirements or architecture-plan.

# Workflow

1. Analyze the documents
2. In the 04_architecture-and-plan check for the next pending implementations in the `Dev Plan` section
3. If no pending implementations, stop
4. otherwise:
   1. pick the next implementations
   2. create a git branch (name rules: between ~5 and ~30 chars, commons naming best practice)
   3. think about how to properly integrate it in the existing codebase
   4. split it in atomic tasks (TaskCreate)
   5. for each tasks
      * (TaskUpdate in_progress)
      * implement the test
      * implement the code
      * run the tests
      * iterate implementation until tests pass
      * merge git branch into main
      * update the `Dev Plan`
      * (TaskUpdate completed)
   6. go to "1. Analyze the documents"

# Required skills
typescript-expert/SKILL.md