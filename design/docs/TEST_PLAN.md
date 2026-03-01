# Test Plan
# WorkChart Office — Agent Session Visualizer

**Version:** 1.1
**Date:** 2026-03-01
**Author:** Quality Engineering
**Status:** Active

---

## 1. Overview

This document defines the comprehensive test plan for WorkChart Office. All tests target a vanilla browser environment (no Node.js test runner, no framework). The primary test harness is `test.html`, which can be opened directly in a browser.

### 1.1 Test Harness Location

```
workchart_office/test.html
```

### 1.2 How to Run

1. Start the server: `python serve.py`
2. Open http://localhost:3200/test.html in Chrome, Firefox, or Edge.
3. Click **"Run All Tests"** to execute unit and integration tests.
4. Scroll to the **"Visual Tests"** section for manual visual validation.
5. Results are displayed inline with pass/fail counts and detailed output.

**Current coverage:** 90+ automated tests across all modules.

### 1.3 Conventions

- Test IDs use the format `<Module>.<Category>.<Number>` (e.g., `TP.PARSE.01`).
- Priority: **P0** = must pass before any merge, **P1** = should pass, **P2** = nice to have.
- All mock data uses realistic JSONL records matching the format documented in `DATA_DICTIONARY.md`.

---

## 2. Unit Tests

### 2.1 TranscriptParser

The `TranscriptParser.parse(jsonLine)` function converts a raw JSONL string into a typed event object (or `null`).

#### 2.1.1 Record Type Parsing

| ID | Test Case | Input | Expected Output | Priority |
|----|-----------|-------|-----------------|----------|
| TP.PARSE.01 | Parse user text message (string content) | `{"type":"user","message":{"role":"user","content":"Hello"}}` | `{ type: 'USER_PROMPT', text: 'Hello' }` | P0 |
| TP.PARSE.02 | Parse user text message (array content) | `{"type":"user","message":{"role":"user","content":[{"type":"text","text":"Fix the bug"}]}}` | `{ type: 'USER_PROMPT', text: 'Fix the bug' }` | P0 |
| TP.PARSE.03 | Parse user tool_result | `{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_01ABC"}]}}` | `{ type: 'TOOL_END', toolId: 'toolu_01ABC' }` | P0 |
| TP.PARSE.04 | Parse assistant text response | `{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Done."}]}}` | `null` (text-only assistant records produce no event) | P0 |
| TP.PARSE.05 | Parse assistant single tool_use | `{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","id":"toolu_01DEF","name":"Read","input":{"file_path":"/src/app.js"}}]}}` | `{ type: 'TOOL_START', toolName: 'Read', toolId: 'toolu_01DEF', input: {...} }` | P0 |
| TP.PARSE.06 | Parse assistant multiple tool_use blocks | Record with both Read and Grep tool_use blocks | Array of two TOOL_START events | P0 |
| TP.PARSE.07 | Parse progress agent_progress | `{"type":"progress","data":{"type":"agent_progress","agentId":"agent-123",...}}` | `{ type: 'SUBAGENT_ACTIVITY', agentId: 'agent-123', toolName: ... }` | P0 |
| TP.PARSE.08 | Parse system turn_duration | `{"type":"system","subtype":"turn_duration","durationMs":15432}` | `{ type: 'TURN_COMPLETE', durationMs: 15432 }` | P0 |
| TP.PARSE.09 | Parse queue-operation enqueue | `{"type":"queue-operation","operation":"enqueue",...}` | `null` (no event emitted, or SESSION_META if slug present) | P1 |
| TP.PARSE.10 | Parse AskUserQuestion tool_use | Record with `name: "AskUserQuestion"` | `{ type: 'ASK_USER', toolId: ... }` | P0 |

#### 2.1.2 Malformed / Invalid Input

