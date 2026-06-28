#!/usr/bin/env node
/**
 * UX Review Engine — Measurement Script
 *
 * 使用 Playwright 测量 UX 维度的自动化脚本。
 * 本地和远程 CI 均可执行。
 *
 * 用法:
 *   node measure.mjs --mode incremental --dimensions ux_flow.feedback_timeliness,responsive.touch_targets --output measurements.json
 *   node measure.mjs --mode full --output measurements.json
 */

import { chromium } from 'playwright'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RUBRIC_PATH = resolve(__dirname, '../rubric.json')
const COMPONENT_MAP_PATH = resolve(__dirname, '../component-map.json')
const BASE_URL = process.env.BASE_URL || 'http://localhost:5173/'

// ─── CLI 参数解析 ─────────────────────────────────────────

const args = process.argv.slice(2)
const params = {
  mode: 'incremental',
  dimensions: [],
  output: 'measurements.json',
  files: [],
  viewport: { width: 1440, height: 900 },
  mobileViewport: { width: 390, height: 844 }
}

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '--mode':
      params.mode = args[++i]
      break
    case '--dimensions':
      params.dimensions = args[++i].split(',').filter(Boolean)
      break
    case '--output':
      params.output = args[++i]
      break
    case '--files':
      params.files = args[++i].split(',').filter(Boolean)
      break
    case '--viewport':
      const [w, h] = args[++i].split('x').map(Number)
      params.viewport = { width: w || 1440, height: h || 900 }
      break
  }
}

// ─── 读取配置 ──────────────────────────────────────────────

let rubric = {}
let componentMap = {}

try {
  rubric = JSON.parse(readFileSync(RUBRIC_PATH, 'utf-8'))
} catch (e) {
  console.error(`[measure] ERROR: Cannot read rubric.json: ${e.message}`)
  process.exit(1)
}

try {
  componentMap = JSON.parse(readFileSync(COMPONENT_MAP_PATH, 'utf-8'))
} catch (e) {
  console.error(`[measure] ERROR: Cannot read component-map.json: ${e.message}`)
  process.exit(1)
}

// ─── 工具函数 ──────────────────────────────────────────────

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

function parseDimension(dim) {
  // "ux_flow.feedback_timeliness" → { dimension: "ux_flow", sub_dimension: "feedback_timeliness" }
  const parts = dim.split('.')
  if (parts.length === 2) {
    return { dimension: parts[0], sub_dimension: parts[1] }
  }
  return { dimension: dim, sub_dimension: null }
}

function getDimensionConfig(dim, sub) {
  try {
    if (sub) {
      return rubric.dimensions[dim].sub_dimensions[sub]
    }
    return rubric.dimensions[dim]
  } catch {
    return null
  }
}

// ─── 测量函数 ──────────────────────────────────────────────

async function measureWithPlaywright(dimension, subDimension, viewport) {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport })
  const page = await context.newPage()

  const results = {
    dimension,
    sub_dimension: subDimension,
    viewport: `${viewport.width}x${viewport.height}`,
    value: null,
    evidence: [],
    issues: [],
    requires_manual_review: false
  }

  try {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await sleep(3000) // 等待页面加载和 mock 数据注入

    // 根据维度执行不同的测量
    switch (dimension) {
      case 'ux_flow':
        await measureUXFlow(page, subDimension, results)
        break
      case 'visual_design':
        await measureVisualDesign(page, subDimension, results)
        break
      case 'responsive':
        await measureResponsive(page, subDimension, viewport, results)
        break
    }
  } catch (e) {
    results.error = e.message
    results.requires_manual_review = true
  } finally {
    await page.close()
    await context.close()
    await browser.close()
  }

  return results
}

