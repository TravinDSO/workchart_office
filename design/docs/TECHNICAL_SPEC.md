# Technical Specification
# WorkChart Office — Agent Session Visualizer

**Version:** 1.1
**Date:** 2026-03-01
**Status:** Active

---

## 1. Module Specifications

### 1.1 `app.js` — Application Entry Point

**Exports:** None (entry module)
**Imports:** `SessionManager`, `BoxRenderer`, `SpriteEngine`, `FileReader`

**Initialization sequence:**
```
1. Initialize SpriteEngine (pre-render all sprite frames)
2. Create FileReader instance
3. Create SessionManager(fileReader, onStateChange callback)
4. Set up UI: "Open Folder" button, session grid container
5. On folder opened: start SessionManager polling
6. Start requestAnimationFrame render loop
```

**Render loop:**
```
function renderLoop(timestamp) {
    const dt = timestamp - lastTimestamp;
    lastTimestamp = timestamp;

    for (const [sessionId, renderer] of boxRenderers) {
        const session = sessionManager.getSession(sessionId);
        if (session.dirty) {
            renderer.render(session, dt);
            session.dirty = false;
        }
    }

    requestAnimationFrame(renderLoop);
}
```

**Session grid management:**
- When a new session is discovered: create a `<div>` wrapper with a `<canvas>` child, append to grid, create a `BoxRenderer` for it
- When a session ends: keep the box visible but dim it (opacity 0.5), stop polling that file

---

### 1.2 `fileReader.js` — File Access Abstraction

**Exports:** `FileReader` class

**Interface:**
```javascript
class FileReader {
    mode: "fsapi" | "http"

    // File System Access API mode
    async openDirectory()
    // Returns: FileSystemDirectoryHandle

    // List .jsonl files in the project directory
    async listJsonlFiles()
    // Returns: Array<{ name: string, handle: FileSystemFileHandle }>

    // Read new content from a file starting at offset
    async readNewLines(fileHandle, offset)
    // Returns: { lines: string[], newOffset: number }

    // List sub-agent files for a session
    async listSubAgentFiles(sessionId)
    // Returns: Array<{ agentId: string, handle: FileSystemFileHandle }>
}
```

**File System Access API flow:**
```javascript
async openDirectory() {
    this.dirHandle = await window.showDirectoryPicker({ mode: 'read' });
    this.mode = 'fsapi';
}

async readNewLines(fileHandle, offset) {
    const file = await fileHandle.getFile();
    if (file.size <= offset) return { lines: [], newOffset: offset };

    const slice = file.slice(offset);
    const text = await slice.text();
    const lines = text.split('\n').filter(l => l.trim());
    return { lines, newOffset: file.size };
}
```

**HTTP flow (primary mode via `serve.py`):**
```javascript
async readNewLines(project, fileName, offset) {
    const resp = await fetch(`/api/read?project=${project}&file=${fileName}&offset=${offset}`);
    const data = await resp.json();
    return { lines: data.lines, newOffset: data.newOffset };
}
```

---

### 1.3 `sessionManager.js` — Session State Management

**Exports:** `SessionManager` class

**Interface:**
```javascript
class SessionManager {
    constructor(fileReader, onSessionUpdate)

    start()           // Begin polling loop
    stop()            // Stop polling
    getSession(id)    // Get SessionState by ID
    getSessions()     // Get all active SessionState objects
}
```

**Polling implementation:**
```javascript
async pollCycle() {
    // 1. Scan for new .jsonl files
    const files = await this.fileReader.listJsonlFiles();

    for (const file of files) {
        const sessionId = file.name.replace('.jsonl', '');

        // 2. Create session if new
        if (!this.sessions.has(sessionId)) {
            this.sessions.set(sessionId, new SessionState(sessionId, file.handle));
            this.onSessionUpdate('new', sessionId);
        }

        // 3. Read new lines
        const session = this.sessions.get(sessionId);
        const { lines, newOffset } = await this.fileReader.readNewLines(
            file.handle, session.fileOffset
        );
        session.fileOffset = newOffset;

        // 4. Parse each line
        for (const line of lines) {
            const event = TranscriptParser.parse(line);
            if (event) {
                session.handleEvent(event);
                session.dirty = true;
            }
        }

        // 5. Check for sub-agent files
        await this.pollSubAgents(session);
    }

    // 6. Schedule next poll
    this.pollTimer = setTimeout(() => this.pollCycle(), 2000);
}
```

