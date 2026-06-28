# UX Review Engine 优化设计

> 基于当前代码库状态、文档同步分析、行业最佳实践交叉验证，设计本地和远程可复用的统一审查体系。

---

## 一、现状诊断

### 1.1 文档同步状态

| 文档 | 同步状态 | 关键问题 |
|------|----------|----------|
| `docs/architecture.md` | ⚠️ 部分同步 | 未区分 platform/app 构建验证路径 |
| `docs/agent-loop.md` | ⚠️ 部分同步 | 缺少 platform build 路径文档 |
| `.claude/agents/verifier.md` | ⚠️ 部分同步 | 缺少 golden-paths.sh 引用，Phase 1 描述过时 |
| `.claude/skills/setgoal/SKILL.md` | ✅ 基本同步 | 缺少 golden-paths.sh 引用 |
| `docs/product/chat-session-design.md` | ⚠️ 部分同步 | 缺少 sidebar UX 改进（分组、搜索、聚类）|
| `goal.md` | ✅ 当前 | golden-paths.sh 引用不一致 |
| `docs/goals/README.md` | ⚠️ 部分同步 | 缺少 verifier 脚本引用 |

**文档健康度：75%** — 核心架构和流程同步，但细节（platform build、golden-paths、近期 UX 改进）不一致。

### 1.2 当前审查体系的核心矛盾

```
当前系统：
  setgoal loop → mvp-verifier (功能验收) → PASS/FAIL → 归档/修复

用户需求：
  build → review → iterate → review → ... → 极致用户体验

矛盾点：
  1. mvp-verifier 是二元门禁（PASS/FAIL），UX 是连续谱系（0-100）
  2. Verifier 只验证功能正确性，不评估交互细节、视觉统一、响应式
  3. 没有"持续打磨"机制，只有"验收检查"
  4. 本地用 subagents，远程用 shell scripts，逻辑不统一
```

---

## 二、核心设计：Review Engine 单源真理

### 2.1 设计哲学

**"定义一次，执行两次"**

```
┌─────────────────────────────────────────────────────────────┐
│              Review Engine（单源真理）                        │
│                                                             │
│  rubric.json         ← WHAT to measure + HOW to score       │
│  component-map.json  ← WHAT changes affect WHAT dimensions   │
│  output-schema.json  ← Unified output format                │
└─────────────────────────────────────────────────────────────┘
           │                              │
           ▼                              ▼
┌──────────────────────┐    ┌──────────────────────────┐
│  Local Execution     │    │  Remote Execution (CI)   │
│  (Claude Code)       │    │  (GitHub Actions)        │
│                      │    │                          │
│  Subagents:          │    │  Scripts:                │
│  • lead-auditor.md   │    │  • measure.mjs           │
│  • interaction.md    │    │  • score.mjs             │
│  • visual.md         │    │  • aggregate.mjs         │
│  • responsive.md     │    │                          │
│                      │    │  CI Workflow:             │
│  Agent() calls:      │    │  • ux-check.yml          │
│  Promise.all()       │    │                          │
│  Parallel execution  │    │  --bare compatible       │
└──────────────────────┘    └──────────────────────────┘
           │                              │
           └──────────┬───────────────────┘
                      ▼
              ┌────────────────┐
              │  Unified Output │
              │  (JSON)         │
              │  • scores       │
              │  • issues       │
              │  • next_actions │
              └────────────────┘
```

### 2.2 为什么这个设计能解决根本矛盾

| 问题 | 解决方案 |
|------|----------|
| 功能验收 vs UX 打磨的判定体系冲突 | 双轨制：mvp-verifier 保持 PASS/FAIL，UX Engine 用 Rubric 分数 |
| 本地 subagents vs 远程 scripts 逻辑不统一 | 同一份 rubric.json，两个执行后端 |
| 增量/全量模式切换 | component-map.json 驱动，自动映射 |
| CI --bare 不支持 subagents | 纯 JavaScript 脚本实现相同逻辑 |
| 回归检测 | .claude/memory/ux-rubric-history.md 统一存储 |

---

## 三、Review Engine 架构

### 3.1 文件结构

```
.claude/
├── agents/                          # Local execution (subagents)
│   ├── verifier.md                  # 现有 mvp-verifier（保持）
│   ├── ux-lead-auditor.md          # 新增：Lead Auditor（协调者）
│   ├── ux-interaction-auditor.md   # 新增：交互审计专员
│   ├── ux-visual-auditor.md        # 新增：视觉审计专员
│   └── ux-responsive-auditor.md    # 新增：响应式审计专员
│
├── skills/
│   └── setgoal/
│       ├── SKILL.md                 # 现有（更新 Phase C）
│       ├── verifiers/               # 现有 verifier scripts
│       │   ├── types-and-api.sh
│       │   ├── session-restore.sh
│       │   ├── create-trigger.sh
│       │   ├── gfm-render.sh
│       │   ├── security-mask.sh
│       │   ├── golden-paths.sh
│       │   └── ux-review.sh         # 新增：UX 审查入口脚本
│       ├── references/
│       │   └── phase-verify.md      # 更新：添加 UX 审查步骤
│       └── review-engine/           # 新增：审查引擎核心
│           ├── README.md
│           ├── rubric.json          # 单源真理：Rubric 定义
│           ├── component-map.json   # 单源真理：文件→维度映射
│           ├── output-schema.json   # 单源真理：输出格式
│           └── scripts/             # Remote execution (CI)
│               ├── measure.mjs      # 测量脚本（Playwright）
│               ├── score.mjs        # 评分脚本（Rubric 引擎）
│               └── aggregate.mjs    # 汇总脚本（多维度合并）
│
└── memory/
    └── ux-rubric-history.md         # 回归检测历史
```