| ID | Test Case | Input | Expected Output | Priority |
|----|-----------|-------|-----------------|----------|
| TP.PARSE.11 | Invalid JSON string | `"not valid json {"` | `null` | P0 |
| TP.PARSE.12 | Empty string | `""` | `null` | P0 |
| TP.PARSE.13 | Valid JSON but unknown type | `{"type":"unknown","data":{}}` | `null` | P1 |
| TP.PARSE.14 | Missing message field on user record | `{"type":"user"}` | `null` | P1 |
| TP.PARSE.15 | Missing content field on assistant record | `{"type":"assistant","message":{"role":"assistant"}}` | `null` | P1 |
| TP.PARSE.16 | Content is null | `{"type":"user","message":{"role":"user","content":null}}` | `null` | P1 |
| TP.PARSE.17 | Content is empty array | `{"type":"assistant","message":{"role":"assistant","content":[]}}` | `null` | P1 |
| TP.PARSE.18 | Content is empty string | `{"type":"user","message":{"role":"user","content":""}}` | `null` | P1 |
| TP.PARSE.19 | Numeric input | `"42"` | `null` | P2 |
| TP.PARSE.20 | Array input | `"[1,2,3]"` | `null` | P2 |

#### 2.1.3 Multi-tool_use Records

| ID | Test Case | Input | Expected Output | Priority |
|----|-----------|-------|-----------------|----------|
| TP.PARSE.21 | Two tool_use blocks (Read + Grep) | Assistant record with two tool_use content blocks | Array with two TOOL_START events | P0 |
| TP.PARSE.22 | Three tool_use blocks | Assistant record with three tool_use content blocks | Array with three TOOL_START events | P1 |
| TP.PARSE.23 | tool_use mixed with text blocks | Assistant record with text + tool_use content | Array containing only TOOL_START events (text ignored) | P0 |
| TP.PARSE.24 | Single tool_use returns object, not array | Assistant record with exactly one tool_use | Single event object (not wrapped in array) | P0 |

#### 2.1.4 Sub-Agent Detection

| ID | Test Case | Input | Expected Output | Priority |
|----|-----------|-------|-----------------|----------|
| TP.PARSE.25 | Task tool_use triggers SUBAGENT_SPAWN | `name: "Task"` with `input.description` | Event includes `type: 'SUBAGENT_SPAWN'`, `agentId`, `description` | P0 |
| TP.PARSE.26 | Agent tool_use triggers SUBAGENT_SPAWN | `name: "Agent"` with `input.prompt` | Event includes `type: 'SUBAGENT_SPAWN'`, `agentId`, `description` | P0 |
| TP.PARSE.27 | Task with no description | `name: "Task"` with empty input | `description` defaults to `""` | P1 |
| TP.PARSE.28 | Task also emits TOOL_START | `name: "Task"` | Returns array with both SUBAGENT_SPAWN and TOOL_START | P0 |
| TP.PARSE.29 | Sub-agent agentId fallback | `name: "Task"` with no `input.agentId` | `agentId` falls back to `block.id` | P1 |

#### 2.1.5 Session Metadata Extraction

| ID | Test Case | Input | Expected Output | Priority |
|----|-----------|-------|-----------------|----------|
| TP.PARSE.30 | Slug extracted from record | Record with `slug: "my-session"` | Event includes or returns `SESSION_META` with slug | P1 |
| TP.PARSE.31 | No slug on record | Record without `slug` field | No SESSION_META emitted | P1 |

---

### 2.2 SessionState

The `SessionState` class manages the live state of a single agent session. It receives events from the parser via `handleEvent()`.

#### 2.2.1 Event Handlers

