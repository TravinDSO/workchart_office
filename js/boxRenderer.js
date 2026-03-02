/**
 * boxRenderer.js — Session Box Canvas Rendering
 *
 * Each session is displayed as a self-contained canvas "box" with:
 *   - Steel-blue background with dark border
 *   - Human sprite (top-left) and Main Agent/Robot sprite (top-right)
 *   - Animated dashed connection line between them
 *   - Sub-agent sprites in a bottom row
 *   - Speech bubble "?" when the agent is waiting for user input
 *   - Status bar at the bottom with session info
 *
 * Logical canvas size: 400 x 250 pixels.
 * Rendered at devicePixelRatio for sharp display.
 */

// Polyfill for CanvasRenderingContext2D.roundRect (older browsers)
if (typeof CanvasRenderingContext2D !== 'undefined' &&
    !CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
        const radius = typeof r === 'number' ? r : (Array.isArray(r) ? r[0] : 0);
        this.moveTo(x + radius, y);
        this.lineTo(x + w - radius, y);
        this.quadraticCurveTo(x + w, y, x + w, y + radius);
        this.lineTo(x + w, y + h - radius);
        this.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
        this.lineTo(x + radius, y + h);
        this.quadraticCurveTo(x, y + h, x, y + h - radius);
        this.lineTo(x, y + radius);
        this.quadraticCurveTo(x, y, x + radius, y);
        this.closePath();
    };
}

export class BoxRenderer {
    /**
     * @param {HTMLCanvasElement} canvas - The canvas element to render into.
     * @param {import('./spriteEngine.js').SpriteEngine} spriteEngine
     */
    constructor(canvas, spriteEngine) {
        /** @type {HTMLCanvasElement} */
        this.canvas = canvas;

        /** @type {import('./spriteEngine.js').SpriteEngine} */
        this.spriteEngine = spriteEngine;

        /** Logical dimensions (CSS pixels) */
        this.logicalWidth = 400;
        this.logicalHeight = 250;

        /** Animated dash offset for the connection line */
        this._dashOffset = 0;

        // Set up canvas for sharp rendering at device pixel ratio
        this._setupCanvas();
    }

    // -----------------------------------------------------------------------
    // Canvas setup
    // -----------------------------------------------------------------------

    _setupCanvas() {
        const dpr = window.devicePixelRatio || 1;

        // Set the actual pixel dimensions of the canvas
        this.canvas.width = this.logicalWidth * dpr;
        this.canvas.height = this.logicalHeight * dpr;

        // Set the CSS display size
        this.canvas.style.width = `${this.logicalWidth}px`;
        this.canvas.style.height = `${this.logicalHeight}px`;

        // Scale the context so drawing commands use logical coordinates
        const ctx = this.canvas.getContext('2d');
        ctx.scale(dpr, dpr);
    }

    // -----------------------------------------------------------------------
    // Main render method
    // -----------------------------------------------------------------------

    /**
     * Render the current session state onto the canvas.
     *
     * @param {import('./sessionManager.js').SessionState} session
     * @param {number} dt - Delta time in milliseconds since last frame.
     */
    render(session, dt) {
        const ctx = this.canvas.getContext('2d');

        // Temporarily reset scale to clear properly
        const dpr = window.devicePixelRatio || 1;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.restore();

        // 1. Background fill
        ctx.fillStyle = '#1b6ca8';
        ctx.fillRect(0, 0, this.logicalWidth, this.logicalHeight);

        // 2. Border stroke
        ctx.strokeStyle = '#0d4f7a';
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, this.logicalWidth - 2, this.logicalHeight - 2);

        // 3. Human sprite (top-left, 64x64 rendered from 32x32 at 2x)
        const humanState = session.humanActive ? 'active' : 'idle';
        this.spriteEngine.draw(ctx, 'human', humanState, 30, 15, dt);

        // Label: "User" below the human sprite
        this._drawSpriteLabel(ctx, 'User', 62, 83);

        // 4. Main Agent / Robot sprite (top-right, 64x64 rendered)
        const agentAnimState = session.mainAgent.state === 'waiting' ? 'idle' :
                               session.mainAgent.state === 'active' ? 'active' : 'idle';
        this.spriteEngine.draw(ctx, 'main-agent', agentAnimState, 280, 15, dt);