### 3.2 Rubric 定义（单源真理）

**文件**: `.claude/skills/setgoal/review-engine/rubric.json`

```json
{
  "version": "1.0.0",
  "description": "Mitosis UX 评价体系 — 用户体验 + 界面设计 + 响应式",
  "thresholds": {
    "pass": 85,
    "partial": 70,
    "fail": 0
  },
  "weights": {
    "ux_flow": 0.40,
    "visual_design": 0.30,
    "responsive": 0.30
  },
  "dimensions": {
    "ux_flow": {
      "label": "用户体验",
      "weight": 0.40,
      "sub_dimensions": {
        "path_clarity": {
          "label": "路径清晰度",
          "weight": 0.25,
          "measurement": "user_can_complete_core_task_in_3_steps",
          "method": "manual_walkthrough"
        },
        "feedback_timeliness": {
          "label": "反馈即时性",
          "weight": 0.20,
          "measurement": "dom_change_within_100ms_after_action",
          "method": "playwright_timing"
        },
        "error_recovery": {
          "label": "错误可恢复性",
          "weight": 0.20,
          "measurement": "error_message_contains_recovery_steps",
          "method": "manual_walkthrough"
        },
        "cognitive_load": {
          "label": "认知负荷",
          "weight": 0.15,
          "measurement": "information_density_reasonable",
          "method": "manual_walkthrough"
        },
        "consistency": {
          "label": "一致性",
          "weight": 0.10,
          "measurement": "similar_actions_use_same_components",
          "method": "code_audit"
        },
        "trust_transparency": {
          "label": "信任透明度",
          "weight": 0.10,
          "measurement": "async_operations_have_visible_status",
          "method": "playwright_visibility"
        }
      }
    },
    "visual_design": {
      "label": "界面设计",
      "weight": 0.30,
      "sub_dimensions": {
        "token_consistency": {
          "label": "Design Token 一致性",
          "weight": 0.20,
          "measurement": "colors_spacing_use_css_variables",
          "method": "code_audit"
        },
        "visual_hierarchy": {
          "label": "视觉层级",
          "weight": 0.20,
          "measurement": "primary_action_most_visible",
          "method": "playwright_visual"
        },
        "component_completeness": {
          "label": "组件完成度",
          "weight": 0.15,
          "measurement": "all_interactive_elements_have_states",
          "method": "manual_walkthrough"
        },
        "readability": {
          "label": "可读性",
          "weight": 0.25,
          "measurement": "contrast_ratio >= 4.5:1",
          "method": "playwright_contrast"
        },
        "micro_interactions": {
          "label": "微交互质量",
          "weight": 0.10,
          "measurement": "transitions_smooth_under_300ms",
          "method": "playwright_timing"
        },
        "dark_mode": {
          "label": "暗色模式和谐",
          "weight": 0.10,
          "measurement": "all_elements_visible_in_dark_mode",
          "method": "playwright_visual"
        }
      }
    },
    "responsive": {
      "label": "响应式体验",
      "weight": 0.30,
      "sub_dimensions": {
        "touch_targets": {
          "label": "触控目标",
          "weight": 0.25,
          "measurement": "all_interactive_elements >= 44x44px",
          "method": "playwright_measurement"
        },
        "layout_adaptation": {
          "label": "布局适配",
          "weight": 0.25,
          "measurement": "no_horizontal_overflow",
          "method": "playwright_overflow"
        },
        "mobile_nav": {
          "label": "移动端导航",
          "weight": 0.20,
          "measurement": "hamburger_menu_works",
          "method": "manual_walkthrough"
        },
        "input_usability": {
          "label": "输入可用性",
          "weight": 0.15,
          "measurement": "input_visible_after_keyboard_popup",
          "method": "playwright_visual"
        },
        "text_readability": {
          "label": "文字可读性",
          "weight": 0.15,
          "measurement": "min_font_size >= 14px_on_mobile",
          "method": "playwright_measurement"
        }
      }
    }
  },
  "component_map": {
    "src/components/ChatInput.vue": {
      "affected_dimensions": ["ux_flow.feedback_timeliness", "ux_flow.path_clarity", "responsive.input_usability", "responsive.touch_targets"],
      "severity": "high"
    },
    "src/components/Workspace.vue": {
      "affected_dimensions": ["ux_flow.path_clarity", "ux_flow.cognitive_load", "responsive.layout_adaptation", "responsive.mobile_nav"],
      "severity": "high"
    },
    "src/components/Sidebar.vue": {
      "affected_dimensions": ["responsive.mobile_nav", "responsive.layout_adaptation", "ux_flow.path_clarity"],
      "severity": "medium"
    },
    "src/App.vue": {
      "affected_dimensions": ["ux_flow.path_clarity", "responsive.layout_adaptation", "ux_flow.consistency"],
      "severity": "critical",
      "triggers_full_audit": true
    },
    "src/styles/main.css": {
      "affected_dimensions": ["visual_design.token_consistency", "visual_design.readability", "visual_design.dark_mode", "visual_design.visual_hierarchy"],
      "severity": "critical",
      "triggers_full_audit": true
    },
    "src/styles/variables.css": {
      "affected_dimensions": ["visual_design.token_consistency", "visual_design.dark_mode"],
      "severity": "critical",
      "triggers_full_audit": true
    }
  },
  "default_scoped_dimensions": ["ux_flow.feedback_timeliness", "ux_flow.path_clarity", "visual_design.token_consistency", "responsive.layout_adaptation"],
  "critical_files": ["src/App.vue", "src/styles/main.css", "src/styles/variables.css"]
}
```

