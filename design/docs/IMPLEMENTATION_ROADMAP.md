# Implementation Roadmap
# WorkChart Office — Agent Session Visualizer

**Version:** 1.1
**Date:** 2026-03-01
**Status:** Active

---

## Phase Overview

| Phase | Name | Deliverable | Dependencies | Status |
|-------|------|-------------|-------------|--------|
| 1 | Design | Design documents, wireframes, reference images | None | COMPLETE |
| 2 | Core Skeleton | `index.html`, CSS layout, grid container, static box rendering | Phase 1 | COMPLETE |
| 3 | Sprite Engine | Programmatic pixel art sprites with animation | Phase 2 | COMPLETE |
| 4 | Transcript Parser | JSONL parsing, event emission, state management | Phase 2 | COMPLETE |
| 5 | File Access | HTTP API via `serve.py`, FSAccess secondary mode, polling | Phase 4 | COMPLETE |
| 6 | Live Integration | End-to-end: file → parse → state → render | Phases 3-5 | COMPLETE |
| 7 | Polish | Visual effects, error handling, UX refinements | Phase 6 | COMPLETE |

---

## Phase 2: Core Skeleton

**Goal:** Render static boxes with placeholder sprites on screen.

**Tasks:**
1. Create `index.html` with header, grid container, footer
2. Create `css/styles.css` with dark theme, responsive grid, box styling
3. Create `js/app.js` with initialization and mock data
4. Create `js/boxRenderer.js` that draws a colored box with placeholder rectangles
5. Verify: open `index.html` in browser, see 2-3 mock boxes with colored rectangles

**Files created:**
- `index.html`
- `css/styles.css`
- `js/app.js`
- `js/boxRenderer.js`

---

## Phase 3: Sprite Engine

**Goal:** Animated pixel-art characters render inside boxes.

**Tasks:**
1. Create `js/spriteEngine.js` with sprite definition format
2. Define Human sprite (32x32, 2 animation states)
3. Define Main Agent/Robot sprite (32x32, 2 animation states)
4. Define Sub-Agent/Brain sprite (16x16, 2 animation states)
5. Implement pre-rendering to offscreen canvases
6. Implement animation loop with delta-time frame cycling
7. Integrate with `boxRenderer.js`
8. Verify: boxes show animated pixel-art characters

**Files created:**
- `js/spriteEngine.js`

**Files modified:**
- `js/boxRenderer.js`

---

## Phase 4: Transcript Parser

**Goal:** Parse JSONL records into typed state events.

**Tasks:**
1. Create `js/transcriptParser.js` with `parse()` function
2. Implement user record parsing (prompts, tool results)
3. Implement assistant record parsing (text, tool_use)
4. Implement progress record parsing (agent_progress)
5. Implement system record parsing (turn_duration)
6. Handle sub-agent detection (Task/Agent tool names)
7. Handle AskUserQuestion detection
8. Create `js/sessionManager.js` with `SessionState` class
9. Implement event handling → state mutations
10. Verify: feed sample JSONL, confirm correct state transitions

**Files created:**
- `js/transcriptParser.js`
- `js/sessionManager.js`

---

## Phase 5: File Access

**Goal:** Read JSONL files from disk via browser or local server.

**Tasks:**
1. Create `js/fileReader.js` with dual-mode abstraction
2. Implement HTTP fetch provider (primary mode via `serve.py`)
3. Implement File System Access API provider (secondary mode)
4. Create `serve.py` (Python HTTP server, zero dependencies)
5. Create `serve.js` (Node.js alternative)
6. Implement incremental reading with offset tracking
7. Implement directory polling (2-second interval)
8. Implement sub-agent file discovery
9. Wire into SessionManager
10. Verify: run `python serve.py`, see `.jsonl` files discovered and read

**Files created:**
- `js/fileReader.js`
- `serve.py`
- `serve.js`

**Files modified:**
- `js/sessionManager.js`

---

## Phase 6: Live Integration

**Goal:** Full end-to-end pipeline: file changes → visual updates.

**Tasks:**
1. Connect FileReader → SessionManager → BoxRenderer pipeline
2. Auto-create boxes for new sessions
3. Auto-add sub-agent sprites when Task/Agent detected
4. Animate sprites based on active/idle/waiting state
5. Update status bar with current tool name
6. Draw speech bubble when agent asks user question
7. Handle session completion (dim box)
8. Verify: start Claude Code session, watch box update in real-time

**Files modified:**
- `js/app.js`
- `js/sessionManager.js`
- `js/boxRenderer.js`

---

## Phase 7: Polish

**Goal:** Visual effects, edge cases, robustness.

**Tasks:**
1. Add sub-agent spawn animation (fade in / matrix effect)
2. Add connection line animation between human and agent
3. Add box border glow for active sessions
4. Handle JSONL parse errors gracefully (skip bad lines)
5. Handle file access errors (show user-friendly messages)
6. Handle browser compatibility (FS API not available → show fallback)
7. Add session count in footer
8. Add polling status indicator
9. Performance test with 10+ simultaneous sessions

**Files modified:**
- `js/boxRenderer.js`
- `js/spriteEngine.js`
- `js/app.js`
- `css/styles.css`

---

## Verification Checklist

| # | Test | Phase | Expected Result |
|---|------|-------|-----------------|
| 1 | Open `index.html` in browser | 2 | Dark page with colored boxes visible |
| 2 | See animated sprites in boxes | 3 | Human, robot, brain sprites animating |
| 3 | Feed mock JSONL to parser | 4 | Correct event types emitted |
| 4 | Grant folder access | 5 | `.jsonl` files listed in console |
| 5 | Start Claude Code session | 6 | New box appears within 2 seconds |
| 6 | Agent uses a tool | 6 | Robot sprite animates, status shows tool name |
| 7 | Agent spawns sub-agent | 6 | Brain sprite appears in bottom row |
| 8 | Agent asks user question | 6 | Speech bubble appears on robot |
| 9 | Turn completes | 6 | All sprites go idle |
| 10 | 5+ sessions active | 7 | Grid layout responsive, 30+ FPS |

---

## Current State (Post-Phase 7)

All phases are complete. Key post-design additions:

- **`serve.py` (Python)** is now the primary and recommended server. Zero external dependencies (stdlib only).
- **Multi-project support** — `serve.py` scans all projects under `~/.claude/projects/`. The frontend includes a project filter dropdown.
- **`/api/projects` endpoint** — returns all discovered projects with human-readable labels.
- **90+ browser tests** in `test.html` covering parser, state management, sprites, and rendering.
- **Demo mode** — 3 mock sessions when loaded as `file://` URL (no server needed for visual verification).
