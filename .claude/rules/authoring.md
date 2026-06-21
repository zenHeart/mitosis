---
paths:
  - "**/*.md"
---

# Authoring Rules — Markdown 编写规范

## Markdown 链接路径

### 禁止冗余路径

Markdown 链接不得包含"回退再进入同一目录"的冗余路径。

**从 `docs/` 内的文件链接到 `docs/` 内其他文件：**

```markdown
# Bad: 从 docs/README.md 链接到 docs/goals/README.md
[goals/README.md](../docs/goals/README.md)

# Good: 直接使用相对路径
[goals/README.md](goals/README.md)
```

**从 `docs/` 内的文件链接到项目根目录文件：**

```markdown
# Good: 向上到根
[goal.md](../goal.md)
[CLAUDE.md](../CLAUDE.md)

# Good: 向上到根再进入 docs/product/
[docs/product/overview.md](../docs/product/overview.md)
```

**从 `docs/product/` 内的文件链接到 `docs/` 文件：**

```markdown
# Good: 向上到根再进入 docs/
[architecture.md](../docs/architecture.md)
```

### 常见错误模式

| 场景 | Bad | Good |
|------|-----|------|
| `docs/README.md` → `docs/goals/` | `../docs/goals/x` | `agent/x` |
| `docs/README.md` → `docs/` 同级 | `../docs/x` | `x` |
| `docs/x.md` → `docs/y.md` | `../docs/y.md` | `y.md` |
| `docs/goals/x.md` → `docs/goals/y.md` | `y.md` | `y.md` |

**判断方法：**
1. 确定当前文件所在目录
2. 确定目标文件所在目录
3. 计算最简相对路径（不经过祖父目录再返回子目录）

### 根目录引用（超过 1 层回退时使用）

当相对路径需要 `../` 超过 1 次时（即出现 `../../` 或更多），直接使用以 `/` 开头的根目录引用。`/` 代表项目根目录。

```markdown
# Bad: 从 docs/goals/README.md 链接到 .claude/rules/setgoal.md
[setgoal.md](../../.claude/rules/setgoal.md)

# Good: 根目录引用（/ 代表 repo root）
[setgoal.md](/.claude/rules/setgoal.md)

# Bad: 从 src/components/X.vue 链接到 .claude/rules/mermaid.md
[mermaid](../../.claude/rules/mermaid.md)

# Good:
[mermaid](/.claude/rules/mermaid.md)
```

**判断方法：** 如果需要 `../` 两次或更多 → 用 `/.claude/...` 或 `/<path-from-root>`。

---

## Mermaid 图表

Mermaid flowchart/node labels inside `[...]` must not contain Chinese smart quotes `"` or `"`; they can cause parse errors.

```mermaid
# Bad
flowchart TD
    A[点击"继续迭代"]

# Good
flowchart TD
    A[点击继续迭代]
    B[点击'继续迭代']
    C["点击继续迭代"]
```

When editing Markdown diagrams, check all Mermaid node labels before declaring the document verified.