### 3.3 Component Map（变更影响映射）

**文件**: `.claude/skills/setgoal/review-engine/component-map.json`

```json
{
  "version": "1.0.0",
  "description": "文件 → UX 维度影响映射，用于增量审查模式",
  "mappings": {
    "src/components/ChatInput.vue": {
      "affected_dimensions": [
        "ux_flow.feedback_timeliness",
        "ux_flow.path_clarity",
        "responsive.input_usability",
        "responsive.touch_targets"
      ],
      "related_components": ["Workspace.vue"],
      "interactions": ["send_message", "typing", "command_input"]
    },
    "src/components/Workspace.vue": {
      "affected_dimensions": [
        "ux_flow.path_clarity",
        "ux_flow.cognitive_load",
        "responsive.layout_adaptation",
        "responsive.mobile_nav"
      ],
      "related_components": ["Sidebar.vue", "ChatInput.vue"],
      "interactions": ["session_switch", "search", "sidebar_toggle"]
    },
    "src/components/Sidebar.vue": {
      "affected_dimensions": [
        "responsive.mobile_nav",
        "responsive.layout_adaptation",
        "ux_flow.path_clarity"
      ],
      "related_components": ["Workspace.vue"],
      "interactions": ["session_list", "search"]
    },
    "src/App.vue": {
      "affected_dimensions": [
        "ux_flow.path_clarity",
        "responsive.layout_adaptation",
        "ux_flow.consistency"
      ],
      "related_components": ["all"],
      "triggers_full_audit": true
    },
    "src/styles/main.css": {
      "affected_dimensions": [
        "visual_design.token_consistency",
        "visual_design.readability",
        "visual_design.dark_mode",
        "visual_design.visual_hierarchy"
      ],
      "related_components": ["all"],
      "triggers_full_audit": true
    },
    "src/styles/variables.css": {
      "affected_dimensions": [
        "visual_design.token_consistency",
        "visual_design.dark_mode"
      ],
      "related_components": ["all"],
      "triggers_full_audit": true
    }
  },
  "default_scoped_dimensions": [
    "ux_flow.feedback_timeliness",
    "ux_flow.path_clarity",
    "visual_design.token_consistency",
    "responsive.layout_adaptation"
  ],
  "critical_files": ["src/App.vue", "src/styles/main.css", "src/styles/variables.css"]
}
```

### 3.4 Output Schema（统一输出格式）

**文件**: `.claude/skills/setgoal/review-engine/output-schema.json`

```json
{
  "version": "1.0.0",
  "mode": "incremental | full",
  "timestamp": "ISO 8601",
  "duration_seconds": 45,
  "trigger": "git_push | manual | schedule | pr_comment",
  "changed_files": ["src/components/ChatInput.vue"],
  "scoped_dimensions": ["ux_flow.feedback_timeliness", ...],
  "scores": {
    "ux_flow": {
      "score": 72,
      "weight": 0.40,
      "sub_scores": {
        "path_clarity": 80,
        "feedback_timeliness": 60
      },
      "issues": [...]
    },
    "visual_design": {
      "score": 82,
      "weight": 0.30,
      "sub_scores": {...},
      "issues": [...]
    },
    "responsive": {
      "score": 75,
      "weight": 0.30,
      "sub_scores": {...},
      "issues": [...]
    }
  },
  "overall_score": 74,
  "verdict": "PASS | PARTIAL | FAIL",
  "regression": {
    "previous_score": 76,
    "delta": -2,
    "degraded_dimensions": ["feedback_timeliness"]
  },
  "top_issues": [...],
  "next_actions": [...]
}
```

---

## 四、执行后端：Local vs Remote

### 4.1 Local Execution（Claude Code）

**核心机制**: Subagent 并行执行

