# Browser MCP Integration Design
# WorkChart Office — Development & Testing Automation

**Version:** 1.1
**Date:** 2026-03-01
**Status:** Active

---

## 1. Purpose

Integrate browser automation MCP servers into the WorkChart Office development workflow so Claude Code can:

- Open the app in a real browser and verify rendering
- Run the test harness (`test.html`) and read pass/fail results
- Inspect canvas output, catch console errors, and validate UI state
- Perform visual regression checks as sprites and layout evolve
- Debug issues without requiring manual screenshots from the developer

---

## 2. Tool Selection

### 2.1 Primary: Microsoft Playwright MCP

**Package:** `@playwright/mcp`
**Why:** Best token efficiency (accessibility tree approach), multi-browser support, active Microsoft maintenance, zero API keys, single `npx` setup. Recommended replacement for the deprecated Puppeteer MCP.

| Capability | Relevance to WorkChart Office |
|-----------|-------------------------------|
| `browser_navigate` | Open `index.html` or `test.html` via `serve.py` |
| `browser_take_screenshot` | Capture canvas rendering for visual verification |
| `browser_evaluate` | Read test results from DOM, inspect canvas state, check JS errors |
| `browser_console_messages` | Catch import errors, canvas API issues, parse failures |
| `browser_snapshot` | Read accessibility tree for DOM structure validation |
| `browser_click` | Click "Run All Tests", "Open Folder", demo mode buttons |
| `browser_wait_for` | Wait for test suite completion or session box rendering |

### 2.2 Secondary: Chrome DevTools MCP (Optional)

**Package:** `chrome-devtools-mcp`
**Why:** Adds performance profiling (Chrome traces, memory snapshots, Lighthouse audits) — useful for Phase 7 polish when we optimize for 10+ simultaneous sessions at 30+ FPS.

| Capability | Relevance to WorkChart Office |
|-----------|-------------------------------|
| `performance_start_trace` / `performance_stop_trace` | Profile render loop FPS with many boxes |
| `take_memory_snapshot` | Verify <100MB memory with 10 sessions (NFR3) |
| `lighthouse_audit` | Check accessibility, best practices |
| `evaluate_script` | Same as Playwright — run JS in page context |
| `list_console_messages` | Same — catch errors |

### 2.3 Not Recommended

| Option | Why Not |
|--------|---------|
| Browserbase/Stagehand | Requires paid cloud account, overkill for local dev |
| Puppeteer MCP | Deprecated, unmaintained |
| WebMCP (W3C standard) | Different protocol entirely — client-side browser API for websites to declare tools to AI agents, not a server-side automation tool |

---

## 3. Configuration

### 3.1 Playwright MCP — Claude Code Settings

**File:** `.claude/settings.local.json` (project-level)

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": [
        "@playwright/mcp@latest",
        "--browser", "chromium",
        "--caps", "vision,testing"
      ]
    }
  }
}
```

**Flags explained:**

| Flag | Value | Reason |
|------|-------|--------|
| `--browser` | `chromium` | Default, widest compatibility |
| `--caps vision` | Enables coordinate-based clicking | Needed for canvas interaction (canvas elements aren't in accessibility tree) |
| `--caps testing` | Enables `browser_verify_*` tools | Useful for asserting DOM state after operations |

**Note:** We use headed mode (no `--headless` flag) during development so we can visually watch the browser. Add `--headless` for CI or automated runs.

### 3.2 Chrome DevTools MCP — Claude Code Settings (Optional)

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--browser", "chromium", "--caps", "vision,testing"]
    },
    "chrome-devtools": {
      "command": "npx",
      "args": ["chrome-devtools-mcp@latest", "--headless=true", "--isolated=true"]
    }
  }
}
```

### 3.3 Prerequisites

```bash
# One-time setup (npm must be available)
npx @playwright/mcp@latest --browser chromium  # auto-installs browser binary

# Optional: Chrome DevTools MCP
npx chrome-devtools-mcp@latest  # uses system Chrome
```

No additional install steps — `npx` handles everything.

---

## 4. Development Workflows

### 4.1 Workflow: Visual Verification Loop

**Trigger:** After any change to `boxRenderer.js`, `spriteEngine.js`, or `styles.css`

```
1. Start serve.py         →  python serve.py (port 3200)
2. browser_navigate       →  http://localhost:3200
3. browser_wait_for       →  Wait for "WorkChart Office" text
4. browser_take_screenshot →  Capture full page
5. browser_evaluate       →  Check for JS errors: window.__errors or console
6. browser_console_messages → Read any console.error output
7. Analyze screenshot     →  Verify sprites render, layout is correct
8. Iterate                →  Edit code → repeat from step 2
```

### 4.2 Workflow: Automated Test Execution

**Trigger:** After any change to `transcriptParser.js`, `sessionManager.js`, or `spriteEngine.js`. Requires `python serve.py` running.

