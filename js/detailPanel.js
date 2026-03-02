/**
 * detailPanel.js — Slide-in Detail Panel
 *
 * Displays real-time details about a clicked element (human, main agent,
 * or sub-agent) in a session box. Slides in from the right edge of the
 * viewport and updates every render frame while visible.
 */

export class DetailPanel {
    constructor() {
        /** @type {HTMLElement} */
        this.el = null;

        /** @type {HTMLElement} */
        this._titleEl = null;

        /** @type {HTMLElement} */
        this._bodyEl = null;

        /** @type {HTMLElement} */
        this._logEl = null;

        /** @type {HTMLElement} */
        this._actionsEl = null;

        /** Cache key for the last rendered actions to avoid re-rendering every frame */
        this._actionsKey = '';

        /** @type {string|null} */
        this._sessionId = null;

        /** @type {'human'|'main-agent'|'sub-agent'|null} */
        this._targetType = null;

        /** @type {string|null} */
        this._targetId = null;

        /** Cache of last-written field values to avoid unnecessary DOM writes */
        this._fieldCache = {};

        /** Cache of last-written log length to avoid unnecessary DOM writes */
        this._logCache = { len: -1 };

        this._buildDOM();
    }

    // -----------------------------------------------------------------------
    // DOM construction
    // -----------------------------------------------------------------------

    _buildDOM() {
        const aside = document.createElement('aside');
        aside.id = 'detail-panel';
        aside.className = 'detail-panel';
        aside.setAttribute('aria-label', 'Session detail panel');

        // Header
        const header = document.createElement('div');
        header.className = 'dp-header';

        this._titleEl = document.createElement('h2');
        this._titleEl.className = 'dp-title';
        header.appendChild(this._titleEl);

        const closeBtn = document.createElement('button');
        closeBtn.className = 'dp-close';
        closeBtn.innerHTML = '<span aria-hidden="true">\u00D7</span>';
        closeBtn.title = 'Close panel';
        closeBtn.setAttribute('aria-label', 'Close detail panel');
        closeBtn.addEventListener('click', () => this.hide());
        header.appendChild(closeBtn);

        aside.appendChild(header);

        // Body (fields)
        this._bodyEl = document.createElement('div');
        this._bodyEl.className = 'dp-body';
        aside.appendChild(this._bodyEl);

        // Actions row (between body and log)
        this._actionsEl = document.createElement('div');
        this._actionsEl.className = 'dp-actions';
        aside.appendChild(this._actionsEl);

        // Log section
        const logHeader = document.createElement('div');
        logHeader.className = 'dp-log-header';
        logHeader.textContent = 'Event Log';
        aside.appendChild(logHeader);

        this._logEl = document.createElement('div');
        this._logEl.className = 'dp-log';
        aside.appendChild(this._logEl);

        document.body.appendChild(aside);
        this.el = aside;
    }

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    /**
     * Show the panel for a given target in a session.
     *
     * @param {string} sessionId
     * @param {'human'|'main-agent'|'sub-agent'} targetType
     * @param {string|null} targetId - Sub-agent key (null for human/main-agent)
     * @param {import('./sessionManager.js').SessionState} session
     */
    show(sessionId, targetType, targetId, session) {
        this._sessionId = sessionId;
        this._targetType = targetType;
        this._targetId = targetId;
        this._fieldCache = {};
        this._logCache = { len: -1 };
        this._actionsKey = '';
        this._render(session);
        this.el.classList.add('visible');
    }

    /**
     * Refresh the panel contents if it's showing data for the given session.
     *
     * @param {import('./sessionManager.js').SessionState} session
     */
    update(session) {
        if (!this.isVisible) return;
        if (session.sessionId !== this._sessionId) return;
        this._render(session);
    }

    /** Hide the panel. */
    hide() {
        this.el.classList.remove('visible');
        this._sessionId = null;
        this._targetType = null;
        this._targetId = null;
        this._fieldCache = {};
        this._logCache = { len: -1 };
        this._actionsKey = '';
    }