```javascript
// Lead Auditor 协调逻辑
const changedFiles = detectChanges() // git diff HEAD~1 --name-only
const scopedDimensions = mapDimensions(changedFiles) // 查 component-map.json
const relevantAuditors = selectAuditors(scopedDimensions) // 只调用相关专员

// 并行调用（单次消息中多个 Agent() 调用自动并行）
const [interactionResult, visualResult, responsiveResult] = await Promise.all([
  relevantAuditors.includes('interaction') ?
    Agent({ name: 'ux-interaction-auditor', prompt: buildPrompt('interaction', mode, changedFiles, scopedDimensions) }) :
    Promise.resolve(null),
  relevantAuditors.includes('visual') ?
    Agent({ name: 'ux-visual-auditor', prompt: buildPrompt('visual', mode, changedFiles, scopedDimensions) }) :
    Promise.resolve(null),
  relevantAuditors.includes('responsive') ?
    Agent({ name: 'ux-responsive-auditor', prompt: buildPrompt('responsive', mode, changedFiles, scopedDimensions) }) :
    Promise.resolve(null)
])

// 汇总结果
const aggregated = aggregateResults([interactionResult, visualResult, responsiveResult])
```

**优势**：
- 利用 Claude Code 的原生 subagent 能力
- 并行执行，时间 = 最慢的专员
- 每个专员有独立的上下文和专业知识

**限制**：
- 只能在 Claude Code 本地运行
- CI `--bare` 模式不支持

### 4.2 Remote Execution（CI）

**核心机制**: 纯 JavaScript 脚本实现相同逻辑

```javascript
// measure.mjs — 测量脚本
import { chromium } from 'playwright';

async function measureDimensions(dimensions, viewports) {
  const results = {};
  for (const dimension of dimensions) {
    results[dimension] = await measureDimension(dimension, viewports);
  }
  return results;
}

// score.mjs — 评分脚本（实现 Rubric 逻辑）
import rubric from './rubric.json';
import measurements from './measurements.json';

function scoreDimension(dimension, measurements) {
  const config = rubric.dimensions[dimension];
  let totalScore = 0;
  let totalWeight = 0;

  for (const [sub, config] of Object.entries(config.sub_dimensions)) {
    const score = evaluateSubDimension(sub, measurements[sub]);
    totalScore += score * config.weight;
    totalWeight += config.weight;
  }

  return totalScore / totalWeight;
}

// aggregate.mjs — 汇总脚本
import rubric from './rubric.json';
import scores from './scores.json';

function aggregate(scores) {
  let overall = 0;
  for (const [dim, config] of Object.entries(rubric.weights)) {
    overall += scores[dim] * config.weight;
  }
  return overall;
}
```

**优势**：
- 不依赖 Claude Code，纯 Node.js 可执行
- CI `--bare` 模式完全兼容
- 结果可预测、可版本化

**限制**：
- 测量能力受 Playwright API 限制（无法做复杂的人工走查）
- 评分逻辑需要预先编码到脚本中

### 4.3 关键设计：双后端一致性保证

```
┌─────────────────────────────────────────┐
│   Rubric Definition (rubric.json)       │
│   - WHAT to measure                     │
│   - HOW to score                        │
│   - WEIGHTS                             │
└─────────────────────────────────────────┘
           │                    │
           ▼                    ▼
┌──────────────────┐   ┌──────────────────┐
│ Local Backend    │   │ Remote Backend   │
│ (Subagents)      │   │ (Scripts)        │
│                  │   │                  │
│ Reads rubric.json│   │ Reads rubric.json│
│ Agent prompts    │   │ measure.mjs      │
│ include rubric   │   │ score.mjs        │
│ LLM judgment     │   │ Rule-based score │
│ + Playwright     │   │ + Playwright     │
└──────────────────┘   └──────────────────┘
           │                    │
           └──────────┬─────────┘
                      ▼
              ┌────────────────┐
              │ Same Output    │
              │ Format (JSON)  │
              └────────────────┘
```

**一致性保证**：
1. 同一份 `rubric.json` 被两个后端读取
2. 同一份 `output-schema.json` 定义输出格式
3. 评分结果可对比（即使计算方式略有差异）

---

## 五、审计专员定义（双后端）

### 5.1 Interaction Auditor

**Local（Subagent Prompt）**:
```markdown
---
name: ux-interaction-auditor
description: Mitosis 交互审计专员。评估用户体验流畅度、反馈即时性、路径清晰度、错误可恢复性。在 Lead Auditor 协调下并行执行。
model: sonnet
---

你是 Interaction Auditor。

## 审计范围
[Rubric 中 ux_flow 维度的完整定义...]

## 测量方法
1. Playwright: 打开页面，执行核心任务，测量 DOM 变化时间
2. 人工走查: [结构化步骤...]
3. 代码检查: [grep 模式...]

## 输出格式
[引用 output-schema.json]
```

