# Wireframe: Agent Session Box Layout
# WorkChart Office

**Date:** 2026-03-01

---

## 1. Single Box — States

### State 1: Session Start (Human + Main Agent only)

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│    ╔═══════╗                              ╔═══════╗        │
│    ║       ║                              ║  ○ ○  ║        │
│    ║  ( )  ║                              ║ ╔═══╗ ║        │
│    ║ /   \ ║          ─ ─ ─ ─ ─ ▶        ║ ║~~~║ ║        │
│    ║ │   │ ║       (control link)         ║ ╠═══╣ ║        │
│    ║       ║                              ║ ║   ║ ║        │
│    ╚═══════╝                              ╚═══════╝        │
│    ORCHESTRATOR                           MAIN AGENT       │
│                                                             │
│                                                             │
│                                                             │
│                                                             │
│  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄  │
│  session-slug  │  Status: Idle  │  0 sub-agents            │
└─────────────────────────────────────────────────────────────┘
```

### State 2: First Sub-Agent Spawned

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│    ╔═══════╗                              ╔═══════╗        │
│    ║       ║                              ║  ○ ○  ║        │
│    ║  ( )  ║                              ║ ╔═══╗ ║        │
│    ║ /   \ ║          ─ ─ ─ ─ ─ ▶        ║ ║~~~║ ║        │
│    ║ │   │ ║       (control link)         ║ ╠═══╣ ║        │
│    ║       ║                              ║ ║   ║ ║        │
│    ╚═══════╝                              ╚═══════╝        │
│    ORCHESTRATOR                           MAIN AGENT       │
│                                                             │
│                         ┌─────┐                             │
│                         │ ◉⚙  │                             │
│                         │ sub │                             │
│                         └─────┘                             │
│  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄  │
│  session-slug  │  Using Read  │  1 sub-agent               │
└─────────────────────────────────────────────────────────────┘
```

### State 3: Multiple Sub-Agents

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│    ╔═══════╗                              ╔═══════╗        │
│    ║       ║                              ║  ○ ○  ║        │
│    ║  ( )  ║                              ║ ╔═══╗ ║        │
│    ║ /   \ ║          ─ ─ ─ ─ ─ ▶        ║ ║~~~║ ║        │
│    ║ │   │ ║       (control link)         ║ ╠═══╣ ║        │
│    ║       ║                              ║ ║   ║ ║        │
│    ╚═══════╝                              ╚═══════╝        │
│    ORCHESTRATOR                           MAIN AGENT       │
│                                                             │
│     ┌─────┐  ┌─────┐  ┌─────┐                             │
│     │ ◉⚙  │  │ ◉⚙  │  │ ◉⚙  │                             │
│     │ sub1 │  │ sub2 │  │ sub3 │                             │
│     └─────┘  └─────┘  └─────┘                             │
│  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄  │
│  session-slug  │  Using Bash  │  3 sub-agents              │
└─────────────────────────────────────────────────────────────┘
```

### State 4: Many Sub-Agents (wrapping)

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│    ╔═══════╗                              ╔═══════╗        │
│    ║       ║                              ║  ○ ○  ║        │
│    ║  ( )  ║                              ║ ╔═══╗ ║        │
│    ║ /   \ ║          ─ ─ ─ ─ ─ ▶        ║ ║~~~║ ║        │
│    ║ │   │ ║       (control link)         ║ ╠═══╣ ║        │
│    ║       ║                              ║ ║   ║ ║        │
│    ╚═══════╝                              ╚═══════╝        │
│    ORCHESTRATOR                           MAIN AGENT       │
│                                                             │
│     ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐│
│     │ ◉⚙  │  │ ◉⚙  │  │ ◉⚙  │  │ ◉⚙  │  │ ◉⚙  │  │ ◉⚙  ││
│     │ sub1 │  │ sub2 │  │ sub3 │  │ sub4 │  │ sub5 │  │ sub6 ││
│     └─────┘  └─────┘  └─────┘  └─────┘  └─────┘  └─────┘│
│  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄  │
│  session-slug  │  Using Edit  │  6 sub-agents              │
└─────────────────────────────────────────────────────────────┘
```

### State 5: Agent Waiting for User (Speech Bubble)

