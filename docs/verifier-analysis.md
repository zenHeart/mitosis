# Verifier Improvement Analysis

## Lessons from Tetris Development (2026-06-20)

---

## 1. Bug Timeline

All bugs below occurred on **2026-06-20** within a 20-minute window (17:38-17:57).

| Time | Commit | Bug | Root Cause | User Impact |
|------|--------|-----|-----------|-------------|
| 17:38 | `b616bf4` | **Board collapsed to 4x4px** | CSS `calc(COLS * 30px)` used JS constants (`COLS`, `ROWS`). Browser treats undefined CSS identifiers as invalid, entire `calc()` evaluates to nothing. Container collapses to minimum content size (4x4px). | Game unplayable — user sees tiny 4x4px box instead of 318x638px board |
| 17:41 | `b0ce0ab` | **Particles caused severe lag** | 30 particles per cleared line, unlimited accumulation, `left`/`top` positioning + inline style updates every tick → layout thrash + paint storms. No FPS guard. | "动效效果太卡了" — user reported game was lagging |
| 17:47 | `cb4c23b` | **200 DOM grid overlay nodes** | `v-for` loop rendered 200 `<div class="board-cell">` elements purely for a visual grid guide, never needed to be real DOM. `box-shadow: glow` on every filled cell × 200 cells × every frame = massive overdraw. | Contributed to lag + unnecessary DOM weight |
| 17:48 | `e9224fa` | **Stop hook hardcoded stale stage name** | `stop-verifier.sh` had `{2: 'snake-create', 3: 'production-verify'}`. Stage 2 was renamed to `production-verify` after snake task was cancelled. Hardcoded string became stale. | Stop hook would show "snake-create" in its allow message — confusing, stale |
| 17:57 | `7e589af` | **Ghost piece appeared against user intent** | Ghost piece (dashed fallback preview) was added as a feature but user explicitly said "不该有下落的虚线方块". No verifier check for unwanted features existed. | "两个问题: 1. 不该有下落的虚线方块提示去掉" |
| 17:57 | `4a131d9` | **Production Gallery showed stale snake-game** | `Gallery.vue` `LOCAL_APPS` array still contained `snake-game` after it was deleted. Verifier only checked `localhost:5173` — never checked production site. | 生产站点显示已删除的贪吃蛇应用 |
| 17:57 | `fcc45a4` | **User requirements not traceable to verifier** | User said "no ghost, no particles" but these constraints were never formalized as verifier checks. The executor had to discover them through user feedback, not automated verification. | 7+ turns wasted discovering and fixing what could have been caught immediately |

---

## 2. Verifier Gaps That Allowed Each Bug

### Bug 1: 4x4px Board (CSS calc() with JS constants)

**Gap: No visual dimension check.**
- Verifier checked: `.board-container` exists (element presence check)
- Verifier did NOT check: `board-container` width/height in pixels
- The commit message itself reveals the insight: *"新 verifier 主窗口检查会 PASS"* — meaning even after the fix, the verifier still only checked element existence, not actual dimensions.

**What the verifier saw vs reality:**
```
Verifier check:  document.querySelector('.board-container') → found ✓
Reality:          element exists but is 4x4px (useless)
```

### Bug 2: Severe Particle Lag

**Gap: No performance measurement.**
- Verifier checked: game starts, keys respond, score increments
- Verifier did NOT check: FPS, frame time, jank, DOM mutation rate
- The only performance signal was indirect: "play 20+ blocks, check for clear messages" — but this doesn't detect lag

**What the verifier saw vs reality:**
```
Verifier check:  press ArrowDown 2x, score increments → PASS ✓
Reality:         game runs at ~10-15 FPS with severe stutter
```

### Bug 3: 200 Unnecessary DOM Nodes

**Gap: No DOM budget enforcement.**
- Verifier checked: `.board-cell` count > 0
- Verifier did NOT check: total DOM node count, whether grid overlay is necessary, whether cells have side effects (box-shadow glow)
- The grid overlay had 200 `<div class="board-cell">` elements that served zero functional purpose — they were purely decorative CSS grid lines

**What the verifier saw vs reality:**
```
Verifier check:  .board-cell count = 200 (expected!) → PASS ✓
Reality:         200 of those are dead overlay nodes + 200 more live game nodes = 400 total
```

