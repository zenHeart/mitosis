#!/usr/bin/env node
/**
 * UX Review Engine — Scoring Script
 *
 * 将测量结果对照 Rubric 评分标准打分。
 * 本地和远程 CI 均可执行。
 *
 * 用法:
 *   node score.mjs --measurements measurements.json --output scores.json
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RUBRIC_PATH = resolve(__dirname, '../rubric.json')

// ─── CLI 参数解析 ─────────────────────────────────────────────

const args = process.argv.slice(2)
const params = {
  measurements: null,
  output: 'scores.json'
}

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '--measurements':
      params.measurements = args[++i]
      break
    case '--output':
      params.output = args[++i]
      break
  }
}

if (!params.measurements) {
  console.error('[score] ERROR: --measurements <file> required')
  process.exit(1)
}

// ─── 读取输入 ─────────────────────────────────────────────────

let rubric = {}
let measurements = {}

try {
  rubric = JSON.parse(readFileSync(RUBRIC_PATH, 'utf-8'))
} catch (e) {
  console.error(`[score] ERROR: Cannot read rubric.json: ${e.message}`)
  process.exit(1)
}

try {
  measurements = JSON.parse(readFileSync(params.measurements, 'utf-8'))
} catch (e) {
  console.error(`[score] ERROR: Cannot read measurements: ${e.message}`)
  process.exit(1)
}

// ─── 评分逻辑 ─────────────────────────────────────────────────

function scoreDimension(dimName, dimConfig, dimMeasurements) {
  const subScores = {}
  const issues = []
  let totalWeightedScore = 0
  let totalWeight = 0

  for (const [subName, subConfig] of Object.entries(dimConfig.sub_dimensions)) {
    const measurement = dimMeasurements[subName]

    if (!measurement) {
      // 未测量
      subScores[subName] = null
      continue
    }

    let score = null
    const issue = {
      criterion: subName,
      severity: 'medium',
      finding: '',
      suggestion: '',
      location: null,
      estimated_effort: 'small'
    }

    if (measurement.requires_manual_review) {
      // 需要人工审查的维度，标记为未评分
      score = null
      issue.finding = `需要人工审查: ${measurement.evidence?.join(', ') || '无测量结果'}`
    } else if (typeof measurement.score === 'number') {
      // 已评分
      score = measurement.score
      if (measurement.issues && measurement.issues.length > 0) {
        issues.push(...measurement.issues.map(i => ({
          ...i,
          dimension: dimName,
          sub_dimension: subName,
          location: i.location || { file: 'unknown', line: 0 }
        })))
      }
    } else if (typeof measurement.value === 'number') {
      // 根据数值评分（用于对比度、延迟等）
      score = scoreByValue(subName, measurement.value, subConfig)
      if (measurement.issues) {
        issues.push(...measurement.issues.map(i => ({
          ...i,
          dimension: dimName,
          sub_dimension: subName
        })))
      }
    } else {
      // 其他情况
      score = null
      issue.finding = `无法自动评分: ${measurement.value}`
    }

    subScores[subName] = score

    // 计算加权分数（只计算已评分的维度）
    if (score !== null) {
      totalWeightedScore += score * subConfig.weight
      totalWeight += subConfig.weight
    }
  }

  // 计算维度总分
  const dimensionScore = totalWeight > 0 ? Math.round(totalWeightedScore / totalWeight) : null

  return {
    score: dimensionScore,
    weight: dimConfig.weight,
    sub_scores: subScores,
    issues: issues.slice(0, rubric.max_issues_per_dimension || 10),
    unreviewed: Object.entries(subScores)
      .filter(([_, s]) => s === null)
      .map(([name, _]) => name)
  }
}

function scoreByValue(subDimension, value, subConfig) {
  // 根据评分标准中的 thresholds 评分
  const thresholds = subConfig.thresholds

  if (!thresholds) {
    // 默认评分逻辑
    return 70
  }

  // 检查是否满足优秀阈值
  if (thresholds.excellent && value >= thresholds.excellent) {
    return 100
  }
  // 检查是否满足良好阈值
  if (thresholds.good && value >= thresholds.good) {
    return 80
  }
  // 检查是否满足及格阈值
  if (thresholds.pass && value >= thresholds.pass) {
    return 60
  }
  // 不及格
  return 40
}

// ─── 主流程 ─────────────────────────────────────────────────

function main() {
  console.log(`[score] Mode: ${measurements.mode}`)

  const scores = {
    mode: measurements.mode,
    timestamp: new Date().toISOString(),
    changed_files: measurements.changed_files || [],
    scoped_dimensions: measurements.scoped_dimensions || []
  }

  let overallWeightedScore = 0
  let overallWeight = 0
  const allIssues = []

  for (const [dimName, dimConfig] of Object.entries(rubric.dimensions)) {
    const dimMeasurements = measurements.dimensions?.[dimName] || {}

    const result = scoreDimension(dimName, dimConfig, dimMeasurements)
    scores[dimName] = result

    // 收集所有问题
    allIssues.push(...result.issues)

    // 计算 overall score
    if (result.score !== null) {
      overallWeightedScore += result.score * dimConfig.weight
      overallWeight += dimConfig.weight
    }

    console.log(`  ${dimName}: ${result.score ?? 'N/A'}/100 (${result.unreviewed.length > 0 ? `${result.unreviewed.length} unreviewed` : 'reviewed'})`)
  }

  // 计算总体分数
  scores.overall_score = overallWeight > 0 ? Math.round(overallWeightedScore / overallWeight) : null

  // 确定 verdict
  if (scores.overall_score === null) {
    scores.verdict = 'PARTIAL'
    scores.recommendation = '存在未审查的维度，建议运行全量审查以获取完整评分'
  } else if (scores.overall_score >= rubric.thresholds.pass) {
    scores.verdict = 'PASS'
    scores.recommendation = null
  } else if (scores.overall_score >= rubric.thresholds.partial) {
    scores.verdict = 'PARTIAL'
    scores.recommendation = '部分维度未达标，建议针对性优化'
  } else {
    scores.verdict = 'FAIL'
    scores.recommendation = '多个维度严重不足，建议优先处理高优先级问题'
  }

  // 添加 next_actions（按严重度排序）
  scores.next_actions = allIssues
    .sort((a, b) => {
      const order = { critical: 4, high: 3, medium: 2, low: 1 }
      return (order[b.severity] || 0) - (order[a.severity] || 0)
    })
    .slice(0, rubric.max_issues_total || 10)
    .map(issue => `[${issue.severity.toUpperCase()}] ${issue.finding} → ${issue.suggestion}`)

  // 保存结果
  writeFileSync(params.output, JSON.stringify(scores, null, 2))
  console.log(`\n[score] Overall: ${scores.overall_score ?? 'N/A'}/100 (${scores.verdict})`)
  console.log(`[score] Results saved to ${params.output}`)

  // 输出优先级问题
  if (scores.next_actions.length > 0) {
    console.log('\n[score] Top issues:')
    scores.next_actions.forEach(action => console.log(`  ${action}`))
  }
}

main().catch(e => {
  console.error(`[score] Fatal error: ${e.message}`)
  process.exit(1)
})
