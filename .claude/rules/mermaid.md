---
paths:
  - "**/*.md"
---

# Mermaid Rules

Mermaid flowchart/node labels inside `[...]` must not contain Chinese smart quotes `“` or `”`; they can cause parse errors.

Bad:

```text
flowchart TD
    A[点击“继续迭代”]
```

Good:

```mermaid
flowchart TD
    A[点击继续迭代]
    B[点击'继续迭代']
    C["点击继续迭代"]
```

When editing Markdown diagrams, check all Mermaid node labels before declaring the document verified.