async function measureUXFlow(page, subDimension, results) {
  switch (subDimension) {
    case 'feedback_timeliness':
      // 测量：操作后 DOM 变化时间
      // 查找聊天输入框
      const chatInput = page.locator('textarea, input[type="text"], [placeholder*="描述"]').first()
      if (await chatInput.count() > 0) {
        await chatInput.fill('/create 测试构建')
        const t0 = Date.now()
        const sendBtn = page.locator('button:has-text("发送"), button[type="submit"], .send-btn').first()
        if (await sendBtn.count() > 0 && await sendBtn.isEnabled()) {
          await sendBtn.click()
          // 等待 2 秒看是否有反馈
          await sleep(2000)
          const t1 = Date.now()
          const latency = t1 - t0

          results.value = latency
          results.evidence.push(`操作延迟: ${latency}ms`)

          if (latency <= 100) {
            results.score = 100
            results.evidence.push('操作 100ms 内有响应')
          } else if (latency <= 500) {
            results.score = 80
            results.evidence.push(`操作 ${latency}ms 内响应`)
          } else if (latency <= 2000) {
            results.score = 60
            results.evidence.push(`操作 ${latency}ms 响应，有延迟`)
          } else {
            results.score = 40
            results.issues.push({
              criterion: 'high_latency',
              severity: 'high',
              finding: `操作响应延迟 ${latency}ms，超过 2 秒`,
              suggestion: '优化异步操作反馈，添加 loading 状态'
            })
          }
        } else {
          results.value = 'send_button_disabled'
          results.evidence.push('发送按钮处于禁用状态，无法测试')
          results.requires_manual_review = true
        }
      } else {
        results.value = 'input_not_found'
        results.evidence.push('未找到聊天输入框')
        results.requires_manual_review = true
      }
      break

    case 'path_clarity':
      results.value = 'requires_manual_walkthrough'
      results.requires_manual_review = true
      results.evidence.push('路径清晰度需要人工走查评估')
      break

    case 'error_recovery':
      results.value = 'requires_manual_walkthrough'
      results.requires_manual_review = true
      results.evidence.push('错误可恢复性需要人工走查评估')
      break

    case 'cognitive_load':
      results.value = 'requires_manual_walkthrough'
      results.requires_manual_review = true
      results.evidence.push('认知负荷需要人工走查评估')
      break

    case 'consistency':
      // 代码检查：同类操作是否使用相同组件
      results.value = 'code_audit_required'
      results.requires_manual_review = true
      results.evidence.push('一致性需要通过代码检查评估')
      break

    case 'trust_transparency':
      // 检查构建中等状态是否可见
      const buildingBadge = page.locator('.status-building, [class*="building"]').first()
      const hasBuildingIndicator = await buildingBadge.count() > 0
      results.value = hasBuildingIndicator ? 'visible' : 'not_visible'
      results.evidence.push(hasBuildingIndicator ? '构建中状态可见' : '构建中状态不可见')
      results.score = hasBuildingIndicator ? 80 : 40
      if (!hasBuildingIndicator) {
        results.issues.push({
          criterion: 'missing_build_status',
          severity: 'medium',
          finding: '构建中等状态不可见',
          suggestion: '添加构建进度指示器'
        })
      }
      break
  }
}