### Bug 4: Stale Stage Name in Stop Hook

**Gap: Dynamic state references not validated.**
- The `stop-verifier.sh` hardcoded `{2: 'snake-create'}` as a stage name mapping
- When the goal changed (snake cancelled → production-verify), the shell script became stale
- No mechanism validates that stage name references in hooks match the actual goal definition

**This is a meta-verifier problem** — the verifier doesn't verify itself.

### Bug 5: Ghost Piece Against User Intent

**Gap: No feature whitelist/blacklist.**
- Verifier checked: ghost piece exists and renders correctly (it was counted as a feature)
- Verifier did NOT check: ghost piece should NOT exist (user said "no ghost")
- Features are treated as always-positive: if it renders, it passes. There's no "should this exist?" check.

### Bug 6: Production Gallery Stale Entry

**Gap: Localhost-only verification.**
- Verifier exclusively tested `localhost:5173`
- Production site (`mitosis.zenheart.site`) was only checked in Stage 3 (after all local stages pass)
- But `Gallery.vue` `LOCAL_APPS` fallback runs on BOTH localhost and production — so stale data affects both
- The bug was in a local file that happened to also affect production, but the verifier never correlated the two

### Bug 7: User Requirements Not Formalized

**Gap: User requirements not traceable to verifier checks.**
- "no ghost, no particles" was communicated in chat feedback
- These constraints never made it into `goal.md` acceptance criteria
- Verifier only checks what's in `goal.md` — if it's not there, it's not checked
- This means every user preference must be manually transcribed to `goal.md` to be verified

---

## 3. Proposed Verifier Improvements

### Category A: Visual Rendering Checks

**Current state:** Verifier checks element existence (`querySelector` returns non-null).
**Problem:** An element can exist but be invisible, collapsed, wrong size, wrong color.

**Proposed additions:**

```javascript
// A1: Dimension check for game board
const boardMetrics = await mcp__playwright__browser_evaluate({
  function: () => {
    const board = document.querySelector('.board-container');
    if (!board) return null;
    const rect = board.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }
});
// Expected: width ~318px, height ~638px (±5px tolerance)
// FAIL if: width < 300 or height < 600 (collapse detection)

// A2: Visibility check (not just existence)
const isVisible = await mcp__playwright__browser_evaluate({
  function: () => {
    const el = document.querySelector('.board-container');
    if (!el) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none'
      && style.visibility !== 'hidden'
      && style.opacity !== '0'
      && el.getBoundingClientRect().width > 0
      && el.getBoundingClientRect().height > 0;
  }
});

// A3: Pixel-perfect snapshot comparison (for regression detection)
// Capture a reference screenshot of the game board in known state
// Compare subsequent renders using pixel diff (threshold: <2% change = same)
```

### Category B: Performance Checks (FPS Measurement)

**Current state:** No performance measurement whatsoever.
**Problem:** A game can pass all functional checks but be unplayable due to lag.

**Proposed additions:**

```javascript
// B1: FPS measurement during gameplay
const fpsResult = await mcp__playwright__browser_evaluate({
  function: async () => {
    const frames = [];
    let lastTime = performance.now();
    let count = 0;

    const measure = (timestamp: number) => {
      count++;
      if (timestamp - lastTime >= 1000) {
        frames.push(count);
        count = 0;
        lastTime = timestamp;
        if (frames.length >= 3) {
          // 3 seconds of data
          const avg = frames.reduce((a, b) => a + b) / frames.length;
          return { avgFPS: avg, samples: frames };
        }
      }
      requestAnimationFrame(measure);
    };
    requestAnimationFrame(measure);

    // Return promise that resolves after 3 seconds
    return new Promise((resolve) => {
      setTimeout(() => {
        const avg = frames.reduce((a, b) => a + b) / frames.length;
        resolve({ avgFPS: avg, minFPS: Math.min(...frames), samples: frames });
      }, 3500);
    });
  }
});
// FAIL if: avgFPS < 30 or minFPS < 15
// WARN if: avgFPS < 50

// B2: Long task detection (jank measurement)
const longTasks = await mcp__playwright__browser_evaluate({
  function: async () => {
    return new Promise((resolve) => {
      const tasks: number[] = [];
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          tasks.push(entry.duration);
        }
      });
      observer.observe({ entryTypes: ['longtask'] });
      setTimeout(() => {
        observer.disconnect();
        resolve({ longTaskCount: tasks.length, maxTaskDuration: Math.max(...tasks, 0) });
      }, 3000);
    });
  }
});
// FAIL if: any task > 100ms or more than 5 long tasks in 3 seconds

// B3: DOM mutation rate during particle effects
// Measure how many style/layout mutations happen per frame during line clear
```

