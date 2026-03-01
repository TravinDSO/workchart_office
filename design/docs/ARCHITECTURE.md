# Software Architecture Document (SAD)
# WorkChart Office — Agent Session Visualizer

**Version:** 1.1
**Date:** 2026-03-01
**Status:** Active

---

## 1. System Context

```
┌──────────────────────────────────────────────────────┐
│                    User's Machine                     │
│                                                       │
│  ┌─────────────┐    writes     ┌──────────────────┐  │
│  │ Claude Code  │ ──────────── │  JSONL Transcript │  │
│  │  (Terminal)  │              │  Files on Disk    │  │
│  └─────────────┘              └────────┬─────────┘  │
│                                         │ reads       │
│                                         ▼             │
│                               ┌──────────────────┐   │
│                               │  serve.py         │   │
│                               │  (Python HTTP     │   │
│                               │   Server + API)   │   │
│                               └────────┬─────────┘   │
│                                         │ JSON API    │
│                                         ▼             │
│                               ┌──────────────────┐   │
│                               │  WorkChart Office │   │
│                               │  (Browser App)    │   │
│                               └──────────────────┘   │
└──────────────────────────────────────────────────────┘
```

WorkChart Office is a **read-only observer**. It does not interact with Claude Code or modify any files. The `serve.py` server reads JSONL transcript files from `~/.claude/projects/` and exposes them via a JSON API to the browser frontend.

---

## 2. High-Level Architecture

```
┌────────────────────────────────────────────────────────────┐
│                       Browser (index.html)                  │
│                                                             │
│  ┌──────────┐   ┌────────────────┐   ┌──────────────────┐ │
│  │  File     │   │   Session      │   │  Transcript      │ │
│  │  Reader   │──▶│   Manager      │──▶│  Parser          │ │
│  │  Layer    │   │                │   │                  │ │
│  └──────────┘   └───────┬────────┘   └────────┬─────────┘ │
│                          │                      │           │
│                          ▼                      ▼           │
│               ┌──────────────────────────────────────┐     │
│               │         Application State             │     │
│               │  (Sessions → Agents → Sub-Agents)     │     │
│               └──────────────────┬───────────────────┘     │
│                                   │                         │
│                    ┌──────────────┼──────────────┐         │
│                    ▼              ▼              ▼          │
│              ┌──────────┐  ┌──────────┐  ┌──────────┐     │
│              │   Box     │  │   Box    │  │   Box    │     │
│              │ Renderer  │  │ Renderer │  │ Renderer │     │
│              │ (Canvas)  │  │ (Canvas) │  │ (Canvas) │     │
│              └──────────┘  └──────────┘  └──────────┘     │
│                    │              │              │          │
│                    └──────────────┼──────────────┘         │
│                                   ▼                         │
│                          ┌──────────────┐                  │
│                          │ Sprite Engine │                  │
│                          │ (Shared)      │                  │
│                          └──────────────┘                  │
└────────────────────────────────────────────────────────────┘
```

### 2.1 Architectural Style

**Event-driven pipeline** with a polling data source:

1. **Poll** → File Reader checks for new JSONL data every 2 seconds
2. **Parse** → Transcript Parser converts new lines into state events
3. **Update** → Session Manager updates application state
4. **Render** → Box Renderers draw updated state to canvas via animation loop

### 2.2 Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| No framework | Vanilla JS | Zero build step, instant startup, minimal complexity |
| Canvas 2D rendering | Per-box canvas elements | Pixel-art needs precise pixel control; DOM would be limiting |
| Polling over WebSocket | 2-second poll interval | HTTP API via `serve.py` provides incremental reads; simple and reliable |
| Programmatic sprites | Pixel arrays in JS | No external asset loading; self-contained; easy to modify |
| ES Modules | Native browser `import` | No bundler needed; modern browsers support natively |

---

## 3. Component Details

### 3.1 File Reader Layer (`js/fileReader.js`)

**Responsibility:** Abstract file system access behind a unified interface.

```
┌─────────────────────────────────────────┐
│           FileReaderLayer Interface       │
│                                           │
│  + init(mode) → void                      │
│  + listSessions(project?) → FileInfo[]    │
│  + readNewLines(file, offset) → lines[]   │
│  + listSubAgents(project, session) → []   │
│  + listProjects() → ProjectInfo[]         │
└─────────────────┬───────────────────────┘
                   │
          ┌────────┴────────┐
          ▼                 ▼
  ┌──────────────┐  ┌──────────────┐
  │ HTTP Fetch   │  │ FSAccess     │
  │ Provider     │  │ Provider     │
  │ (serve.py    │  │ (Browser     │
  │  primary)    │  │  secondary)  │
  └──────────────┘  └──────────────┘
```