```
┌─────────────────────────────────────────────────────────────┐
│                                                ╭───╮        │
│    ╔═══════╗                              ╔═══║ ? ║═╗      │
│    ║       ║                              ║  ○╰─┬─╯ ║      │
│    ║  ( )  ║                              ║ ╔═══╗   ║      │
│    ║ /   \ ║          ─ ─ ─ ─ ─ ▶        ║ ║~~~║   ║      │
│    ║ │   │ ║       (control link)         ║ ╠═══╣   ║      │
│    ║       ║                              ║ ║   ║   ║      │
│    ╚═══════╝                              ╚═════════╝      │
│    ORCHESTRATOR                           MAIN AGENT       │
│                                                             │
│     ┌─────┐  ┌─────┐  ┌─────┐                             │
│     │ ◉⚙  │  │ ◉⚙  │  │ ◉⚙  │                             │
│     │ sub1 │  │ sub2 │  │ sub3 │                             │
│     └─────┘  └─────┘  └─────┘                             │
│  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄  │
│  session-slug  │  Waiting for input  │  3 sub-agents       │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Multi-Session Grid Layout

### Desktop (wide viewport, 1920px+)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  WorkChart Office                            [Open Folder] ● Connected  │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────────┐  ┌──────────────────────────┐             │
│  │  Session A               │  │  Session B               │             │
│  │  👤          🤖          │  │  👤          🤖          │             │
│  │                          │  │                          │             │
│  │  🧠 🧠                  │  │  🧠 🧠 🧠              │             │
│  │  slug-a | Active | 2 sub │  │  slug-b | Idle   | 3 sub │             │
│  └──────────────────────────┘  └──────────────────────────┘             │
│                                                                          │
│  ┌──────────────────────────┐  ┌──────────────────────────┐             │
│  │  Session C               │  │  Session D               │             │
│  │  👤          🤖  [?]     │  │  👤          🤖          │             │
│  │                          │  │                          │             │
│  │  🧠 🧠 🧠 🧠 🧠 🧠    │  │                          │             │
│  │  slug-c | Waiting | 6sub │  │  slug-d | Active | 0 sub │             │
│  └──────────────────────────┘  └──────────────────────────┘             │
│                                                                          │
├──────────────────────────────────────────────────────────────────────────┤
│  4 sessions  │  Polling: active (2s)                                     │
└──────────────────────────────────────────────────────────────────────────┘
```

### Tablet / Narrow (800-1200px)

```
┌────────────────────────────────────┐
│  WorkChart Office  [Open] ● Conn   │
├────────────────────────────────────┤
│                                    │
│  ┌──────────────────────────────┐  │
│  │  Session A                   │  │
│  │  👤              🤖          │  │
│  │  🧠 🧠                      │  │
│  │  slug-a | Active | 2 sub    │  │
│  └──────────────────────────────┘  │
│                                    │
│  ┌──────────────────────────────┐  │
│  │  Session B                   │  │
│  │  👤              🤖          │  │
│  │  🧠 🧠 🧠                  │  │
│  │  slug-b | Idle   | 3 sub    │  │
│  └──────────────────────────────┘  │
│                                    │
├────────────────────────────────────┤
│  2 sessions  │  Polling: active    │
└────────────────────────────────────┘
```

---

## 3. Visual State Indicators

| Element | Idle State | Active State | Waiting State |
|---------|-----------|-------------|---------------|
| **Human sprite** | Static, muted | Subtle typing animation, brighter | — |
| **Main Agent** | Static, muted | Typing animation, brighter, gear indicator | Speech bubble with "?" |
| **Sub-agent** | Dim, static | Glowing, pulsing accent color | — |
| **Connection line** | Dotted, dim | Solid, animated dash flow | Dotted, pulsing |
| **Status bar text** | "Idle" | "Using [ToolName]" | "Waiting for input" |
| **Box border** | Subtle | Slight glow/accent | Pulsing border |

---

## 4. Sprite Dimensions

| Sprite | Pixel Art Size | Render Size (2x) | Position |
|--------|---------------|-------------------|----------|
| Human | 32×32 px | 64×64 px | Top-left (x:30, y:15) |
| Main Agent | 32×32 px | 64×64 px | Top-right (x:280, y:15) |
| Sub-Agent | 16×16 px | 32×32 px | Bottom row (y:140, x: 20 + 50*n) |

---

## 5. Color Palette

| Element | Color | Hex |
|---------|-------|-----|
| Page background | Dark navy | `#1a1a2e` |
| Box background | Steel teal | `#1b6ca8` |
| Box border | Dark teal | `#0d4f7a` |
| Status bar bg | Semi-transparent black | `rgba(0,0,0,0.4)` |
| Status text | White | `#ffffff` |
| Active indicator | Bright green | `#00ff88` |
| Waiting indicator | Amber | `#ffaa00` |
| Idle text | Light gray | `#aaaaaa` |
| Sprite outline | Dark gray | `#333333` |
| Sprite fill | Medium gray | `#555555` |
| Accent (circuits) | Neon green | `#00ff88` |
