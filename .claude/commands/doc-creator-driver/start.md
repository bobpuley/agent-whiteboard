Read CLAUDE.md and all existing project documents in the root (00 → 05).
After reading 05_dev-plan.md, follow the milestone links:
- Parse the Milestone Registry to find the milestone with the highest semver that has status **released** (compare version numbers, e.g. v0.3 > v0.2 > v0.1) and read its file
- If a milestone has status **in progress**, read its file too
Check if docs/raw/ contains any unprocessed files.

If raw files exist and 01_input-ideas.md is empty: tell the user to run /synthesize first.
Otherwise: summarize in 3 bullets what has been decided, what is in progress, what hasn't started.
Then ask the single most valuable next question to move the project forward.