| ID | Test Case | Event | Expected State Change | Priority |
|----|-----------|-------|-----------------------|----------|
| SS.EVENT.01 | USER_PROMPT sets humanActive | `{ type: 'USER_PROMPT', text: 'Hello' }` | `humanActive === true`, `mainAgent.state === 'active'` | P0 |
| SS.EVENT.02 | TOOL_START sets active tool | `{ type: 'TOOL_START', toolName: 'Read', toolId: 'toolu_01' }` | `mainAgent.state === 'active'`, `mainAgent.currentTool === 'Read'`, `mainAgent.toolId === 'toolu_01'` | P0 |
| SS.EVENT.03 | TOOL_END clears matching tool | `{ type: 'TOOL_END', toolId: 'toolu_01' }` | `mainAgent.currentTool === null`, `mainAgent.toolId === null` | P0 |
| SS.EVENT.04 | TOOL_END ignores mismatched toolId | `TOOL_END` with different toolId than active | `mainAgent.currentTool` unchanged | P0 |
| SS.EVENT.05 | SUBAGENT_SPAWN adds sub-agent | `{ type: 'SUBAGENT_SPAWN', agentId: 'a1', description: 'Fix tests' }` | `subAgents.has('a1') === true`, sub-agent state is `'active'` | P0 |
| SS.EVENT.06 | SUBAGENT_ACTIVITY updates sub-agent | `{ type: 'SUBAGENT_ACTIVITY', agentId: 'a1', toolName: 'Bash' }` | `subAgents.get('a1').lastTool === 'Bash'`, state is `'active'` | P0 |
| SS.EVENT.07 | SUBAGENT_ACTIVITY for unknown agent | `{ type: 'SUBAGENT_ACTIVITY', agentId: 'unknown' }` | No error, no state change | P1 |
| SS.EVENT.08 | TURN_COMPLETE resets to idle | `{ type: 'TURN_COMPLETE', durationMs: 5000 }` | `mainAgent.state === 'idle'`, `mainAgent.currentTool === null` | P0 |
| SS.EVENT.09 | ASK_USER sets waiting | `{ type: 'ASK_USER', toolId: 'toolu_ask' }` | `mainAgent.state === 'waiting'` | P0 |
| SS.EVENT.10 | SESSION_META sets slug | `{ type: 'SESSION_META', slug: 'my-project' }` | `slug === 'my-project'` | P0 |
| SS.EVENT.11 | SESSION_META with no slug is no-op | `{ type: 'SESSION_META' }` (no slug field) | `slug` unchanged | P1 |
| SS.EVENT.12 | dirty flag set after every event | Any valid event | `dirty === true` | P0 |

#### 2.2.2 humanActive Auto-Clear Timer

| ID | Test Case | Setup | Expected Behavior | Priority |
|----|-----------|-------|--------------------|----------|
| SS.TIMER.01 | humanActive clears after 3 seconds | Send USER_PROMPT, wait 3100ms | `humanActive === false` | P0 |
| SS.TIMER.02 | Timer resets on new USER_PROMPT | Send USER_PROMPT, wait 1s, send another, wait 2s | `humanActive === true` (timer reset) | P0 |
| SS.TIMER.03 | dirty set when timer fires | Send USER_PROMPT, wait 3100ms | `dirty === true` after timer | P1 |

#### 2.2.3 Multiple Sub-Agents

| ID | Test Case | Setup | Expected State | Priority |
|----|-----------|-------|----------------|----------|
| SS.SUB.01 | Track 3 independent sub-agents | Spawn agents a1, a2, a3 | `subAgents.size === 3` | P0 |
| SS.SUB.02 | Activity updates correct sub-agent | Spawn a1, a2; send activity for a2 | `subAgents.get('a2').lastTool` updated, a1 unchanged | P0 |
| SS.SUB.03 | Sub-agents persist after TURN_COMPLETE | Spawn a1, then TURN_COMPLETE | `subAgents.size === 1`, a1 still present | P1 |

#### 2.2.4 State Sequences

| ID | Test Case | Event Sequence | Expected Final State | Priority |
|----|-----------|---------------|----------------------|----------|
| SS.SEQ.01 | Full turn lifecycle | USER_PROMPT -> TOOL_START(Read) -> TOOL_END -> TOOL_START(Edit) -> TOOL_END -> TURN_COMPLETE | `mainAgent.state === 'idle'`, no active tool | P0 |
| SS.SEQ.02 | Ask user flow | TOOL_START(Edit) -> ASK_USER | `mainAgent.state === 'waiting'` | P0 |
| SS.SEQ.03 | User responds after ask | ASK_USER -> USER_PROMPT | `mainAgent.state === 'active'`, `humanActive === true` | P0 |
| SS.SEQ.04 | Sub-agent spawn during tool use | TOOL_START(Read) -> SUBAGENT_SPAWN -> TOOL_END | Sub-agent exists, main agent tool cleared | P0 |

---

### 2.3 SpriteEngine