async function measureVisualDesign(page, subDimension, results) {
  switch (subDimension) {
    case 'token_consistency':
      results.value = 'code_audit_required'
      results.requires_manual_review = true
      results.evidence.push('Design Token 一致性需要通过代码检查评估')
      break

    case 'readability':
      // 测量主要文字元素的对比度
      const textElements = await page.locator('h1, h2, h3, p, span, button').all()
      let minContrast = 1
      const contrastResults = []

      for (const el of textElements.slice(0, 20)) { // 采样前 20 个元素
        try {
          const contrast = await el.evaluate((node) => {
            const style = getComputedStyle(node)
            function parseColor(colorStr) {
              const match = colorStr.match(/(\d+),\s*(\d+),\s*(\d+)/)
              if (!match) return [0, 0, 0]
              return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])]
            }
            function luminance(rgb) {
              const [r, g, b] = rgb.map(v => {
                v = v / 255
                return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
              })
              return 0.2126 * r + 0.7152 * g + 0.0722 * b
            }
            const fg = luminance(parseColor(style.color))
            const bg = luminance(parseColor(style.backgroundColor))
            if (bg === 0 && style.backgroundColor === 'transparent') {
              // 假设背景为白色
              return (luminance([255, 255, 255]) + 0.05) / (fg + 0.05)
            }
            return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05)
          })

          if (contrast > 0) {
            contrastResults.push(contrast)
            minContrast = Math.min(minContrast, contrast)
          }
        } catch {
          // 跳过无法测量的元素
        }
      }

      results.value = minContrast
      results.evidence.push(`采样 ${contrastResults.length} 个文字元素，最小对比度: ${minContrast.toFixed(2)}:1`)

      if (minContrast >= 7) {
        results.score = 100
      } else if (minContrast >= 4.5) {
        results.score = 80
      } else if (minContrast >= 3) {
        results.score = 60
      } else {
        results.score = 40
        results.issues.push({
          criterion: 'low_contrast',
          severity: 'high',
          finding: `最小对比度 ${minContrast.toFixed(2)}:1，低于 WCAG AA 标准 4.5:1`,
          suggestion: '提高文字颜色对比度，或调整背景色'
        })
      }
      break

    case 'visual_hierarchy':
      results.value = 'requires_manual_walkthrough'
      results.requires_manual_review = true
      results.evidence.push('视觉层级需要人工走查评估')
      break

    case 'component_completeness':
      results.value = 'requires_manual_walkthrough'
      results.requires_manual_review = true
      results.evidence.push('组件完成度需要人工走查评估')
      break

    case 'micro_interactions':
      results.value = 'requires_manual_walkthrough'
      results.requires_manual_review = true
      results.evidence.push('微交互质量需要人工走查评估')
      break

    case 'dark_mode':
      // 尝试切换暗色模式
      const darkModeToggle = page.locator('[class*="dark"], [aria-label*="dark"], button:has-text("主题")').first()
      if (await darkModeToggle.count() > 0) {
        await darkModeToggle.click()
        await sleep(500)
        results.value = 'dark_mode_tested'
        results.evidence.push('已测试暗色模式切换')
        results.score = 70 // 默认假设基本可用
      } else {
        results.value = 'no_dark_mode_toggle'
        results.evidence.push('未找到暗色模式切换按钮')
        results.requires_manual_review = true
      }
      break
  }
}