### Category C: Feature Whitelist/Blacklist Checks

**Current state:** Verifier checks that features exist/function.
**Problem:** Verifier cannot detect unwanted features that were explicitly removed per user requirements.

**Proposed additions:**

```javascript
// C1: Feature absence verification
const unwantedFeatures = await mcp__playwright__browser_evaluate({
  function: () => {
    return {
      // Ghost piece should NOT exist (user: "不该有下落的虚线方块")
      hasGhostPiece: !!document.querySelector('.ghost-piece, [class*="ghost"]'),
      // Particle system should NOT exist (user: "粒子效果太卡去掉")
      hasParticles: !!document.querySelector('.particles-container, [class*="particle"]'),
      // Glow effects should NOT exist (user feedback: "glow too much")
      hasGlow: document.querySelectorAll('[style*="box-shadow"]').length > 0 ||
               document.querySelectorAll('.glow').length > 0,
      // Snake game should NOT appear in gallery
      hasSnakeGame: document.querySelector('[href*="snake"]') !== null,
    };
  }
});
// These should be derived from goal.md "Feature Constraints" section
// FAIL if: any unwanted feature is present

// C2: Goal.md feature constraint extraction
// Parse goal.md for sections like:
//   ## Feature Constraints
//   - NO ghost piece
//   - NO particle effects
//   - NO glow/bloom
// Then verify each constraint programmatically.
```

### Category D: Production Verification

**Current state:** Verifier exclusively tests `localhost:5173`. Production only checked at Stage 3 (after all local stages pass).
**Problem:** Bugs that affect both localhost AND production (like `LOCAL_APPS` stale data) slip through because production verification happens last.

**Proposed additions:**

```javascript
// D1: Production Gallery smoke test (parallel with localhost)
const prodGallery = await fetch('https://mitosis.zenheart.site/', {
  headers: { 'Accept': 'text/html' },
  signal: AbortSignal.timeout(10000)
}).then(r => r.text());

// Check: no stale app entries, no snake-game, tetris points to v2
const hasStaleSnake = prodGallery.includes('snake-game');
const tetrisPointsToV2 = prodGallery.includes('/apps/tetris-game/v2/');

// D2: Production app page smoke test
const prodApp = await fetch('https://mitosis.zenheart.site/apps/tetris-game/v2/', {
  signal: AbortSignal.timeout(10000)
}).then(r => r.text());

// Check: HTTP 200, board-container present, no console errors in initial load

// D3: CI-built vs local-built consistency check
// When a CI deploy exists, compare the production app JS hash with
// the locally built app JS hash to ensure they're the same build
```

### Category E: DOM Node Budget

**Current state:** Verifier counts `.board-cell` elements but has no total DOM budget.
**Problem:** 200 grid overlay + 200 live cells + particles = 400+ nodes for a simple game that could use 0 overlay nodes via CSS.

**Proposed additions:**

```javascript
// E1: Total DOM node count
const totalNodes = await mcp__playwright__browser_evaluate({
  function: () => document.querySelectorAll('*').length
});
// FAIL if: totalNodes > 500 for a game page
// WARN if: totalNodes > 300

// E2: Node breakdown by selector
const nodeBreakdown = await mcp__playwright__browser_evaluate({
  function: () {
    const breakdown: Record<string, number> = {};
    document.querySelectorAll('*').forEach(el => {
      const tag = el.tagName.toLowerCase();
      breakdown[tag] = (breakdown[tag] || 0) + 1;
    });
    return breakdown;
  }
});
// Log breakdown to help identify bloat sources

// E3: Specific expensive selector checks
const expensiveSelectors = {
  'board-grid .board-cell': document.querySelectorAll('.board-grid .board-cell').length,
  'particles-container > *': document.querySelectorAll('.particles-container > *').length,
  '[style*="box-shadow"]': document.querySelectorAll('[style*="box-shadow"]').length,
  '[style*="left"]': document.querySelectorAll('[style*="left"]').length,
  '[style*="top"]': document.querySelectorAll('[style*="top"]').length,
};
// FAIL if: grid overlay > 0 (should be CSS-only), particles > 0, inline left/top > 0
```