#### 2.3.1 Sprite Data Integrity

| ID | Test Case | Validation | Priority |
|----|-----------|-----------|----------|
| SE.DATA.01 | All sprite frame arrays have consistent dimensions | Every frame in a sprite definition has the same row count and column count | P0 |
| SE.DATA.02 | All palette indices in frames reference valid palette entries | No frame cell references a palette index not in the sprite's palette (except 0 for transparent) | P0 |
| SE.DATA.03 | Human sprite has idle and active frames | `human.frames.idle` and `human.frames.active` both exist and are non-empty | P0 |
| SE.DATA.04 | Main agent sprite has idle and active frames | `main-agent.frames.idle` and `main-agent.frames.active` both exist and are non-empty | P0 |
| SE.DATA.05 | Sub-agent sprite has idle and active frames | `sub-agent.frames.idle` and `sub-agent.frames.active` both exist and are non-empty | P0 |

#### 2.3.2 Animation Frame Cycling

| ID | Test Case | Setup | Expected Behavior | Priority |
|----|-----------|-------|--------------------|----------|
| SE.ANIM.01 | Frame advances after duration elapsed | Call `draw()` with cumulative dt exceeding frame duration | Frame index increments | P0 |
| SE.ANIM.02 | Frame wraps to 0 after last frame | Call `draw()` enough times to exceed total frames | Frame index returns to 0 | P0 |
| SE.ANIM.03 | Frame does not advance if dt is too small | Call `draw()` with dt = 1ms | Frame index stays at 0 | P1 |
| SE.ANIM.04 | Different sprite/state combos have independent animation state | Animate `human-idle` and `main-agent-active` | Each has its own frame counter | P1 |

---

### 2.4 BoxRenderer

#### 2.4.1 Canvas Configuration

| ID | Test Case | Validation | Priority |
|----|-----------|-----------|----------|
| BR.CANVAS.01 | Canvas logical size is 400x250 | `canvas.width === 400`, `canvas.height === 250` | P0 |
| BR.CANVAS.02 | Canvas display size accounts for devicePixelRatio | Canvas attribute width/height = logical * dpr, CSS width/height = logical | P0 |
| BR.CANVAS.03 | Canvas has pixelated rendering | CSS `image-rendering: pixelated` or `crisp-edges` | P1 |

#### 2.4.2 Render Output

| ID | Test Case | Session State | Expected Drawing | Priority |
|----|-----------|--------------|-----------------|----------|
| BR.RENDER.01 | Idle session renders all elements | state=idle, 0 sub-agents | Background, border, human sprite, agent sprite, status bar | P0 |
| BR.RENDER.02 | Active session shows animated sprites | state=active, currentTool=Read | Agent sprite in active animation state | P0 |
| BR.RENDER.03 | Waiting session shows speech bubble | state=waiting | Speech bubble with "?" drawn near agent | P0 |
| BR.RENDER.04 | Sub-agents render in bottom row | 3 sub-agents | 3 sub-agent sprites at y=140, spaced 50px apart | P0 |
| BR.RENDER.05 | Status bar shows slug and tool | slug="my-project", currentTool="Edit" | Status bar text: "my-project | Using Edit | 0 sub-agent(s)" | P0 |
| BR.RENDER.06 | Sub-agent overflow (>7 sub-agents) | 8+ sub-agents | Only first 7 rendered (x <= 370), no canvas overflow | P1 |

---

### 2.5 FileReaderLayer

#### 2.5.1 Incremental Offset Tracking

| ID | Test Case | Setup | Expected Behavior | Priority |
|----|-----------|-------|--------------------|----------|
| FR.OFFSET.01 | Initial offset is 0 | New session | `fileOffset === 0` | P0 |
| FR.OFFSET.02 | Offset advances after read | Read returns lines, newOffset=500 | `fileOffset === 500` | P0 |
| FR.OFFSET.03 | No new data returns same offset | File size unchanged since last read | `lines` is empty, offset unchanged | P0 |
| FR.OFFSET.04 | Incremental read only returns new lines | First read gets lines 1-5, file grows, second read gets lines 6-10 | Second read returns only new lines | P0 |

