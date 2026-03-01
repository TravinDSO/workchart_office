# Product Requirements Document (PRD)
# WorkChart Office — Agent Session Visualizer

**Version:** 1.1
**Date:** 2026-03-01
**Author:** Design Phase
**Status:** Active

---

## 1. Overview

WorkChart Office is a standalone browser-based application that provides real-time visual monitoring of Claude Code agent sessions. Each active session is displayed as a self-contained "work box" showing the human orchestrator, the primary agent, and any sub-agents that are spawned during execution.

### 1.1 Problem Statement

When running Claude Code sessions — especially with sub-agents — there is no visual representation of what is happening across sessions. Users lack awareness of which agents are active, what tools they're using, and how many sub-agents have been spawned.

### 1.2 Solution

A lightweight, standalone web app that reads Claude Code JSONL transcript files and renders each session as a pixel-art visualization box. The app requires no build step and runs by opening a single HTML file in a browser.

### 1.3 Inspiration

Inspired by [pixel-agents](https://github.com/pablodelucca/pixel-agents), a VS Code extension that renders an animated pixel-art office scene for Claude Code sessions. WorkChart Office takes a drastically simplified approach: no office environment, no furniture, no pathfinding — just clean boxes with character sprites.

---

## 2. Goals & Non-Goals

### 2.1 Goals

| ID | Goal | Priority |
|----|------|----------|
| G1 | Visualize each Claude Code session as an independent box | P0 |
| G2 | Show human orchestrator, main agent, and sub-agents within each box | P0 |
| G3 | Reflect real-time agent state (active, idle, waiting) via sprite animation | P0 |
| G4 | Run standalone in any modern browser without VS Code | P0 |
| G5 | Require zero build step (vanilla HTML/CSS/JS) | P1 |
| G6 | Auto-discover new sessions and sub-agents as they appear | P1 |
| G7 | Display status information (current tool, session name) | P1 |

### 2.2 Non-Goals

- Full office/room simulation (no walking, furniture, pathfinding)
- VS Code extension packaging
- React, Vue, or any framework dependency
- Real-time collaboration or multi-user features
- Agent control or interaction (read-only visualization)
- Historical session replay

---

## 3. User Stories

| ID | As a... | I want to... | So that... |
|----|---------|-------------|------------|
| US1 | Developer | See all active Claude Code sessions in one view | I know what's running at a glance |
| US2 | Developer | See when a sub-agent is spawned | I understand the work decomposition |
| US3 | Developer | See which tool an agent is currently using | I know what the agent is doing |
| US4 | Developer | See when an agent is waiting for my input | I can respond promptly |
| US5 | Developer | Open the app without installing anything | I can start monitoring immediately |
| US6 | Developer | See the session name/slug on each box | I can identify which session is which |

---

## 4. Functional Requirements

### 4.1 Session Discovery

| ID | Requirement |
|----|------------|
| FR1 | The app SHALL scan a Claude Code project directory for `.jsonl` transcript files |
| FR2 | The app SHALL create a visual box for each discovered session |
| FR3 | The app SHALL detect new sessions within 2 seconds of file creation |
| FR4 | The app SHALL support reading files via the `serve.py` HTTP API (primary mode) |
| FR5 | The app SHALL support reading files via the File System Access API as a secondary mode (Chromium browsers only) |

### 4.2 Agent Box Display

| ID | Requirement |
|----|------------|
| FR6 | Each box SHALL display a human orchestrator sprite in the top-left area |
| FR7 | Each box SHALL display a main agent (robot) sprite in the top-right area |
| FR8 | Each box SHALL display sub-agent sprites in a bottom row, appearing dynamically |
| FR9 | Each box SHALL display the session slug/name |
| FR10 | Each box SHALL display the current agent status (tool name, state) |

### 4.3 State Detection

| ID | Requirement |
|----|------------|
| FR11 | The app SHALL detect agent tool use from `assistant` records with `tool_use` content |
| FR12 | The app SHALL detect sub-agent spawning from `Task` tool invocations |
| FR13 | The app SHALL detect turn completion from `system:turn_duration` records |
| FR14 | The app SHALL detect user input from `user` records with text content |
| FR15 | The app SHALL detect "waiting for user" from `AskUserQuestion` tool use |

### 4.4 Visual Feedback

| ID | Requirement |
|----|------------|
| FR16 | Active agents SHALL display an animated sprite (typing/working) |
| FR17 | Idle agents SHALL display a static sprite |
| FR18 | Newly spawned sub-agents SHALL have a visible entrance effect |
| FR19 | Agents waiting for user input SHALL display a visual indicator (speech bubble) |

---

## 5. Non-Functional Requirements

| ID | Requirement |
|----|------------|
| NFR1 | The app SHALL load in under 2 seconds with no external dependencies |
| NFR2 | The app SHALL run in Chrome, Firefox, and Edge (latest 2 versions) |
| NFR3 | The app SHALL consume less than 100MB of memory with 10 active sessions |
| NFR4 | The app SHALL require only Python 3.10+ (standard library) to run. No pip packages, Node.js, npm, or build tooling needed. |
| NFR5 | The canvas rendering SHALL maintain 30+ FPS with 10 active boxes |
| NFR6 | The layout SHALL be responsive from 800px to 3840px viewport width |

---

## 6. Data Source

### 6.1 JSONL Transcript Location

```
Windows: C:\Users\<user>\.claude\projects\<project-dir>\<session-uuid>.jsonl
macOS:   ~/.claude/projects/<project-dir>/<session-uuid>.jsonl
Linux:   ~/.claude/projects/<project-dir>/<session-uuid>.jsonl
```

**Project directory naming:** The workspace absolute path with all non-alphanumeric/non-hyphen characters replaced by hyphens.

**Sub-agent files:**
```
<session-uuid>/subagents/agent-<agent-id>.jsonl
```

### 6.2 Record Types

| Record Type | Purpose |
|------------|---------|
| `user` (text) | Human sent a prompt |
| `user` (tool_result) | Tool returned output |
| `assistant` (text) | Agent produced text response |
| `assistant` (tool_use) | Agent invoked a tool |
| `progress` (agent_progress) | Sub-agent activity update |
| `system` (turn_duration) | Agent turn completed |

---

## 7. Success Metrics

| Metric | Target |
|--------|--------|
| Time to first render | < 2 seconds |
| State update latency | < 3 seconds from JSONL write to visual update |
| Sub-agent appearance | < 2 seconds from Task tool invocation |
| Zero-config startup | User runs `python serve.py`, browser opens automatically |

---

## 8. Open Questions

| ID | Question | Status |
|----|----------|--------|
| Q1 | Should closed/completed sessions remain visible or auto-hide? | Open |
| Q2 | Should we support multiple project directories simultaneously? | **Resolved — implemented.** `serve.py` scans all projects under `~/.claude/projects/`. A project filter dropdown allows focusing on one project. |
| Q3 | Should sub-agents show their description text as a tooltip? | Open |
