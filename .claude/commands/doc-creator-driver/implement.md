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
   2. think about how to properly integrate it in the existing codebase
   3. split it in atomic tasks (TaskCreate)
   4. for each tasks
      * (TaskUpdate in_progress)
      * implement the test
      * implement the code
      * run the tests
      * iterate implementation until tests pass
      * update the `Dev Plan`
      * (TaskUpdate completed)
   5. go to "1. Analyze the documents"

# Required skills
typescript-expert/SKILL.md