---

## 3. Integration Tests

### 3.1 JSONL to State Pipeline

| ID | Test Case | Setup | Expected Outcome | Priority |
|----|-----------|-------|--------------------|----------|
| INT.PIPE.01 | Parse multiple JSONL lines into session state | Feed 5 lines: enqueue, user prompt, assistant tool_use, user tool_result, turn_duration | Session state reflects: humanActive briefly true, tool started then ended, final state idle | P0 |
| INT.PIPE.02 | Sub-agent lifecycle | Feed: assistant with Task tool_use, then progress agent_progress, then turn_complete | Sub-agent appears, shows activity, main agent goes idle | P0 |
| INT.PIPE.03 | Multi-line batch processing | Feed 20 JSONL lines at once | All events processed in order, final state is correct | P0 |

### 3.2 Multi-Session Management

| ID | Test Case | Setup | Expected Outcome | Priority |
|----|-----------|-------|--------------------|----------|
| INT.MULTI.01 | Two sessions tracked independently | Two different sessionIds with interleaved events | Each SessionState has independent mainAgent.state | P0 |
| INT.MULTI.02 | New session discovered mid-run | Start with 1 session, add second session's events | SessionManager creates new SessionState | P0 |
| INT.MULTI.03 | Session slug extracted per-session | Two sessions with different slugs | Each session has its own slug | P1 |

### 3.3 Sub-Agent File Discovery

| ID | Test Case | Setup | Expected Outcome | Priority |
|----|-----------|-------|--------------------|----------|
| INT.SUBFILE.01 | Sub-agent file listing | Session directory contains `subagents/agent-abc.jsonl` | `listSubAgentFiles` returns the file | P1 |
| INT.SUBFILE.02 | Sub-agent events from separate file | Main file has Task spawn, sub-agent file has tool_use | Sub-agent state reflects tool from sub-agent file | P1 |

### 3.4 Full Render Cycle

| ID | Test Case | Setup | Expected Outcome | Priority |
|----|-----------|-------|--------------------|----------|
| INT.RENDER.01 | State change triggers re-render | Feed TOOL_START event, check dirty flag, call render | Canvas is drawn with active agent sprite, dirty cleared | P0 |
| INT.RENDER.02 | Multiple boxes render independently | Two sessions with different states | Each canvas shows correct state for its session | P0 |

---

## 4. Visual / Manual Tests

These tests require human verification by looking at the rendered output.

### 4.1 Box Rendering

| ID | Test Case | How to Verify | Expected Result | Priority |
|----|-----------|--------------|-----------------|----------|
| VIS.BOX.01 | Box renders at default size | Open test.html, look at Visual Tests section | 400x250 box with blue background and dark border | P0 |
| VIS.BOX.02 | Box scales correctly on high-DPI display | Open on retina/high-DPI monitor | Sprites are crisp, not blurry | P1 |
| VIS.BOX.03 | Multiple boxes wrap in grid | Resize browser window | Boxes wrap to next row when window is narrow | P1 |

### 4.2 Sprites

| ID | Test Case | How to Verify | Expected Result | Priority |
|----|-----------|--------------|-----------------|----------|
| VIS.SPRITE.01 | Human sprite is recognizable | Look at top-left of box | Humanoid pixel-art character visible | P0 |
| VIS.SPRITE.02 | Robot/agent sprite is recognizable | Look at top-right of box | Robot pixel-art character visible | P0 |
| VIS.SPRITE.03 | Sub-agent sprite is recognizable | Look at bottom row of box with sub-agents | Smaller brain/bot pixel-art character visible | P0 |
| VIS.SPRITE.04 | Active animation is visible | Set state to active | Sprite visibly animates (not static) | P0 |
| VIS.SPRITE.05 | Idle sprite is static | Set state to idle | Sprite does not animate | P0 |

### 4.3 UI Elements