```
1. browser_navigate        →  http://localhost:3200/test.html
2. browser_click           →  Click "Run All Tests" button
3. browser_wait_for        →  Wait for results to appear (test summary bar)
4. browser_evaluate        →  Extract results:
                               document.querySelector('#summary').textContent
                               // Returns: "67 passed, 0 failed, 0 skipped"
5. If failures:
   a. browser_evaluate     →  Get failure details:
                               document.querySelectorAll('.test-fail')
                                 .map(el => el.textContent)
   b. browser_take_screenshot → Capture failure context
6. Report results          →  Pass/fail summary back to conversation
```

### 4.3 Workflow: Demo Mode Verification

**Trigger:** After changes to `app.js` demo data or `boxRenderer.js` rendering

```
1. browser_navigate        →  http://localhost:3200
2. browser_wait_for        →  Wait for demo boxes to appear
3. browser_take_screenshot →  Capture initial demo state
4. browser_evaluate        →  Check box count:
                               document.querySelectorAll('.session-box').length
                               // Expected: 3 (demo mode)
5. Wait 5 seconds          →  Demo cycles states
6. browser_take_screenshot →  Capture after state cycle
7. Compare states          →  Verify animations changed
```

### 4.4 Workflow: Performance Profiling (Chrome DevTools MCP)

**Trigger:** Phase 7 optimization — verifying 30+ FPS with 10 sessions

```
1. browser_navigate              →  http://localhost:3200
2. browser_evaluate              →  Inject 10 mock sessions via JS
3. performance_start_trace       →  Begin recording
4. Wait 5 seconds                →  Let render loop run
5. performance_stop_trace        →  End recording
6. performance_analyze_insight   →  Get FPS data, long frame analysis
7. take_memory_snapshot          →  Check heap size (<100MB target)
8. lighthouse_audit              →  Overall performance score
```

### 4.5 Workflow: Canvas Content Inspection

**Challenge:** Canvas elements are opaque to the accessibility tree. We can't "read" pixel content via `browser_snapshot`.

**Solution:** Use `browser_evaluate` to run canvas inspection code:

```javascript
// Inject into page via browser_evaluate
(() => {
    const canvases = document.querySelectorAll('.session-box canvas');
    const results = [];
    for (const canvas of canvases) {
        const ctx = canvas.getContext('2d');
        // Sample pixel at known sprite locations
        const humanPixel = ctx.getImageData(30, 15, 1, 1).data;  // Human position
        const agentPixel = ctx.getImageData(280, 15, 1, 1).data; // Agent position
        const bgPixel = ctx.getImageData(200, 125, 1, 1).data;   // Background
        results.push({
            width: canvas.width,
            height: canvas.height,
            hasHumanSprite: humanPixel[3] > 0,      // Non-transparent
            hasAgentSprite: agentPixel[3] > 0,       // Non-transparent
            bgColor: `rgb(${bgPixel[0]},${bgPixel[1]},${bgPixel[2]})`,
        });
    }
    return JSON.stringify(results, null, 2);
})()
```

This lets us programmatically verify sprites are rendering at expected positions without relying on screenshots alone.

---

## 5. Test Harness Integration

### 5.1 Test Result Contract

The `test.html` page exposes results in a predictable DOM structure that `browser_evaluate` can query:

| Selector | Content |
|----------|---------|
| `#summary` | "X passed, Y failed, Z skipped" |
| `.suite` | Each test suite container |
| `.suite .suite-header` | Suite name + pass/fail count |
| `.test-pass` | Passing test case |
| `.test-fail` | Failing test case (includes error message) |
| `.test-fail .error-message` | Specific assertion failure text |

### 5.2 Automated Test Script (for browser_evaluate)

```javascript
// Quick pass/fail check
(() => {
    const summary = document.querySelector('#summary');
    if (!summary) return { status: 'not-run', message: 'Tests have not been executed' };

    const text = summary.textContent;
    const match = text.match(/(\d+) passed, (\d+) failed/);
    if (!match) return { status: 'error', message: 'Cannot parse summary' };

    const passed = parseInt(match[1]);
    const failed = parseInt(match[2]);

    if (failed === 0) return { status: 'pass', passed, failed };

    // Collect failure details
    const failures = [...document.querySelectorAll('.test-fail')].map(el => ({
        name: el.querySelector('.test-name')?.textContent,
        error: el.querySelector('.error-message')?.textContent
    }));

    return { status: 'fail', passed, failed, failures };
})()
```

---

## 6. Error Detection Patterns

### 6.1 Common Errors to Watch For

| Error Pattern | Detection Method | Likely Cause |
|--------------|-----------------|-------------|
| `Failed to resolve module specifier` | `browser_console_messages` | Incorrect ES module import path |
| `Uncaught SyntaxError` | `browser_console_messages` | JS syntax error in source |
| `canvas.getContext is not a function` | `browser_console_messages` | Canvas not properly created |
| `OffscreenCanvas is not defined` | `browser_console_messages` | Browser doesn't support OffscreenCanvas |
| `showDirectoryPicker is not defined` | `browser_console_messages` | FS API not available (expected in non-Chromium) |
| Empty `#session-grid` | `browser_snapshot` | App init failed silently |
| Black/blank canvas | `browser_take_screenshot` | Sprite rendering error |
| 0 test results after click | `browser_evaluate` | Test module import failed |