**Remote（measure.mjs + score.mjs）**:
```javascript
// measure-interaction.mjs
export async function measureInteraction(page, dimensions) {
  const results = {};
  for (const dim of dimensions) {
    switch (dim) {
      case 'feedback_timeliness':
        results[dim] = await measureFeedbackTimeliness(page);
        break;
      case 'path_clarity':
        results[dim] = await measurePathClarity(page);
        break;
      // ...
    }
  }
  return results;
}

// score-interaction.mjs
export function scoreInteraction(measurements, rubric) {
  // 实现 rubric.json 中的评分逻辑
  const scores = {};
  for (const [sub, config] of Object.entries(rubric.dimensions.ux_flow.sub_dimensions)) {
    scores[sub] = evaluate(sub, measurements[sub], config);
  }
  return weightedAverage(scores, rubric.dimensions.ux_flow.sub_dimensions);
}
```

### 5.2 Visual Auditor

**同样的双后端结构**:
- Local: `ux-visual-auditor.md` subagent
- Remote: `measure-visual.mjs` + `score-visual.mjs`

### 5.3 Responsive Auditor

**同样的双后端结构**:
- Local: `ux-responsive-auditor.md` subagent
- Remote: `measure-responsive.mjs` + `score-responsive.mjs`

---

## 六、Lead Auditor 协调逻辑

### 6.1 增量模式流程

```
输入: mode="incremental", trigger="git_push"
    │
    ▼
┌──────────────────────────────────────────────┐
│ Lead Auditor                                 │
│                                              │
│ 1. 检测变更                                   │
│    git diff HEAD~1 --name-only               │
│    → changed_files: [ChatInput.vue]          │
│                                              │
│ 2. 读取 component-map.json                    │
│    对每个 changed_file，查 affected_dimensions │
│    → scoped_dimensions: [feedback_timeliness, │
│                          input_usability,     │
│                          touch_targets]       │
│                                              │
│ 3. 选择相关审计专员                            │
│    feedback_timeliness → interaction-auditor  │
│    input_usability → responsive-auditor       │
│    touch_targets → responsive-auditor         │
│    → 需要 2 个专员（去重）                     │
│                                              │
│ 4. 并行调用（本地）或 并行执行（远程）           │
│    [并行执行审计任务]                          │
│                                              │
│ 5. 汇总结果                                   │
│    → 只计算 scoped_dimensions 的分数           │
│    → 未审查维度标记为 "not_reviewed"           │
│    → 输出 partial report                      │
│                                              │
│ 6. 判断是否建议全量                            │
│    if (any score < threshold || critical_file) │
│      → recommendation: "建议运行全量审查"      │
└──────────────────────────────────────────────┘
```

### 6.2 全量模式流程

```
输入: mode="full", trigger="manual"
    │
    ▼
┌──────────────────────────────────────────────┐
│ Lead Auditor                                 │
│                                              │
│ 1. 所有维度全量测量                            │
│    → 3 个专员并行执行                          │
│                                              │
│ 2. 完整评分                                   │
│    → 计算所有维度的加权分数                     │
│                                              │
│ 3. 回归检测                                   │
│    读取 .claude/memory/ux-rubric-history.md  │
│    对比上次全量评分                            │
│    → delta, degraded_dimensions               │
│                                              │
│ 4. 优先级排序                                 │
│    → top_issues: severity × impact            │
│                                              │
│ 5. 输出完整报告                               │
└──────────────────────────────────────────────┘
```

### 6.3 Lead Auditor 输出示例

```json
{
  "mode": "incremental",
  "timestamp": "2026-06-28T10:00:00Z",
  "duration_seconds": 35,
  "trigger": "git_push",
  "changed_files": ["src/components/ChatInput.vue"],
  "scoped_dimensions": ["ux_flow.feedback_timeliness", "responsive.input_usability", "responsive.touch_targets"],
  "scores": {
    "ux_flow.feedback_timeliness": {
      "score": 60,
      "weight": 0.20,
      "evidence": ["/create 触发后聊天区域无即时反馈", "侧边栏状态更新延迟 2s"],
      "issues": [
        {
          "criterion": "build_progress_feedback",
          "severity": "high",
          "finding": "发送 /create 后聊天区域完全静止",
          "suggestion": "触发后立即插入系统消息 + 进度条",
          "location": "Workspace.vue:handleSend"
        }
      ]
    },
    "responsive.input_usability": {
      "score": 85,
      "weight": 0.15,
      "evidence": ["移动端输入框可见", "键盘弹出后仍可输入"],
      "issues": []
    },
    "responsive.touch_targets": {
      "score": 90,
      "weight": 0.25,
      "evidence": ["所有按钮 >= 44x44px", "发送按钮 48x48px"],
      "issues": []
    }
  },
  "overall_score": 74,
  "unreviewed_dimensions": ["visual_design.*", "responsive.mobile_nav", ...],
  "verdict": "PARTIAL",
  "recommendation": "建议运行全量审查以获取完整评分",
  "next_actions": [
    "HIGH: 发送 /create 后聊天区域无即时反馈 → 插入系统消息",
    "建议: 运行 /ux-polish full 获取完整评分"
  ]
}
```