| ID | Test Case | How to Verify | Expected Result | Priority |
|----|-----------|--------------|-----------------|----------|
| VIS.UI.01 | Status bar text is readable | Look at bottom of box | White text on dark background, shows slug/tool/sub-agent count | P0 |
| VIS.UI.02 | Speech bubble appears when waiting | Set state to waiting | "?" speech bubble visible near agent sprite | P0 |
| VIS.UI.03 | Speech bubble disappears when active | Change from waiting to active | Speech bubble gone | P0 |
| VIS.UI.04 | Sub-agents appear in correct positions | Add 3 sub-agents | Three sprites in bottom row, evenly spaced | P0 |

### 4.4 Animation Performance

| ID | Test Case | How to Verify | Expected Result | Priority |
|----|-----------|--------------|-----------------|----------|
| VIS.PERF.01 | Animation is smooth | Watch active sprites for 10 seconds | No jank, smooth frame transitions | P0 |
| VIS.PERF.02 | No flicker during state changes | Rapidly toggle states | No visible flicker or artifacts | P1 |

---

## 5. Edge Cases

### 5.1 Data Edge Cases

| ID | Test Case | Setup | Expected Behavior | Priority |
|----|-----------|-------|--------------------|----------|
| EDGE.DATA.01 | Empty JSONL file | File with 0 bytes | Session created but stays in initial state (idle) | P0 |
| EDGE.DATA.02 | File with only queue-operation records | File with enqueue + dequeue, no user/assistant | No events emitted, state stays idle | P0 |
| EDGE.DATA.03 | Session with 0 sub-agents | Full session, no Task/Agent tool use | `subAgents.size === 0`, bottom row is empty | P0 |
| EDGE.DATA.04 | Session with 20+ sub-agents | 20 SUBAGENT_SPAWN events | All 20 tracked in map, renderer caps display at ~7 | P1 |
| EDGE.DATA.05 | Malformed JSON line in middle of valid data | Lines: valid, valid, INVALID, valid | Invalid line skipped (returns null), valid lines parsed | P0 |
| EDGE.DATA.06 | Two sessions with same slug | Two different sessionIds, both with slug "my-project" | Both sessions exist independently, both show same slug | P1 |
| EDGE.DATA.07 | Very long tool name | tool_use with 200-character name | Status bar truncates or handles gracefully | P2 |
| EDGE.DATA.08 | Unicode in user prompt | User prompt with emoji and CJK characters | Parsed correctly, text preserved | P2 |

### 5.2 Runtime Edge Cases

| ID | Test Case | Setup | Expected Behavior | Priority |
|----|-----------|-------|--------------------|----------|
| EDGE.RT.01 | File System Access API not supported | Browser without `window.showDirectoryPicker` | Graceful fallback or clear error message | P0 |
| EDGE.RT.02 | File deleted while being read | Remove file between polls | No crash, session marked as stale or error handled | P1 |
| EDGE.RT.03 | Very rapid state changes | 50 events in 100ms | All events processed, final state correct | P1 |
| EDGE.RT.04 | Browser tab hidden (requestAnimationFrame paused) | Switch to another tab for 30s, return | Rendering resumes, no backlog explosion | P1 |
| EDGE.RT.05 | Directory with 100+ JSONL files | Folder with many files | All discovered, no crash, acceptable poll time | P2 |

---

## 6. Performance Tests

| ID | Test Case | Method | Target | Priority |
|----|-----------|--------|--------|----------|
| PERF.01 | 10 simultaneous sessions rendering | Create 10 BoxRenderers with active state, measure FPS | >= 30 FPS sustained | P0 |
| PERF.02 | 100+ JSONL lines parsed in batch | Feed 100 lines to parser, measure wall-clock time | < 50ms total parse time | P0 |
| PERF.03 | Memory after 1 hour of polling | Open test page, let poll for 60 minutes, check memory | < 100MB heap usage | P1 |
| PERF.04 | First render time | From page load to first box visible | < 2 seconds | P0 |
| PERF.05 | State update latency | From event fed to dirty flag set | < 1ms per event | P1 |

---

## 7. Browser Compatibility

| ID | Browser | Version | Priority |
|----|---------|---------|----------|
| COMPAT.01 | Chrome | Latest 2 versions | P0 |
| COMPAT.02 | Firefox | Latest 2 versions | P0 |
| COMPAT.03 | Edge | Latest 2 versions | P0 |
| COMPAT.04 | Safari | Latest 2 versions | P2 |