**SessionState class:**
```javascript
class SessionState {
    sessionId       // string
    slug            // string (human-readable session name)
    fileHandle      // FileSystemFileHandle
    fileOffset      // number
    dirty           // boolean (needs re-render)

    mainAgent: {
        state       // "idle" | "active" | "waiting"
        currentTool // string | null (e.g., "Read", "Edit", "Bash")
        toolId      // string | null (for matching tool_result)
    }

    subAgents       // Map<agentId, SubAgentState>

    humanActive     // boolean
    humanActiveTimer // timeout handle (auto-clear after 3s)

    lastUpdate      // timestamp
    isComplete      // boolean

    handleEvent(event) {
        switch (event.type) {
            case 'USER_PROMPT':
                this.humanActive = true;
                this.mainAgent.state = 'active';
                clearTimeout(this.humanActiveTimer);
                this.humanActiveTimer = setTimeout(() => {
                    this.humanActive = false;
                    this.dirty = true;
                }, 3000);
                break;

            case 'TOOL_START':
                this.mainAgent.state = 'active';
                this.mainAgent.currentTool = event.toolName;
                this.mainAgent.toolId = event.toolId;
                break;

            case 'TOOL_END':
                if (this.mainAgent.toolId === event.toolId) {
                    this.mainAgent.currentTool = null;
                    this.mainAgent.toolId = null;
                }
                break;

            case 'SUBAGENT_SPAWN':
                this.subAgents.set(event.agentId, {
                    state: 'active',
                    description: event.description,
                    lastTool: null,
                    spawnTime: Date.now()
                });
                break;

            case 'SUBAGENT_ACTIVITY':
                const sub = this.subAgents.get(event.agentId);
                if (sub) {
                    sub.state = 'active';
                    sub.lastTool = event.toolName;
                }
                break;

            case 'TURN_COMPLETE':
                this.mainAgent.state = 'idle';
                this.mainAgent.currentTool = null;
                break;

            case 'ASK_USER':
                this.mainAgent.state = 'waiting';
                break;

            case 'SESSION_META':
                if (event.slug) this.slug = event.slug;
                break;
        }
    }
}
```

---

### 1.4 `transcriptParser.js` — JSONL Record Parser

**Exports:** `TranscriptParser` object

**Interface:**
```javascript
TranscriptParser = {
    parse(jsonLine)  // Returns: Event object or null
}
```

**Parsing logic:**
```javascript
parse(jsonLine) {
    let record;
    try {
        record = JSON.parse(jsonLine);
    } catch {
        return null;  // Skip malformed lines
    }

    // Extract session metadata from any record
    const meta = record.slug
        ? { type: 'SESSION_META', slug: record.slug, sessionId: record.sessionId }
        : null;

    switch (record.type) {
        case 'user': return this.parseUserRecord(record) || meta;
        case 'assistant': return this.parseAssistantRecord(record) || meta;
        case 'progress': return this.parseProgressRecord(record);
        case 'system': return this.parseSystemRecord(record);
        default: return meta;
    }
}

parseUserRecord(record) {
    const content = record.message?.content;
    if (!content) return null;

    // Array content
    if (Array.isArray(content)) {
        // Check for tool results
        const toolResult = content.find(b => b.type === 'tool_result');
        if (toolResult) {
            return { type: 'TOOL_END', toolId: toolResult.tool_use_id };
        }
        // Check for text (user prompt)
        const textBlock = content.find(b => b.type === 'text');
        if (textBlock) {
            return { type: 'USER_PROMPT', text: textBlock.text };
        }
    }

    // String content (user prompt)
    if (typeof content === 'string' && content.trim()) {
        return { type: 'USER_PROMPT', text: content };
    }

    return null;
}

parseAssistantRecord(record) {
    const content = record.message?.content;
    if (!Array.isArray(content)) return null;

    const events = [];

    for (const block of content) {
        if (block.type === 'tool_use') {
            // Check for sub-agent spawn
            if (block.name === 'Task' || block.name === 'Agent') {
                const desc = block.input?.description || block.input?.prompt || '';
                const agentId = block.input?.agentId || block.id;
                events.push({
                    type: 'SUBAGENT_SPAWN',
                    agentId,
                    description: desc,
                    toolId: block.id
                });
            }

            // Check for AskUserQuestion
            if (block.name === 'AskUserQuestion') {
                return { type: 'ASK_USER', toolId: block.id };
            }

            // General tool start
            events.push({
                type: 'TOOL_START',
                toolName: block.name,
                toolId: block.id,
                input: block.input
            });
        }
    }

    return events.length === 1 ? events[0] : events.length > 1 ? events : null;
}

parseProgressRecord(record) {
    if (record.data?.type === 'agent_progress') {
        const agentId = record.data.agentId;
        const msg = record.data.message;
        let toolName = null;

        if (msg?.message?.content) {
            const toolUse = (Array.isArray(msg.message.content)
                ? msg.message.content : []).find(b => b.type === 'tool_use');
            if (toolUse) toolName = toolUse.name;
        }

        return { type: 'SUBAGENT_ACTIVITY', agentId, toolName };
    }
    return null;
}

parseSystemRecord(record) {
    if (record.subtype === 'turn_duration') {
        return { type: 'TURN_COMPLETE', durationMs: record.durationMs };
    }
    return null;
}
```