### Category F: Dynamic State References

**Current state:** Stage names and app names hardcoded in shell scripts and verifier docs.
**Problem:** When goal changes (snake cancelled → production-verify), references become stale.

**Proposed additions:**

```bash
# F1: Verify hook references match goal.md
# In stop-verifier.sh, replace hardcoded stage names with goal.md parsing:
STAGE_NAMES=$(node -e "
  const fs = require('fs');
  const goal = fs.readFileSync('goal.md', 'utf8');
  const matches = goal.match(/Stage \d+: ([^\n]+)/g) || [];
  const names = {};
  matches.forEach(m => {
    const [, num, name] = m.match(/Stage (\d+): (.+)/);
    names[num] = name.trim();
  });
  console.log(JSON.stringify(names));
")
# Use $STAGE_NAMES instead of hardcoded {2: 'snake-create'}

# F2: Verify app references are consistent
# Check that all references to apps in codebase match what's in goal.md
grep -r "snake-game" src/ apps/ .claude/ 2>/dev/null && echo "STALE_REF: snake-game"
grep -r "tetris-game/v1" src/ apps/ .claude/ 2>/dev/null && echo "STALE_REF: tetris-game/v1"
```

### Category G: CSS Sanity Checks

**Current state:** Verifier checks Vite `base` config but not CSS correctness.
**Problem:** CSS `calc()` with undefined variables silently fails — no error, just collapse.

**Proposed additions:**

```bash
# G1: Detect calc() with JS-constant-style identifiers
# CSS calc() should only use: var(--custom-prop), numbers, px/em/rem units
# Flag any calc() that references ALL_CAPS identifiers (likely JS constants)
rg "calc\([^)]*[A-Z]{2,}[^)]*\)" apps/*/src/*.css apps/*/src/*.vue \
  --type-add 'vue:*.vue' -g '*.css' -g '*.vue' \
  | grep -v "var(--" | grep -v "calc(var("
# FAIL if: calc() contains bare ALL_CAPS identifiers without var()

# G2: Verify CSS custom properties are defined before use
# Check that every var(--foo) has a corresponding --foo: value declaration
# in the same file or a parent selector

# G3: Check for common CSS anti-patterns
rg "display:\s*none" apps/*/src/*.vue | head -5  # Hidden elements = dead code?
rg "position:\s*absolute.*width:\s*0" apps/*/src/*.vue  # Zero-size elements
```

### Category H: User Requirements Traceability

**Current state:** User preferences communicated in chat are not formalized.
**Problem:** Requirements like "no ghost, no particles" are verbal, not verifiable.

**Proposed additions:**

```markdown
# In goal.md, add a "Feature Constraints" section:

## Feature Constraints (User Requirements)
These are binding constraints from user feedback. Verifier MUST check absence.
- [ ] NO ghost piece (dashed fallback preview) — user: "不该有下落的虚线方块"
- [ ] NO particle effects — user: "粒子效果太卡去掉"
- [ ] NO glow/bloom effects — user: "glow too much"
- [ ] Target: 60 FPS minimum during active gameplay

# Verifier automatically extracts and checks each constraint:
// Parse goal.md "Feature Constraints" section
// For each "NO X" constraint, generate a querySelector check for X
// For each "Target: Y" constraint, generate a measurement check for Y
```

---

## 4. Priority Ranking

