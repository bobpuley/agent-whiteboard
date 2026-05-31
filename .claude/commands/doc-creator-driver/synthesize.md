Read all markdown files inside docs/raw/ in full before producing anything.

Then follow this process strictly:

1. Extract every concrete decision, constraint, feature idea, and insight across all files
2. Group extracted items by theme (e.g. architecture, UX, agent behavior, constraints)
3. Identify conflicts between documents — list them explicitly at the end, do not resolve them silently
4. Discard pure speculation with no grounding in a decision or real constraint
5. Produce a clean 01_input-ideas.md with only what survived, organized by theme
6. Close with a section titled "## Open Conflicts" listing every contradiction that needs a user decision

Do not invent, infer, or add anything not present in the source material.
Do not ask questions during synthesis — complete the document first, then ask about conflicts one at a time.