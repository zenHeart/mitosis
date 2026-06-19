---
name: mermaid-no-chinese-quotes-in-node-labels
description: Mermaid flowchart/node labels must not contain Chinese curly/smart quotes "..." inside brackets, as they cause parse errors. Use straight quotes, single quotes, or remove quotes entirely.
metadata:
  type: project
---

Mermaid diagram 节点标签（`[内容]`）中**禁止使用中文引号** `“` `”`（即 `"` `"`），会导致渲染解析失败。

**错误示例：**
```mermaid
C[点击"基于此继续创造"]    // ❌ 中文引号导致 parse error
```

**正确写法：**
```mermaid
C[点击基于此继续创造]       // ✅ 去掉引号
C[点击'基于此继续创造']      // ✅ 使用英文单引号
C["基于此继续创造"]          // ✅ 英文双引号在标签外也可
```

**Why:** Mermaid 解析器将标签内的中文引号误认为语法分隔符，导致 `Expecting 'TEXT', got 'STR'` 类错误。

**How to apply:** 编辑任何 `.md` 文件中的 mermaid 图时，检查所有 `[xxx]` 节点标签，确保不含 `“` 和 `”`（Unicode U+201C/U+201D）。常见来源：中文写作时自动转换的智能引号。
