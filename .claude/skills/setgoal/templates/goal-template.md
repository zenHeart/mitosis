# Goal: <简短描述>

## 目标

<一段话描述要达成什么。为什么这个目标重要？完成后用户能得到什么？>

## 串行验证流程

```
Stage 0: <阶段名称>
  ─────────────────────────────────────────────────────
  确保 <前置条件>：
  - 验收项 1
  - 验收项 2
  ─────────────────────────────────────────────────────
                          │
                          ▼  Stage 0 PASS
Stage 1: <阶段名称>
  ─────────────────────────────────────────────────────
  实现 <核心功能>：
  - 验收项 1
  - 验收项 2
  ─────────────────────────────────────────────────────
```

## 使用方式

```bash
/goal
```

Agent Loop 自动按 Stage 顺序迭代，每步通过后进入下一步。

**详细协议：** `.claude/skills/setgoal/SKILL.md`
**Verifier 脚本：** `.claude/skills/setgoal/verifiers/`
**进度追踪：** `.claude/.goal-state.json`

## 范围

### 允许修改
- `src/` — 前端源码
- `docs/` — 技术文档
- `docs/product/` — 产品需求
- `.claude/skills/setgoal/` — 本技能的 verifiers

### 禁止修改
- `.claude/settings.local.json`
- 真实 token、key、secret
- 与当前目标无关的功能

## 阻塞点处理

### <阻塞点名称>
**处理方式：** <如何处理>
```bash
<具体命令>
```

## 验收标准

### C1: <标准名称>
- [ ] <可验证的具体条件>
- [ ] <可验证的具体条件>

### C2: <标准名称>
- [ ] <可验证的具体条件>

## 验证命令

```bash
# 快速本地验证
bash .claude/skills/setgoal/verifiers/<relevant>.sh

# 构建验证
npm run build
npm run typecheck

# 安全扫描
rg "(ghp_|gho_|github_pat_|sk-|AKIA|AIza|eyJ)" \
  --type-add 'code:*.{ts,js,vue,json,yml,yaml,sh,env}' \
  -g '!*.md' \
  src/ apps/ worker/ .github/ || echo "SECURITY_SCAN: PASS"
```

## 风险

- P0: <阻断性风险描述>
- P1: <高优先级风险描述>