        // Label: "Optimus Prime" below the main agent sprite
        this._drawSpriteLabel(ctx, 'Optimus Prime', 312, 83);

        // 5. Connection line between human and agent
        this._drawConnection(ctx, session.mainAgent.state, dt);

        // 6. Sub-agent sprites in bottom row
        this._drawSubAgents(ctx, session, dt);

        // 7. Speech bubble if agent is waiting
        if (session.mainAgent.state === 'waiting') {
            this._drawSpeechBubble(ctx, 310, 5, '?');
        }

        // 8. Status bar at the bottom
        this._drawStatusBar(ctx, session);
    }

    // -----------------------------------------------------------------------
    // Connection line
    // -----------------------------------------------------------------------

    /**
     * Draw the dashed connection line between human and agent.
     * Animates when the agent is active, pulses when waiting.
     */
    _drawConnection(ctx, agentState, dt) {
        const startX = 94;  // Right edge of human sprite area
        const endX = 280;   // Left edge of agent sprite area
        const y = 47;       // Vertical center of sprites

        ctx.save();

        if (agentState === 'active') {
            // Animated solid-ish dashes flowing left-to-right
            ctx.strokeStyle = '#00ff88';
            ctx.lineWidth = 2;
            ctx.setLineDash([8, 4]);
            this._dashOffset -= dt * 0.03;
            ctx.lineDashOffset = this._dashOffset;
        } else if (agentState === 'waiting') {
            // Pulsing dashed line in amber
            const pulse = Math.sin(Date.now() * 0.004) * 0.3 + 0.7;
            ctx.strokeStyle = `rgba(255, 170, 0, ${pulse})`;
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 6]);
        } else {
            // Idle — dim dotted line
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 8]);
        }

        ctx.beginPath();
        ctx.moveTo(startX, y);
        ctx.lineTo(endX, y);
        ctx.stroke();

        // Draw an arrowhead at the agent end when active
        if (agentState === 'active') {
            ctx.setLineDash([]);
            ctx.fillStyle = '#00ff88';
            ctx.beginPath();
            ctx.moveTo(endX, y);
            ctx.lineTo(endX - 8, y - 4);
            ctx.lineTo(endX - 8, y + 4);
            ctx.closePath();
            ctx.fill();
        }

        ctx.restore();
    }

    // -----------------------------------------------------------------------
    // Sub-agents
    // -----------------------------------------------------------------------

    _drawSubAgents(ctx, session, dt) {
        const baseY = 140;
        const minX = 20;
        const maxX = 380;
        const availableWidth = maxX - minX;
        const spriteW = 32; // 16px at 2x

        // Collect visible sub-agents first so we can calculate layout
        const visible = [];
        for (const [, sub] of session.subAgents) {
            if (sub.state !== 'completed') visible.push(sub);
        }
        if (visible.length === 0) return;

        // Calculate spacing: spread evenly, but cap at a comfortable max
        const maxSpacing = 90;
        const minSpacing = 45;
        let spacing;
        if (visible.length === 1) {
            spacing = 0; // single agent, no spacing needed
        } else {
            spacing = Math.min(maxSpacing, Math.max(minSpacing,
                Math.floor(availableWidth / visible.length)));
        }

        // Calculate max label chars based on available space per agent
        const labelCharsPerPx = 0.14; // ~7px per char at 9px monospace
        const availPerAgent = visible.length === 1 ? availableWidth : spacing;
        const maxLabelLen = Math.max(5, Math.floor(availPerAgent * labelCharsPerPx));

        // Center the row if it doesn't fill the full width
        const totalWidth = visible.length === 1 ? spriteW : (visible.length - 1) * spacing + spriteW;
        const startX = Math.max(minX, Math.floor((this.logicalWidth - totalWidth) / 2));

        for (let i = 0; i < visible.length; i++) {
            const sub = visible[i];
            const x = startX + i * spacing;

            if (x + spriteW > maxX + 10) break; // safety overflow guard

            const subState = sub.state === 'active' ? 'active' : 'idle';
            this.spriteEngine.draw(ctx, 'sub-agent', subState, x, baseY, dt);

            // Label below the sub-agent sprite
            const label = sub.description || 'agent';
            const truncated = label.length > maxLabelLen
                ? label.substring(0, maxLabelLen) + '..'
                : label;
            this._drawSpriteLabel(ctx, truncated, x + spriteW / 2, baseY + 35, 9);
        }
    }

    // -----------------------------------------------------------------------
    // Sprite labels
    // -----------------------------------------------------------------------

    /**
     * Draw a small text label centered at (cx, y) below a sprite.
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {string} text
     * @param {number} cx - Center x position.
     * @param {number} y  - Top of the label text.
     * @param {number} [fontSize=10] - Font size in pixels.
     */
    _drawSpriteLabel(ctx, text, cx, y, fontSize = 10) {
        ctx.save();
        ctx.font = `bold ${fontSize}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.fillText(text, cx, y);
        ctx.restore();
    }

    // -----------------------------------------------------------------------
    // Speech bubble
    // -----------------------------------------------------------------------

    /**
     * Draw a speech bubble with text above the agent sprite.
     */
    _drawSpeechBubble(ctx, x, y, text) {
        const bubbleWidth = 28;
        const bubbleHeight = 22;
        const bx = x;
        const by = y;
        const tailSize = 6;

        ctx.save();

        // Bubble background
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.roundRect(bx, by, bubbleWidth, bubbleHeight, 6);
        ctx.fill();

        // Bubble border
        ctx.strokeStyle = '#333333';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(bx, by, bubbleWidth, bubbleHeight, 6);
        ctx.stroke();

        // Tail triangle pointing down
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(bx + 8, by + bubbleHeight - 1);
        ctx.lineTo(bx + 8 + tailSize, by + bubbleHeight + tailSize);
        ctx.lineTo(bx + 8 + tailSize * 2, by + bubbleHeight - 1);
        ctx.closePath();
        ctx.fill();

        // Tail border
        ctx.strokeStyle = '#333333';
        ctx.beginPath();
        ctx.moveTo(bx + 8, by + bubbleHeight);
        ctx.lineTo(bx + 8 + tailSize, by + bubbleHeight + tailSize);
        ctx.lineTo(bx + 8 + tailSize * 2, by + bubbleHeight);
        ctx.stroke();

        // Text inside the bubble
        ctx.fillStyle = '#ffaa00';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, bx + bubbleWidth / 2, by + bubbleHeight / 2);

        ctx.restore();
    }

    // -----------------------------------------------------------------------
    // Status bar
    // -----------------------------------------------------------------------

    /**
     * Draw the semi-transparent status bar at the bottom of the box.
     */
    _drawStatusBar(ctx, session) {
        const barY = 220;
        const barHeight = 30;

        // Semi-transparent background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(0, barY, this.logicalWidth, barHeight);

        // Status text
        ctx.font = '11px monospace';
        ctx.textBaseline = 'middle';

        // Project label (short, dimmed)
        const projectLabel = session.projectLabel || '';

        // Session name — use the full available width
        const slug = session.customTitle || session.slug || session.sessionId.substring(0, 12);

        // Draw project label first (dimmed) if available
        let textX = 10;
        if (projectLabel) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
            ctx.textAlign = 'left';
            ctx.fillText(projectLabel, textX, barY + barHeight / 2);
            textX += ctx.measureText(projectLabel).width + 6;

            // Separator
            ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.fillText('|', textX, barY + barHeight / 2);
            textX += ctx.measureText('|').width + 6;
        }

        // Color based on state
        if (session.mainAgent.state === 'active') {
            ctx.fillStyle = '#00ff88';
        } else if (session.mainAgent.state === 'waiting') {
            ctx.fillStyle = '#ffaa00';
        } else {
            ctx.fillStyle = '#aaaaaa';
        }

        // Truncate slug to fit remaining width (with 10px right margin)
        const maxWidth = this.logicalWidth - textX - 10;
        let displaySlug = slug;
        while (ctx.measureText(displaySlug).width > maxWidth && displaySlug.length > 3) {
            displaySlug = displaySlug.substring(0, displaySlug.length - 1);
        }
        if (displaySlug.length < slug.length) {
            displaySlug = displaySlug.substring(0, displaySlug.length - 2) + '..';
        }

        ctx.textAlign = 'left';
        ctx.fillText(displaySlug, textX, barY + barHeight / 2);
    }
}
