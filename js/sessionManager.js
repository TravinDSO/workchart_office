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
// Inactivity thresholds
// ---------------------------------------------------------------------------

/** Mark an active agent as idle after this many ms of no new data. */
const INACTIVE_MS = 30000;

/** Hide a sub-agent entirely after this many ms of inactivity. */
const HIDE_MS = 5 * 60 * 1000;

/** Maximum event log entries kept per entity (main, human, each sub-agent). */
const MAX_LOG_ENTRIES = 50;

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

        /** @type {string} Auto-generated session name from transcript */
        this.slug = '';

        /** @type {string} User-set custom title via /rename (takes priority) */
        this.customTitle = '';

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

        /** @type {number} Timestamp of when this session was first seen */
        this.createdTime = Date.now();

        /** @type {boolean} Whether the initial bulk read has completed */
        this._initialReadDone = false;

        /** @type {boolean} Whether the session has ended */
        this.isComplete = false;

        // Event logs — capped ring buffers for the detail panel
        /** @type {Array<{time: number, type: string, detail: string}>} */
        this.humanLog = [];
        /** @type {Array<{time: number, type: string, detail: string}>} */
        this.mainAgentLog = [];
        /** @type {Map<string, Array<{time: number, type: string, detail: string}>>} */
        this.subAgentLogs = new Map();

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
                    spawnTime: event.ts || Date.now(),
                    lastActivityTime: event.ts || Date.now(),
                    toolId: event.toolId || null,
                });
                break;

            case 'SUBAGENT_ACTIVITY': {
                const sub = this.subAgents.get(event.agentId);
                if (sub) {
                    sub.state = 'active';
                    sub.lastActivityTime = event.ts || Date.now();
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
                if (event.customTitle) {
                    this.customTitle = event.customTitle;
                } else if (event.slug) {
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

        /** @type {number} Consecutive poll failures (0 = healthy) */
        this.consecutiveErrors = 0;

        /** @type {number} Timestamp of last successful poll */
        this.lastSuccessfulPoll = 0;
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
            this.consecutiveErrors = 0;
            this.lastSuccessfulPoll = Date.now();
        } catch (err) {
            this.consecutiveErrors++;
            if (this.consecutiveErrors <= 3) {
                console.warn('Poll cycle error (attempt ' + this.consecutiveErrors + '):', err.message || err);
            }
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
                // Use the file's actual modification time so old sessions
                // appear stale immediately instead of waiting an hour.
                if (file.mtime) {
                    session.lastDataTime = file.mtime;
                    session.createdTime = file.mtime;
                }
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
            const wasInitialRead = !session._initialReadDone && hadNewMainData;
            session.fileOffset = newOffset;

            if (hadNewMainData) {
                // Only update lastDataTime on subsequent reads, not the
                // initial bulk read — the file mtime is more accurate for
                // detecting sessions that have been dormant for hours.
                if (session._initialReadDone) {
                    session.lastDataTime = Date.now();
                }
                session._initialReadDone = true;
            }

            // 4. Parse each line and feed events into the session state
            for (const line of lines) {
                const result = TranscriptParser.parse(line);
                if (result) {
                    this._applyEvents(session, result);
                    session.dirty = true;
                }
            }

            // 5. After the initial bulk read, reset transient visual state
            //    so the session doesn't appear active from historical events.
            //    Live data on the next poll cycle will set the correct state.
            if (wasInitialRead) {
                session.mainAgent.state = 'idle';
                session.mainAgent.currentTool = null;
                session.mainAgent.toolId = null;
                session.humanActive = false;
                if (session._humanActiveTimer) {
                    clearTimeout(session._humanActiveTimer);
                    session._humanActiveTimer = null;
                }
                for (const [, sub] of session.subAgents) {
                    if (sub.state === 'active') sub.state = 'idle';
                }
                session.dirty = true;
            }

            // 5. Poll for sub-agent files
            await this._pollSubAgents(session);
        }

        // 6. Sweep agents that have gone inactive
        this._sweepInactive();
    }

    /**
     * Apply one or more events to a session and record them in logs.
     * The parser may return a single event or an array of events.
     */
    _applyEvents(session, result) {
        const events = Array.isArray(result) ? result : [result];
        for (const event of events) {
            session.handleEvent(event);
            this._logEvent(session, event);
        }
        this.onSessionUpdate('updated', session.sessionId);
    }

    /**
     * Record an event into the appropriate log for the detail panel.
     */
    _logEvent(session, event) {
        if (!event || !event.type) return;
        const now = event.ts || Date.now();

        switch (event.type) {
            case 'USER_PROMPT':
                _pushLog(session.humanLog, {
                    time: now,
                    type: 'prompt',
                    detail: event.text || '(prompt)',
                });
                break;
            case 'ASSISTANT_TEXT':
                _pushLog(session.mainAgentLog, {
                    time: now,
                    type: 'text',
                    detail: event.text,
                });
                break;
            case 'TOOL_START':
                _pushLog(session.mainAgentLog, {
                    time: now,
                    type: 'tool',
                    detail: event.toolName || 'unknown',
                });
                break;
            case 'TOOL_END':
                _pushLog(session.mainAgentLog, {
                    time: now,
                    type: 'tool_end',
                    detail: 'done',
                });
                break;
            case 'SUBAGENT_SPAWN':
                _pushLog(session.mainAgentLog, {
                    time: now,
                    type: 'spawn',
                    detail: event.description || 'sub-agent',
                });
                break;
            case 'ASK_USER':
                _pushLog(session.mainAgentLog, {
                    time: now,
                    type: 'ask',
                    detail: 'waiting for user',
                });
                break;
            case 'TURN_COMPLETE':
                _pushLog(session.mainAgentLog, {
                    time: now,
                    type: 'turn',
                    detail: event.durationMs ? `${(event.durationMs / 1000).toFixed(1)}s` : 'done',
                });
                break;
        }
    }

    /**
     * Record a sub-agent event into its dedicated log.
     */
    _logSubAgentEvent(session, agentId, event) {
        if (!event || !event.type) return;
        let log = session.subAgentLogs.get(agentId);
        if (!log) {
            log = [];
            session.subAgentLogs.set(agentId, log);
        }
        const now = event.ts || Date.now();

        switch (event.type) {
            case 'ASSISTANT_TEXT':
                _pushLog(log, { time: now, type: 'text', detail: event.text });
                break;
            case 'TOOL_START':
                _pushLog(log, { time: now, type: 'tool', detail: event.toolName || 'unknown' });
                break;
            case 'TOOL_END':
                _pushLog(log, { time: now, type: 'tool_end', detail: 'done' });
                break;
            case 'TURN_COMPLETE':
                _pushLog(log, { time: now, type: 'turn', detail: 'turn complete' });
                break;
            case 'USER_PROMPT':
                _pushLog(log, { time: now, type: 'prompt', detail: event.text || '' });
                break;
        }
    }

    /**
     * Force agents idle after INACTIVE_MS of no new data and hide
     * sub-agents after HIDE_MS of inactivity.
     */
    _sweepInactive() {
        const now = Date.now();
        for (const [, session] of this.sessions) {
            // Sub-agents: idle after timeout, hidden after 1h
            let hasActiveSub = false;
            for (const [, sub] of session.subAgents) {
                if (sub.state === 'completed') continue;
                const subElapsed = now - (sub.lastActivityTime || sub.spawnTime);
                if (subElapsed > HIDE_MS) {
                    sub.state = 'completed';
                    session.dirty = true;
                } else if (subElapsed > INACTIVE_MS && sub.state === 'active') {
                    sub.state = 'idle';
                    session.dirty = true;
                }
                if (sub.state === 'active') hasActiveSub = true;
            }

            const elapsed = now - session.lastDataTime;

            // Main agent: force idle after timeout, but stay active if
            // any sub-agent is still active (main is waiting on results)
            if (elapsed > INACTIVE_MS && session.mainAgent.state === 'active' && !hasActiveSub) {
                session.mainAgent.state = 'idle';
                session.mainAgent.currentTool = null;
                session.mainAgent.toolId = null;
                session.dirty = true;
                this.onSessionUpdate('updated', session.sessionId);
            }
        }
    }

    /**
     * Try to match a file-discovered sub-agent against a spawn entry from
     * the main transcript, using timestamp proximity. This merges the
     * spawn's description into the file-based entry and removes the
     * orphaned spawn entry to prevent duplicates.
     *
     * @param {SessionState} session
     * @param {string} fileAgentId - The file-based agent ID
     * @param {object} fileSub - The file-based sub-agent entry
     */
    _matchSpawnEntry(session, fileAgentId, fileSub) {
        let bestKey = null;
        let bestDelta = Infinity;

        for (const [spawnKey, spawnSub] of session.subAgents) {
            // Skip the file entry itself and already-matched entries
            if (spawnKey === fileAgentId) continue;
            if (spawnSub._matchedFileId) continue;
            if (!spawnSub.spawnTime) continue;

            // Must have a description (spawn entries always do)
            if (!spawnSub.description) continue;

            // Compare spawn time to the file's earliest event
            const delta = Math.abs(spawnSub.spawnTime - fileSub.spawnTime);

            // Only match within a 60-second window
            if (delta < 60000 && delta < bestDelta) {
                bestDelta = delta;
                bestKey = spawnKey;
            }
        }

        if (bestKey) {
            const spawnSub = session.subAgents.get(bestKey);
            // Merge: take description from spawn if file entry has none
            if (!fileSub.description && spawnSub.description) {
                fileSub.description = spawnSub.description;
            }
            // Use the spawn's original timestamp if it's earlier
            if (spawnSub.spawnTime && spawnSub.spawnTime < fileSub.spawnTime) {
                fileSub.spawnTime = spawnSub.spawnTime;
            }
            // Mark and remove the orphaned spawn entry
            spawnSub._matchedFileId = fileAgentId;
            session.subAgents.delete(bestKey);
        }
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
                        initialReadDone: false,
                    });

                    // Create a placeholder entry — timestamps will be set
                    // from actual event data after the initial read.
                    // Matching against spawn entries is deferred until then.
                    if (!session.subAgents.has(sf.agentId)) {
                        session.subAgents.set(sf.agentId, {
                            state: 'idle',
                            description: '',
                            lastTool: null,
                            spawnTime: null,
                            lastActivityTime: null,
                            _needsMatch: true,
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
                const wasInitialRead = !tracking.initialReadDone && hadNewData;
                tracking.offset = newOffset;
                if (hadNewData) tracking.initialReadDone = true;

                // Track earliest/latest timestamps during initial read
                let minTs = Infinity;
                let maxTs = -Infinity;

                // Parse lines — look for TOOL_START and other activity events
                for (const line of lines) {
                    const result = TranscriptParser.parse(line);
                    if (!result) continue;

                    const events = Array.isArray(result) ? result : [result];
                    for (const event of events) {
                        // Log the event for the detail panel
                        this._logSubAgentEvent(session, sf.agentId, event);

                        const eventTime = event.ts || Date.now();

                        // Track timestamp range
                        if (eventTime < minTs) minTs = eventTime;
                        if (eventTime > maxTs) maxTs = eventTime;

                        if (event.type === 'TOOL_START') {
                            const sub = session.subAgents.get(sf.agentId);
                            if (sub) {
                                sub.state = 'active';
                                sub.lastTool = event.toolName;
                                sub.lastActivityTime = eventTime;
                                session.dirty = true;
                            }
                        } else if (event.type === 'TURN_COMPLETE') {
                            const sub = session.subAgents.get(sf.agentId);
                            if (sub) {
                                sub.lastActivityTime = eventTime;
                                session.dirty = true;
                            }
                        } else if (event.type === 'USER_PROMPT') {
                            const sub = session.subAgents.get(sf.agentId);
                            if (sub) {
                                sub.lastActivityTime = eventTime;
                                // Use the first prompt as the description if
                                // we don't have one (more reliable than spawn matching)
                                if (!sub.description && event.text) {
                                    const firstLine = event.text.split('\n')[0].trim();
                                    sub.description = firstLine.length > 80
                                        ? firstLine.substring(0, 78) + '..'
                                        : firstLine;
                                }
                                session.dirty = true;
                            }
                        } else if (event.type === 'TOOL_END') {
                            const sub = session.subAgents.get(sf.agentId);
                            if (sub) {
                                sub.lastActivityTime = eventTime;
                                session.dirty = true;
                            }
                        }
                    }
                }

                // After initial bulk read, set accurate timestamps from the
                // actual event data and match against spawn entries.
                if (wasInitialRead) {
                    const sub = session.subAgents.get(sf.agentId);
                    if (sub) {
                        sub.state = 'idle';

                        // Set timestamps from actual event data
                        if (minTs !== Infinity) {
                            sub.spawnTime = minTs;
                            sub.lastActivityTime = maxTs;
                        } else {
                            sub.spawnTime = Date.now();
                            sub.lastActivityTime = Date.now();
                        }

                        // Now that we have real timestamps, try to match
                        // against a spawn entry from the main transcript.
                        // Match by closest spawn time to avoid mis-pairing.
                        if (sub._needsMatch) {
                            delete sub._needsMatch;
                            this._matchSpawnEntry(session, sf.agentId, sub);
                        }

                        session.dirty = true;
                    }
                } else if (hadNewData) {
                    // Live data — mark as active
                    const sub = session.subAgents.get(sf.agentId);
                    if (sub && sub.state !== 'completed') {
                        sub.lastActivityTime = Date.now();
                    }
                }
            }
        } catch {
            // Sub-agent directory may not exist — that is expected
        }
    }
}

// ---------------------------------------------------------------------------
// Module-level helpers
// ---------------------------------------------------------------------------

/** Push an entry into a capped log array. */
function _pushLog(log, entry) {
    log.push(entry);
    if (log.length > MAX_LOG_ENTRIES) {
        log.shift();
    }
}