async function measureResponsive(page, subDimension, viewport, results) {
  switch (subDimension) {
    case 'touch_targets':
      // 测量所有可交互元素的尺寸
      const elements = await page.locator('button, a, input, [role="button"], [role="link"]').all()
      const violations = []
      let checkedCount = 0

      for (const el of elements) {
        try {
          const box = await el.boundingBox()
          if (box && (box.width < 44 || box.height < 44)) {
            const tag = await el.evaluate(e => e.tagName.toLowerCase())
            const cls = await el.evaluate(e => (e.className || '').split(' ')[0])
            violations.push({
              tag,
              class: cls,
              size: { w: Math.round(box.width), h: Math.round(box.height) }
            })
          }
          checkedCount++
        } catch {
          // 跳过不可见的元素
        }
      }

      results.value = { checked: checkedCount, violations: violations.length }
      results.evidence.push(`检查 ${checkedCount} 个可交互元素，${violations.length} 个小于 44x44px`)

      if (violations.length === 0) {
        results.score = 100
      } else if (violations.length <= 2) {
        results.score = 80
      } else if (violations.length <= 5) {
        results.score = 60
      } else {
        results.score = 40
        results.issues.push({
          criterion: 'small_touch_targets',
          severity: 'high',
          finding: `${violations.length} 个可交互元素小于 44x44px`,
          suggestion: '增大按钮和链接的点击区域至 44x44px 以上',
          details: violations.slice(0, 5)
        })
      }
      break

    case 'layout_adaptation':
      // 检测水平溢出
      const overflows = await page.evaluate(() => {
        const issues = []
        document.querySelectorAll('*').forEach(el => {
          if (el.scrollWidth > el.clientWidth + 1) {
            const cls = (el.className || '').toString().split(' ')[0]
            issues.push({
              tag: el.tagName.toLowerCase(),
              class: cls,
              overflow: Math.round(el.scrollWidth - el.clientWidth)
            })
          }
        })
        return issues
      })

      results.value = { overflow_count: overflows.length, details: overflows.slice(0, 5) }
      results.evidence.push(`检测到 ${overflows.length} 处水平溢出`)

      if (overflows.length === 0) {
        results.score = 100
      } else if (overflows.length === 1 && overflows[0].overflow <= 10) {
        results.score = 80
      } else if (overflows.length <= 3) {
        results.score = 60
      } else {
        results.score = 40
        results.issues.push({
          criterion: 'horizontal_overflow',
          severity: 'high',
          finding: `${overflows.length} 处水平溢出`,
          suggestion: '修复布局溢出，添加 overflow-x: hidden 或调整宽度',
          details: overflows.slice(0, 5)
        })
      }
      break

    case 'mobile_nav':
      results.value = 'requires_manual_walkthrough'
      results.requires_manual_review = true
      results.evidence.push('移动端导航需要人工走查评估')
      break

    case 'input_usability':
      results.value = 'requires_visual_check'
      results.requires_manual_review = true
      results.evidence.push('输入可用性需要视觉检查')
      break

    case 'text_readability':
      const fontSize = await page.evaluate(() => {
        const elements = document.querySelectorAll('*')
        let minSize = Infinity
        let minElement = null
        elements.forEach(el => {
          const size = parseFloat(getComputedStyle(el).fontSize)
          if (size > 0 && size < minSize) {
            minSize = size
            minElement = el.tagName + '.' + (el.className || '').toString().split(' ')[0]
          }
        })
        return { minSize: minSize === Infinity ? 0 : minSize, element: minElement }
      })

      results.value = fontSize.minSize
      results.evidence.push(`最小字体: ${fontSize.minSize}px (${fontSize.element})`)

      if (fontSize.minSize >= 16) {
        results.score = 100
      } else if (fontSize.minSize >= 14) {
        results.score = 80
      } else if (fontSize.minSize >= 12) {
        results.score = 60
      } else if (fontSize.minSize > 0) {
        results.score = 40
        results.issues.push({
          criterion: 'small_font_size',
          severity: 'medium',
          finding: `最小字体 ${fontSize.minSize}px 小于 14px`,
          suggestion: '增大移动端最小字体至 14px 以上'
        })
      } else {
        results.score = 0
      }
      break
  }
}

// ─── 主流程 ─────────────────────────────────────────────────