| Priority | Improvement | Category | Impact | Effort |
|----------|------------|----------|--------|--------|
| **P0** | Visual dimension check (board width/height) | A | **Critical** — prevents 4x4px board bug entirely | Low |
| **P0** | Feature blacklist check (no ghost, no particles) | C | **Critical** — directly enforces user requirements | Low |
| **P0** | FPS measurement during gameplay | B | **Critical** — prevents performance regressions | Medium |
| **P1** | DOM node budget | E | **High** — catches unnecessary DOM bloat | Low |
| **P1** | Dynamic stage name references | F | **High** — prevents stale hook messages | Low |
| **P1** | Production smoke test (parallel with localhost) | D | **High** — catches production-only bugs early | Medium |
| **P2** | CSS calc() JS-constant detection | G | **Medium** — catches silent CSS failures | Low |
| **P2** | User requirements traceability in goal.md | H | **Medium** — makes constraints verifiable | Low |
| **P2** | Pixel-diff snapshot comparison | A | **Low** — catches visual regressions | High |
| **P2** | Long task / jank detection | B | **Low** — deeper perf analysis | Medium |

---

## 5. Top 3 Critical Improvements — Code Snippets

### #1 (P0): Visual Dimension Check

**Why:** This would have caught the 4x4px board bug on the FIRST verifier run, before any user feedback was needed.

```javascript
// In verifier.md, Phase 1.3, add AFTER the existing board-cell checks:

// ── 尺寸验证（阻断性 — 未通过直接 FAIL）──
const boardDimensions = await mcp__playwright__browser_evaluate({
  function: () => {
    const board = document.querySelector('.board-container') ||
                  document.querySelector('.board-wrapper');
    if (!board) return { found: false, reason: 'no-board-element' };
    const rect = board.getBoundingClientRect();
    const style = window.getComputedStyle(board);
    return {
      found: rect.width > 0 && rect.height > 0,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      display: style.display,
      visibility: style.visibility,
      // Check if CSS custom properties are being used (indicates fix applied)
      hasCSSVars: style.getPropertyValue('--cols') !== '' ||
                  board.style.getPropertyValue('--cols') !== ''
    };
  }
});

// Checkpoint:
// - [ ] board-container width >= 300px (expected ~318px)
// - [ ] board-container height >= 600px (expected ~638px)
// - [ ] board is not display:none or visibility:hidden

if (boardDimensions.found === false || boardDimensions.width < 300 || boardDimensions.height < 600) {
  return {
    status: "FAIL",
    detail: `Board dimensions: ${boardDimensions.width}x${boardDimensions.height}px (expected ~318x638). ` +
            `Possible CSS calc() failure with JS constants. ` +
            `Fix: use CSS custom properties (--cols, --rows, --cell-size) instead of bare JS constants.`
  };
}
```

### #2 (P0): Feature Blacklist Check

**Why:** This directly enforces "no ghost, no particles" as verifier-enforced constraints rather than relying on user feedback.

```javascript
// In verifier.md, Phase 1.3, add as a new subsection "1.3b Feature Constraint Verification"

// ── Feature Constraint Verification ──
// Parse goal.md "Feature Constraints" section to build blacklist:
const featureBlacklist = await mcp__playwright__browser_evaluate({
  function: () {
    // These correspond to constraints in goal.md "Feature Constraints" section
    const checks = {
      // NO ghost piece (dashed fallback preview)
      'ghost-piece': !!document.querySelector('.ghost-piece, [class*="ghost"]'),
      // NO particle container
      'particles': !!document.querySelector('.particles-container, [class*="particle"]'),
      // NO glow effects (inline box-shadow on cells)
      'glow-effects': document.querySelectorAll('[style*="box-shadow"]').length > 0,
      // NO snake game in gallery
      'snake-game': !!document.querySelector('[href*="snake"], [data-app="snake-game"]'),
    };
    const violations = Object.entries(checks)
      .filter(([, present]) => present)
      .map(([feature]) => feature);
    return { violations, checks };
  }
});

// Checkpoint:
// - [ ] No ghost piece element present
// - [ ] No particle container present
// - [ ] No glow box-shadow effects
// - [ ] No snake-game references in gallery

if (featureBlacklist.violations.length > 0) {
  return {
    status: "FAIL",
    detail: `Feature constraint violations: ${featureBlacklist.violations.join(', ')}. ` +
            `These features were explicitly excluded per goal.md constraints.`
  };
}
```

**Corresponding `goal.md` addition:**