---

## 七、与 setgoal 的集成

### 7.1 Phase C 增强

更新 `.claude/skills/setgoal/references/phase-verify.md`:

```markdown
## Phase C: 验证结果

### C1: 安全审计（强制）
[现有流程...]

### C2: 功能验收（强制）
[现有流程...]

### C3: UX 审查（可选）
当 goal.md 包含 `ux_polish: true` 时执行：

#### C3.1 检测模式
- 默认: 增量模式（仅审查变更文件影响的维度）
- 手动触发: 全量模式（/ux-polish full）

#### C3.2 执行审查
```bash
# 本地模式
bash .claude/skills/setgoal/verifiers/ux-review.sh --mode incremental

# 或调用 Lead Auditor subagent
Agent(name: "ux-lead-auditor", prompt: "...")
```

#### C3.3 判定
- score ≥ 85 → PASS，继续归档
- 70 ≤ score < 85 → PARTIAL，建议迭代，不阻塞
- score < 70 → FAIL，创建 UX 任务

#### C3.4 更新 State
```json
{
  "ux_review": {
    "mode": "incremental",
    "score": 74,
    "verdict": "PARTIAL",
    "timestamp": "2026-06-28T10:00:00Z"
  }
}
```
```

### 7.2 goal.md 配置

```yaml
# goal.md 顶部添加
ux_polish: true
ux_mode: incremental
ux_threshold: 85
ux_full_interval: weekly
```

---

## 八、CI 集成

### 8.1 GitHub Actions Workflow

**文件**: `.github/workflows/ux-check.yml`

```yaml
name: UX Check
on:
  issue_comment:
    types: [created]
  schedule:
    - cron: '0 10 * * 5'  # 每周五全量
  workflow_dispatch:
    inputs:
      mode:
        description: '审查模式'
        required: true
        default: 'incremental'
        type: choice
        options: ['incremental', 'full']

jobs:
  ux-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 18

      - name: Install
        run: npm ci

      - name: Build
        run: npm run build

      - name: Detect Mode
        id: mode
        run: |
          BODY="${{ github.event.comment.body }}"
          if [[ "$BODY" == *"/ux-check full"* ]]; then
            echo "mode=full" >> $GITHUB_OUTPUT
          elif [[ "$BODY" == *"/ux-check"* ]]; then
            echo "mode=incremental" >> $GITHUB_OUTPUT
          elif [[ "${{ github.event_name }}" == "schedule" ]]; then
            echo "mode=full" >> $GITHUB_OUTPUT
          else
            echo "mode=${{ github.event.inputs.mode || 'incremental' }}" >> $GITHUB_OUTPUT
          fi

      - name: Get Changed Files
        id: changed
        if: steps.mode.outputs.mode == 'incremental'
        run: |
          if [ "${{ github.event_name }}" == "issue_comment" ]; then
            PR_NUMBER=$(gh pr view --json number -q .number)
            gh pr diff $PR_NUMBER --name-only > changed.txt
          else
            git diff HEAD~1 --name-only > changed.txt
          fi
          echo "files=$(cat changed.txt | tr '\n' ',')" >> $GITHUB_OUTPUT

      - name: Run UX Review
        run: |
          bash .claude/skills/setgoal/verifiers/ux-review.sh \
            --mode ${{ steps.mode.outputs.mode }} \
            $([ "${{ steps.mode.outputs.mode }}" == "incremental" ] && echo "--files ${{ steps.changed.outputs.files }}") \
            --output ux-report.json

      - name: Post Results
        if: github.event_name == 'issue_comment'
        run: |
          gh issue comment ${{ github.event.issue.number }} \
            --body-file ux-report.md

      - name: Upload Report
        uses: actions/upload-artifact@v4
        with:
          name: ux-report-${{ steps.mode.outputs.mode }}
          path: ux-report.md
```

### 8.2 ux-review.sh 入口脚本

