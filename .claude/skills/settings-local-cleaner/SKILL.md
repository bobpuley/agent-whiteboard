---
name: settings-local-cleaner
description: Analyzes and simplifies Claude Code settings by generalizing permission patterns, resolving duplicates, and producing a clean .claude/settings.json with user validation
version: 1.0.0
author: System
---

# Settings Local Cleaner

This skill analyzes `.claude/settings.local.json` and produces a simplified, generalized `.claude/settings.temp.json` file through an interactive process.

## Input
- **Primary**: `.claude/settings.local.json` (must exist)

## Output
- **Primary**: `.claude/settings.local.json` (cleaned and simplified)

## Intermediate Output
- **Primary**: `.claude/settings.temp.json` (cleaned and simplified)

## Workflow

### Step 1: Read Input File
1. Check if `.claude/settings.local.json` exists
2. Parse JSON content
3. Extract the `permissions.allow` array
4. If file doesn't exist, prompt user to provide the correct path

### Step 2: Analyze and Generalize
Apply the following transformation rules:

#### Pattern Generalization Rules
```python
# Rule 1: Group commands with same base
# npm install *, npm test *, npm run * → npm *
# npx vitest *, npx tsc * → npx *
# git add *, git * → git *

# Rule 2: Remove redundant prefixes
# python3 -c "..." → python3 *
# bash tests/*/run_*.sh → bash *

# Rule 3: Consolidate duplicate patterns
# echo "EXIT:$?" and echo "exit=$?" → echo *

# Rule 4: Pattern match scripts
# .claude/scripts/archive-*.sh * → .claude/scripts/archive-*.sh *
# .claude/scripts/milestone-*.sh * → .claude/scripts/milestone-*.sh *

# Rule 5: Generalize system commands
# cmake --build /tmp/* --parallel → cmake *
# clang++ -std=c++17 ... → clang++ *

# Rule 6: Remove specific paths when possible
# /tmp/** → kept as-is for security
# screencapture -x /tmp/vscode-screenshot-2.png → screencapture *
```

#### Deduplication Algorithm
1. Sort patterns alphabetically
2. Remove exact duplicates
3. Remove patterns fully covered by broader patterns (e.g., remove `git add *` if `git *` exists)
4. Preserve `Read` and `WebSearch` permissions separately

#### Security Analysis
Flag the following for user validation:
- Commands with potentially destructive operations (`rm`, `chmod 777`, etc.)
- Commands accessing system directories (`/etc`, `/usr`, `/var`)
- Commands with network operations (`curl`, `wget`, etc.)
- Commands with privilege escalation (`sudo`)
- Unusual or project-specific paths
- Commands that don't match any known safe pattern

### Step 3: Interactive User Validation

For each flagged item, present to the user:

