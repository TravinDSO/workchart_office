/**
 * sessionManager.js — Session State Management
 *
 * Manages the lifecycle of all discovered Claude Code sessions:
 *   - Polls the file system for new .jsonl transcript files
 *   - Reads incremental lines from each file
 *   - Feeds lines through the TranscriptParser to produce events
 *   - Updates SessionState objects based on events
 *   - Notifies the app layer when sessions change
 *
 * Also handles sub-agent file discovery in <sessionId>/subagents/ directories.
 */

import { TranscriptParser } from './transcriptParser.js';

// ---------------------------------------------------------------------------
// SessionState — Represents a single agent session's current visual state
// ---------------------------------------------------------------------------

export class SessionState {
    /**
     * @param {string} sessionId - UUID from the filename.
     * @param {FileSystemFileHandle|string} fileHandle - FS API handle or HTTP filename.
     * @param {string|null} [project] - Project directory name this session belongs to.
     */
    constructor(sessionId, fileHandle, project) {
        /** @type {string} */
        this.sessionId = sessionId;

        /** @type {string} Human-readable session name */
        this.slug = '';

        /** @type {string|null} Project directory name */
        this.project = project || null;

        /** @type {FileSystemFileHandle|string} */
        this.fileHandle = fileHandle;

        /** @type {number} Byte offset of data already read */
        this.fileOffset = 0;

        /** @type {boolean} True when state changed and canvas needs re-render */
        this.dirty = true;

        /** Main agent state */
        this.mainAgent = {
            state: 'idle',       // 'idle' | 'active' | 'waiting'
            currentTool: null,   // e.g., 'Read', 'Edit', 'Bash'
            toolId: null,        // Active tool_use ID for matching tool_result
        };

        /** @type {Map<string, {state: string, description: string, lastTool: string|null, spawnTime: number}>} */
        this.subAgents = new Map();

        /** @type {boolean} True for ~3 seconds after a user prompt */
        this.humanActive = false;

        /** @type {number|null} Timer handle for auto-clearing humanActive */
        this._humanActiveTimer = null;

        /** @type {number} Timestamp of last state change */
        this.lastUpdate = 0;

        /** @type {number} Timestamp of when new data was last read from the file */
        this.lastDataTime = Date.now();

        /** @type {boolean} Whether the session has ended */
        this.isComplete = false;

        // Sub-agent file tracking
        /** @type {Map<string, {handle: FileSystemFileHandle|string, offset: number}>} */
        this._subAgentFiles = new Map();
    }