```markdown
## Feature Constraints (Binding — Verifier Enforced)

These are user-stated requirements. The verifier will FAIL if any are violated.

- [ ] **NO ghost piece** — no dashed fallback preview element (class `ghost` or `ghost-piece`)
- [ ] **NO particle effects** — no particles container or particle DOM elements
- [ ] **NO glow/bloom** — no box-shadow glow effects on game cells
- [ ] **60 FPS minimum** — average FPS during active gameplay >= 60
```

### #3 (P0): FPS Measurement During Gameplay

**Why:** Would have caught the particle-induced lag immediately. The current verifier measures functional correctness (keys work, score increments) but never measures whether the game is actually playable at acceptable framerate.

```javascript
// In verifier.md, Phase 1.3, add FPS measurement AFTER game starts:

// ── FPS Measurement (Performance Gate) ──
// Start game, then measure FPS for 3 seconds of active gameplay
const fpsData = await mcp__playwright__browser_evaluate({
  function: async () => {
    const samples: number[] = [];
    let lastTime = performance.now();
    let count = 0;

    return new Promise((resolve) => {
      const measure = (timestamp: number) => {
        count++;
        if (timestamp - lastTime >= 1000) {
          samples.push(count);
          count = 0;
          lastTime = timestamp;
        }
        if (samples.length < 3) {
          requestAnimationFrame(measure);
        } else {
          const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
          const min = Math.min(...samples);
          resolve({
            avgFPS: Math.round(avg),
            minFPS: min,
            samples,
            // Check for frame drops (>20% below avg = significant jank)
            jankFrames: samples.filter(s => s < avg * 0.7).length
          });
        }
      };
      requestAnimationFrame(measure);
    });
  }
});

// Checkpoint:
// - [ ] Average FPS >= 55 (acceptable minimum: 60)
// - [ ] Minimum FPS >= 30 (no sustained drops below playable threshold)
// - [ ] No more than 2 jank frames (frames >20% below average)

if (fpsData.avgFPS < 50) {
  return {
    status: "FAIL",
    detail: `FPS too low: avg=${fpsData.avgFPS}, min=${fpsData.minFPS}. ` +
            `Expected >= 55 FPS for smooth gameplay. ` +
            `Check: particle count, DOM mutations per frame, box-shadow overdraw.`
  };
} else if (fpsData.avgFPS < 55) {
  return {
    status: "WARN",
    detail: `FPS marginal: avg=${fpsData.avgFPS}, min=${fpsData.minFPS}. ` +
            `Target is 60 FPS. May be acceptable for simple scenes.`
  };
}
```

---

## 6. Recommended Implementation Order

```
Week 1 (P0 — Prevent repeat bugs):
  1. Add dimension check to verifier.md (A1)
  2. Add feature blacklist section to goal.md + verifier (C1+C2)
  3. Add FPS measurement to verifier gameplay test (B1)

Week 2 (P1 — Strengthen verification):
  4. Add DOM node budget check (E1+E2+E3)
  5. Dynamic stage name references in stop-verifier.sh (F1)
  6. Production smoke test (D1+D2)

Week 3 (P2 — Polish):
  7. CSS calc() JS-constant detection (G1)
  8. Goal.md feature constraints section (H)
  9. Long task / jank detection (B2)
```

---

## 7. Meta-Lesson: The Verifier Must Verify Itself

The `stop-verifier.sh` stale stage name bug reveals a deeper architectural issue: **the verifier is not itself verified**. The proposed improvements include:

1. **Self-consistency check** — Before each run, verify that all stage/app names referenced in `.claude/hooks/` and `.claude/agents/` match the current `goal.md` definition
2. **Verifier test suite** — A set of known-bad and known-good inputs that exercise the verifier to ensure it catches what it should catch
3. **Regression test for each bug** — Each bug that slipped through should become a permanent test case:
   - `test-4x4px-board`: Board with collapsed CSS should FAIL dimension check
   - `test-laggy-particles`: Board with particles should FAIL FPS check
   - `test-stale-gallery`: Gallery with snake-game should FAIL feature blacklist

---

*Generated: 2026-06-20*
*Basis: Tetris v2 development commits b616bf4..fcc45a4, verifier.md, goal.md, .goal-state.json*