**HTTP Fetch Provider (primary):** Uses `fetch()` calls against `serve.py`, which scans all projects under `~/.claude/projects/` and exposes JSONL files via REST endpoints (`/api/projects`, `/api/sessions`, `/api/read`, `/api/subagents`).

**FSAccess Provider (secondary):** Uses the File System Access API (`showDirectoryPicker()`). Only available in Chromium browsers. Useful when running without a server.

### 3.2 Session Manager (`js/sessionManager.js`)

**Responsibility:** Track active sessions, poll for updates, maintain session state.

**State Model:**
```javascript
// Per-session state
SessionState {
  sessionId: string,          // UUID from filename
  slug: string,               // Human-readable name from JSONL records
  filePath: string,           // Path to .jsonl file
  fileOffset: number,         // Bytes read so far (incremental reading)
  mainAgent: {
    state: "idle" | "active" | "waiting",
    currentTool: string | null,
    toolDescription: string | null
  },
  subAgents: Map<string, {    // agentId → sub-agent state
    state: "idle" | "active" | "completed",
    description: string,
    lastTool: string | null,
    spawnTime: number
  }>,
  humanActive: boolean,       // True briefly when user sends a prompt
  lastUpdate: number,         // Timestamp of last state change
  isComplete: boolean         // True after session ends
}
```

**Polling loop:**
1. Every 2 seconds, iterate all known sessions
2. Check file size — if unchanged, skip
3. Read new bytes from `fileOffset` to end
4. Split into lines, send to Transcript Parser
5. Update `fileOffset`
6. Also scan directory for new `.jsonl` files

### 3.3 Transcript Parser (`js/transcriptParser.js`)

**Responsibility:** Parse JSONL lines into typed state-change events.

**Input:** Raw JSON string (one JSONL line)
**Output:** State event object

**Event types emitted:**

| Event | Trigger Record | Data |
|-------|---------------|------|
| `USER_PROMPT` | `type:"user"` with text content | `{ text }` |
| `TOOL_START` | `type:"assistant"` with `tool_use` | `{ toolName, toolId, input }` |
| `TOOL_END` | `type:"user"` with `tool_result` | `{ toolId }` |
| `SUBAGENT_SPAWN` | `tool_use` with `name:"Task"` | `{ agentId, description }` |
| `SUBAGENT_ACTIVITY` | `progress` with `agent_progress` | `{ agentId, toolName }` |
| `TURN_COMPLETE` | `system:turn_duration` | `{ durationMs }` |
| `ASK_USER` | `tool_use` with `name:"AskUserQuestion"` | `{ question }` |
| `SESSION_META` | Any record with `slug` field | `{ slug, sessionId }` |

**Parsing strategy:**
```
JSONL Line → JSON.parse() → Type Switch → Event Factory → Event Object
```

### 3.4 Box Renderer (`js/boxRenderer.js`)

**Responsibility:** Render a single session box to a canvas element.

**Layout within each canvas (400×250 logical pixels, rendered at 2x):**

```
┌─────────────────────────────────────────────────────┐
│ (10,10)                              (310,10)       │
│   ┌────────┐                          ┌────────┐   │
│   │ HUMAN  │                          │ ROBOT  │   │
│   │ 64x64  │   ←── connection ───▶   │ 64x64  │   │
│   └────────┘                          └────────┘   │
│ (10,74)                              (310,74)       │
│                                                     │
│   ┌──┐  ┌──┐  ┌──┐  ┌──┐  ┌──┐  ┌──┐             │
│   │S1│  │S2│  │S3│  │S4│  │S5│  │S6│  ...         │ ← Sub-agents
│   └──┘  └──┘  └──┘  └──┘  └──┘  └──┘             │   (32x32 each)
│ (10,150)                                            │
│                                                     │
│  session-slug | Status: Using Read tool | 12s       │ ← Status bar
│ (10,220)                                            │
└─────────────────────────────────────────────────────┘
```

**Rendering layers (bottom to top):**
1. Background fill (teal: `#1b6ca8`)
2. Human sprite
3. Main agent sprite
4. Connection line/indicator between human and agent
5. Sub-agent sprites (dynamic row)
6. Speech bubble (when waiting for user)
7. Status bar text

