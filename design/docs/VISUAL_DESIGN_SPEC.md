# Visual Design Specification
# WorkChart Office — Agent Session Visualizer

**Version:** 1.1
**Date:** 2026-03-01
**Status:** Active
**Role:** Single source of truth for all visual and interaction design decisions

---

## Table of Contents

1. [Color System](#1-color-system)
2. [Typography](#2-typography)
3. [Layout Specifications](#3-layout-specifications)
4. [Animation Design](#4-animation-design)
5. [Micro-interactions](#5-micro-interactions)
6. [Visual Hierarchy](#6-visual-hierarchy)
7. [Pixel Art Style Guide](#7-pixel-art-style-guide)
8. [Dark Theme Details](#8-dark-theme-details)

---

## 1. Color System

### 1.1 Core Palette

| Token                | Hex         | RGB                  | Usage                                      |
|----------------------|-------------|----------------------|--------------------------------------------|
| `--color-bg-page`    | `#0e0e1a`   | `14, 14, 26`         | Page background, deepest surface           |
| `--color-bg-surface` | `#1a1a2e`   | `26, 26, 46`         | Header, footer, card surrounds             |
| `--color-bg-box`     | `#1b6ca8`   | `27, 108, 168`       | Canvas/box background fill (primary teal)  |
| `--color-bg-box-dim` | `#155a8a`   | `21, 90, 138`        | Completed/ended session box background     |
| `--color-border-box` | `#0d4f7a`   | `13, 79, 122`        | Default box border                         |
| `--color-border-active` | `#00ff88` | `0, 255, 136`       | Active session border glow source          |
| `--color-statusbar`  | `rgba(0,0,0,0.45)` | --            | Status bar overlay within canvas           |
| `--color-white`      | `#ffffff`   | `255, 255, 255`      | Primary text on dark backgrounds           |

### 1.2 State Colors

| State        | Color Token            | Hex         | Indicator Usage                                |
|--------------|------------------------|-------------|------------------------------------------------|
| **Active**   | `--color-state-active` | `#00ff88`   | Border glow, dot indicator, sprite highlights  |
| **Idle**     | `--color-state-idle`   | `#6b7b8d`   | Muted border, dimmed sprites, dot color        |
| **Waiting**  | `--color-state-waiting`| `#ffaa00`   | Pulsing border, speech bubble accent, dot      |
| **Error**    | `--color-state-error`  | `#ff4466`   | Border flash, error icon tint                  |
| **Completed**| `--color-state-done`   | `#4a90c2`   | Faded border, reduced opacity overlay          |

### 1.3 Accent & Utility Colors

| Token                     | Hex         | Usage                                     |
|---------------------------|-------------|-------------------------------------------|
| `--color-accent-neon`     | `#00ff88`   | Circuit lines, active indicators, glows   |
| `--color-accent-cyan`     | `#00d4ff`   | Connection line active state, links        |
| `--color-accent-amber`    | `#ffaa00`   | Warnings, waiting state, speech bubbles    |
| `--color-accent-purple`   | `#b388ff`   | Sub-agent spawn flash effect               |
| `--color-button-default`  | `#2a5a8a`   | Default button background                  |
| `--color-button-hover`    | `#3a7ab4`   | Button hover state                         |
| `--color-button-active`   | `#1d4a6e`   | Button pressed state                       |
| `--color-button-disabled` | `#1a2a3a`   | Button disabled state                      |

### 1.4 Background Hierarchy

Four distinct depth levels, darkest to lightest:

```
Level 0 (Page)    : #0e0e1a  — the void behind everything
Level 1 (Surface) : #1a1a2e  — header, footer, panels
Level 2 (Card)    : #222244  — box wrapper / card container (DOM element around canvas)
Level 3 (Canvas)  : #1b6ca8  — inside-canvas box fill (the teal workspace)
```

### 1.5 Contrast Ratios (WCAG 2.1 AA Compliance)

| Foreground         | Background        | Ratio  | Pass  |
|--------------------|-------------------|--------|-------|
| `#ffffff` (text)   | `#1a1a2e` (surface) | 15.1:1 | AAA |
| `#ffffff` (text)   | `#1b6ca8` (box)   | 4.6:1  | AA   |
| `#00ff88` (accent) | `#0e0e1a` (page)  | 12.3:1 | AAA  |
| `#00ff88` (accent) | `#1b6ca8` (box)   | 5.2:1  | AA   |
| `#ffaa00` (amber)  | `#1a1a2e` (surface) | 8.7:1 | AAA  |
| `#aaaaaa` (secondary text) | `#1a1a2e` | 7.5:1 | AAA  |
| `#6b7b8d` (idle)   | `#0e0e1a` (page)  | 4.5:1  | AA   |

### 1.6 CSS Custom Properties Declaration

```css
:root {
    /* Backgrounds */
    --color-bg-page: #0e0e1a;
    --color-bg-surface: #1a1a2e;
    --color-bg-card: #222244;
    --color-bg-box: #1b6ca8;
    --color-bg-box-dim: #155a8a;
    --color-statusbar: rgba(0, 0, 0, 0.45);

    /* Borders */
    --color-border-box: #0d4f7a;
    --color-border-surface: #2a2a4e;
    --color-border-subtle: rgba(255, 255, 255, 0.06);

    /* State */
    --color-state-active: #00ff88;
    --color-state-idle: #6b7b8d;
    --color-state-waiting: #ffaa00;
    --color-state-error: #ff4466;
    --color-state-done: #4a90c2;

    /* Accents */
    --color-accent-neon: #00ff88;
    --color-accent-cyan: #00d4ff;
    --color-accent-amber: #ffaa00;
    --color-accent-purple: #b388ff;

    /* Text */
    --color-text-primary: #ffffff;
    --color-text-secondary: #aaaaaa;
    --color-text-disabled: #555566;
    --color-text-inverse: #0e0e1a;

    /* Buttons */
    --color-button-default: #2a5a8a;
    --color-button-hover: #3a7ab4;
    --color-button-active: #1d4a6e;
    --color-button-disabled: #1a2a3a;
    --color-button-text: #ffffff;
    --color-button-text-disabled: #556677;
}
```

---

## 2. Typography

### 2.1 Font Stack

```css
:root {
    /* Monospace — status bars, code, session slugs, technical readouts */
    --font-mono: 'JetBrains Mono', 'Cascadia Code', 'Fira Code', 'SF Mono',
                 'Consolas', 'Liberation Mono', monospace;

    /* System — headers, buttons, body text, UI labels */
    --font-system: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto',
                   'Helvetica Neue', Arial, sans-serif;
}
```

**Rationale:** System fonts load instantly (zero network), monospace reinforces the developer-tool aesthetic. JetBrains Mono is preferred when available because of its clear distinction between similar glyphs (0/O, 1/l/I).

### 2.2 Type Scale

All sizes follow a **minor third** progression (1.2 ratio) anchored at 14px base.

| Token                | Size   | Weight | Letter Spacing | Line Height | Font Stack | Usage                          |
|----------------------|--------|--------|----------------|-------------|------------|--------------------------------|
| `--type-header`      | 20px   | 700    | -0.02em        | 1.2         | system     | App title "WorkChart Office"   |
| `--type-box-title`   | 13px   | 600    | 0              | 1.3         | system     | Session name above each box    |
| `--type-status`      | 11px   | 400    | 0.02em         | 1.4         | mono       | Status bar text inside canvas  |
| `--type-status-bold` | 11px   | 600    | 0.02em         | 1.4         | mono       | Tool name highlight in status  |
| `--type-label`       | 12px   | 500    | 0.01em         | 1.3         | system     | Button labels, count badges    |
| `--type-footer`      | 11px   | 400    | 0.02em         | 1.4         | mono       | Footer polling status, counts  |
| `--type-tooltip`     | 11px   | 400    | 0              | 1.4         | system     | Tooltip text for sub-agents    |
| `--type-badge`       | 10px   | 700    | 0.04em         | 1.0         | mono       | Sub-agent count badge          |
| `--type-empty`       | 16px   | 400    | 0              | 1.5         | system     | Empty state messaging          |

### 2.3 CSS Typography Declarations

```css
/* Application header */
#app-header h1 {
    font-family: var(--font-system);
    font-size: 20px;
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1.2;
    color: var(--color-text-primary);
}

/* Canvas status bar (drawn via Canvas 2D API) */
/* ctx.font = '11px "JetBrains Mono", "Cascadia Code", monospace'; */

/* Footer text */
#app-footer {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 400;
    letter-spacing: 0.02em;
    color: var(--color-text-secondary);
}
```

### 2.4 Canvas Text Rendering

Since canvas text does not inherit CSS, all text drawn inside `<canvas>` elements must set font properties explicitly:

```javascript
// Status bar text
ctx.font = '11px monospace';
ctx.fillStyle = '#ffffff';
ctx.textBaseline = 'middle';

// Tool name emphasis (slightly brighter)
ctx.font = 'bold 11px monospace';
ctx.fillStyle = '#00ff88';

// Speech bubble text
ctx.font = 'bold 14px monospace';
ctx.fillStyle = '#ffffff';
ctx.textAlign = 'center';
```

---

## 3. Layout Specifications

### 3.1 Grid System

All spacing values are multiples of **8px** (the base grid unit). Use `4px` only for tight internal spacing (e.g., icon-to-label gaps within a status bar).

| Token              | Value  | Usage                                       |
|--------------------|--------|---------------------------------------------|
| `--space-unit`     | `8px`  | Base grid unit                              |
| `--space-xs`       | `4px`  | Icon-label gaps, inner padding              |
| `--space-sm`       | `8px`  | Tight element spacing                       |
| `--space-md`       | `16px` | Standard gap between elements, box padding  |
| `--space-lg`       | `24px` | Section separation, grid gap                |
| `--space-xl`       | `32px` | Major section separation                    |
| `--space-2xl`      | `48px` | Page-level margins on ultrawide             |

### 3.2 Page Structure Heights

```
┌──────────────────────────────────────────────┐
│  HEADER  (height: 56px)                      │  -- var(--header-height)
│    padding: 0 16px                           │
│    display: flex; align-items: center        │
├──────────────────────────────────────────────┤
│                                              │
│  MAIN / SESSION GRID                         │  -- flex: 1; overflow-y: auto
│    padding: 16px                             │
│    gap: 16px                                 │
│                                              │
│                                              │
│                                              │
├──────────────────────────────────────────────┤
│  FOOTER (height: 40px)                       │  -- var(--footer-height)
│    padding: 0 16px                           │
└──────────────────────────────────────────────┘
```

```css
:root {
    --header-height: 56px;
    --footer-height: 40px;
}

body {
    margin: 0;
    padding: 0;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--color-bg-page);
    overflow: hidden;
}

#app-header {
    height: var(--header-height);
    padding: 0 var(--space-md);
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--color-bg-surface);
    border-bottom: 1px solid var(--color-border-surface);
    flex-shrink: 0;
}

#session-grid {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-md);
}

#app-footer {
    height: var(--footer-height);
    padding: 0 var(--space-md);
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--color-bg-surface);
    border-top: 1px solid var(--color-border-surface);
    flex-shrink: 0;
}
```

### 3.3 Session Grid Layout

```css
#session-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
    gap: var(--space-md);   /* 16px */
    padding: var(--space-md);
    align-content: start;
}
```

### 3.4 Breakpoint Definitions

| Breakpoint   | Viewport Width | Columns | Grid Min Width | Gap  | Behavior                          |
|-------------|----------------|---------|----------------|------|-----------------------------------|
| **Mobile**  | < 600px        | 1       | 100%           | 12px | Boxes stack, full width           |
| **Tablet**  | 600–899px      | 1       | 100%           | 16px | Single column, wider boxes        |
| **Desktop** | 900–1439px     | 2       | 420px          | 16px | Two-column grid                   |
| **Wide**    | 1440–2559px    | 3       | 420px          | 16px | Three-column grid                 |
| **Ultra**   | 2560px+        | 4+      | 420px          | 24px | Four+ columns, increased gap      |

```css
/* Mobile: single column, smaller padding */
@media (max-width: 599px) {
    #session-grid {
        grid-template-columns: 1fr;
        gap: 12px;
        padding: 12px;
    }
}

/* Tablet: single column, normal padding */
@media (min-width: 600px) and (max-width: 899px) {
    #session-grid {
        grid-template-columns: 1fr;
        gap: var(--space-md);
    }
}

/* Desktop (default): 2 columns */
@media (min-width: 900px) and (max-width: 1439px) {
    #session-grid {
        grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
    }
}

/* Wide: 3 columns */
@media (min-width: 1440px) and (max-width: 2559px) {
    #session-grid {
        grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
    }
}

/* Ultrawide: larger gap */
@media (min-width: 2560px) {
    #session-grid {
        grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
        gap: var(--space-lg);
        padding: var(--space-2xl) var(--space-lg);
    }
}
```

### 3.5 Box Dimensions

| Property               | Value                | Notes                              |
|------------------------|----------------------|------------------------------------|
| **Canvas logical size** | 400 x 250 px        | Internal coordinate space          |
| **Canvas render scale** | 2x (devicePixelRatio)| Crisp pixel art on retina          |
| **Aspect ratio**       | 8:5 (1.6:1)         | Canvas maintains this via CSS      |
| **Min box width**      | 360px                | Below this, details become unreadable |
| **Max box width**      | 560px                | Prevent boxes from growing too wide |
| **Border radius**      | 8px                  | On the `.session-box` wrapper      |
| **Box shadow**         | See Section 8.4      | Elevation shadow                   |

```css
.session-box {
    min-width: 360px;
    max-width: 560px;
    border-radius: 8px;
    overflow: hidden;
    background: var(--color-bg-card);
    border: 1px solid var(--color-border-box);
}

.session-box canvas {
    display: block;
    width: 100%;
    height: auto;
    aspect-ratio: 8 / 5;
    image-rendering: pixelated;
    image-rendering: crisp-edges;
}
```

### 3.6 Canvas Internal Layout (400 x 250 coordinate space)

```
 0        30                                   280      370   400
 ┌────────┬─────────────────────────────────────┬────────┬─────┐
 │ pad=10 │                                     │        │pad10│  y=0
 │        │                                     │        │     │
 │        │  ┌──────┐                  ┌──────┐ │        │     │  y=15
 │        │  │HUMAN │   connection     │ROBOT │ │        │     │
 │        │  │64x64 │  ─ ─ ─ ─ ─ ─ ▶  │64x64 │ │        │     │
 │        │  └──────┘                  └──────┘ │        │     │  y=79
 │        │  x=30                      x=280    │        │     │
 │        │                                     │        │     │  y=100 (gap)
 │        │                                     │        │     │
 │        │  ┌──┐  ┌──┐  ┌──┐  ┌──┐  ┌──┐     │        │     │  y=140
 │        │  │S1│  │S2│  │S3│  │S4│  │S5│ ... │        │     │
 │        │  │32│  │32│  │32│  │32│  │32│     │        │     │
 │        │  └──┘  └──┘  └──┘  └──┘  └──┘     │        │     │  y=172
 │        │  x=20  x=70  x=120 x=170 x=220    │        │     │
 │        │                                     │        │     │
 ├────────┴─────────────────────────────────────┴────────┴─────┤  y=220
 │  STATUS BAR  (height: 30px, full width)                     │
 │  padding-left: 10px, text baseline at y=238                 │
 └─────────────────────────────────────────────────────────────┘  y=250
```

**Key coordinates (all in logical canvas pixels):**

| Element            | X      | Y      | Width  | Height | Spacing              |
|--------------------|--------|--------|--------|--------|----------------------|
| Human sprite       | 30     | 15     | 64     | 64     | --                   |
| Main agent sprite  | 280    | 15     | 64     | 64     | --                   |
| Connection line    | 94     | 47     | 186    | 1      | Between sprites      |
| Sub-agent row      | 20     | 140    | 32 ea  | 32     | 50px center-to-center (18px gap) |
| Status bar         | 0      | 220    | 400    | 30     | --                   |
| Status text        | 10     | 238    | --     | --     | 10px left padding    |
| Speech bubble      | 280    | 0      | 40     | 28     | Above robot head     |

---

## 4. Animation Design

### 4.1 Global Animation Constants

```javascript
const ANIM = {
    // Sprite frame rates
    SPRITE_FRAME_DURATION: 500,         // ms per frame for idle/active loops
    SPRITE_ACTIVE_FRAME_DURATION: 350,  // ms per frame when actively working (faster)

    // Connection line
    CONNECTION_DASH_LENGTH: 6,          // px dash segment
    CONNECTION_GAP_LENGTH: 4,           // px gap between dashes
    CONNECTION_SPEED: 40,               // px/second dash offset movement
    CONNECTION_PULSE_SPEED: 1500,       // ms full pulse cycle (waiting state)

    // Sub-agent spawn
    SPAWN_DURATION: 400,                // ms for full spawn-in animation
    SPAWN_SCALE_START: 0.3,             // start at 30% scale
    SPAWN_SCALE_END: 1.0,              // end at 100% scale
    SPAWN_OPACITY_START: 0.0,           // start fully transparent
    SPAWN_FLASH_COLOR: '#b388ff',       // purple flash on spawn

    // Speech bubble
    BUBBLE_APPEAR_DURATION: 300,        // ms to bounce in
    BUBBLE_BOUNCE_OVERSHOOT: 1.15,      // scale overshoots to 115% then settles
    BUBBLE_BOB_AMPLITUDE: 2,            // px vertical bob when visible
    BUBBLE_BOB_SPEED: 1200,             // ms per full bob cycle

    // Box border glow
    GLOW_INTENSITY_ACTIVE: 0.8,         // shadow opacity for active sessions
    GLOW_PULSE_SPEED: 2000,             // ms per glow pulse cycle
    GLOW_PULSE_MIN: 0.4,               // minimum glow opacity in pulse
    GLOW_PULSE_MAX: 0.9,               // maximum glow opacity in pulse

    // Status transitions
    STATE_TRANSITION_DURATION: 300,      // ms for color/opacity transitions
    STATE_FADE_EASING: 'ease-in-out',   // CSS easing (for DOM elements)

    // Idle breathing
    IDLE_BREATHE_SPEED: 3000,           // ms per full breath cycle
    IDLE_BREATHE_SCALE_MIN: 1.0,        // minimum scale
    IDLE_BREATHE_SCALE_MAX: 1.015,      // maximum scale (very subtle)
    IDLE_BREATHE_OPACITY_MIN: 0.85,     // dim slightly on "exhale"
    IDLE_BREATHE_OPACITY_MAX: 1.0,      // full opacity on "inhale"
};
```

### 4.2 Sprite Animation Timing

**Frame structure per sprite:**

| Sprite       | Idle Frames | Active Frames | Frame Duration (idle) | Frame Duration (active) |
|-------------|-------------|---------------|----------------------|------------------------|
| Human        | 1 (static)  | 2 (typing)    | --                   | 350ms                  |
| Main Agent   | 2 (subtle)  | 3 (working)   | 500ms                | 350ms                  |
| Sub-Agent    | 1 (static)  | 2 (pulse)     | --                   | 400ms                  |

**Idle animation detail:**
- Human: Completely static single frame. No animation.
- Main Agent: 2-frame subtle antenna/eye blink cycle at 500ms per frame. Indicates the bot is "alive" even when idle.
- Sub-Agent: Static single frame. Differentiated from idle main agent by dimmed palette.

**Active animation detail:**
- Human: 2-frame typing animation. Arms alternate position every 350ms.
- Main Agent: 3-frame working animation. Frame 1: neutral. Frame 2: arm up (typing). Frame 3: screen flicker (circuit line change). Cycle at 350ms per frame.
- Sub-Agent: 2-frame circuit pulse. The accent color pixels alternate between `#00ff88` and `#00cc66` every 400ms.

### 4.3 Connection Line Animation

The dashed line connecting the human orchestrator to the main agent:

```javascript
function drawConnection(ctx, state, elapsed) {
    const y = 47;  // vertical center between sprites
    const x1 = 94; // right edge of human sprite
    const x2 = 280; // left edge of main agent sprite

    ctx.strokeStyle = getConnectionColor(state);
    ctx.lineWidth = state === 'active' ? 2 : 1;

    if (state === 'active') {
        // Animated flowing dashes — particles move left to right
        const offset = (elapsed * ANIM.CONNECTION_SPEED / 1000) % (ANIM.CONNECTION_DASH_LENGTH + ANIM.CONNECTION_GAP_LENGTH);
        ctx.setLineDash([ANIM.CONNECTION_DASH_LENGTH, ANIM.CONNECTION_GAP_LENGTH]);
        ctx.lineDashOffset = -offset;
        ctx.globalAlpha = 1.0;
    } else if (state === 'waiting') {
        // Pulsing dotted line
        const pulse = (Math.sin(elapsed * 2 * Math.PI / ANIM.CONNECTION_PULSE_SPEED) + 1) / 2;
        ctx.setLineDash([3, 5]);
        ctx.globalAlpha = 0.4 + pulse * 0.6;  // pulse between 0.4 and 1.0
    } else {
        // Idle: faint static dotted line
        ctx.setLineDash([2, 6]);
        ctx.globalAlpha = 0.3;
    }

    ctx.beginPath();
    ctx.moveTo(x1, y);
    ctx.lineTo(x2, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1.0;
}

function getConnectionColor(state) {
    switch (state) {
        case 'active':  return '#00d4ff';  // bright cyan
        case 'waiting': return '#ffaa00';  // amber
        default:        return '#6b7b8d';  // muted grey
    }
}
```

### 4.4 Sub-Agent Spawn Animation

When a sub-agent is detected, it appears with a **scale-up + fade-in + purple flash** effect:

**Sequence (400ms total):**

```
t=0ms   : Sub-agent appears at 30% scale, 0% opacity.
          A brief purple (#b388ff) circle flash radiates from spawn point.
t=0-200 : Scale eases from 0.3 to 1.05 (slight overshoot). Opacity 0 to 1.
          Easing: cubic-bezier(0.34, 1.56, 0.64, 1) — "back out" feel.
t=200-400: Scale settles from 1.05 to 1.0. Purple flash fades out.
           Easing: ease-out.
```

**Canvas implementation:**

```javascript
function drawSubAgentSpawn(ctx, sprite, x, y, spawnAge) {
    if (spawnAge > ANIM.SPAWN_DURATION) {
        // Fully spawned — draw normally
        ctx.drawImage(sprite, x, y, 32, 32);
        return;
    }

    const t = spawnAge / ANIM.SPAWN_DURATION;  // 0..1 normalized

    // Scale with overshoot
    let scale;
    if (t < 0.5) {
        scale = ANIM.SPAWN_SCALE_START + (1.05 - ANIM.SPAWN_SCALE_START) * easeBackOut(t * 2);
    } else {
        scale = 1.05 + (1.0 - 1.05) * easeOut((t - 0.5) * 2);
    }

    // Opacity
    const opacity = Math.min(1.0, t * 3);  // reaches 1.0 at t=0.33

    // Purple flash ring
    if (t < 0.5) {
        const flashOpacity = 1.0 - t * 2;
        const flashRadius = 8 + t * 40;
        ctx.globalAlpha = flashOpacity * 0.6;
        ctx.strokeStyle = ANIM.SPAWN_FLASH_COLOR;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x + 16, y + 16, flashRadius, 0, Math.PI * 2);
        ctx.stroke();
    }

    // Draw scaled sprite
    ctx.globalAlpha = opacity;
    const w = 32 * scale;
    const h = 32 * scale;
    const dx = x + (32 - w) / 2;
    const dy = y + (32 - h) / 2;
    ctx.drawImage(sprite, dx, dy, w, h);
    ctx.globalAlpha = 1.0;
}
```

### 4.5 Speech Bubble Animation

The "?" speech bubble appears when the agent is waiting for user input.

**Appear sequence (300ms):**

```
t=0ms   : Bubble at 0% scale, anchored at bottom-center (tail point).
t=0-200 : Scale from 0 to 1.15 (overshoot).
          Easing: cubic-bezier(0.34, 1.56, 0.64, 1).
t=200-300: Scale settles from 1.15 to 1.0.
           Easing: ease-out.
```

**Persistent bob (while visible):**

```javascript
function drawSpeechBubble(ctx, x, y, text, elapsed, bubbleAge) {
    // Appear animation
    let scale = 1.0;
    if (bubbleAge < ANIM.BUBBLE_APPEAR_DURATION) {
        const t = bubbleAge / ANIM.BUBBLE_APPEAR_DURATION;
        if (t < 0.67) {
            scale = easeBackOut(t / 0.67) * ANIM.BUBBLE_BOUNCE_OVERSHOOT;
        } else {
            scale = ANIM.BUBBLE_BOUNCE_OVERSHOOT + (1.0 - ANIM.BUBBLE_BOUNCE_OVERSHOOT) * easeOut((t - 0.67) / 0.33);
        }
    }

    // Gentle vertical bob
    const bob = Math.sin(elapsed * 2 * Math.PI / ANIM.BUBBLE_BOB_SPEED) * ANIM.BUBBLE_BOB_AMPLITUDE;

    const bx = x;
    const by = y + bob;

    ctx.save();
    ctx.translate(bx + 20, by + 28);  // anchor at tail
    ctx.scale(scale, scale);
    ctx.translate(-(bx + 20), -(by + 28));

    // Bubble body
    ctx.fillStyle = '#ffaa00';
    roundRect(ctx, bx, by, 40, 24, 6);
    ctx.fill();

    // Tail triangle
    ctx.beginPath();
    ctx.moveTo(bx + 16, by + 24);
    ctx.lineTo(bx + 20, by + 30);
    ctx.lineTo(bx + 24, by + 24);
    ctx.fill();

    // Text
    ctx.fillStyle = '#0e0e1a';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, bx + 20, by + 12);

    ctx.restore();
}
```

### 4.6 Box Border Glow Effect

Active sessions emit a colored glow around the `.session-box` wrapper. This is a CSS `box-shadow` effect, not rendered on canvas.

```css
/* Default state — no glow */
.session-box {
    transition: box-shadow 300ms ease-in-out, border-color 300ms ease-in-out;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    border: 1px solid var(--color-border-box);
}

/* Active session — green glow */
.session-box[data-state="active"] {
    box-shadow:
        0 2px 8px rgba(0, 0, 0, 0.3),
        0 0 12px rgba(0, 255, 136, 0.35),
        0 0 24px rgba(0, 255, 136, 0.15);
    border-color: rgba(0, 255, 136, 0.5);
}

/* Waiting session — amber pulse glow (animated via JS class toggle or @keyframes) */
.session-box[data-state="waiting"] {
    animation: glow-pulse-amber 2s ease-in-out infinite;
    border-color: rgba(255, 170, 0, 0.5);
}

@keyframes glow-pulse-amber {
    0%, 100% {
        box-shadow:
            0 2px 8px rgba(0, 0, 0, 0.3),
            0 0 8px rgba(255, 170, 0, 0.2),
            0 0 16px rgba(255, 170, 0, 0.08);
    }
    50% {
        box-shadow:
            0 2px 8px rgba(0, 0, 0, 0.3),
            0 0 16px rgba(255, 170, 0, 0.45),
            0 0 32px rgba(255, 170, 0, 0.2);
    }
}

/* Error session — red flash */
.session-box[data-state="error"] {
    box-shadow:
        0 2px 8px rgba(0, 0, 0, 0.3),
        0 0 12px rgba(255, 68, 102, 0.4);
    border-color: rgba(255, 68, 102, 0.6);
}

/* Completed session — dimmed */
.session-box[data-state="completed"] {
    opacity: 0.55;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
    border-color: var(--color-border-surface);
}
```

### 4.7 Status Transitions

When a session changes state (e.g., idle to active), the visual transition follows this pattern:

| Transition          | Behavior                                                   | Duration |
|--------------------|------------------------------------------------------------|----------|
| idle -> active      | Border glow fades in, sprites swap to active frames, connection brightens | 300ms |
| active -> idle      | Border glow fades out, sprites swap to idle frames, connection dims | 300ms |
| active -> waiting   | Glow shifts from green to amber pulse, speech bubble bounces in | 300ms |
| waiting -> active   | Speech bubble shrinks out (reverse of appear), glow shifts back to green | 200ms |
| any -> error        | Red flash on border (instant), then pulses                 | Instant flash, then 1s pulse |
| any -> completed    | Overall opacity transitions to 0.55, glow removed         | 500ms |

**Canvas-side transitions** (sprite brightness, connection color) happen over 300ms using linear interpolation per frame:

```javascript
function lerpColor(colorA, colorB, t) {
    // t = 0..1 clamped
    const rA = parseInt(colorA.slice(1, 3), 16);
    const gA = parseInt(colorA.slice(3, 5), 16);
    const bA = parseInt(colorA.slice(5, 7), 16);
    const rB = parseInt(colorB.slice(1, 3), 16);
    const gB = parseInt(colorB.slice(3, 5), 16);
    const bB = parseInt(colorB.slice(5, 7), 16);
    const r = Math.round(rA + (rB - rA) * t);
    const g = Math.round(gA + (gB - gA) * t);
    const b = Math.round(bA + (bB - bA) * t);
    return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}
```

### 4.8 Idle Breathing / Pulse Effect

When the app is connected and polling but all sessions are idle, a subtle breathing effect on the entire grid indicates the app is alive:

**CSS approach (on the session grid):**

```css
/* Applied globally when at least one session exists but all are idle */
.session-box[data-state="idle"] canvas {
    animation: idle-breathe 3s ease-in-out infinite;
}

@keyframes idle-breathe {
    0%, 100% {
        filter: brightness(0.92);
    }
    50% {
        filter: brightness(1.0);
    }
}
```

**Per-box canvas approach (drawn in render loop):**

```javascript
function applyIdleBreathe(ctx, elapsed) {
    const t = (Math.sin(elapsed * 2 * Math.PI / ANIM.IDLE_BREATHE_SPEED) + 1) / 2;
    const brightness = ANIM.IDLE_BREATHE_OPACITY_MIN + t * (ANIM.IDLE_BREATHE_OPACITY_MAX - ANIM.IDLE_BREATHE_OPACITY_MIN);
    ctx.globalAlpha = brightness;
}
```

---

## 5. Micro-interactions

### 5.1 Box Hover Effects

When the user hovers over a session box, provide visual feedback that the box is interactive.

```css
.session-box {
    transition:
        transform 200ms ease-out,
        box-shadow 200ms ease-out,
        border-color 200ms ease-out;
    cursor: pointer;
}

.session-box:hover {
    transform: translateY(-2px);
    box-shadow:
        0 4px 16px rgba(0, 0, 0, 0.4),
        0 0 8px rgba(0, 212, 255, 0.15);
    border-color: rgba(0, 212, 255, 0.4);
}

/* Subtle scale on hover for idle boxes only (active boxes already have glow) */
.session-box[data-state="idle"]:hover {
    border-color: rgba(107, 123, 141, 0.6);
}

.session-box[data-state="active"]:hover {
    box-shadow:
        0 4px 16px rgba(0, 0, 0, 0.4),
        0 0 16px rgba(0, 255, 136, 0.45),
        0 0 32px rgba(0, 255, 136, 0.2);
}
```

### 5.2 Box Click Behavior

Clicking a session box opens a detail overlay or expands the box to show more information.

**Primary click action:** Select the box. The selected box gets a persistent highlight border and the status bar information is also shown in the footer.

```css
.session-box.selected {
    border: 2px solid var(--color-accent-cyan);
    box-shadow:
        0 4px 16px rgba(0, 0, 0, 0.4),
        0 0 12px rgba(0, 212, 255, 0.3);
}
```

**Double-click action:** Reserved for future use (e.g., opening the session transcript, navigating to the project folder).

**Click feedback:**

```css
.session-box:active {
    transform: translateY(0px) scale(0.995);
    transition: transform 50ms ease-in;
}
```

### 5.3 "Open Folder" Button States

```css
#open-folder-btn {
    font-family: var(--font-system);
    font-size: 12px;
    font-weight: 500;
    padding: 8px 16px;
    border-radius: 6px;
    border: 1px solid transparent;
    cursor: pointer;
    transition:
        background-color 150ms ease,
        border-color 150ms ease,
        transform 100ms ease,
        box-shadow 150ms ease;
}

/* Default */
#open-folder-btn {
    background: var(--color-button-default);
    color: var(--color-button-text);
    border-color: rgba(255, 255, 255, 0.1);
}

/* Hover */
#open-folder-btn:hover {
    background: var(--color-button-hover);
    border-color: rgba(255, 255, 255, 0.2);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

/* Active (pressed) */
#open-folder-btn:active {
    background: var(--color-button-active);
    transform: translateY(1px);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

/* Disabled (folder already open / polling active) */
#open-folder-btn:disabled {
    background: var(--color-button-disabled);
    color: var(--color-button-text-disabled);
    cursor: not-allowed;
    border-color: transparent;
    box-shadow: none;
}

/* Focus ring for keyboard accessibility */
#open-folder-btn:focus-visible {
    outline: 2px solid var(--color-accent-cyan);
    outline-offset: 2px;
}
```

### 5.4 Status Indicator (Connection Dot)

The status indicator dot in the header shows connection/polling state.

```css
#status-indicator {
    display: flex;
    align-items: center;
    gap: 6px;
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--color-text-secondary);
}

#status-indicator::before {
    content: '';
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--color-state-idle);
    transition: background-color 300ms ease;
}

/* Connected and polling */
#status-indicator.connected::before {
    background: var(--color-state-active);
    animation: status-pulse 2s ease-in-out infinite;
}

/* Disconnected / error */
#status-indicator.disconnected::before {
    background: var(--color-state-error);
    animation: none;
}

@keyframes status-pulse {
    0%, 100% {
        box-shadow: 0 0 0 0 rgba(0, 255, 136, 0.5);
        opacity: 1;
    }
    50% {
        box-shadow: 0 0 0 4px rgba(0, 255, 136, 0);
        opacity: 0.8;
    }
}
```

### 5.5 Sub-Agent Tooltips

When hovering over a sub-agent sprite within the canvas, show a tooltip with the sub-agent's description. Since tooltips cannot be rendered natively inside a canvas, they are implemented as a DOM element positioned over the canvas based on mouse coordinates.

```css
.sub-agent-tooltip {
    position: absolute;
    z-index: 100;
    max-width: 240px;
    padding: 8px 12px;
    background: var(--color-bg-surface);
    border: 1px solid var(--color-border-surface);
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    pointer-events: none;

    font-family: var(--font-system);
    font-size: 11px;
    line-height: 1.4;
    color: var(--color-text-primary);

    /* Appear animation */
    opacity: 0;
    transform: translateY(4px);
    transition: opacity 150ms ease, transform 150ms ease;
}

.sub-agent-tooltip.visible {
    opacity: 1;
    transform: translateY(0);
}

/* Tooltip header (sub-agent ID) */
.sub-agent-tooltip .tooltip-header {
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--color-accent-neon);
    margin-bottom: 4px;
    text-transform: uppercase;
}

/* Tooltip body (description) */
.sub-agent-tooltip .tooltip-body {
    color: var(--color-text-secondary);
}
```

**Hit detection for sub-agent sprites:**

```javascript
canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = 400 / rect.width;
    const scaleY = 250 / rect.height;
    const cx = (e.clientX - rect.left) * scaleX;
    const cy = (e.clientY - rect.top) * scaleY;

    // Check each sub-agent bounding box
    let hoveredAgent = null;
    let agentX = 20;
    for (const [agentId, sub] of session.subAgents) {
        if (cx >= agentX && cx <= agentX + 32 && cy >= 140 && cy <= 172) {
            hoveredAgent = { agentId, sub, screenX: agentX, screenY: 140 };
            break;
        }
        agentX += 50;
    }

    if (hoveredAgent) {
        showTooltip(hoveredAgent, e.clientX, e.clientY);
    } else {
        hideTooltip();
    }
});
```

---

## 6. Visual Hierarchy

### 6.1 At-a-Glance State Differentiation

A user scanning the grid of session boxes should be able to immediately identify each session's state. The following visual channels are used simultaneously:

| Visual Channel      | Active                          | Idle                          | Waiting                         | Completed                    |
|--------------------|---------------------------------|-------------------------------|---------------------------------|------------------------------|
| **Border glow**    | Green glow (#00ff88)            | None                          | Amber pulse (#ffaa00)           | None, dimmed                 |
| **Border color**   | Semi-transparent green          | Default (#0d4f7a)             | Semi-transparent amber          | Faded grey                   |
| **Sprite brightness** | Full brightness, animated    | 85% brightness, static        | Full brightness, speech bubble  | 55% opacity                  |
| **Connection line**| Bright cyan, flowing dashes     | Faint grey, static dots       | Amber, pulsing opacity          | Faint, static                |
| **Status bar text**| "Using [ToolName]" in green     | "Idle" in grey                | "Waiting for input" in amber    | "Completed" in blue-grey     |
| **Overall opacity**| 100%                            | 100% (breathe effect)         | 100%                            | 55%                          |

### 6.2 Eye Flow Within a Single Box

The visual layout guides the eye in a natural Z-pattern:

```
1. TOP-LEFT → Human orchestrator (familiar anchor, "this is a person")
   ↓
2. TOP-RIGHT → Main agent (follow the connection line, "this is the bot")
   ↓
3. MIDDLE → Connection line (shows relationship state)
   ↓
4. BOTTOM ROW → Sub-agents (scan left-to-right, count them)
   ↓
5. STATUS BAR → Text information (session name, tool, sub-agent count)
```

**Design reinforcements for this flow:**
- The human and robot are the largest sprites (64x64 rendered), immediately drawing attention
- The connection line creates a horizontal bridge that the eye follows
- Sub-agents are smaller (32x32), creating a clear size hierarchy
- The status bar is the lowest element with a darkened background, acting as a footer/caption

### 6.3 Sub-Agent Overflow Handling

**Maximum sub-agents visible in a single row:**

At 50px center-to-center spacing starting at x=20, with the canvas being 400px wide:
- Positions: x=20, 70, 120, 170, 220, 270, 320 (last agent's right edge = 352)
- **Maximum visible: 7 sub-agents** before the last would exceed x=370

**Overflow behavior (8+ sub-agents):**

```
Option A (recommended): Show first 6, then a "+N" badge

  ┌──┐  ┌──┐  ┌──┐  ┌──┐  ┌──┐  ┌──┐  ╭────╮
  │S1│  │S2│  │S3│  │S4│  │S5│  │S6│  │ +4 │
  └──┘  └──┘  └──┘  └──┘  └──┘  └──┘  ╰────╯
```

**"+N" overflow badge rendering:**

```javascript
function drawOverflowBadge(ctx, x, y, overflowCount) {
    // Rounded rectangle
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    roundRect(ctx, x, y + 4, 36, 24, 12);
    ctx.fill();

    // Border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    roundRect(ctx, x, y + 4, 36, 24, 12);
    ctx.stroke();

    // Text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`+${overflowCount}`, x + 18, y + 16);
}
```

### 6.4 Empty State Design (No Sessions Found)

When the folder is open but no JSONL files are detected:

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                                                             │
│                       ╔═══════╗                             │
│                       ║  ○ ○  ║                             │
│                       ║ ╔═══╗ ║     <-- Idle robot,        │
│                       ║ ║ z  ║ ║         "sleeping"         │
│                       ║ ╠═══╣ ║         with "zzz"          │
│                       ║ ║   ║ ║                             │
│                       ╚═══════╝                             │
│                                                             │
│               No active sessions found.                     │
│                                                             │
│           Claude Code sessions will appear here             │
│           when JSONL transcript files are detected.         │
│                                                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Implementation:**

```css
#empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 300px;
    gap: 16px;
    text-align: center;
    padding: 48px 24px;
}

#empty-state .empty-icon {
    width: 96px;
    height: 96px;
    /* Rendered via a small canvas showing the idle robot sprite at 3x */
    image-rendering: pixelated;
    opacity: 0.5;
    animation: idle-breathe 3s ease-in-out infinite;
}

#empty-state .empty-title {
    font-family: var(--font-system);
    font-size: 16px;
    font-weight: 600;
    color: var(--color-text-primary);
}

#empty-state .empty-subtitle {
    font-family: var(--font-system);
    font-size: 13px;
    font-weight: 400;
    color: var(--color-text-secondary);
    max-width: 340px;
    line-height: 1.5;
}
```

### 6.5 Loading State Design (Scanning for Files)

When the folder has just been opened and the first poll is in progress:

```css
#loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 200px;
    gap: 16px;
}

#loading-state .loading-spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--color-border-surface);
    border-top-color: var(--color-accent-neon);
    border-radius: 50%;
    animation: spin 800ms linear infinite;
}

@keyframes spin {
    to { transform: rotate(360deg); }
}

#loading-state .loading-text {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--color-text-secondary);
    letter-spacing: 0.02em;
}
```

**Loading text sequence (cycled every 600ms):**

```
"Scanning for sessions..."
"Scanning for sessions.."
"Scanning for sessions."
```

### 6.6 First-Open State (No Folder Selected)

Before the user clicks "Open Folder":

```css
#welcome-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 400px;
    gap: 24px;
    text-align: center;
    padding: 48px 24px;
}

#welcome-state .welcome-title {
    font-family: var(--font-system);
    font-size: 20px;
    font-weight: 700;
    color: var(--color-text-primary);
}

#welcome-state .welcome-instructions {
    font-family: var(--font-system);
    font-size: 14px;
    color: var(--color-text-secondary);
    max-width: 420px;
    line-height: 1.6;
}

#welcome-state .welcome-path {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--color-accent-cyan);
    background: rgba(0, 212, 255, 0.08);
    padding: 8px 16px;
    border-radius: 4px;
    border: 1px solid rgba(0, 212, 255, 0.15);
}
```

---

## 7. Pixel Art Style Guide

### 7.1 Sprite Color Palette (Restricted)

All sprites use a **5-color maximum palette** to maintain pixel art authenticity. A shared base palette is used across all sprite types, with per-sprite accent variations:

**Base Sprite Palette:**

| Index | Name       | Hex         | Usage                            |
|-------|------------|-------------|----------------------------------|
| 0     | Transparent| --          | Empty/background pixels          |
| 1     | Outline    | `#2a2a3e`   | 1px dark outline on all shapes   |
| 2     | Body Dark  | `#444466`   | Shading side, shadow areas       |
| 3     | Body Light | `#667788`   | Primary fill, front-facing areas |
| 4     | Accent     | (varies)    | Eyes, circuits, highlights       |
| 5     | Highlight  | `#ffffff`   | Eye glints, screen reflections (1-2 pixels max) |

**Per-sprite accent color (index 4):**

| Sprite       | Accent Hex  | Accent Usage                  |
|-------------|-------------|-------------------------------|
| Human        | `#88aacc`   | Shirt/clothing highlight       |
| Main Agent   | `#00ff88`   | Eyes, circuit lines, antenna   |
| Sub-Agent    | `#00cc88`   | Brain circuit pattern, eye     |

### 7.2 Outline Style

Every sprite uses a **1-pixel dark outline** (`#2a2a3e`) on all external edges. This is the single most important pixel art convention for readability at small sizes.

**Rules:**
- All characters have a continuous 1px outline. No broken outlines.
- Outline color is consistent across all sprites (palette index 1).
- Internal detail lines (e.g., mouth, belt, screen edge) also use index 1 but can be skipped for the smallest sprites (sub-agents at 16x16).
- Outline does NOT extend to transparent pixels (no outline around empty space).

### 7.3 Shading Approach

**Flat shading with a single shade level:**
- Each colored area has exactly two tones: a **light** tone (index 3) and a **dark** tone (index 2).
- Light comes from the top-left (conventional pixel art lighting direction).
- Top and left edges of body masses use index 3 (light).
- Bottom and right edges of body masses use index 2 (dark).
- No dithering, no gradients, no anti-aliasing.

**Example (8x8 simplified body block):**

```
  0 0 1 1 1 1 0 0
  0 1 3 3 3 3 1 0
  1 3 3 3 3 2 2 1
  1 3 3 4 3 2 2 1    ← accent pixel (4) = eye or circuit
  1 3 3 3 2 2 2 1
  1 2 2 2 2 2 2 1
  0 1 2 2 2 2 1 0
  0 0 1 1 1 1 0 0
```

### 7.4 Size Relationships

| Sprite       | Pixel Art Size | Render Size (2x) | Relative Scale | Visual Role          |
|-------------|---------------|-------------------|----------------|----------------------|
| Human        | 32 x 32 px    | 64 x 64 px       | 1.0x (base)    | Familiar anchor      |
| Main Agent   | 32 x 32 px    | 64 x 64 px       | 1.0x (base)    | Primary focus        |
| Sub-Agent    | 16 x 16 px    | 32 x 32 px       | 0.5x           | Secondary, numerous  |

The human and main agent are the same size to establish visual parity (co-equal in the workspace). Sub-agents are exactly half-size, reinforcing their subordinate role.

### 7.5 Human Sprite Design

**Appearance:** Simplified human silhouette — head, shoulders, torso. No legs visible (desk-worker framing). Inspired by the reference image: round head, rounded shoulders.

```
Frame: idle (32x32)

        0 0 0 0 0 0 0 0 0 0 0 0 1 1 1 1 1 1 1 1 0 0 0 0 0 0 0 0 0 0 0 0
        0 0 0 0 0 0 0 0 0 0 1 1 3 3 3 3 3 3 3 3 1 1 0 0 0 0 0 0 0 0 0 0
        0 0 0 0 0 0 0 0 0 1 3 3 3 3 3 3 3 3 3 3 3 3 1 0 0 0 0 0 0 0 0 0
        0 0 0 0 0 0 0 0 1 3 3 3 3 3 3 3 3 3 3 3 3 3 3 1 0 0 0 0 0 0 0 0
        0 0 0 0 0 0 0 0 1 3 3 3 3 3 3 3 3 3 3 3 3 3 3 1 0 0 0 0 0 0 0 0
        ...  (detailed pixel data defined in spriteEngine.js)

Key features:
  - Round head occupying top ~40% of sprite
  - Shoulders curve down from head
  - No facial features except 2 dark pixels for eyes (index 1)
  - Body fill uses index 3 (light) on left, index 2 (dark) on right
  - Accent color (index 4: #88aacc) used for 2-3 pixels on shirt collar
```

### 7.6 Main Agent (Robot) Sprite Design

**Appearance:** Blocky robot body with: square head, antenna, two circular eyes, rectangular screen/chest panel with circuit lines, boxy body, simple arm stubs. Directly inspired by the reference image.

```
Key features:
  - Antenna: 1px wide, 3px tall, topped with 1px accent dot
  - Head: 10x8 px block with 1px outline
  - Eyes: 2x2 px each, filled with accent color (#00ff88), spaced 4px apart
  - Screen/chest: 8x4 px rectangle, shows circuit pattern using accent pixels
  - Body: 12x8 px main block
  - Arms: 2px wide stubs on each side, one raised (waving) in active frame
  - Treads/base: 12x2 px base with 3 circle details (1px each)
```

**Animation frames:**

| Frame | Name    | Changes from idle                                    |
|-------|---------|------------------------------------------------------|
| 0     | idle-0  | Neutral pose, eyes open, screen static               |
| 1     | idle-1  | Eyes blink (2x2 accent pixels become index 1 briefly)|
| 2     | active-0| Right arm raised, screen circuit pattern shifts      |
| 3     | active-1| Right arm mid-position, screen pattern alternate     |
| 4     | active-2| Right arm down, screen flicker (all accent for 1 frame)|

### 7.7 Sub-Agent Sprite Design

**Appearance:** A **brain/head profile** — distinctly different from the full-body robot. This is a side-view head silhouette with visible circuit patterns inside, inspired by the reference image's brain-head icons.

```
Key features (16x16 px):
  - Side-facing head profile (looking right)
  - Rounded cranium taking up top 60% of sprite
  - Brain circuit pattern inside head using accent pixels
  - Single visible eye (2x1 px accent color)
  - Simplified jaw/chin line at bottom
  - NO body, NO arms, NO legs — head only
  - Circuit lines: 3-4 accent-colored pixels in a branching pattern inside the skull
```

**Visual distinction from main agent:**
- Shape: Profile head vs. frontal full body
- Size: 16x16 vs. 32x32 (half size)
- Complexity: ~40 filled pixels vs. ~200 filled pixels
- Orientation: Side-facing vs. front-facing

### 7.8 Active vs Idle Visual Distinction

**Idle state:**
- Sprites use the **muted palette variant**: body colors are shifted 15% darker
- Muted palette override: index 2 becomes `#3a3a55`, index 3 becomes `#556677`
- Accent pixels (index 4) are dimmed: `#00ff88` becomes `#00994d` (50% brightness)
- No animation (static single frame for human and sub-agent; slow blink for main agent)

**Active state:**
- Sprites use the **full brightness palette** (values as defined in Section 7.1)
- Accent pixels are at full brightness: `#00ff88`
- Active animation frames play
- An optional **scanline overlay** effect can be applied to the main agent sprite to simulate a "processing" look:

```javascript
// Optional scanline effect for active main agent (2px moving highlight band)
function drawScanlineOverlay(ctx, x, y, w, h, elapsed) {
    const scanY = y + (elapsed * 0.03) % h;
    ctx.fillStyle = 'rgba(0, 255, 136, 0.12)';
    ctx.fillRect(x, scanY, w, 2);
    ctx.fillRect(x, scanY + 4, w, 1);
}
```

### 7.9 Completed/Dead Sub-Agent Visual

When a sub-agent completes its task:
- Accent pixels (index 4) switch to `#4a90c2` (cool blue-grey)
- Overall sprite opacity drops to 60%
- No animation

---

## 8. Dark Theme Details

WorkChart Office is **dark-theme only** by design. There is no light theme. The entire application uses a dark navy/charcoal palette that evokes a terminal or mission-control aesthetic.

### 8.1 Surface Elevation Levels

Four elevation levels create visual depth through progressively lighter backgrounds:

| Level | Name          | Background    | Usage                                    | Border             |
|-------|---------------|---------------|------------------------------------------|---------------------|
| 0     | **Void**      | `#0e0e1a`     | Page body, areas between boxes           | None                |
| 1     | **Base**      | `#1a1a2e`     | Header, footer, sidebars, overlays       | `#2a2a4e`           |
| 2     | **Card**      | `#222244`     | Session box wrapper (DOM), tooltip bg    | `#2a2a5e`           |
| 3     | **Workspace** | `#1b6ca8`     | Canvas fill (the teal box interior)      | `#0d4f7a`           |

**Elevation shadow progression:**

```css
/* Level 0: No shadow (it IS the background) */

/* Level 1: Subtle shadow */
.elevation-1 {
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

/* Level 2: Medium shadow (session boxes) */
.elevation-2 {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
}

/* Level 3: Not applicable (canvas internal, no CSS shadow) */
```

### 8.2 Border Styling

| Context              | Border CSS                                        | Notes                          |
|---------------------|---------------------------------------------------|--------------------------------|
| **Header bottom**   | `1px solid #2a2a4e`                                | Subtle separator               |
| **Footer top**      | `1px solid #2a2a4e`                                | Matching header                |
| **Session box**     | `1px solid #0d4f7a`                                | Default, transitions on state  |
| **Session box (active)** | `1px solid rgba(0, 255, 136, 0.5)`          | State-dependent override       |
| **Session box (waiting)**| `1px solid rgba(255, 170, 0, 0.5)`          | State-dependent override       |
| **Button**          | `1px solid rgba(255, 255, 255, 0.1)`              | Barely visible edge            |
| **Tooltip**         | `1px solid #2a2a5e`                                | Matches card elevation         |
| **Input/focus ring**| `2px solid #00d4ff`                                | High-visibility focus          |
| **Divider (internal)**| `1px solid rgba(255, 255, 255, 0.06)`          | Ultra-subtle separation        |

### 8.3 Shadow Specifications

```css
/* Primary box shadow (session boxes) */
.session-box {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
}

/* Hover state — lifted shadow */
.session-box:hover {
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.45);
}

/* Active glow — combines shadow + colored glow */
.session-box[data-state="active"] {
    box-shadow:
        0 2px 8px rgba(0, 0, 0, 0.35),           /* base depth shadow */
        0 0 12px rgba(0, 255, 136, 0.35),          /* inner glow */
        0 0 24px rgba(0, 255, 136, 0.15);          /* outer glow halo */
}

/* Waiting pulse — animated (see Section 4.6) */
.session-box[data-state="waiting"] {
    box-shadow:
        0 2px 8px rgba(0, 0, 0, 0.35),
        0 0 12px rgba(255, 170, 0, 0.3),
        0 0 20px rgba(255, 170, 0, 0.1);
}

/* Error state — red glow */
.session-box[data-state="error"] {
    box-shadow:
        0 2px 8px rgba(0, 0, 0, 0.35),
        0 0 12px rgba(255, 68, 102, 0.4),
        0 0 20px rgba(255, 68, 102, 0.15);
}

/* Tooltip shadow */
.sub-agent-tooltip {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
}

/* Header/footer shadow (optional for depth) */
#app-header {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
}
```

### 8.4 Glow Effects

Glow effects are the primary visual language for communicating state in a dark theme. They use layered `box-shadow` on DOM elements and `shadowBlur`/`shadowColor` on canvas.

**DOM-level glow (CSS box-shadow):**

See Section 4.6 for full implementation. Summary:

| State    | Glow Color                     | Spread   | Animation          |
|----------|--------------------------------|----------|--------------------|
| Active   | `rgba(0, 255, 136, 0.35)`     | 12-24px  | Static             |
| Waiting  | `rgba(255, 170, 0, 0.3)`      | 12-20px  | 2s pulse cycle     |
| Error    | `rgba(255, 68, 102, 0.4)`     | 12-20px  | Static             |
| Selected | `rgba(0, 212, 255, 0.3)`      | 8-16px   | Static             |

**Canvas-level glow (for sprite accents):**

```javascript
// Apply glow to accent-colored pixels when active
function drawSpriteWithGlow(ctx, sprite, x, y, glowColor, glowRadius) {
    ctx.save();
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = glowRadius;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.drawImage(sprite, x, y);
    ctx.restore();
}

// Usage:
// Active main agent: drawSpriteWithGlow(ctx, sprite, 280, 15, '#00ff88', 6);
// Active sub-agent:  drawSpriteWithGlow(ctx, sprite, x, 140, '#00cc88', 4);
```

### 8.5 Text Color Hierarchy

| Level         | Token                      | Hex         | Opacity | Usage                                              |
|---------------|----------------------------|-------------|---------|-----------------------------------------------------|
| **Primary**   | `--color-text-primary`     | `#ffffff`   | 100%    | Headers, important labels, active status text       |
| **Secondary** | `--color-text-secondary`   | `#aaaaaa`   | ~67%    | Descriptions, non-critical labels, footer text      |
| **Tertiary**  | `--color-text-tertiary`    | `#777788`   | ~47%    | Timestamps, metadata, supplementary info            |
| **Disabled**  | `--color-text-disabled`    | `#555566`   | ~33%    | Disabled button text, placeholder text              |
| **Inverse**   | `--color-text-inverse`     | `#0e0e1a`   | 100%    | Text on light/accent backgrounds (e.g., inside speech bubble) |
| **Accent**    | `--color-accent-neon`      | `#00ff88`   | 100%    | Active state labels, highlighted tool names          |
| **Warning**   | `--color-accent-amber`     | `#ffaa00`   | 100%    | Waiting state labels, warning messages               |
| **Error**     | `--color-state-error`      | `#ff4466`   | 100%    | Error messages, disconnect notices                   |

---

## Appendix A: Easing Functions (JavaScript)

```javascript
// Standard ease-out (deceleration)
function easeOut(t) {
    return 1 - Math.pow(1 - t, 3);
}

// Ease-in-out (smooth start and stop)
function easeInOut(t) {
    return t < 0.5
        ? 4 * t * t * t
        : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Back-out (overshoot and settle) — used for spawn and bubble animations
function easeBackOut(t) {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

// Sine wave (for pulsing/breathing)
function easeSine(t) {
    return (Math.sin(t * Math.PI * 2) + 1) / 2;
}
```

## Appendix B: CSS Custom Properties (Complete)

```css
:root {
    /* === COLORS === */
    /* Backgrounds */
    --color-bg-page: #0e0e1a;
    --color-bg-surface: #1a1a2e;
    --color-bg-card: #222244;
    --color-bg-box: #1b6ca8;
    --color-bg-box-dim: #155a8a;
    --color-statusbar: rgba(0, 0, 0, 0.45);

    /* Borders */
    --color-border-box: #0d4f7a;
    --color-border-surface: #2a2a4e;
    --color-border-card: #2a2a5e;
    --color-border-subtle: rgba(255, 255, 255, 0.06);

    /* State */
    --color-state-active: #00ff88;
    --color-state-idle: #6b7b8d;
    --color-state-waiting: #ffaa00;
    --color-state-error: #ff4466;
    --color-state-done: #4a90c2;

    /* Accents */
    --color-accent-neon: #00ff88;
    --color-accent-cyan: #00d4ff;
    --color-accent-amber: #ffaa00;
    --color-accent-purple: #b388ff;

    /* Text */
    --color-text-primary: #ffffff;
    --color-text-secondary: #aaaaaa;
    --color-text-tertiary: #777788;
    --color-text-disabled: #555566;
    --color-text-inverse: #0e0e1a;

    /* Buttons */
    --color-button-default: #2a5a8a;
    --color-button-hover: #3a7ab4;
    --color-button-active: #1d4a6e;
    --color-button-disabled: #1a2a3a;
    --color-button-text: #ffffff;
    --color-button-text-disabled: #556677;

    /* === TYPOGRAPHY === */
    --font-mono: 'JetBrains Mono', 'Cascadia Code', 'Fira Code', 'SF Mono',
                 'Consolas', 'Liberation Mono', monospace;
    --font-system: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto',
                   'Helvetica Neue', Arial, sans-serif;

    /* === SPACING === */
    --space-unit: 8px;
    --space-xs: 4px;
    --space-sm: 8px;
    --space-md: 16px;
    --space-lg: 24px;
    --space-xl: 32px;
    --space-2xl: 48px;

    /* === LAYOUT === */
    --header-height: 56px;
    --footer-height: 40px;
    --box-min-width: 360px;
    --box-max-width: 560px;
    --box-border-radius: 8px;
    --canvas-width: 400;
    --canvas-height: 250;

    /* === TIMING === */
    --transition-fast: 150ms;
    --transition-normal: 300ms;
    --transition-slow: 500ms;
    --ease-default: ease-in-out;
    --ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1);
}
```

## Appendix C: Design Tokens Quick Reference

For developers implementing the canvas renderer, here are the most critical values in one place:

```
CANVAS SIZE:             400 x 250 (logical), rendered at 2x for retina
BOX BACKGROUND:          #1b6ca8
STATUS BAR:              y=220, h=30, bg=rgba(0,0,0,0.45), text=#ffffff at 11px monospace
HUMAN POSITION:          x=30, y=15, size=64x64
ROBOT POSITION:          x=280, y=15, size=64x64
CONNECTION LINE:         y=47, from x=94 to x=280
SUB-AGENT ROW:           y=140, starting x=20, spacing=50px center-to-center, size=32x32
MAX VISIBLE SUB-AGENTS:  7 (then overflow badge)
SPRITE FRAME RATE:       500ms idle, 350ms active
SPAWN ANIMATION:         400ms, scale 0.3->1.0, purple flash
SPEECH BUBBLE:           300ms bounce-in, amber (#ffaa00), "?" in dark text
GLOW (ACTIVE):           green, 12-24px spread, static
GLOW (WAITING):          amber, 12-20px spread, 2s pulse
IDLE BREATHE:            3s cycle, brightness 0.92-1.0
```

---

*End of Visual Design Specification*