---

### 1.5 `boxRenderer.js` — Session Box Rendering

**Exports:** `BoxRenderer` class

**Interface:**
```javascript
class BoxRenderer {
    constructor(canvas, spriteEngine)

    render(sessionState, deltaTime)  // Renders current state to canvas
    resize(width, height)            // Handle container resize
}
```

**Canvas dimensions:**
- Logical size: 400 × 250 pixels
- Display size: scaled by `devicePixelRatio` for sharp rendering
- `image-rendering: pixelated` CSS for crisp pixel art

**Render method:**
```javascript
render(session, dt) {
    const ctx = this.canvas.getContext('2d');

    // 1. Clear and fill background
    ctx.fillStyle = '#1b6ca8';
    ctx.fillRect(0, 0, 400, 250);

    // 2. Draw border
    ctx.strokeStyle = '#0d4f7a';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, 398, 248);

    // 3. Draw human sprite (top-left)
    const humanFrame = session.humanActive ? 'active' : 'idle';
    this.spriteEngine.draw(ctx, 'human', humanFrame, 30, 15, dt);

    // 4. Draw main agent sprite (top-right)
    const agentFrame = session.mainAgent.state === 'active' ? 'active' : 'idle';
    this.spriteEngine.draw(ctx, 'main-agent', agentFrame, 280, 15, dt);

    // 5. Draw connection indicator
    this.drawConnection(ctx, session.mainAgent.state);

    // 6. Draw sub-agents (bottom row)
    let x = 20;
    const y = 140;
    for (const [agentId, sub] of session.subAgents) {
        const frame = sub.state === 'active' ? 'active' : 'idle';
        this.spriteEngine.draw(ctx, 'sub-agent', frame, x, y, dt);
        x += 50;  // spacing between sub-agents
        if (x > 370) break;  // prevent overflow
    }

    // 7. Draw speech bubble if waiting
    if (session.mainAgent.state === 'waiting') {
        this.drawSpeechBubble(ctx, 280, 10, '?');
    }

    // 8. Draw status bar
    this.drawStatusBar(ctx, session);
}

drawStatusBar(ctx, session) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(0, 220, 400, 30);

    ctx.fillStyle = '#ffffff';
    ctx.font = '11px monospace';

    const slug = session.slug || session.sessionId.substring(0, 8);
    const tool = session.mainAgent.currentTool
        ? `Using ${session.mainAgent.currentTool}`
        : session.mainAgent.state;
    const subs = session.subAgents.size;

    ctx.fillText(`${slug} | ${tool} | ${subs} sub-agent(s)`, 10, 238);
}
```

---

### 1.6 `spriteEngine.js` — Pixel Art Sprite System

**Exports:** `SpriteEngine` class

**Interface:**
```javascript
class SpriteEngine {
    constructor()

    init()  // Pre-render all sprites to offscreen canvases
    draw(ctx, spriteName, animState, x, y, dt)  // Draw sprite at position
}
```

