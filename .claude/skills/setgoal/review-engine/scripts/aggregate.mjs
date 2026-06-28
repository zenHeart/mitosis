#!/usr/bin/env node
/**
 * UX Review Engine — Aggregation Script
 *
 * 合并多个审计专员的输出，解决冲突，生成最终报告。
 * 本地和远程 CI 均可执行。
 *
 * 用法:
 *   node aggregate.mjs --inputs auditor1.json auditor2.json auditor3.json --output report.json
 *   node aggregate.mjs --inputs scores.json --output report.json  # 单文件聚合（score.mjs 输出）
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RUBRIC_PATH = resolve(__dirname, '../rubric.json')

// ─── CLI 参数解析 ─────────────────────────────────────────────

const args = process.argv.slice(2)
const params = {
  inputs: [],
  output: 'report.json',
  mode: 'incremental'
}

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '--inputs':
      while (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        params.inputs.push(args[++i])
      }
      break
    case '--output':
      params.output = args[++i]
      break
    case '--mode':
      params.mode = args[++i]
      break
  }
}

if (params.inputs.length === 0) {
  console.error('[aggregate] ERROR: --inputs <file1> <file2> ... required')
  process.exit(1)
}

// ─── 读取输入 ─────────────────────────────────────────────────

let rubric = {}
let inputs = []

try {
  rubric = JSON.parse(readFileSync(RUBRIC_PATH, 'utf-8'))
} catch (e) {
  console.error(`[aggregate] ERROR: Cannot read rubric.json: ${e.message}`)
  process.exit(1)
}

for (const file of params.inputs) {
  try {
    const data = JSON.parse(readFileSync(file, 'utf-8'))
    inputs.push(data)
    console.log(`[aggregate] Loaded: ${file}`)
  } catch (e) {
    console.error(`[aggregate] ERROR: Cannot read ${file}: ${e.message}`)
    process.exit(1)
  }
}

// ─── 聚合逻辑 ─────────────────────────────────────────────────

function aggregateResults(inputs) {
  // 如果是单文件输入（来自 score.mjs），直接包装
  if (inputs.length === 1 && inputs[0].overall_score !== undefined) {
    return formatReport(inputs[0])
  }

  // 多文件输入（来自多个审计专员）
  const report = {
    mode: params.mode,
    timestamp: new Date().toISOString(),
    duration_seconds: inputs.reduce((sum, i) => sum + (i.duration_seconds || 0), 0),
    trigger: inputs[0]?.trigger || 'manual',
    changed_files: inputs[0]?.changed_files || [],
    scoped_dimensions: inputs[0]?.scoped_dimensions || [],
    scores: {},
    overall_score: null,
    unreviewed_dimensions: [],
    verdict: 'PARTIAL',
    recommendation: null,
    next_actions: []
  }

  const allIssues = []
  let totalWeightedScore = 0
  let totalWeight = 0

  // 聚合每个维度
  for (const [dimName, dimConfig] of Object.entries(rubric.dimensions)) {
    const dimResults = inputs.filter(i => i.scores?.[dimName])
    const dimIssues = []
    const subScores = {}

    if (dimResults.length === 0) {
      // 该维度未被任何专员覆盖
      report.unreviewed_dimensions.push(dimName)
      continue
    }

    // 合并子维度分数
    for (const subName of Object.keys(dimConfig.sub_dimensions)) {
      const scores = dimResults
        .map(r => r.scores?.[dimName]?.sub_scores?.[subName])
        .filter(s => s !== undefined && s !== null)

      if (scores.length === 0) {
        subScores[subName] = null
      } else {
        // 取最保守的分数（最低）
        subScores[subName] = Math.min(...scores)
      }
    }

    // 收集问题
    for (const result of dimResults) {
      if (result.scores?.[dimName]?.issues) {
        dimIssues.push(...result.scores[dimName].issues)
      }
    }

    // 去重问题
    const dedupedIssues = deduplicateIssues(dimIssues)

    // 计算维度总分
    let dimWeightedScore = 0
    let dimWeight = 0
    for (const [subName, subConfig] of Object.entries(dimConfig.sub_dimensions)) {
      if (subScores[subName] !== null) {
        dimWeightedScore += subScores[subName] * subConfig.weight
        dimWeight += subConfig.weight
      }
    }

    const dimScore = dimWeight > 0 ? Math.round(dimWeightedScore / dimWeight) : null

    report.scores[dimName] = {
      score: dimScore,
      weight: dimConfig.weight,
      sub_scores: subScores,
      issues: dedupedIssues.slice(0, rubric.max_issues_per_dimension || 10),
      unreviewed: Object.entries(subScores)
        .filter(([_, s]) => s === null)
        .map(([name, _]) => name)
    }

    // 计算 overall
    if (dimScore !== null) {
      totalWeightedScore += dimScore * dimConfig.weight
      totalWeight += dimConfig.weight
    }

    allIssues.push(...dedupedIssues)
  }

  // 计算 overall score
  report.overall_score = totalWeight > 0 ? Math.round(totalWeightedScore / totalWeight) : null

  // 确定 verdict
  if (report.unreviewed_dimensions.length > 0) {
    report.verdict = 'PARTIAL'
    report.recommendation = `未审查维度: ${report.unreviewed_dimensions.join(', ')}。建议运行全量审查。`
  } else if (report.overall_score >= rubric.thresholds.pass) {
    report.verdict = 'PASS'
    report.recommendation = null
  } else if (report.overall_score >= rubric.thresholds.partial) {
    report.verdict = 'PARTIAL'
    report.recommendation = '部分维度未达标，建议针对性优化'
  } else {
    report.verdict = 'FAIL'
    report.recommendation = '多个维度严重不足，建议优先处理高优先级问题'
  }

  // 优先级排序问题
  report.next_actions = prioritizeIssues(allIssues)
    .slice(0, rubric.max_issues_total || 10)
    .map(issue => `[${issue.severity.toUpperCase()}] ${issue.finding} → ${issue.suggestion}`)

  return report
}

function formatReport(scores) {
  // 将 score.mjs 输出转换为完整报告格式
  return {
    mode: scores.mode,
    timestamp: scores.timestamp,
    changed_files: scores.changed_files || [],
    scoped_dimensions: scores.scoped_dimensions || [],
    scores: Object.fromEntries(
      Object.entries(scores).filter(([k]) => rubric.dimensions[k])
    ),
    overall_score: scores.overall_score,
    verdict: scores.verdict,
    recommendation: scores.recommendation,
    next_actions: scores.next_actions || []
  }
}

// ─── 问题去重 ─────────────────────────────────────────────────

function deduplicateIssues(issues) {
  const grouped = {}

  for (const issue of issues) {
    const key = `${issue.location?.file || 'unknown'}:${issue.location?.line || '?'}`

    if (!grouped[key]) {
      grouped[key] = { ...issue, auditors: [issue.auditor || 'unknown'] }
    } else {
      // 合并 auditor 标签
      if (issue.auditor && !grouped[key].auditors.includes(issue.auditor)) {
        grouped[key].auditors.push(issue.auditor)
      }

      // 取最高严重度
      const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 }
      if (severityOrder[issue.severity] > severityOrder[grouped[key].severity]) {
        grouped[key].severity = issue.severity
      }

      // 合并建议
      if (issue.suggestion && !grouped[key].suggestion?.includes(issue.suggestion)) {
        grouped[key].suggestion = grouped[key].suggestion
          ? `${grouped[key].suggestion}; ${issue.suggestion}`
          : issue.suggestion
      }
    }
  }

  return Object.values(grouped).sort((a, b) => {
    const order = { critical: 4, high: 3, medium: 2, low: 1 }
    return (order[b.severity] || 0) - (order[a.severity] || 0)
  })
}

// ─── 优先级排序 ─────────────────────────────────────────────────

function prioritizeIssues(issues) {
  const severityWeight = { critical: 4, high: 3, medium: 2, low: 1 }
  const effortWeight = { trivial: 1, small: 2, medium: 3, large: 4 }

  return issues
    .map(issue => ({
      ...issue,
      priority_score: (severityWeight[issue.severity] || 2) * 10 - (effortWeight[issue.estimated_effort] || 2)
    }))
    .sort((a, b) => b.priority_score - a.priority_score)
}

// ─── 主流程 ─────────────────────────────────────────────────

function main() {
  console.log(`[aggregate] Aggregating ${params.inputs.length} inputs...`)

  const report = aggregateResults(inputs)

  writeFileSync(params.output, JSON.stringify(report, null, 2))
  console.log(`[aggregate] Report saved to ${params.output}`)
  console.log(`[aggregate] Overall score: ${report.overall_score ?? 'N/A'}/100 (${report.verdict})`)

  if (report.unreviewed_dimensions?.length > 0) {
    console.log(`[aggregate] Unreviewed: ${report.unreviewed_dimensions.join(', ')}`)
  }

  if (report.next_actions?.length > 0) {
    console.log(`[aggregate] Top actions:`)
    report.next_actions.forEach(action => console.log(`  ${action}`))
  }

  // 返回退出码：PARTIAL/FAIL 返回 1，PASS 返回 0
  if (report.verdict === 'PASS') {
    process.exit(0)
  } else {
    process.exit(1)
  }
}

main().catch(e => {
  console.error(`[aggregate] Fatal error: ${e.message}`)
  process.exit(1)
})
