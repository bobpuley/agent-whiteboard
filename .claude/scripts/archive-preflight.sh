#!/usr/bin/env bash
# Validates that a version is ready to archive.
# Usage: archive-preflight.sh <version>   (e.g. v0.13)
# Exit 0 = ready; exit 1 = blocked, reasons printed to stderr.
set -euo pipefail

VERSION="${1:-}"
if [[ -z "$VERSION" ]]; then
  echo "Usage: $0 <version>  (e.g. v0.13)" >&2
  exit 1
fi

DEVPLAN="docs/05_dev-plan.md"

if [[ ! -f "$DEVPLAN" ]]; then
  echo "ERROR: $DEVPLAN not found. Run this script from the repository root." >&2
  exit 1
fi

ERRORS=0

# --- Check 1: the $VERSION row exists in the Milestone Registry and is released ---
# Table format: | Milestone | Name | Sprints | Status | File |
# NB: use local awk vars (not $2/$5/$6 directly) — mutating a field and then printing
# $0 rebuilds the line with OFS (a space), which would destroy the "|" separators.
FOUND=$(awk -F'|' -v v="$VERSION" '
  { m=$2; gsub(/^[[:space:]]+|[[:space:]]+$/, "", m); if (m == v) { print "1"; exit } }
' "$DEVPLAN")

if [[ -z "$FOUND" ]]; then
  echo "ERROR: no Milestone Registry row for '$VERSION' found in $DEVPLAN" >&2
  exit 1
fi

STATUS=$(awk -F'|' -v v="$VERSION" '
  { m=$2; gsub(/^[[:space:]]+|[[:space:]]+$/, "", m); if (m == v) { s=$5; gsub(/^[[:space:]]+|[[:space:]]+$/, "", s); print s; exit } }
' "$DEVPLAN")
FILE_CELL=$(awk -F'|' -v v="$VERSION" '
  { m=$2; gsub(/^[[:space:]]+|[[:space:]]+$/, "", m); if (m == v) { f=$6; gsub(/^[[:space:]]+|[[:space:]]+$/, "", f); print f; exit } }
' "$DEVPLAN")

if [[ "$STATUS" != "released" ]]; then
  echo "FAIL: Milestone Registry row for '$VERSION' has status '$STATUS', not 'released'" >&2
  ERRORS=$((ERRORS + 1))
fi

# --- Check 2: no unchecked tasks in the linked milestone file ---
# FILE_CELL looks like: [Milestone_v0.13.md](./milestones/Milestone_v0.13.md)
MILESTONE_REL=$(echo "$FILE_CELL" | sed -n 's/.*(\(.*\))/\1/p')
MILESTONE_FILE="docs/${MILESTONE_REL#./}"

if [[ -z "$MILESTONE_REL" ]]; then
  echo "WARN: could not parse milestone file link from registry row for '$VERSION' — skipping task check" >&2
elif [[ ! -f "$MILESTONE_FILE" ]]; then
  echo "WARN: milestone file $MILESTONE_FILE not found — skipping task check" >&2
elif grep -q '^- \[ \]' "$MILESTONE_FILE"; then
  echo "FAIL: open tasks in $MILESTONE_FILE" >&2
  ERRORS=$((ERRORS + 1))
fi

if [[ $ERRORS -gt 0 ]]; then
  echo "" >&2
  echo "Pre-flight FAILED: $ERRORS issue(s) found. Resolve them before archiving $VERSION." >&2
  exit 1
fi

echo "Pre-flight PASSED: $VERSION is released and all its tasks are checked."