**Sprite definitions (programmatic pixel art):**

Each sprite is defined as a 2D array of palette indices. `0` = transparent, `1-N` = palette colors.

```javascript
// Example: 16x16 sub-agent head (simplified)
const SUB_AGENT_IDLE = [
    [0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0],
    [0,0,0,1,1,2,2,2,2,2,2,1,1,0,0,0],
    [0,0,1,2,2,3,2,2,2,3,2,2,1,0,0,0],
    // ... remaining rows
];

const PALETTE = {
    1: '#333333',  // outline
    2: '#555555',  // fill
    3: '#00ff88',  // circuit/accent
};
```

**Pre-rendering:**
```javascript
init() {
    for (const sprite of ALL_SPRITES) {
        for (const [state, frames] of Object.entries(sprite.frames)) {
            for (const frame of frames) {
                const offscreen = new OffscreenCanvas(sprite.width, sprite.height);
                const ctx = offscreen.getContext('2d');
                this.renderPixelData(ctx, frame, sprite.palette);
                this.cache.set(`${sprite.name}-${state}-${i}`, offscreen);
            }
        }
    }
}
```

**Animation state tracking:**
```javascript
draw(ctx, spriteName, animState, x, y, dt) {
    const key = `${spriteName}-${animState}`;
    const anim = this.animations.get(key) || { frame: 0, elapsed: 0 };

    anim.elapsed += dt;
    const frameDuration = this.getFrameDuration(spriteName);
    if (anim.elapsed >= frameDuration) {
        anim.frame = (anim.frame + 1) % this.getFrameCount(spriteName, animState);
        anim.elapsed = 0;
    }
    this.animations.set(key, anim);

    const cached = this.cache.get(`${key}-${anim.frame}`);
    if (cached) {
        // Draw at 2x scale for pixel art crispness
        ctx.drawImage(cached, x, y, cached.width * 2, cached.height * 2);
    }
}
```

---

## 2. `serve.py` — Python HTTP Server (Primary)

A zero-dependency Python server that scans all Claude Code projects and serves both the frontend and a JSON API. Uses only the Python standard library (Python 3.10+).

**Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/projects` | List all project directories under `~/.claude/projects/` |
| GET | `/api/sessions?project=<name>` | List `.jsonl` files (all projects if `project` omitted) |
| GET | `/api/read?project=<name>&file=<name>&offset=<n>` | Read new lines from byte offset |
| GET | `/api/subagents?project=<name>&session=<id>` | List sub-agent files for a session |
| GET | `/*` | Serve static files (index.html, js/, css/) |

**Configuration:**
```python
PORT = int(os.environ.get("PORT", 3200))       # Server port
PROJECTS_BASE = Path.home() / ".claude" / "projects"  # All projects scanned
```

**Key features:**
- Threaded HTTP server (handles concurrent requests)
- Auto-opens browser on startup
- Project label derivation (converts encoded directory names to readable labels)
- Path traversal protection on all API endpoints

### `serve.js` — Node.js Alternative

A Node.js v18+ server with equivalent functionality. Use when Python is not available. Start with `node serve.js` and open http://localhost:3200 manually.

---

## 3. HTML Structure

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WorkChart Office</title>
    <link rel="stylesheet" href="css/styles.css">
</head>
<body>
    <header id="app-header">
        <h1>WorkChart Office</h1>
        <div id="controls">
            <button id="open-folder-btn">Open Project Folder</button>
            <span id="status-indicator">Disconnected</span>
        </div>
    </header>

    <main id="session-grid">
        <!-- Dynamically populated with session boxes -->
    </main>

    <footer id="app-footer">
        <span id="session-count">0 sessions</span>
        <span id="poll-status">Polling: inactive</span>
    </footer>

    <script type="module" src="js/app.js"></script>
</body>
</html>
```

---

## 4. CSS Layout

```css
/* Grid layout for session boxes */
#session-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
    gap: 16px;
    padding: 16px;
}

/* Each session box wrapper */
.session-box {
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

/* Canvas within each box */
.session-box canvas {
    width: 100%;
    height: auto;
    image-rendering: pixelated;
    image-rendering: crisp-edges;
}
```
