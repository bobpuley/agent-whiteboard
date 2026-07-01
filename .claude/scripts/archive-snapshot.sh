#!/usr/bin/env bash
# Performs all mechanical filesystem mutations for archiving a version.
# Covers command steps 3–4: snapshot, banner stamp on 01–04, registry row update.
# Usage: archive-snapshot.sh <version>   (e.g. v0.13)
# Run from the repository root after archive-preflight.sh passes.
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

# Compute next version by incrementing the minor number after the dot.
# VERSION is not a float ("v0.13" -> "v0.14", not "v0.13 + 1"), so split on "." rather
# than doing arithmetic on the whole string.
NUM="${VERSION#v}"
MAJOR="${NUM%%.*}"
MINOR="${NUM#*.}"
NEXT_MINOR=$((MINOR + 1))
NEXT_VERSION="v${MAJOR}.${NEXT_MINOR}"
DATE=$(date +%Y-%m-%d)

ARCHIVE_DIR="docs/$VERSION"

echo "=== Step 1: Snapshot docs/01–05 → $ARCHIVE_DIR/ ==="
mkdir -p "$ARCHIVE_DIR"
cp "docs/01_input-ideas.md"           "$ARCHIVE_DIR/01_input-ideas.md"
cp "docs/02_assumptions-and-risks.md" "$ARCHIVE_DIR/02_assumptions-and-risks.md"
cp "docs/03_requirements.md"          "$ARCHIVE_DIR/03_requirements.md"
cp "docs/04_architecture.md"          "$ARCHIVE_DIR/04_architecture.md"
cp "$DEVPLAN"                         "$ARCHIVE_DIR/05_dev-plan.md"
echo "  Copied docs/01–05 → $ARCHIVE_DIR/"

# Copy docs/06_review.md if present (the exact name /doc-creator-driver:review writes;
# it's usually deleted once its checklist clears, so this is the uncommon case)
REVIEW_ARCHIVED=0
if [[ -f "docs/06_review.md" ]]; then
  cp "docs/06_review.md" "$ARCHIVE_DIR/06_review.md"
  REVIEW_ARCHIVED=1
  echo "  Copied docs/06_review.md → $ARCHIVE_DIR/"
else
  echo "  Note: docs/06_review.md not found — skipping."
fi

# Move unversioned docs/raw/ files (not already under a versioned sub-dir)
RAW_UNVERSIONED=()
if [[ -d "docs/raw" ]]; then
  while IFS= read -r f; do
    RAW_UNVERSIONED+=("$f")
  done < <(find "docs/raw" -maxdepth 1 -type f 2>/dev/null | sort)
fi
if [[ ${#RAW_UNVERSIONED[@]} -gt 0 ]]; then
  mkdir -p "docs/raw/$VERSION"
  for f in "${RAW_UNVERSIONED[@]}"; do
    mv "$f" "docs/raw/$VERSION/$(basename "$f")"
    echo "  Moved docs/raw/$(basename "$f") → docs/raw/$VERSION/"
  done
else
  echo "  Note: no unversioned files in docs/raw/ — skipping."
fi

echo ""
echo "=== Step 2: Stamp completion banner on docs/01–04 ==="
# docs/05_dev-plan.md is NOT stamped/stubbed — its Milestone Registry is a permanent,
# cumulative index across all versions, not version-scoped content.
BANNER="> **$VERSION complete** — archived to \`docs/$VERSION/\` on $DATE. This file now seeds $NEXT_VERSION planning."

for doc in \
  "docs/01_input-ideas.md" \
  "docs/02_assumptions-and-risks.md" \
  "docs/03_requirements.md" \
  "docs/04_architecture.md"
do
  tmp=$(mktemp)
  printf '%s\n\n' "$BANNER" | cat - "$doc" > "$tmp"
  mv "$tmp" "$doc"
  echo "  Stamped banner → $doc"
done

echo ""
echo "=== Step 3: Update Milestone Registry in $DEVPLAN ==="
# Append "— archived in `docs/$version/`" to the $VERSION row's Status cell
perl -i -pe "
  if (/^\|\s*\Q${VERSION}\E\s*\|/) {
    s/(\|\s*released)(\s*)(\|)/\${1} — archived in \`docs\/${VERSION}\/\` \${3}/;
  }
" "$DEVPLAN"
echo "  Patched: $VERSION row Status → 'released — archived in \`docs/$VERSION/\`'"

# Append a new $NEXT_VERSION row directly after the last table row (NOT before the blank
# line + legend that follows the table — GFM tables break if a blank line interrupts them)
NEW_ROW="| $NEXT_VERSION | TBD | TBD | planned      | TBD |"
awk -v newrow="$NEW_ROW" '
  { lines[NR] = $0; if ($0 ~ /^\|/) last = NR }
  END {
    for (i = 1; i <= NR; i++) {
      print lines[i]
      if (i == last) print newrow
    }
  }
' "$DEVPLAN" > "$DEVPLAN.tmp"
mv "$DEVPLAN.tmp" "$DEVPLAN"
echo "  Appended registry row for $NEXT_VERSION (planned, TBD — filled in by /doc-creator-driver:intake)"

echo ""
echo "=== Snapshot complete ==="
echo "  Archived:     $ARCHIVE_DIR/"
if [[ $REVIEW_ARCHIVED -eq 1 ]]; then
  echo "  Archived:     $ARCHIVE_DIR/06_review.md"
fi
echo ""
echo "Remaining AI steps:"
echo "  Step 4 — Rewrite root docs/01–04 (and docs/06_review.md stub if present) as $NEXT_VERSION seeds"
echo "  Step 5 — Append shipped-version line to .claude/memory/project-progress.md"
echo "  Step 6 — Run: .claude/scripts/archive-commit.sh $VERSION"
