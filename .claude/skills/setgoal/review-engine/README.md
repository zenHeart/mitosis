# UX Review Engine

Mitosis 用户体验持续审查引擎。支持增量（默认）和全量两种模式，确保产品和应用的持续迭代打磨。

## 架构概览

```
.claude/skills/setgoal/review-engine/
├── README.md                  # 本文件
├── rubric.json                # ⭐ 单一评分标准（唯一真实来源）
├── component-map.json         # 文件→维度映射（用于增量分析）
├── output-schema.json         # 统一输出格式
├── scripts/                   # CI/本地执行脚本（纯 JS）
│   ├── measure.mjs            # Playwright 自动化测量
│   ├── score.mjs              # 对照 Rubric 评分
│   └── aggregate.mjs          # 多输入聚合 + 去重
├── verifiers/
│   └── ux-review.sh           # 入口脚本（被 setgoal Phase C 调用）
└── agents/                    # Claude Code 子 Agent 定义
    ├── ux-interaction-auditor.md   # 交互审计专员
    ├── ux-visual-auditor.md        # 视觉审计专员
    ├── ux-responsive-auditor.md    # 响应式审计专员
    └── ux-lead-auditor.md          # 首席审计员（协调）
```

## 核心原则

### Single Source of Truth

`rubric.json` 是唯一的评分标准，被本地（Agent 子进程）和远程（CI scripts）两个执行后端共同消费：

```
rubric.json
    ↓                ↓
   本地执行           远程执行
   (subagent)        (scripts)
   ux-*-auditor       measure.mjs
   ↓                 ↓
   输出 JSON          score.mjs
   符合               ↓
   output-schema      aggregate.mjs
                       ↓
                   最终报告
```

### 双轨执行后端

| 场景 | 执行后端 | 触发方式 |
|------|---------|---------|
| 本地 setgoal | Claude subagent | `/ux-polish` |
| 远程 CI | Node.js scripts | PR comment `/ux-check` |
| 本地手动 | Shell + Node | `bash ux-review.sh` |

### 增量优先

默认只审查变更文件影响的维度，通过 `component-map.json` 映射：

```json
{
  "mappings": {
    "src/components/ChatInput.vue": {
      "affected_dimensions": [
        "ux_flow.feedback_timeliness",
        "ux_flow.path_clarity",
        "responsive.input_usability"
      ]
    }
  }
}
```

## 触发方式

### 本地触发（setgoal Phase C）

```bash
# 增量模式（默认）
/ux-polish

# 全量模式
/ux-polish full

# 指定文件增量
/ux-polish --files ChatInput.vue Workspace.vue
```

### 远程触发（CI）

在 PR 中评论：
```
/ux-check          # 增量模式
/ux-check full     # 全量模式
```

## 审计维度

### ux_flow（40%）— 交互体验
| 子维度 | 权重 | 测量方式 |
|--------|------|---------|
| path_clarity | 25% | 人工走查 |
| feedback_timeliness | 20% | Playwright 自动化 |
| error_recovery | 20% | 人工走查 |
| cognitive_load | 15% | 人工走查 |
| consistency | 10% | 代码检查 |
| trust_transparency | 10% | Playwright 自动化 |

### visual_design（30%）— 视觉设计
| 子维度 | 权重 | 测量方式 |
|--------|------|---------|
| token_consistency | 20% | 代码检查 |
| readability | 25% | Playwright 自动化（对比度） |
| visual_hierarchy | 20% | 人工走查 |
| component_completeness | 15% | 人工走查 |
| micro_interactions | 10% | 人工走查 |
| dark_mode | 10% | Playwright 自动化 |

### responsive（30%）— 响应式
| 子维度 | 权重 | 测量方式 |
|--------|------|---------|
| touch_targets | 25% | Playwright 自动化 |
| layout_adaptation | 25% | Playwright 自动化 |
| mobile_nav | 20% | 人工走查 |
| input_usability | 15% | Playwright 自动化 |
| text_readability | 15% | Playwright 自动化 |

## 输出格式

所有输出符合 `output-schema.json`：

```json
{
  "mode": "incremental|full",
  "timestamp": "2026-06-28T10:00:00Z",
  "duration_seconds": 35,
  "trigger": "git_push|manual|pr_comment",
  "changed_files": ["src/components/ChatInput.vue"],
  "scoped_dimensions": ["ux_flow.feedback_timeliness", "responsive.touch_targets"],
  "scores": {
    "ux_flow": {
      "score": 72,
      "weight": 0.40,
      "sub_scores": { "path_clarity": 80, "feedback_timeliness": 60 },
      "issues": [...]
    },
    "visual_design": { "score": 82, "weight": 0.30, "sub_scores": {...}, "issues": [...] },
    "responsive": { "score": 75, "weight": 0.30, "sub_scores": {...}, "issues": [...] }
  },
  "overall_score": 74,
  "unreviewed_dimensions": ["visual_design.*", "responsive.mobile_nav"],
  "verdict": "PASS|PARTIAL|FAIL",
  "recommendation": "...",
  "next_actions": [...]
}
```

全量模式额外包含：
```json
{
  "regression": {
    "previous_score": 76,
    "delta": -2,
    "previous_timestamp": "2026-06-25T10:00:00Z",
    "degraded_dimensions": ["feedback_timeliness"],
    "improved_dimensions": ["token_consistency"]
  }
}
```

## 使用 Playwright

### 安装依赖

```bash
cd .claude/skills/setgoal/review-engine
npm install playwright
npx playwright install chromium
```

### 手动运行

```bash
# 增量模式（默认维度）
bash verifiers/ux-review.sh incremental

# 增量模式（指定文件）
bash verifiers/ux-review.sh incremental -- ChatInput.vue

# 全量模式
bash verifiers/ux-review.sh full
```

### CI 集成

```yaml
# .github/workflows/ux-check.yml
name: UX Check
on:
  issue_comment:
    types: [created]

jobs:
  ux-check:
    if: github.event.issue.pull_request != '' && contains(github.event.comment.body, '/ux-check')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm install
      - run: npm run dev &  # 启动 dev server
      - run: npx playwright install chromium
      - run: bash .claude/skills/setgoal/review-engine/verifiers/ux-review.sh incremental
```

## 回归检测

全量模式会自动对比上次评分：

```bash
# 读取历史
cat .claude/memory/ux-rubric-history.md

# 对比维度变化
# 标记退化的维度
```

## 铁律

1. **不修改代码** — 只报告，修复由 Executor 执行
2. **增量优先** — 默认只测量变更影响的维度
3. **具体证据** — 每个分数必须有具体证据支撑
4. **可执行建议** — 每个 issue 必须包含 file:line 定位
5. **中文输出** — 所有报告和建议使用中文