    /**
     * Process a parsed event and update internal state accordingly.
     *
     * @param {object} event - An event object from the TranscriptParser.
     */
    handleEvent(event) {
        // Accept arrays of events (multi-tool parse output)
        if (Array.isArray(event)) {
            for (const e of event) {
                this.handleEvent(e);
            }
            return;
        }
        if (!event || !event.type) return;

        this.lastUpdate = Date.now();

        switch (event.type) {
            case 'USER_PROMPT':
                this.humanActive = true;
                this.mainAgent.state = 'active';
                // Auto-clear human active flag after 3 seconds
                if (this._humanActiveTimer) {
                    clearTimeout(this._humanActiveTimer);
                }
                this._humanActiveTimer = setTimeout(() => {
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
                // Only clear tool state if this result matches the active tool
                if (this.mainAgent.toolId === event.toolId) {
                    this.mainAgent.currentTool = null;
                    this.mainAgent.toolId = null;
                }
                // Check if this tool_result corresponds to a sub-agent's spawn tool
                for (const [, sub] of this.subAgents) {
                    if (sub.toolId === event.toolId) {
                        sub.state = 'completed';
                        break;
                    }
                }
                break;

            case 'SUBAGENT_SPAWN':
                this.subAgents.set(event.agentId, {
                    state: 'active',
                    description: event.description || '',
                    lastTool: null,
                    spawnTime: Date.now(),
                    toolId: event.toolId || null,
                });
                break;

            case 'SUBAGENT_ACTIVITY': {
                const sub = this.subAgents.get(event.agentId);
                if (sub) {
                    sub.state = 'active';
                    if (event.toolName) {
                        sub.lastTool = event.toolName;
                    }
                }
                break;
            }

            case 'TURN_COMPLETE':
                this.mainAgent.state = 'idle';
                this.mainAgent.currentTool = null;
                this.mainAgent.toolId = null;
                break;

            case 'ASK_USER':
                this.mainAgent.state = 'waiting';
                this.mainAgent.currentTool = null;
                break;

            case 'SESSION_META':
                if (event.slug) {
                    this.slug = event.slug;
                }
                break;

            default:
                // Unknown event type — ignore
                break;
        }
    }
}


// ---------------------------------------------------------------------------
// SessionManager — Orchestrates polling and state management
// ---------------------------------------------------------------------------

export class SessionManager {
    /**
     * @param {import('./fileReader.js').FileReaderLayer} fileReader
     * @param {function(string, string): void} onSessionUpdate - Callback: (eventType, sessionId)
     *        eventType is 'new', 'updated', or 'removed'.
     */
    constructor(fileReader, onSessionUpdate) {
        /** @type {import('./fileReader.js').FileReaderLayer} */
        this.fileReader = fileReader;

        /** @type {function} */
        this.onSessionUpdate = onSessionUpdate;

        /** @type {Map<string, SessionState>} */
        this.sessions = new Map();

        /** @type {number|null} Polling timer handle */
        this._pollTimer = null;

        /** @type {boolean} */
        this._running = false;

        /** Polling interval in ms */
        this.pollInterval = 2000;
    }

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    /**
     * Start the polling loop.
     */
    start() {
        if (this._running) return;
        this._running = true;
        this._doPollCycle();
    }

    /**
     * Stop polling.
     */
    stop() {
        this._running = false;
        if (this._pollTimer !== null) {
            clearTimeout(this._pollTimer);
            this._pollTimer = null;
        }
    }

    /**
     * Get a single session by ID.
     *
     * @param {string} id
     * @returns {SessionState|undefined}
     */
    getSession(id) {
        return this.sessions.get(id);
    }

    /**
     * Get all sessions as an iterable.
     *
     * @returns {IterableIterator<[string, SessionState]>}
     */
    getSessions() {
        return this.sessions.entries();
    }

    /**
     * Get the total session count.
     *
     * @returns {number}
     */
    get sessionCount() {
        return this.sessions.size;
    }

    // -----------------------------------------------------------------------
    // Polling internals
    // -----------------------------------------------------------------------

    async _doPollCycle() {
        if (!this._running) return;

        try {
            await this._pollCycle();
        } catch (err) {
            console.error('Poll cycle error:', err);
        }

        // Schedule next poll
        if (this._running) {
            this._pollTimer = setTimeout(() => this._doPollCycle(), this.pollInterval);
        }
    }

    async _pollCycle() {
        // 1. List all .jsonl files (across all projects in HTTP mode)
        const files = await this.fileReader.listJsonlFiles();

        for (const file of files) {
            const sessionId = file.name.replace('.jsonl', '');

            // 2. Create new session if not yet tracked
            if (!this.sessions.has(sessionId)) {
                const session = new SessionState(sessionId, file.handle, file.project);
                this.sessions.set(sessionId, session);
                this.onSessionUpdate('new', sessionId);
            }

            const session = this.sessions.get(sessionId);

            // 3. Read new lines from the transcript file
            const { lines, newOffset } = await this.fileReader.readNewLines(
                session.fileHandle,
                session.fileOffset,
                session.project
            );
            const hadNewMainData = newOffset > session.fileOffset;
            session.fileOffset = newOffset;

            if (hadNewMainData) {
                session.lastDataTime = Date.now();
            }

            // 4. Parse each line and feed events into the session state
            for (const line of lines) {
                const result = TranscriptParser.parse(line);
                if (result) {
                    this._applyEvents(session, result);
                    session.dirty = true;
                }
            }

            // 5. Poll for sub-agent files
            await this._pollSubAgents(session);
        }
    }

    /**
     * Apply one or more events to a session.
     * The parser may return a single event or an array of events.
     */
    _applyEvents(session, result) {
        if (Array.isArray(result)) {
            for (const event of result) {
                session.handleEvent(event);
            }
        } else {
            session.handleEvent(result);
        }
        this.onSessionUpdate('updated', session.sessionId);
    }

    /**
     * Poll for sub-agent transcript files and read new lines from them.
     */
    async _pollSubAgents(session) {
        try {
            const subFiles = await this.fileReader.listSubAgentFiles(session.sessionId, session.project);

            for (const sf of subFiles) {
                // Initialize tracking for this sub-agent file if new
                if (!session._subAgentFiles.has(sf.agentId)) {
                    session._subAgentFiles.set(sf.agentId, {
                        handle: sf.handle,
                        offset: 0,
                    });

                    // If the sub-agent is not yet in the session state, add it
                    if (!session.subAgents.has(sf.agentId)) {
                        session.subAgents.set(sf.agentId, {
                            state: 'active',
                            description: '',
                            lastTool: null,
                            spawnTime: Date.now(),
                        });
                        session.dirty = true;
                        this.onSessionUpdate('updated', session.sessionId);
                    }
                }

                // Read new lines from the sub-agent file
                const tracking = session._subAgentFiles.get(sf.agentId);
                const { lines, newOffset } = await this.fileReader.readNewLines(
                    tracking.handle,
                    tracking.offset,
                    session.project
                );
                const hadNewData = newOffset > tracking.offset;
                tracking.offset = newOffset;

                // Parse lines — we mainly look for TOOL_START events to track
                // what the sub-agent is doing
                for (const line of lines) {
                    const result = TranscriptParser.parse(line);
                    if (!result) continue;

                    const events = Array.isArray(result) ? result : [result];
                    for (const event of events) {
                        if (event.type === 'TOOL_START') {
                            // Update the sub-agent's last tool
                            const sub = session.subAgents.get(sf.agentId);
                            if (sub) {
                                sub.state = 'active';
                                sub.lastTool = event.toolName;
                                session.dirty = true;
                            }
                        } else if (event.type === 'TURN_COMPLETE') {
                            // Sub-agent turn completed — mark as completed
                            const sub = session.subAgents.get(sf.agentId);
                            if (sub) {
                                sub.state = 'completed';
                                session.dirty = true;
                            }
                        }
                    }
                }

                // If no new data arrived and the sub-agent was previously read,
                // its transcript has stopped growing — mark as completed
                if (!hadNewData && tracking.offset > 0) {
                    const sub = session.subAgents.get(sf.agentId);
                    if (sub && sub.state !== 'completed') {
                        sub.state = 'completed';
                        session.dirty = true;
                    }
                }
            }
        } catch {
            // Sub-agent directory may not exist — that is expected
        }
    }
}
