# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

WorkChart Office is a real-time visual monitor for Claude Code agent sessions. It renders each session as a pixel-art "work box" on canvas, showing the human, main agent, and sub-agents. Zero external dependencies — Python stdlib server, vanilla JS frontend, no build step.

## Commands

```bash
# Start server (primary — Python 3.10+)
python serve.py
python serve.py --port 8080

# Start server (alternative — Node.js v18+)
node serve.js
node serve.js --port 8080

# Run tests (server must be running)
# Open http://localhost:3200/test.html in browser
```

There is no build, lint, or CI pipeline. The test suite is browser-based (90+ tests in `test.html`).

## Server Parity Rule

**serve.js and serve.py MUST stay in feature parity.** They are interchangeable implementations. Any API change, new endpoint, or behavioral change made to one MUST be reflected in the other.

### API Contract (both servers implement identically)

| Endpoint | Params | Response |
|---|---|---|
| `GET /api/projects` | — | `{ projects: [{ name, label }] }` |
| `GET /api/sessions` | `?project=<name>` (optional) | `{ files: [{ name, project, mtime }] }` |
| `GET /api/read` | `?project=<name>&file=<name>&offset=<n>` | `{ lines: [...], newOffset: N }` |
| `GET /api/subagents` | `?project=<name>&session=<id>` | `{ files: [{ name, agentId }] }` |

- Both scan ALL projects under `~/.claude/projects/` (no single-project mode).
- `project` is required on `/api/read` and `/api/subagents`.
- `projectLabel()` / `project_label()` derives human-friendly labels from encoded directory names.
- Both auto-open the browser on startup.

## Architecture

### Data Flow

```
~/.claude/projects/*.jsonl  →  serve.py API  →  fileReader.js (HTTP fetch)
                                                      ↓
                                              sessionManager.js (2s poll loop)
                                                      ↓
                                              transcriptParser.js (JSONL → events)
                                                      ↓
                                              SessionState (in-memory)
                                                      ↓
                                              app.js (requestAnimationFrame loop)
                                                      ↓
                                              boxRenderer.js + spriteEngine.js → canvas
```

### Module Responsibilities

- **app.js** — Entry point. Initializes all modules, manages the render loop (`requestAnimationFrame`), creates/removes session box DOM elements and `BoxRenderer` instances, handles project filtering dropdown, auto-detects server vs demo mode.
- **sessionManager.js** — Polls `/api/sessions` every 2 seconds, reads incremental JSONL lines via `/api/read`, applies parsed events to `SessionState` objects, fires `onSessionUpdate` callbacks. Owns all `SessionState` instances.
- **transcriptParser.js** — Stateless parser. Converts raw JSONL lines into typed events: `USER_PROMPT`, `TOOL_START`, `TOOL_END`, `SUBAGENT_SPAWN`, `SUBAGENT_ACTIVITY`, `TURN_COMPLETE`, `ASK_USER`, `SESSION_META`.
- **boxRenderer.js** — Renders a single session to a 400×250 canvas at `devicePixelRatio`. Draws human sprite, robot sprite, connection line, sub-agent row, speech bubbles, and status bar.
- **fileReader.js** — Abstraction layer with two modes: `"http"` (fetch against server API) and `"fsapi"` (File System Access API for Chromium file:// usage).
- **spriteEngine.js** — Pre-renders all 32×32 pixel-art sprites to `OffscreenCanvas` during `init()`. Provides `draw(ctx, spriteType, x, y, frameOffset)` for animation.

### Key Design Patterns

- **Incremental reading**: Files are read from byte offsets, not re-read from the start. `SessionState.fileOffset` tracks position.
- **Dirty flagging**: Only sessions with `dirty=true` are re-rendered each frame.
- **Demo mode**: When no server is detected and `DEMO_MODE=true` in app.js, 3 mock sessions are shown.
- **Dual file access**: HTTP mode (default via server) and File System Access API (Chromium-only, for file:// usage without a server).

## Constraints

- **No external dependencies.** Python stdlib only for serve.py; Node.js built-ins only for serve.js.
- **No build step.** Frontend is vanilla JS (ES6 modules), CSS, and HTML.
- **No image assets.** All sprites are programmatically generated pixel art.
- **Dark theme.** Background `#1a1a2e`, accent `#00ff88`, amber `#ffaa00`.
- Design docs in `design/docs/` (8 documents, all v1.1) are the source of truth for visual spec, data dictionary, and architecture decisions.