### 3.5 Sprite Engine (`js/spriteEngine.js`)

**Responsibility:** Define, cache, and animate pixel-art sprites.

**Sprite definition format:**
```javascript
{
  name: "main-agent",
  width: 32,
  height: 32,
  frames: {
    idle: [[pixel data as 2D array]],
    active: [[frame1], [frame2]]  // 2-frame animation
  },
  palette: {
    primary: "#333333",
    secondary: "#666666",
    accent: "#00ff88"
  },
  animationSpeed: 500  // ms per frame
}
```

**Sprites are defined programmatically** using 2D pixel arrays where each cell is a palette index. This eliminates external asset loading and keeps the app self-contained.

**Animation loop:** Uses `requestAnimationFrame` with delta-time tracking. Each sprite cycles through its active animation frames at the defined speed.

---

## 4. Data Flow

```
JSONL File (disk)
      │
      │ poll every 2s
      ▼
  FileReader.readNewLines()
      │
      │ raw text lines
      ▼
  TranscriptParser.parse(line)
      │
      │ typed events
      ▼
  SessionManager.handleEvent(sessionId, event)
      │
      │ state mutations
      ▼
  SessionState (updated)
      │
      │ render cycle (requestAnimationFrame)
      ▼
  BoxRenderer.render(canvas, sessionState)
      │
      │ draw calls
      ▼
  Canvas 2D (screen)
```

---

## 5. File Structure

```
workchart_office/
├── serve.py                        # Python HTTP server (recommended)
├── serve.js                        # Node.js HTTP server (alternative)
├── index.html                      # App entry point
├── test.html                       # Browser-based test harness (90+ tests)
├── README.md                       # Quick start and project docs
├── .gitignore
├── css/
│   └── styles.css                  # Dark theme, responsive grid
├── js/
│   ├── app.js                      # Init, render loop, demo mode
│   ├── sessionManager.js           # Session state tracking and polling
│   ├── transcriptParser.js         # JSONL record parsing
│   ├── boxRenderer.js              # Canvas rendering per session box
│   ├── spriteEngine.js             # Pixel-art sprites and animation
│   └── fileReader.js               # File access (HTTP primary, FSAccess secondary)
└── design/
    ├── docs/
    │   ├── PRD.md                  # Product Requirements
    │   ├── ARCHITECTURE.md         # This document
    │   ├── TECHNICAL_SPEC.md       # Implementation details
    │   ├── DATA_DICTIONARY.md      # Data structures & JSONL format
    │   ├── VISUAL_DESIGN_SPEC.md   # Visual design and color palettes
    │   ├── IMPLEMENTATION_ROADMAP.md # Phase breakdown (all complete)
    │   ├── TEST_PLAN.md            # Test coverage and strategy
    │   └── BROWSER_MCP_INTEGRATION.md # MCP server integration
    ├── wireframes/
    │   └── box-layout.md           # Box layout wireframe
    └── reference/
        └── example_oveview.png     # Visual reference
```

---

## 6. Technology Constraints

| Constraint | Detail |
|-----------|--------|
| No build step | No bundler, transpiler, or npm install needed |
| No framework | Vanilla HTML, CSS, JavaScript only |
| ES Modules | Use native `<script type="module">` |
| No external CDN | Fully self-contained, works offline |
| Python 3.10+ | Server uses only the standard library (no pip packages) |
| Browser APIs only | Canvas 2D, Fetch; FSAccess API optional for secondary mode |
| No modification | Read-only access to JSONL files |

---

## 7. Error Handling Strategy

| Scenario | Response |
|----------|----------|
| File System Access API denied | Show "Open Folder" button (secondary mode only) |
| JSONL parse error on a line | Skip the line, log warning, continue |
| Session file deleted mid-read | Mark session as "disconnected", keep box visible |
| Browser doesn't support FS API | Use HTTP mode via `serve.py` (the default) |
| Sub-agent file not found | Show sub-agent as "unknown" state, retry on next poll |

---

## 8. Performance Considerations

- **Incremental reading:** Only read new bytes from JSONL files (track offset per file)
- **Canvas per box:** Each box has its own canvas; only re-render boxes with state changes
- **Sprite caching:** Pre-render sprite frames to offscreen canvases, blit during render
- **Throttled polling:** 2-second interval balances responsiveness with CPU usage
- **Dirty flag:** Skip render for boxes with no state change since last frame