    /** @returns {boolean} */
    get isVisible() {
        return this.el.classList.contains('visible');
    }

    /** @returns {string|null} The session ID currently shown, or null. */
    get activeSessionId() {
        return this._sessionId;
    }

    // -----------------------------------------------------------------------
    // Rendering
    // -----------------------------------------------------------------------

    _render(session) {
        switch (this._targetType) {
            case 'human':
                this._renderHuman(session);
                break;
            case 'main-agent':
                this._renderMainAgent(session);
                break;
            case 'sub-agent':
                this._renderSubAgent(session);
                break;
        }
    }

    _renderHuman(session) {
        this._setTitle('Human');
        const status = session.humanActive ? 'active' : 'idle';
        const sessionName = session.customTitle || session.slug || session.sessionId.substring(0, 16);
        const project = session.projectLabel || session.project || '—';

        this._setFields([
            { label: 'Status', value: status, stateClass: status },
            { label: 'Session', value: sessionName },
            { label: 'Project', value: project },
        ]);

        this._setActions([
            {
                label: 'View Report',
                className: 'dp-action-btn dp-action-report',
                title: 'Open full session report in a new tab',
                onClick: () => this._openReport(session),
            },
        ]);

        this._renderLog(session.humanLog || []);
    }

    _renderMainAgent(session) {
        this._setTitle('Main Agent');
        const state = session.mainAgent.state;
        const tool = session.mainAgent.currentTool || '—';

        let activeCount = 0;
        let idleCount = 0;
        for (const [, sub] of session.subAgents) {
            if (sub.state === 'active') activeCount++;
            else if (sub.state === 'idle') idleCount++;
        }
        const subSummary = (activeCount + idleCount) > 0
            ? `${activeCount} active / ${idleCount} idle`
            : 'none';
        const sessionName = session.customTitle || session.slug || session.sessionId.substring(0, 16);
        const spawned = session.createdTime ? DetailPanel.formatAge(session.createdTime) : '—';
        const lastActivity = session.lastDataTime ? DetailPanel.formatAge(session.lastDataTime) : '—';

        this._setFields([
            { label: 'Spawned', value: spawned },
            { label: 'Last Activity', value: lastActivity },
            { label: 'State', value: state, stateClass: state },
            { label: 'Current Tool', value: tool },
            { label: 'Sub-agents', value: subSummary },
            { label: 'Session', value: sessionName },
        ]);

        this._setActions([
            {
                label: 'Open Folder',
                className: 'dp-action-btn dp-action-open',
                title: 'Open session directory in file explorer',
                onClick: () => this._openFolder(session),
            },
            {
                label: 'Delete Session',
                className: 'dp-action-btn dp-action-delete',
                title: 'Permanently delete this session',
                onClick: () => this._showDeleteConfirm(session),
            },
        ]);

        this._renderLog(session.mainAgentLog || []);
    }

    _renderSubAgent(session) {
        this._setActions([]);
        const sub = session.subAgents.get(this._targetId);
        if (!sub) {
            this._setTitle('Sub-Agent');
            this._setFields([{ label: 'Status', value: 'gone' }]);
            return;
        }

        const desc = sub.description || 'agent';
        this._setTitle('Sub-Agent');

        const state = sub.state;
        const lastTool = sub.lastTool || '—';
        const age = sub.spawnTime ? DetailPanel.formatAge(sub.spawnTime) : '—';
        const lastActivity = sub.lastActivityTime
            ? DetailPanel.formatAge(sub.lastActivityTime)
            : '—';

        this._setFields([
            { label: 'Description', value: desc },
            { label: 'State', value: state, stateClass: state },
            { label: 'Last Tool', value: lastTool },
            { label: 'Spawned', value: age },
            { label: 'Last Activity', value: lastActivity },
        ]);
        const subLog = session.subAgentLogs ? session.subAgentLogs.get(this._targetId) : null;
        this._renderLog(subLog || []);
    }