```bash
#!/usr/bin/env bash
# .claude/skills/setgoal/verifiers/ux-review.sh
# UX 审查入口脚本 — 本地和远程共用逻辑

set -euo pipefail

MODE="${1:?Usage: ux-review.sh --mode <incremental|full> [--files <file1,file2>] [--output <path>]}"
FILES="${2:-}"
OUTPUT="${3:-ux-report.json}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REVIEW_ENGINE="$SCRIPT_DIR/../review-engine"

# 1. 读取 Rubric 定义
RUBRIC="$REVIEW_ENGINE/rubric.json"
if [[ ! -f "$RUBRIC" ]]; then
  echo "ERROR: rubric.json not found at $RUBRIC"
  exit 1
fi

# 2. 确定审查维度
if [[ "$MODE" == "full" ]]; then
  DIMENSIONS=$(jq -r '.dimensions | keys[]' "$RUBRIC" | tr '\n' ' ')
else
  # 增量模式：从 component-map 映射
  if [[ -n "$FILES" ]]; then
    DIMENSIONS=$(echo "$FILES" | tr ',' '\n' | while read -r file; do
      jq -r --arg file "$file" '.component_map[$file].affected_dimensions[]?' "$REVIEW_ENGINE/component-map.json" 2>/dev/null
    done | sort -u | tr '\n' ' ')
  fi
  # 如果映射失败，使用默认维度
  if [[ -z "$DIMENSIONS" ]]; then
    DIMENSIONS=$(jq -r '.default_scoped_dimensions[]' "$RUBRIC" | tr '\n' ' ')
  fi
fi

echo "[ux-review] Mode: $MODE"
echo "[ux-review] Dimensions: $DIMENSIONS"

# 3. 执行测量（Playwright 脚本）
node "$REVIEW_ENGINE/scripts/measure.mjs" \
  --dimensions $DIMENSIONS \
  --mode $MODE \
  --output measurements.json

# 4. 评分
node "$REVIEW_ENGINE/scripts/score.mjs" \
  --rubric "$RUBRIC" \
  --measurements measurements.json \
  --output scores.json

# 5. 汇总
node "$REVIEW_ENGINE/scripts/aggregate.mjs" \
  --scores scores.json \
  --rubric "$RUBRIC" \
  --mode $MODE \
  --output "$OUTPUT"

echo "[ux-review] Report saved to $OUTPUT"
```

---

## 九、双后端一致性保证

### 9.1 核心原则

**"同一份 Rubric，两个实现"**

| 组件 | Local (Subagents) | Remote (Scripts) | 一致性保证 |
|------|-------------------|------------------|-----------|
| Rubric 定义 | `rubric.json` | `rubric.json` | 同一文件，JSON schema 验证 |
| 评分逻辑 | LLM 读取 rubric + 判断 | `score.mjs` 实现规则 | 输出格式由 `output-schema.json` 约束 |
| 测量方法 | Playwright MCP | Playwright API | 同一 Playwright 版本，相同视口 |
| 输出格式 | JSON（Agent 返回） | JSON（文件写入） | `output-schema.json` 定义 |

### 9.2 验证策略

```bash
# 本地运行后，用脚本验证输出格式
node .claude/skills/setgoal/review-engine/scripts/validate-output.mjs \
  --schema output-schema.json \
  --input ux-report.json

# CI 中自动验证
- name: Validate UX Report
  run: |
    node .claude/skills/setgoal/review-engine/scripts/validate-output.mjs \
      --schema .claude/skills/setgoal/review-engine/output-schema.json \
      --input ux-report.json
```

---

## 十、实施路径

### Phase 1: 核心 Review Engine（1-2 天）

**目标**: 创建单源真理文件 + 基础测量脚本

**新增文件**:
- `.claude/skills/setgoal/review-engine/rubric.json`
- `.claude/skills/setgoal/review-engine/component-map.json`
- `.claude/skills/setgoal/review-engine/output-schema.json`
- `.claude/skills/setgoal/review-engine/scripts/measure.mjs`
- `.claude/skills/setgoal/review-engine/scripts/score.mjs`

**不修改任何现有文件**

### Phase 2: Local Subagents（1-2 天）

**目标**: 创建 4 个审计专员 Agent 定义

**新增文件**:
- `.claude/agents/ux-lead-auditor.md`
- `.claude/agents/ux-interaction-auditor.md`
- `.claude/agents/ux-visual-auditor.md`
- `.claude/agents/ux-responsive-auditor.md`

**不修改任何现有文件**

### Phase 3: Remote Scripts（2-3 天）

**目标**: 实现 CI 可执行的测量 + 评分脚本

**新增文件**:
- `.claude/skills/setgoal/review-engine/scripts/measure.mjs`
- `.claude/skills/setgoal/review-engine/scripts/score.mjs`
- `.claude/skills/setgoal/review-engine/scripts/aggregate.mjs`
- `.claude/skills/setgoal/verifiers/ux-review.sh`
- `.github/workflows/ux-check.yml`

**不修改任何现有文件**

### Phase 4: 集成与测试（1-2 天）

**目标**: 本地和远程都能跑完整流程

**测试清单**:
- [ ] 本地增量模式: `/ux-polish` → 3 个专员并行 → 输出 JSON
- [ ] 本地全量模式: `/ux-polish full` → 3 个专员并行 → 输出 JSON + 回归检测
- [ ] CI 增量模式: PR 评论 `/ux-check` → 脚本执行 → 输出报告
- [ ] CI 全量模式: `/ux-check full` → 脚本执行 → 输出完整报告
- [ ] 输出格式验证: 本地和远程输出符合 `output-schema.json`
- [ ] Rubric 一致性: 同一份代码，本地和远程分数偏差 < 10%

### Phase 5: 文档同步（1 天）

**目标**: 更新所有文档使其与当前代码库同步

