#!/usr/bin/env bash
# Stages and commits all archive outputs for a version.
# Covers command step 6. Run after AI completes steps 4 and 5.
# Usage: archive-commit.sh <version>   (e.g. v0.13)
# Run from the repository root.
set -euo pipefail

VERSION="${1:-}"
if [[ -z "$VERSION" ]]; then
  echo "Usage: $0 <version>  (e.g. v0.13)" >&2
  exit 1
fi

if [[ ! -f "docs/05_dev-plan.md" ]]; then
  echo "ERROR: docs/05_dev-plan.md not found. Run this script from the repository root." >&2
  exit 1
fi

# Core files — always present
STAGE=(
  "docs/$VERSION"
  "docs/01_input-ideas.md"
  "docs/02_assumptions-and-risks.md"
  "docs/03_requirements.md"
  "docs/04_architecture.md"
  "docs/05_dev-plan.md"
)

# docs/raw/ — stage as a path (not just docs/raw/$VERSION) so the deletion of files
# moved out of docs/raw/ by archive-snapshot.sh is captured too, not just the new subdir
if [[ -d "docs/raw" ]]; then
  STAGE+=("docs/raw")
fi

# docs/06_review.md — root stub (if present) and its archived copy
[[ -f "docs/06_review.md" ]] && STAGE+=("docs/06_review.md")
[[ -f "docs/$VERSION/06_review.md" ]] && STAGE+=("docs/$VERSION/06_review.md")

# .claude/memory/project-progress.md is tracked like the rest of .claude/
[[ -f ".claude/memory/project-progress.md" ]] && STAGE+=(".claude/memory/project-progress.md")

echo "Staging:"
for f in "${STAGE[@]}"; do
  echo "  $f"
done
echo ""

git add "${STAGE[@]}"
git commit -m "chore: archive $VERSION docs — all milestones released"

echo ""
echo "Committed archive for $VERSION."
echo "Next: push to remote when ready (git push)."