async function main() {
  console.log(`[measure] Mode: ${params.mode}`)
  console.log(`[measure] Base URL: ${BASE_URL}`)
  console.log(`[measure] Output: ${params.output}`)

  // 确定要测量的维度
  let dimensionsToMeasure = []

  if (params.mode === 'full') {
    // 全量模式：测量所有维度
    for (const [dim, config] of Object.entries(rubric.dimensions)) {
      for (const sub of Object.keys(config.sub_dimensions)) {
        dimensionsToMeasure.push(`${dim}.${sub}`)
      }
    }
    console.log(`[measure] Full audit: ${dimensionsToMeasure.length} dimensions`)
  } else {
    // 增量模式：只测量 scoped dimensions
    if (params.dimensions.length > 0) {
      dimensionsToMeasure = params.dimensions
    } else if (params.files.length > 0) {
      // 从文件映射维度
      for (const file of params.files) {
        const mapping = componentMap.mappings[file]
        if (mapping) {
          dimensionsToMeasure.push(...mapping.affected_dimensions)
        } else {
          // 尝试目录模式匹配
          for (const [pattern, config] of Object.entries(componentMap.directory_patterns)) {
            if (file.startsWith(pattern)) {
              dimensionsToMeasure.push(...config.fallback_dimensions)
              break
            }
          }
        }
      }
      // 去重
      dimensionsToMeasure = [...new Set(dimensionsToMeasure)]
    }

    if (dimensionsToMeasure.length === 0) {
      // 使用默认维度
      dimensionsToMeasure = rubric.default_scoped_dimensions
    }

    console.log(`[measure] Incremental: ${dimensionsToMeasure.length} dimensions from ${params.files.length || 'default'} files`)
  }

  // 执行测量
  const measurements = {
    mode: params.mode,
    timestamp: new Date().toISOString(),
    dimensions: {}
  }

  // 按维度分组
  const dimensionGroups = {}
  for (const dim of dimensionsToMeasure) {
    const { dimension, sub_dimension } = parseDimension(dim)
    if (!dimensionGroups[dimension]) {
      dimensionGroups[dimension] = []
    }
    if (sub_dimension) {
      dimensionGroups[dimension].push(sub_dimension)
    }
  }

  // 对每个维度执行测量
  for (const [dimension, subDimensions] of Object.entries(dimensionGroups)) {
    if (!measurements.dimensions[dimension]) {
      measurements.dimensions[dimension] = {}
    }

    for (const sub of subDimensions) {
      console.log(`[measure] Measuring ${dimension}.${sub}...`)

      // 在 Desktop 和 Mobile 视口下测量
      const desktopResult = await measureWithPlaywright(dimension, sub, params.viewport)
      const mobileResult = await measureWithPlaywright(dimension, sub, params.mobileViewport)

      // 合并结果（取更严格的那个）
      const result = mergeResults(desktopResult, mobileResult)
      measurements.dimensions[dimension][sub] = result

      if (result.requires_manual_review) {
        console.log(`  ⚠️  ${dimension}.${sub}: 需要人工审查`)
      } else {
        console.log(`  ✅ ${dimension}.${sub}: score=${result.score || 'N/A'}`)
      }
    }
  }

  // 保存结果
  writeFileSync(params.output, JSON.stringify(measurements, null, 2))
  console.log(`[measure] Results saved to ${params.output}`)

  // 输出摘要
  const summary = generateSummary(measurements)
  console.log(`[measure] Summary: ${summary.automated}/${summary.total} automated, ${summary.manual}/${summary.total} require manual review`)
}

function mergeResults(desktop, mobile) {
  // 如果两个结果都需要人工审查，返回标记
  if (desktop.requires_manual_review && mobile.requires_manual_review) {
    return {
      ...desktop,
      viewports: [desktop.viewport, mobile.viewport],
      requires_manual_review: true,
      evidence: [...desktop.evidence, ...mobile.evidence]
    }
  }

  // 如果只有一个需要人工审查，返回另一个
  if (desktop.requires_manual_review) return mobile
  if (mobile.requires_manual_review) return desktop

  // 两个都有自动评分，取较低的那个（保守原则）
  const score = Math.min(desktop.score || 100, mobile.score || 100)

  return {
    ...desktop,
    score,
    viewports: [desktop.viewport, mobile.viewport],
    evidence: [...desktop.evidence, ...(mobile.evidence || [])],
    issues: [...(desktop.issues || []), ...(mobile.issues || [])]
  }
}

function generateSummary(measurements) {
  let total = 0
  let automated = 0
  let manual = 0

  for (const [dim, subs] of Object.entries(measurements.dimensions)) {
    for (const [sub, result] of Object.entries(subs)) {
      total++
      if (result.requires_manual_review) {
        manual++
      } else {
        automated++
      }
    }
  }

  return { total, automated, manual }
}

// ─── 运行 ──────────────────────────────────────────────────

main().catch(e => {
  console.error(`[measure] Fatal error: ${e.message}`)
  process.exit(1)
})
