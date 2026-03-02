/**
 * boxRenderer.js — Session Box Canvas Rendering
 *
 * Each session is displayed as a self-contained canvas "box" with:
 *   - Left column: Human sprite (top) → vertical connection → Robot sprite (bottom)
 *   - Right column: Sub-agents listed vertically with labels
 *   - Speech bubble "?" when the agent is waiting for user input
 *   - Status bar at the bottom with session info
 *
 * Logical canvas width: 400 pixels (fixed).
 * Logical canvas height: dynamic, grows with sub-agent count.
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
        this.logicalHeight = 180; // minimum height

        /** Animated dash offset for the connection line */
        this._dashOffset = 0;

        /** When true, completed sub-agents are shown */
        this.showAllSubAgents = false;

        // Set up canvas for sharp rendering at device pixel ratio
        this._setupCanvas(this.logicalHeight);
    }

    // -----------------------------------------------------------------------
    // Dynamic height calculation
    // -----------------------------------------------------------------------

    /**
     * Compute the logical canvas height based on sub-agent count.
     * Left column is fixed (~117px for compact user + connection + bot + label).
     * Right column grows: 15 + visibleSubAgents * 45.
     * Height = max(leftCol, rightCol) + 10 (gap) + 30 (status bar).
     * Minimum: 160px.
     */
    _computeLogicalHeight(session) {
        const leftColBottom = 139;

        let visibleCount = 0;
        for (const [, sub] of session.subAgents) {
            if (this.showAllSubAgents || sub.state !== 'completed') visibleCount++;
        }

        const rightColBottom = 15 + visibleCount * 45;
        const contentHeight = Math.max(leftColBottom, rightColBottom);
        return Math.max(180, contentHeight + 10 + 30);
    }

    // -----------------------------------------------------------------------
    // Canvas setup
    // -----------------------------------------------------------------------

    /**
     * Set up or resize the canvas. Only resizes when dimensions actually change
     * to avoid flicker.
     */
    _setupCanvas(height) {
        const dpr = window.devicePixelRatio || 1;
        const newW = this.logicalWidth * dpr;
        const newH = height * dpr;

        if (this.canvas.width === newW && this.canvas.height === newH) {
            return; // no change needed
        }

        this.logicalHeight = height;

        // Set the actual pixel dimensions of the canvas
        this.canvas.width = newW;
        this.canvas.height = newH;

        // Set the CSS display size
        this.canvas.style.width = `${this.logicalWidth}px`;
        this.canvas.style.height = `${height}px`;

        // Scale the context so drawing commands use logical coordinates
        const ctx = this.canvas.getContext('2d');
        ctx.setTransform(1, 0, 0, 1, 0, 0);
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
        // 0. Compute dynamic height and resize canvas if needed
        const height = this._computeLogicalHeight(session);
        this._setupCanvas(height);

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

        // 3. Human sprite (top of left column, 32x32 at scale=1)
        const humanState = session.humanActive ? 'active' : 'idle';
        this.spriteEngine.draw(ctx, 'human', humanState, 34, 10, dt, 1);

        // Label: "User" below the human sprite
        this._drawSpriteLabel(ctx, 'User', 50, 45);

        // 4. Vertical connection line from human down to bot
        this._drawConnection(ctx, session.mainAgent.state, dt);

        // 5. Main Agent / Robot sprite (below connection, left column, 32x32 at scale=1)
        const agentAnimState = session.mainAgent.state === 'waiting' ? 'idle' :
                               session.mainAgent.state === 'active' ? 'active' : 'idle';
        this.spriteEngine.draw(ctx, 'main-agent', agentAnimState, 34, 92, dt, 1);

        // Label: "Optimus Prime" below the main agent sprite
        this._drawSpriteLabel(ctx, 'Optimus Prime', 50, 127);

        // 6. Speech bubble near bot when waiting
        if (session.mainAgent.state === 'waiting') {
            this._drawSpeechBubble(ctx, 70, 62, '?');
        }

        // 7. Vertical divider between left and right columns
        this._drawDivider(ctx);

        // 8. Sub-agent sprites in right column (vertical list)
        this._drawSubAgents(ctx, session, dt);

        // 9. Status bar at the bottom
        this._drawStatusBar(ctx, session);
    }

    // -----------------------------------------------------------------------
    // Hit-testing (for click / hover detection)
    // -----------------------------------------------------------------------

    /**
     * Convert CSS pixel coordinates to logical canvas coordinates,
     * accounting for CSS scaling of the canvas element.
     * @param {number} cssX
     * @param {number} cssY
     * @returns {{x: number, y: number}}
     */
    _cssToLogical(cssX, cssY) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.logicalWidth / rect.width;
        const scaleY = this.logicalHeight / rect.height;
        return {
            x: cssX * scaleX,
            y: cssY * scaleY,
        };
    }

    /**
     * Determine what element (if any) is at the given CSS pixel coords
     * relative to the canvas element.
     *
     * @param {number} cssX - X relative to canvas bounding rect left.
     * @param {number} cssY - Y relative to canvas bounding rect top.
     * @param {import('./sessionManager.js').SessionState} session
     * @returns {{type: 'human'|'main-agent'|'sub-agent', id: string|null}|null}
     */
    hitTest(cssX, cssY, session) {
        const { x, y } = this._cssToLogical(cssX, cssY);

        // Human sprite + label area
        if (x >= 18 && x <= 82 && y >= 2 && y <= 57) {
            return { type: 'human', id: null };
        }

        // Main agent sprite + label area
        if (x >= 18 && x <= 82 && y >= 82 && y <= 139) {
            return { type: 'main-agent', id: null };
        }

        // Sub-agents in the right column
        const visible = [];
        for (const [key, sub] of session.subAgents) {
            if (this.showAllSubAgents || sub.state !== 'completed') visible.push(key);
        }
        for (let i = 0; i < visible.length; i++) {
            const rowY = 7 + i * 45;
            if (x >= 102 && x <= 390 && y >= rowY && y <= rowY + 40) {
                return { type: 'sub-agent', id: visible[i] };
            }
        }

        return null;
    }

    /**
     * Check if the given CSS coords are over a clickable sprite area.
     * Used for cursor feedback (pointer vs default).
     *
     * @param {number} cssX
     * @param {number} cssY
     * @param {import('./sessionManager.js').SessionState} session
     * @returns {boolean}
     */
    isOverClickable(cssX, cssY, session) {
        return this.hitTest(cssX, cssY, session) !== null;
    }

    // -----------------------------------------------------------------------
    // Connection line
    // -----------------------------------------------------------------------

    /**
     * Draw the dashed vertical connection line between human and agent.
     * Animates when the agent is active, pulses when waiting.
     */
    _drawConnection(ctx, agentState, dt) {
        const x = 50;       // Center of left column
        const startY = 57;  // Below human label
        const endY = 90;    // Top of bot sprite

        ctx.save();

        if (agentState === 'active') {
            // Animated dashes flowing top-to-bottom
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
        ctx.moveTo(x, startY);
        ctx.lineTo(x, endY);
        ctx.stroke();

        // Draw a downward arrowhead at the bot end when active
        if (agentState === 'active') {
            ctx.setLineDash([]);
            ctx.fillStyle = '#00ff88';
            ctx.beginPath();
            ctx.moveTo(x, endY);
            ctx.lineTo(x - 4, endY - 8);
            ctx.lineTo(x + 4, endY - 8);
            ctx.closePath();
            ctx.fill();
        }

        ctx.restore();
    }

    // -----------------------------------------------------------------------
    // Vertical divider
    // -----------------------------------------------------------------------

    /**
     * Draw a subtle vertical separator between left and right columns.
     */
    _drawDivider(ctx) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(100, 10);
        ctx.lineTo(100, this.logicalHeight - 40);
        ctx.stroke();
        ctx.restore();
    }

    // -----------------------------------------------------------------------
    // Sub-agents
    // -----------------------------------------------------------------------

    _drawSubAgents(ctx, session, dt) {
        const baseX = 110;
        const baseY = 15;
        const rowHeight = 45;
        const spriteSize = 32; // 16px at 2x
        const labelX = 148;
        const maxLabelLen = 40;

        // Collect visible sub-agents
        const visible = [];
        for (const [, sub] of session.subAgents) {
            if (this.showAllSubAgents || sub.state !== 'completed') visible.push(sub);
        }
        if (visible.length === 0) return;

        for (let i = 0; i < visible.length; i++) {
            const sub = visible[i];
            const y = baseY + i * rowHeight;

            const subState = sub.state === 'active' ? 'active' : 'idle';
            this.spriteEngine.draw(ctx, 'sub-agent', subState, baseX, y, dt);

            // Label to the right of the sub-agent sprite
            const label = sub.description || 'agent';
            const truncated = label.length > maxLabelLen
                ? label.substring(0, maxLabelLen) + '..'
                : label;
            this._drawSubAgentLabel(ctx, truncated, labelX, y + 16);
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

    /**
     * Draw a left-aligned label for a sub-agent in the right column.
     */
    _drawSubAgentLabel(ctx, text, x, y) {
        ctx.save();
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.fillText(text, x, y);
        ctx.restore();
    }

    // -----------------------------------------------------------------------
    // Speech bubble
    // -----------------------------------------------------------------------

    /**
     * Draw a speech bubble with text near the agent sprite.
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
        const barHeight = 30;
        const barY = this.logicalHeight - barHeight;

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
