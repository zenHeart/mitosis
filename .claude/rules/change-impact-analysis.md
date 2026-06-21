# Change Impact Analysis Rule

## 原则

任何修改涉及以下领域的代码时，**必须先输出变更影响分析**，再执行修改：

- 认证/授权（auth、OAuth、token、session）
- 路由/视图切换（view、route、redirect、path）
- 环境变量/配置（env、define、config、secrets）
- 构建流程（CI、workflow、build script）
- Git 操作（push、rebase、merge、branch）

## 要求

在修改代码前，AI 必须回答：

1. **影响范围**：列出所有受影响的文件、组件、函数、数据流
2. **边界条件**：列出"正常情况下没问题，但边界情况下会出问题"的场景
3. **测试覆盖**：是否有测试覆盖受影响路径？如果没有，先写测试再改代码
4. **回退方案**：如果这个变更出问题，如何快速回退？

## 输出格式

```markdown
## 变更影响分析

### 影响范围
- 文件 A: 修改了 X，会影响 Y
- 文件 B: 新增了 Z，会改变 W 的行为

### 边界条件
- 场景 1: 当...时，可能会...
- 场景 2: 如果...，则...

### 测试覆盖
- [x] 已有测试覆盖
- [ ] 需要新增测试：...

### 回退方案
- git revert <commit>
```

## 禁止事项

- 禁止在认证/路由/配置代码中"顺手"修改其他逻辑
- 禁止添加"兜底"条件（如 `view === 'gallery' || isGalleryPath`）
- 禁止在模板中混合路径检测和认证状态
- 禁止将构建时常量（`__VAR__`）当作运行时配置使用

## 相关记忆

- [[oauth-redirect-loop-github-pages]] — OAuth 变更影响分析案例
- [[verifier-must-measure-not-check]] — 验证要求
