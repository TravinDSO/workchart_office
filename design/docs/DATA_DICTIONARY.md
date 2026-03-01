# Data Dictionary
# WorkChart Office — Agent Session Visualizer

**Version:** 1.1
**Date:** 2026-03-01
**Status:** Active

---

## 1. JSONL Transcript Format

Claude Code writes one JSONL file per session at:
```
~/.claude/projects/<project-dir>/<session-uuid>.jsonl
```

Each line is a self-contained JSON object with a `type` discriminator field.

---

## 2. JSONL Record Types

### 2.1 `queue-operation`

Session lifecycle bookkeeping. Appears at start/end of sessions.

| Field | Type | Description |
|-------|------|-------------|
| `type` | `"queue-operation"` | Record discriminator |
| `operation` | `"enqueue" \| "dequeue"` | Session start or end |
| `timestamp` | string (ISO 8601) | When the operation occurred |
| `sessionId` | string (UUID) | Session identifier |

**Example:**
```json
{
  "type": "queue-operation",
  "operation": "enqueue",
  "timestamp": "2026-03-01T15:17:59.013Z",
  "sessionId": "91059d04-c70c-42da-9af4-fddf34870751"
}
```

---

### 2.2 `user`

A human prompt or a tool result returned to the model.

**Common fields (present on most record types):**

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | Record discriminator |
| `parentUuid` | string (UUID) | Parent message in conversation chain |
| `uuid` | string (UUID) | This record's unique ID |
| `timestamp` | string (ISO 8601) | When the record was written |
| `sessionId` | string (UUID) | Session identifier |
| `version` | string | Claude Code version (e.g., `"2.1.63"`) |
| `cwd` | string | Current working directory |
| `gitBranch` | string | Current git branch |
| `isSidechain` | boolean | `true` for sub-agent records |
| `slug` | string | Human-readable session name |
| `userType` | string | `"external"` for human-initiated |

**User text message (human prompt):**

| Field | Type | Description |
|-------|------|-------------|
| `message.role` | `"user"` | Always "user" |
| `message.content` | `Array<{type, text}>` or `string` | Message content |
| `message.content[].type` | `"text"` | Content block type |
| `message.content[].text` | string | The user's prompt text |

**Tool result:**

| Field | Type | Description |
|-------|------|-------------|
| `message.content[].type` | `"tool_result"` | Content block type |
| `message.content[].tool_use_id` | string | Matches the `tool_use.id` that invoked it |
| `message.content[].content` | Array | Tool output content |

---

### 2.3 `assistant`

Model response. Can contain text blocks, tool_use blocks, or both.

**Text response:**

| Field | Type | Description |
|-------|------|-------------|
| `message.role` | `"assistant"` | Always "assistant" |
| `message.model` | string | Model ID (e.g., `"claude-opus-4-6"`) |
| `message.content[].type` | `"text"` | Text content block |
| `message.content[].text` | string | The model's text response |
| `message.stop_reason` | string \| null | Why generation stopped |

**Tool use:**

| Field | Type | Description |
|-------|------|-------------|
| `message.content[].type` | `"tool_use"` | Tool invocation block |
| `message.content[].id` | string | Unique tool invocation ID (e.g., `"toolu_01..."`) |
| `message.content[].name` | string | Tool name (see Tool Names table below) |
| `message.content[].input` | object | Tool parameters |

---

### 2.4 `progress`

Real-time progress updates, sub-typed by `data.type`.

**`agent_progress` (sub-agent activity):**

| Field | Type | Description |
|-------|------|-------------|
| `data.type` | `"agent_progress"` | Progress sub-type |
| `data.agentId` | string | Sub-agent identifier |
| `data.prompt` | string | The prompt given to the sub-agent |
| `data.message` | object | Nested message (same structure as `assistant` or `user`) |
| `parentToolUseID` | string | The `Task` tool_use ID that spawned this sub-agent |

**`hook_progress` (hook execution):**

| Field | Type | Description |
|-------|------|-------------|
| `data.type` | `"hook_progress"` | Progress sub-type |
| `data.hookEvent` | string | Hook event type (e.g., `"PostToolUse"`) |
| `data.hookName` | string | Hook identifier |
| `parentToolUseID` | string | Related tool invocation |

---

### 2.5 `system` (with `subtype: "turn_duration"`)

Emitted at the end of a complete agent turn.

| Field | Type | Description |
|-------|------|-------------|
| `type` | `"system"` | Record discriminator |
| `subtype` | `"turn_duration"` | System sub-type |
| `durationMs` | number | Turn duration in milliseconds |
| `timestamp` | string (ISO 8601) | When the turn ended |
| `isMeta` | boolean | Metadata flag |

---

### 2.6 `file-history-snapshot`

File backup state. Not used by WorkChart Office but documented for completeness.