**Notes:**
- File System Access API is Chromium-only (Chrome, Edge). The primary HTTP mode via `serve.py` works in all browsers.
- `OffscreenCanvas` is supported in all target browsers.
- ES module `<script type="module">` is supported in all target browsers.

---

## 8. Test Data Inventory

The test harness (`test.html`) includes the following mock JSONL records:

| Record ID | Type | Subtype | Description |
|-----------|------|---------|-------------|
| MOCK_ENQUEUE | queue-operation | enqueue | Session start |
| MOCK_USER_TEXT | user | text content | Human prompt "Fix the login bug" |
| MOCK_ASSISTANT_SINGLE_TOOL | assistant | single tool_use | Agent uses Read tool |
| MOCK_ASSISTANT_MULTI_TOOL | assistant | multiple tool_use | Agent uses Read + Grep |
| MOCK_ASSISTANT_SUBAGENT | assistant | Task tool_use | Agent spawns sub-agent |
| MOCK_ASSISTANT_ASK | assistant | AskUserQuestion | Agent asks user a question |
| MOCK_TOOL_RESULT | user | tool_result | Tool returns output |
| MOCK_PROGRESS | progress | agent_progress | Sub-agent activity update |
| MOCK_TURN_DURATION | system | turn_duration | Turn completed |
| MOCK_ASSISTANT_TEXT_ONLY | assistant | text only | Agent text response, no tools |
| MOCK_DEQUEUE | queue-operation | dequeue | Session end |

---

## 9. Traceability Matrix

Maps test cases to requirements from the PRD.

| Requirement | Test Cases |
|------------|------------|
| FR1 (Scan directory for JSONL files) | FR.OFFSET.01-04, INT.SUBFILE.01 |
| FR2 (Create visual box per session) | INT.MULTI.01-02, VIS.BOX.01 |
| FR3 (Detect new sessions within 2s) | INT.MULTI.02 |
| FR6 (Human sprite top-left) | VIS.SPRITE.01, BR.RENDER.01 |
| FR7 (Agent sprite top-right) | VIS.SPRITE.02, BR.RENDER.01 |
| FR8 (Sub-agent sprites bottom row) | VIS.SPRITE.03, BR.RENDER.04, SS.SUB.01-03 |
| FR9 (Display session slug) | BR.RENDER.05, SS.EVENT.10 |
| FR10 (Display agent status) | BR.RENDER.05, SS.EVENT.02 |
| FR11 (Detect tool use) | TP.PARSE.05-06, SS.EVENT.02-03 |
| FR12 (Detect sub-agent spawning) | TP.PARSE.25-29, SS.EVENT.05 |
| FR13 (Detect turn completion) | TP.PARSE.08, SS.EVENT.08 |
| FR14 (Detect user input) | TP.PARSE.01-02, SS.EVENT.01 |
| FR15 (Detect waiting for user) | TP.PARSE.10, SS.EVENT.09 |
| FR16 (Active animated sprite) | VIS.SPRITE.04, SE.ANIM.01-02 |
| FR17 (Idle static sprite) | VIS.SPRITE.05 |
| FR19 (Waiting speech bubble) | VIS.UI.02-03, BR.RENDER.03 |
| NFR1 (Load under 2s) | PERF.04 |
| NFR3 (< 100MB with 10 sessions) | PERF.03 |
| NFR5 (30+ FPS) | PERF.01, VIS.PERF.01 |

---

## 10. Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| File System Access API not available in Firefox/Safari | Cannot open folders in those browsers | HTTP API via `serve.py` is the primary mode and works in all browsers |
| OffscreenCanvas not available | Sprites cannot be pre-rendered | Fall back to regular canvas elements for pre-rendering |
| Large JSONL files (>10MB) | Memory pressure, slow parsing | Incremental offset reading ensures only new data is parsed |
| Many sub-agents (>20) | Canvas overflow, visual clutter | Renderer caps visible sub-agents, all tracked in state |
| Rapid file changes | Polling interval misses intermediate states | 2-second polling is acceptable; events are cumulative, not point-in-time |