### 6.2 Health Check Script

Run this after every navigation to quickly validate the page loaded:

```javascript
(() => {
    const errors = [];

    // Check for JS errors
    if (window.__workchart_errors?.length > 0)
        errors.push(...window.__workchart_errors);

    // Check key elements exist
    if (!document.querySelector('#session-grid'))
        errors.push('Missing #session-grid');
    if (!document.querySelector('#open-folder-btn'))
        errors.push('Missing #open-folder-btn');

    // Check for demo boxes in demo mode
    const boxes = document.querySelectorAll('.session-box');

    return {
        healthy: errors.length === 0,
        errors,
        boxCount: boxes.length,
        title: document.title
    };
})()
```

---

## 7. CI/Future Automation

### 7.1 Headless Test Runner

For future CI integration, Playwright MCP can run headless:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--browser", "chromium", "--headless"]
    }
  }
}
```

### 7.2 Potential Automation Script

A future `scripts/run-tests.sh` could:

```bash
#!/bin/bash
# 1. Start serve.py in background
python serve.py &
SERVER_PID=$!

# 2. Wait for server
sleep 2

# 3. Use Playwright CLI (not MCP) for headless test run
npx playwright test test.spec.js

# 4. Cleanup
kill $SERVER_PID
```

This is outside MCP scope but shows how the same infrastructure can be used for CI.

---

## 8. Architecture Diagram

```
┌───────────────────────────────────────────────────────────┐
│                     Claude Code Session                    │
│                                                           │
│  ┌─────────────────┐                                     │
│  │   User Request   │  "verify the sprites render"       │
│  └────────┬────────┘                                     │
│           ▼                                               │
│  ┌─────────────────┐     ┌────────────────────────────┐  │
│  │  Claude Agent    │────▶│  Playwright MCP Server     │  │
│  │  (orchestrator)  │◀────│  (@playwright/mcp)         │  │
│  └────────┬────────┘     └────────────┬───────────────┘  │
│           │                            │                  │
│           │  tool calls:               │  controls:       │
│           │  browser_navigate          │                  │
│           │  browser_take_screenshot   ▼                  │
│           │  browser_evaluate    ┌──────────────┐        │
│           │  browser_click       │  Chromium     │        │
│           │                      │  Browser      │        │
│           │                      │              │        │
│           │                      │  localhost:   │        │
│           │                      │  3200         │        │
│           │                      └──────┬───────┘        │
│           │                             │                 │
│           │                             ▼                 │
│           │                      ┌──────────────┐        │
│           │                      │  serve.py     │        │
│           │                      │  (Python)     │        │
│           │                      └──────┬───────┘        │
│           │                             │                 │
│           │                             ▼                 │
│           │                      ┌──────────────┐        │
│           │                      │  WorkChart    │        │
│           │                      │  Office       │        │
│           │                      │  (HTML/JS/CSS)│        │
│           ▼                      └──────────────┘        │
│  ┌─────────────────┐                                     │
│  │  Results back    │  screenshots, DOM data, test       │
│  │  to conversation │  results, console errors           │
│  └─────────────────┘                                     │
└───────────────────────────────────────────────────────────┘

Optional addition:

┌────────────────────────────────┐
│  Chrome DevTools MCP           │
│  (chrome-devtools-mcp)         │
│                                │
│  Adds: performance traces,     │
│  memory snapshots, Lighthouse  │
│  audits for Phase 7 polish     │
└────────────────────────────────┘
```

---

## 9. Implementation Steps (When Ready)

| Step | Action | Command |
|------|--------|---------|
| 1 | Install Playwright MCP | `claude mcp add playwright npx @playwright/mcp@latest --caps vision,testing` |
| 2 | Update `.claude/settings.local.json` | Add config from Section 3.1 |
| 3 | Start local server | `python serve.py` |
| 4 | Verify connection | Use `browser_navigate` to open `http://localhost:3200` |
| 5 | Run test harness | Navigate to `/test.html`, click run, evaluate results |
| 6 | Optional: Add Chrome DevTools | Add config from Section 3.2 for perf profiling |

---

## 10. Clarification: WebMCP vs Browser MCP

These are **two completely different things** — important to not confuse them:

| | WebMCP (W3C Standard) | Browser MCP Servers |
|---|---|---|
| **What** | A browser API for websites to declare tools to AI agents | MCP servers that let AI agents control browsers |
| **Direction** | Website → Agent ("here are my tools") | Agent → Browser ("navigate to this URL") |
| **Protocol** | `postMessage` in browser | JSON-RPC over stdio |
| **Spec** | W3C Community Group draft | Model Context Protocol |
| **Status** | Chrome 146 flag preview | Production-ready |
| **Use case** | Web developers make sites AI-friendly | AI agents automate/test browsers |
| **Our usage** | Could annotate WorkChart Office's UI for AI interaction (future) | Automate dev/test workflow (now) |

**For our purposes, we want Browser MCP Servers (Playwright MCP)**, not the WebMCP W3C standard. However, in a future phase, we *could* add WebMCP annotations to WorkChart Office so that AI agents can natively interact with the session boxes — but that's a separate initiative.