```markdown
## Security Review Required

The following permission patterns were identified as potentially sensitive:

1. **Command**: `Bash(sudo apt-get install *)`
   - **Risk**: Privilege escalation
   - **Recommendation**: Remove or restrict to specific packages
   - **Options**: `keep|modify|remove`

2. **Command**: `Bash(rm -rf /tmp/*)`
   - **Risk**: Destructive operation
   - **Recommendation**: Restrict to specific paths
   - **Options**: `keep|modify|remove`

3. **Command**: `Bash(curl http://*)`
   - **Risk**: Network access
   - **Recommendation**: Consider if needed
   - **Options**: `keep|modify|remove`
```

Also prompt for: "Is this the correct level of generalization for your project?"

### Step 4: Write Output File

1. Generate the cleaned `permissions.allow` array
2. Preserve any non-permissions configuration from the input
3. Write to `.claude/settings.temp.json`
4. Format with 2-space indentation for readability

### Step 5: Clean Up

1. Verify `.claude/settings.temp.json` was written successfully
2. Ask user confirmation: "Confirm changes? [y/n]"
3. If yes, 
   1. `mv .claude/settings.local.json .claude/settings.local.json.backup` 
   2. `mv .claude/settings.temp.json .claude/settings.local.json`
   3. `rm .claude/settings.local.json.backup`
4. If no, `rm .claude/settings.temp.backup`

## Edge Cases

### Empty Permissions
If `permissions.allow` is empty:
- Inform the user
- Create a minimal configuration or abort

### Malformed JSON
- Attempt to repair common issues (trailing commas, unclosed brackets)
- If repair fails, report error and exit

### Very Large Files
- For files with >100 permission entries, suggest additional generalizations
- Provide statistics: "Found 150 patterns, can reduce to ~30"

### Mixed Permission Types
Keep `Read` and `WebSearch` separate - don't generalize them as `Bash`

## Implementation Details

### Generalization Function
```javascript
function generalizePattern(pattern) {
    // Remove specific arguments
    let generalized = pattern.replace(/\s+-[a-zA-Z0-9]\s+[^\s]*/g, ' *');
    
    // Remove specific paths
    generalized = generalized.replace(/\/[\/a-zA-Z0-9\-_\.]+/g, ' *');
    
    // Remove version numbers
    generalized = generalized.replace(/[0-9]+\.[0-9]+\.[0-9]+/g, '*');
    
    // Normalize command prefixes
    generalized = generalized.replace(/^(npm|npx|git|python3|bash) .*$/, '$1 *');
    
    return generalized;
}
```

### Deduplication Logic
```javascript
function deduplicatePatterns(patterns) {
    const sorted = patterns.sort();
    const result = [];
    
    for (let i = 0; i < sorted.length; i++) {
        let isCovered = false;
        for (let j = 0; j < result.length; j++) {
            if (result[j].endsWith('*') && sorted[i].startsWith(result[j].slice(0, -1))) {
                isCovered = true;
                break;
            }
        }
        if (!isCovered && !result.includes(sorted[i])) {
            result.push(sorted[i]);
        }
    }
    return result;
}
```

### Security Detection
```javascript
function detectSecurityRisk(pattern) {
    const risks = [];
    
    if (pattern.includes('sudo')) risks.push('PRIVILEGE_ESCALATION');
    if (pattern.includes('rm ')) risks.push('DESTRUCTIVE');
    if (pattern.includes('curl') || pattern.includes('wget')) risks.push('NETWORK');
    if (pattern.match(/\/etc\//) || pattern.match(/\/usr\//)) risks.push('SYSTEM_PATH');
    if (pattern.includes('chmod 777') || pattern.includes('chmod -R')) risks.push('DANGEROUS_PERMISSION');
    
    return risks;
}
```

## Example Output

Before:
```json
{
  "permissions": {
    "allow": [
      "Bash(npm install *)",
      "Bash(npm test *)",
      "Bash(git add *)",
      "Bash(git *)",
      "Bash(python3 -c \"import sys...\")",
      "Bash(cmake --build /tmp/m36-asan-build --parallel)",
      "Read(//tmp/**)",
      "WebSearch"
    ]
  }
}
```

After:
```json
{
  "permissions": {
    "allow": [
      "Bash(cmake *)",
      "Bash(git *)",
      "Bash(npm *)",
      "Bash(python3 *)",
      "Read(//tmp/**)",
      "WebSearch"
    ]
  }
}
```

## Success Criteria

1. ✅ All duplicates removed
2. ✅ Patterns generalized to minimum necessary specificity
3. ✅ Security risks validated with user
4. ✅ `.claude/settings.local.json` updated or untouched
5. ✅ User informed of all changes made
6. ✅ No functionality lost (all necessary permissions preserved)

## Error Handling

| Error                   | Action                                 |
|-------------------------|----------------------------------------|
| File not found          | Prompt for alternative path or exit    |
| Invalid JSON            | Attempt repair, else exit with error   |
| Write permission denied | Report and ask for manual intervention |
| User aborts             | Restore from backup if exists          |
| Empty result            | Warn user and keep original            |

## User Messages

### Start
```
🔍 Analyzing .claude/settings.local.json...
Found 42 permission patterns in settings.local.json
```

### Progress
```
📊 Analysis complete:
- 42 original patterns
- 18 duplicates found
- 12 patterns can be generalized
- 7 security risks identified
- Estimated final: ~12 patterns
```

### Completion
```
✅ Updated .claude/settings.local.json
- Reduced from 42 to 12 patterns (71% reduction)
- All security risks reviewed

Would you like to review the changes? [y/n]
```