| Field | Type | Description |
|-------|------|-------------|
| `type` | `"file-history-snapshot"` | Record discriminator |
| `messageId` | string (UUID) | Associated message |
| `snapshot` | object | Backup state data |

---

## 3. Tool Names

Tools that Claude Code can invoke, as seen in `tool_use` blocks:

| Tool Name | Category | Description |
|-----------|----------|-------------|
| `Read` | File I/O | Read a file from disk |
| `Write` | File I/O | Write/create a file |
| `Edit` | File I/O | Edit portions of a file |
| `Glob` | Search | Find files by pattern |
| `Grep` | Search | Search file contents |
| `Bash` | Execution | Run a shell command |
| `WebFetch` | Network | Fetch a URL |
| `WebSearch` | Network | Search the web |
| `Task` / `Agent` | Orchestration | Spawn a sub-agent |
| `NotebookEdit` | File I/O | Edit Jupyter notebooks |
| `AskUserQuestion` | Interaction | Ask the user a question |
| `EnterPlanMode` | Workflow | Switch to planning mode |
| `ExitPlanMode` | Workflow | Exit planning mode |
| `TodoWrite` | Workflow | Update task list |
| `Skill` | Workflow | Execute a skill |

**Sub-agent spawning tools:** `Task` and `Agent` — when either appears in `tool_use`, a new sub-agent is being created.

---

## 4. Application State Model

### 4.1 `SessionState`

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `sessionId` | string | — | UUID from filename |
| `slug` | string | `""` | Human-readable session name |
| `filePath` | string | — | Path to .jsonl file |
| `fileHandle` | FileSystemFileHandle | — | File handle for FS API |
| `fileOffset` | number | `0` | Bytes read so far |
| `dirty` | boolean | `true` | Needs re-render |
| `mainAgent` | `MainAgentState` | see below | Primary agent state |
| `subAgents` | `Map<string, SubAgentState>` | empty | Sub-agent registry |
| `humanActive` | boolean | `false` | Human just sent a prompt |
| `lastUpdate` | number | `0` | Timestamp of last change |
| `isComplete` | boolean | `false` | Session has ended |

### 4.2 `MainAgentState`

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `state` | `"idle" \| "active" \| "waiting"` | `"idle"` | Current agent state |
| `currentTool` | string \| null | `null` | Name of tool being used |
| `toolId` | string \| null | `null` | Active tool_use ID |
| `toolDescription` | string \| null | `null` | Human-friendly tool description |

### 4.3 `SubAgentState`

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `state` | `"active" \| "idle" \| "completed"` | `"active"` | Sub-agent state |
| `description` | string | `""` | Task description from spawn |
| `lastTool` | string \| null | `null` | Last tool the sub-agent used |
| `spawnTime` | number | `Date.now()` | When the sub-agent was created |
| `parentToolId` | string | — | The Task/Agent tool_use ID |

---

## 5. Event Types (Internal)

Events emitted by the Transcript Parser, consumed by Session Manager.

| Event Type | Fields | Triggered By |
|-----------|--------|-------------|
| `USER_PROMPT` | `{ text }` | User sends a message |
| `TOOL_START` | `{ toolName, toolId, input }` | Agent invokes a tool |
| `TOOL_END` | `{ toolId }` | Tool returns a result |
| `SUBAGENT_SPAWN` | `{ agentId, description, toolId }` | Agent spawns Task/Agent |
| `SUBAGENT_ACTIVITY` | `{ agentId, toolName }` | Sub-agent uses a tool |
| `TURN_COMPLETE` | `{ durationMs }` | Agent turn finishes |
| `ASK_USER` | `{ toolId }` | Agent asks user a question |
| `SESSION_META` | `{ slug, sessionId }` | Metadata extracted from record |

---

## 6. Sub-Agent File Locations

Sub-agent transcripts are stored separately from the main session:

```
~/.claude/projects/<project-dir>/
├── <session-uuid>.jsonl                    # Main session transcript
└── <session-uuid>/
    └── subagents/
        ├── agent-<agent-id-1>.jsonl        # Sub-agent 1 transcript
        ├── agent-<agent-id-2>.jsonl        # Sub-agent 2 transcript
        └── ...
```

The `agentId` in `agent_progress` records matches the `<agent-id>` in the filename.

---

## 7. Project Directory Path Convention

Claude Code converts the workspace absolute path to a directory name:

**Rule:** Replace all characters that are NOT `a-zA-Z0-9-` with hyphens (`-`).

**Examples:**

| Workspace Path | Project Directory Name |
|---------------|----------------------|
| `C:\mauricesource\Alpha_Assistant\src\workchart_office` | `c--mauricesource-Alpha-Assistant-src-workchart-office` |
| `/home/user/my-project` | `-home-user-my-project` |
| `/Users/dev/code/app` | `-Users-dev-code-app` |