    // -----------------------------------------------------------------------
    // DOM helpers
    // -----------------------------------------------------------------------

    _setTitle(text) {
        if (this._titleEl.textContent !== text) {
            this._titleEl.textContent = text;
        }
    }

    /**
     * Render a list of label/value fields into the body.
     * Only touches the DOM when values actually change.
     *
     * @param {Array<{label: string, value: string, stateClass?: string}>} fields
     */
    _setFields(fields) {
        const key = fields.map(f => `${f.label}:${f.value}:${f.stateClass || ''}`).join('|');
        if (this._fieldCache._key === key) return;
        this._fieldCache._key = key;

        this._bodyEl.innerHTML = '';
        for (const f of fields) {
            const row = document.createElement('div');
            row.className = 'dp-field';

            const label = document.createElement('span');
            label.className = 'dp-label';
            label.textContent = f.label;
            row.appendChild(label);

            const value = document.createElement('span');
            value.className = 'dp-value';
            if (f.stateClass) {
                value.classList.add(`dp-state-${f.stateClass}`);
            }
            value.textContent = f.value;
            row.appendChild(value);

            this._bodyEl.appendChild(row);
        }
    }

    /**
     * Render the event log entries into the log section.
     * Only re-renders when the log length changes (new entries appended).
     *
     * @param {Array<{time: number, type: string, detail: string}>} log
     */
    _renderLog(log) {
        if (log.length === this._logCache.len) return;
        this._logCache.len = log.length;

        this._logEl.innerHTML = '';
        if (log.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'dp-log-empty';
            empty.textContent = 'No events yet';
            this._logEl.appendChild(empty);
            return;
        }

        // Show newest first
        for (let i = log.length - 1; i >= 0; i--) {
            const entry = log[i];
            const row = document.createElement('div');
            row.className = 'dp-log-entry';
            row.style.cursor = 'pointer';
            row.addEventListener('click', () => row.classList.toggle('expanded'));

            const time = document.createElement('span');
            time.className = 'dp-log-time';
            time.textContent = DetailPanel.formatAge(entry.time);
            row.appendChild(time);

            const badge = document.createElement('span');
            badge.className = `dp-log-badge dp-log-${entry.type}`;
            badge.textContent = entry.type;
            row.appendChild(badge);

            const detail = document.createElement('span');
            detail.className = 'dp-log-detail';
            detail.textContent = entry.detail;
            row.appendChild(detail);

            this._logEl.appendChild(row);
        }

        // Auto-scroll to top (newest)
        this._logEl.scrollTop = 0;
    }

    // -----------------------------------------------------------------------
    // Actions
    // -----------------------------------------------------------------------

    /**
     * Render action buttons into the actions row.
     * Caches by label key to avoid re-rendering every frame.
     *
     * @param {Array<{label: string, className: string, onClick: function, title: string}>} actions
     */
    _setActions(actions) {
        const key = actions.map(a => a.label).join('|');
        if (this._actionsKey === key) return;
        this._actionsKey = key;

        this._actionsEl.innerHTML = '';
        if (actions.length === 0) {
            this._actionsEl.style.display = 'none';
            return;
        }
        this._actionsEl.style.display = '';

        for (const action of actions) {
            const btn = document.createElement('button');
            btn.className = action.className;
            btn.textContent = action.label;
            btn.title = action.title;
            btn.addEventListener('click', action.onClick);
            this._actionsEl.appendChild(btn);
        }
    }

    /**
     * Open the session report page in a new browser tab.
     */
    _openReport(session) {
        if (!session.project || !session.sessionId) return;
        const url = `/report.html?project=${encodeURIComponent(session.project)}&session=${encodeURIComponent(session.sessionId)}`;
        window.open(url, '_blank');
    }