**需要更新的文档**:
1. `docs/architecture.md` — 添加 platform vs app 验证路径
2. `docs/agent-loop.md` — 添加 platform build 路径 + UX 审查循环
3. `.claude/agents/verifier.md` — 添加 golden-paths.sh 引用，更新 Phase 1 描述
4. `.claude/skills/setgoal/SKILL.md` — 添加 UX 审查步骤引用
5. `.claude/skills/setgoal/references/phase-verify.md` — 添加 C3: UX 审查
6. `docs/product/chat-session-design.md` — 添加 sidebar UX 改进（分组、搜索、聚类）
7. `docs/goals/README.md` — 添加 verifier 脚本引用

---

## 十一、关键设计决策总结

| 决策 | 选择 | 理由 |
|------|------|------|
| Review Engine 架构 | **单源真理 + 双后端** | 保证本地和远程使用同一套评价标准 |
| Rubric 存储 | **JSON 文件** | 可被 JSON Schema 验证，可被脚本读取，可被 Agent 引用 |
| 本地执行 | **Subagents 并行** | 利用 Claude Code 原生能力，每个专员有独立上下文 |
| 远程执行 | **纯 JS 脚本** | CI `--bare` 兼容，不依赖 Claude Code |
| 输出格式 | **统一 JSON Schema** | 保证双后端输出一致性，可被 setgoal Phase C 消费 |
| 增量模式 | **默认** | 快（30-60s），便宜，日常可用 |
| 全量模式 | **定期/手动** | 慢（3-5min），全面体检 + 回归检测 |
| 审计专员数量 | **3 个** | 交互+视觉+响应式覆盖核心 UX 维度，再多增加协调开销 |
| 评分阈值 | **85 通过，70 建议迭代** | 留出打磨空间，不卡死流程 |
| 与 setgoal 集成 | **Phase C 可选步骤** | 不强制，goal.md 配置开关 |

---

## 十二、与行业最佳实践对齐

### 12.1 Anthropic 的 Agent 模式

根据 Anthropic 的 "Building Effective Agents" 研究：

| 最佳实践 | Mitosis 实现 |
|----------|--------------|
| **Orchestrator-Workers** | Lead Auditor + 3 个审计专员 |
| **Sectioning（并行）** | Promise.all() 并行调用专员 |
| **Evaluator-Optimizer Loop** | build → measure → feedback → iterate |
| **Environmental Feedback** | Playwright 测量提供客观数据 |
| **Sandboxed Testing** | Playwright headless + mock data |

### 12.2 Playwright 最佳实践

根据 Playwright 官方文档：

| 最佳实践 | Mitosis 实现 |
|----------|--------------|
| **Golden Files** | measurements.json 作为基线 |
| **Tolerance** | 评分偏差容忍度（本地 vs 远程 < 10%） |
| **Dynamic Suppression** | mock data 隐藏 volatile 元素 |
| **Consistent Environment** | 同一 Playwright 版本，相同视口 |

### 12.3 CI/CD UX Testing

根据行业实践：

| 最佳实践 | Mitosis 实现 |
|----------|--------------|
| **Hybrid Strategy** | 增量（per PR）+ 全量（weekly） |
| **Baseline in VCS** | rubric.json + component-map.json 版本化 |
| **Fail Fast** | 增量模式 30-60s，快速反馈 |
| **Human Review** | 全量报告人工审查 |

---

## 十三、成功指标

### 13.1 技术指标

| 指标 | 目标 | 测量方法 |
|------|------|----------|
| 本地增量审查时间 | < 60s | Playwright timing |
| 本地全量审查时间 | < 5min | Playwright timing |
| CI 增量审查时间 | < 2min | GitHub Actions timing |
| 双后端分数偏差 | < 10% | 对比本地/远程输出 |
| Rubric 覆盖率 | 100% | 所有维度有测量方法 |

### 13.2 产品指标

| 指标 | 目标 | 测量方法 |
|------|------|----------|
| UX Rubric 分数 | ≥ 85 | 全量审查 |
| 功能验收通过率 | 100% | mvp-verifier |
| 回归检测准确率 | > 90% | 对比历史评分 |
| 审查覆盖率 | 每次提交 | git hook / CI |

---

## 十四、总结

### 核心创新

1. **单源真理**: `rubric.json` 定义 WHAT + HOW + WEIGHTS，两个后端实现
2. **双模式**: 增量（快）+ 全量（全），自动切换
3. **并行审计**: 3 个专员同时工作，时间 = 最慢的那个
4. **统一输出**: 本地和远程输出相同格式，可对比、可追踪
5. **回归检测**: 全量模式自动对比历史评分，发现退化

### 与现有系统关系

```
现有系统（保持不变）:
  setgoal loop → mvp-verifier → PASS/FAIL → 归档/修复

新增系统（可选启用）:
  setgoal loop → mvp-verifier → PASS → UX Review Engine
                                      → 增量/全量 → 评分 → 建议 → 迭代
```

### 下一步行动

1. **立即**: 创建 `review-engine/` 核心文件（rubric.json, component-map.json）
2. **本周**: 创建 4 个审计专员 Agent 定义
3. **下周**: 实现 CI 脚本 + GitHub Actions workflow
4. **持续**: 迭代 Rubric，根据实际测量结果调整权重和阈值