    /**
     * Open the session's project folder in the OS file explorer.
     */
    async _openFolder(session) {
        if (!session.project) return;
        try {
            await fetch('/api/open-folder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    project: session.project,
                    session: session.sessionId,
                }),
            });
        } catch (err) {
            console.error('Failed to open folder:', err);
        }
    }

    /**
     * Show a confirmation modal for deleting a session.
     */
    _showDeleteConfirm(session) {
        const sessionName = session.customTitle || session.slug || session.sessionId.substring(0, 16);

        // Overlay
        const overlay = document.createElement('div');
        overlay.className = 'dp-modal-overlay';

        // Modal card
        const modal = document.createElement('div');
        modal.className = 'dp-modal';

        const title = document.createElement('h3');
        title.className = 'dp-modal-title';
        title.textContent = 'Delete this session?';
        modal.appendChild(title);

        const warning = document.createElement('p');
        warning.className = 'dp-modal-warning';
        warning.textContent = 'This will permanently delete the session transcript and all sub-agent data. This action cannot be undone.';
        modal.appendChild(warning);

        const nameBox = document.createElement('div');
        nameBox.className = 'dp-modal-name';
        nameBox.textContent = sessionName;
        modal.appendChild(nameBox);

        const prompt = document.createElement('p');
        prompt.className = 'dp-modal-prompt';
        prompt.innerHTML = `To confirm, type "<strong>${sessionName}</strong>" below:`;
        modal.appendChild(prompt);

        const input = document.createElement('input');
        input.className = 'dp-modal-input';
        input.type = 'text';
        input.autocomplete = 'off';
        input.spellcheck = false;
        modal.appendChild(input);

        const btnRow = document.createElement('div');
        btnRow.className = 'dp-modal-buttons';

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'dp-modal-cancel';
        cancelBtn.textContent = 'Cancel';
        btnRow.appendChild(cancelBtn);

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'dp-modal-delete';
        deleteBtn.textContent = 'Delete';
        deleteBtn.disabled = true;
        btnRow.appendChild(deleteBtn);

        modal.appendChild(btnRow);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // Focus the input
        requestAnimationFrame(() => input.focus());

        // Enable/disable delete button based on input
        input.addEventListener('input', () => {
            deleteBtn.disabled = input.value !== sessionName;
        });

        const closeModal = () => {
            overlay.remove();
        };

        cancelBtn.addEventListener('click', closeModal);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeModal();
        });

        const onKeyDown = (e) => {
            if (e.key === 'Escape') {
                closeModal();
                document.removeEventListener('keydown', onKeyDown);
            }
        };
        document.addEventListener('keydown', onKeyDown);

        deleteBtn.addEventListener('click', async () => {
            deleteBtn.disabled = true;
            deleteBtn.textContent = 'Deleting...';
            try {
                await fetch('/api/delete-session', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        project: session.project,
                        session: session.sessionId,
                    }),
                });
                document.dispatchEvent(new CustomEvent('session-deleted', {
                    detail: { sessionId: session.sessionId },
                }));
                this.hide();
            } catch (err) {
                console.error('Failed to delete session:', err);
            } finally {
                closeModal();
                document.removeEventListener('keydown', onKeyDown);
            }
        });
    }

    // -----------------------------------------------------------------------
    // Utility
    // -----------------------------------------------------------------------

    /**
     * Format a timestamp as a relative age string.
     *
     * @param {number} timestampMs
     * @returns {string} e.g. "2m 34s ago"
     */
    static formatAge(timestampMs) {
        const elapsed = Date.now() - timestampMs;
        if (elapsed < 1000) return 'just now';

        const sec = Math.floor(elapsed / 1000) % 60;
        const min = Math.floor(elapsed / 60000) % 60;
        const hr = Math.floor(elapsed / 3600000);

        if (hr > 0) return `${hr}h ${min}m ago`;
        if (min > 0) return `${min}m ${sec}s ago`;
        return `${sec}s ago`;
    }
}
