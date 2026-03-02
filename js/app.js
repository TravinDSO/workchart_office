/**
 * app.js — WorkChart Office Application Entry Point
 *
 * Orchestrates the entire application:
 *   - Initializes the SpriteEngine (pre-renders all pixel art)
 *   - Creates the FileReaderLayer and SessionManager instances
 *   - Fetches the project list and populates the filter dropdown
 *   - Manages the requestAnimationFrame render loop
 *   - Dynamically creates/removes session box DOM elements and BoxRenderer
 *     instances as sessions appear or disappear
 *   - Supports filtering by project via a dropdown
 *   - Includes DEMO_MODE for testing with mock data
 *
 * This module imports all other modules and exports nothing (entry point).
 */

import { SpriteEngine } from './spriteEngine.js';
import { FileReaderLayer } from './fileReader.js';
import { SessionManager, SessionState } from './sessionManager.js';
import { BoxRenderer } from './boxRenderer.js';
import { DetailPanel } from './detailPanel.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Set to true to show 3 fake sessions for testing without opening a folder. */
const DEMO_MODE = true;

/** Hide sessions with no new data for this many milliseconds (30 min). */
const STALE_SESSION_MS = 30 * 60 * 1000;

// ---------------------------------------------------------------------------
// Application state
// ---------------------------------------------------------------------------

/** @type {SpriteEngine} */
let spriteEngine;

/** @type {FileReaderLayer} */
let fileReader;

/** @type {SessionManager} */
let sessionManager;

/** @type {Map<string, BoxRenderer>} Maps sessionId to its BoxRenderer */
const boxRenderers = new Map();

/** @type {DetailPanel} */
let detailPanel;

/** @type {Set<string>} Session IDs the user has manually minimized */
const minimizedSessions = new Set();

/** @type {boolean} When true, stale/completed sessions are shown */
let showAll = false;

/** @type {number} Last timestamp from requestAnimationFrame */
let lastTimestamp = 0;

/** @type {boolean} Whether the render loop is active */
let renderLoopActive = false;

/** @type {string|null} Active project filter (null = all projects) */
let activeProjectFilter = null;

/** @type {Array<{name: string, label: string}>} Known project list */
let projectList = [];

// DOM element references
let sessionGrid;
let minimizedTray;
let sessionCountEl;
let pollStatusEl;
let statusIndicator;
let showAllBtn;
let projectFilterEl;

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
    // Grab DOM references
    sessionGrid = document.getElementById('session-grid');
    minimizedTray = document.getElementById('minimized-tray');
    sessionCountEl = document.getElementById('session-count');
    pollStatusEl = document.getElementById('poll-status');
    statusIndicator = document.getElementById('status-indicator');
    projectFilterEl = document.getElementById('project-filter');
    showAllBtn = document.getElementById('show-all-btn');

    // Initialize the sprite engine
    spriteEngine = new SpriteEngine();
    spriteEngine.init();

    // Create the file reader layer
    fileReader = new FileReaderLayer();

    // Create the session manager with our update callback
    sessionManager = new SessionManager(fileReader, onSessionUpdate);

    // Wire up project filter
    projectFilterEl.addEventListener('change', handleProjectFilterChange);

    // Wire up Show All toggle
    showAllBtn.addEventListener('click', toggleShowAll);

    // Initialize the detail panel
    detailPanel = new DetailPanel();

    // Close panel on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && detailPanel.isVisible) {
            detailPanel.hide();
        }
    });

    // Close panel on click-outside (not on canvas or panel itself)
    document.addEventListener('click', (e) => {
        if (!detailPanel.isVisible) return;
        if (detailPanel.el.contains(e.target)) return;
        if (e.target.tagName === 'CANVAS') return;
        detailPanel.hide();
    });

    // Show empty state initially
    showEmptyState();

    // Start the render loop
    startRenderLoop();

    // Auto-detect serve.py: if loaded over HTTP, probe the API and auto-connect
    if (window.location.protocol !== 'file:') {
        tryAutoConnect();
    } else if (DEMO_MODE) {
        // Only show demo sessions when opened directly as a file
        setupDemoSessions();
    }
});

// ---------------------------------------------------------------------------
// Auto-connect to serve.py when loaded over HTTP
// ---------------------------------------------------------------------------

async function tryAutoConnect() {
    try {
        const resp = await fetch('/api/projects');
        if (resp.ok) {
            // serve.py is running — switch to HTTP mode and start polling
            fileReader.mode = 'http';
            clearDemoSessions();
            setConnected(true);
            sessionManager.start();
            pollStatusEl.textContent = 'Polling: active (2s)';
            pollStatusEl.classList.add('active');

            // Populate the project filter dropdown
            const data = await resp.json();
            populateProjectFilter(data.projects || []);
            return;
        }
    } catch {
        // serve.py not available — fall through
    }

    // No server detected, show demo mode
    if (DEMO_MODE) {
        setupDemoSessions();
    }
}

// ---------------------------------------------------------------------------
// Project filter
// ---------------------------------------------------------------------------

/**
 * Populate the project filter dropdown with discovered projects.
 */
function populateProjectFilter(projects) {
    projectList = projects;

    // Clear existing options (except "All Projects")
    while (projectFilterEl.options.length > 1) {
        projectFilterEl.remove(1);
    }

    for (const proj of projects) {
        const option = document.createElement('option');
        option.value = proj.name;
        option.textContent = proj.label;
        option.title = proj.name;
        projectFilterEl.appendChild(option);
    }
}

/**
 * Handle project filter dropdown change.
 */
function handleProjectFilterChange() {
    activeProjectFilter = projectFilterEl.value || null;
    applyProjectFilter();
    updateSessionCount();
}

/**
 * Toggle showing all sessions (including stale/completed).
 */
function toggleShowAll() {
    showAll = !showAll;
    showAllBtn.classList.toggle('active', showAll);
    showAllBtn.textContent = showAll ? 'Hide Stale' : 'Show All';

    // Sync flag to all renderers so completed sub-agents are shown/hidden
    for (const [, renderer] of boxRenderers) {
        renderer.showAllSubAgents = showAll;
    }

    // Toggle stale visibility on all session boxes
    for (const [sessionId,] of boxRenderers) {
        const session = sessionManager.getSession(sessionId);
        if (session) {
            const box = document.querySelector(`[data-session-id="${sessionId}"]`);
            if (!box) continue;
            const isStale = (Date.now() - session.lastDataTime) > STALE_SESSION_MS;
            if (showAll) {
                box.classList.remove('stale');
            } else if (isStale && !minimizedSessions.has(sessionId)) {
                box.classList.add('stale');
            }
        }
    }
    updateSessionCount();
}

/**
 * Apply the current project filter to all session boxes.
 */
function applyProjectFilter() {
    const boxes = document.querySelectorAll('.session-box');
    for (const box of boxes) {
        const project = box.dataset.project;
        if (!activeProjectFilter || project === activeProjectFilter) {
            box.classList.remove('project-hidden');
        } else {
            box.classList.add('project-hidden');
        }
    }
}

/**
 * Get the short label for a project directory name.
 */
function getProjectLabel(projectName) {
    if (!projectName) return '';
    const proj = projectList.find(p => p.name === projectName);
    if (proj) return proj.label;
    // Fallback: derive from name
    const parts = projectName.split('-');
    const trailing = [];
    for (let i = parts.length - 1; i >= 0; i--) {
        if (!parts[i]) break;
        trailing.unshift(parts[i]);
        if (trailing.join('-').length > 20) break;
    }
    return trailing.join('-') || projectName;
}

// ---------------------------------------------------------------------------
// Session update callback (called by SessionManager)
// ---------------------------------------------------------------------------

/**
 * Called whenever a session is created or updated.
 *
 * @param {'new'|'updated'|'removed'} eventType
 * @param {string} sessionId
 */
function onSessionUpdate(eventType, sessionId) {
    if (eventType === 'new') {
        const session = sessionManager.getSession(sessionId);
        createSessionBox(sessionId, session ? session.project : null);
    }
    updateSessionCount();
}

// ---------------------------------------------------------------------------
// Session box DOM management
// ---------------------------------------------------------------------------

/**
 * Create a new DOM element and BoxRenderer for a discovered session.
 */
function createSessionBox(sessionId, project) {
    // Remove empty state if present
    removeEmptyState();

    // Create container div
    const box = document.createElement('div');
    box.classList.add('session-box');
    box.dataset.sessionId = sessionId;
    if (project) {
        box.dataset.project = project;
    }

    // Apply project filter immediately
    if (activeProjectFilter && project !== activeProjectFilter) {
        box.classList.add('project-hidden');
    }

    // Minimize button (top-right, visible on hover)
    const minBtn = document.createElement('button');
    minBtn.className = 'minimize-btn';
    minBtn.textContent = '\u2014'; // em dash —
    minBtn.title = 'Minimize session';
    minBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        minimizeSession(sessionId);
    });
    box.appendChild(minBtn);

    // Create canvas element
    const canvas = document.createElement('canvas');

    // Click handler — open detail panel for the clicked sprite
    canvas.addEventListener('click', (e) => {
        const renderer = boxRenderers.get(sessionId);
        const session = sessionManager.getSession(sessionId) || getDemoSession(sessionId);
        if (!renderer || !session) return;

        const rect = canvas.getBoundingClientRect();
        const cssX = e.clientX - rect.left;
        const cssY = e.clientY - rect.top;
        const hit = renderer.hitTest(cssX, cssY, session);
        if (hit) {
            detailPanel.show(sessionId, hit.type, hit.id, session);
        }
    });

    // Mousemove handler — toggle pointer cursor over clickable sprites
    canvas.addEventListener('mousemove', (e) => {
        const renderer = boxRenderers.get(sessionId);
        const session = sessionManager.getSession(sessionId) || getDemoSession(sessionId);
        if (!renderer || !session) return;

        const rect = canvas.getBoundingClientRect();
        const cssX = e.clientX - rect.left;
        const cssY = e.clientY - rect.top;
        canvas.style.cursor = renderer.isOverClickable(cssX, cssY, session)
            ? 'pointer'
            : 'default';
    });

    box.appendChild(canvas);

    // Minimized label (hidden until minimized)
    const label = document.createElement('div');
    label.className = 'minimized-label';

    const pip = document.createElement('span');
    pip.className = 'status-pip pip-idle';
    label.appendChild(pip);

    const nameSpan = document.createElement('span');
    nameSpan.className = 'minimized-name';
    nameSpan.textContent = sessionId.substring(0, 12);
    label.appendChild(nameSpan);

    const restoreBtn = document.createElement('button');
    restoreBtn.className = 'restore-btn';
    restoreBtn.textContent = 'Restore';
    restoreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        restoreSession(sessionId);
    });
    label.appendChild(restoreBtn);

    box.appendChild(label);

    // Add to the grid
    sessionGrid.appendChild(box);

    // Create a BoxRenderer for this canvas
    const renderer = new BoxRenderer(canvas, spriteEngine);
    renderer.showAllSubAgents = showAll;
    boxRenderers.set(sessionId, renderer);
}

/**
 * Remove a session box from the DOM.
 */
function removeSessionBox(sessionId) {
    const box = document.querySelector(`[data-session-id="${sessionId}"]`);
    if (box) {
        box.parentNode.removeChild(box);
    }
    boxRenderers.delete(sessionId);
}

/**
 * Update the CSS class on a session box to reflect its state.
 */
function updateSessionBoxClass(sessionId, session) {
    const box = document.querySelector(`[data-session-id="${sessionId}"]`);
    if (!box) return;

    box.classList.remove('active', 'waiting', 'completed');
    if (session.isComplete) {
        box.classList.add('completed');
    } else if (session.mainAgent.state === 'waiting') {
        box.classList.add('waiting');
    } else if (session.mainAgent.state === 'active') {
        box.classList.add('active');
    }

    // Update stale state (suppressed when showAll is active)
    const isStale = (Date.now() - session.lastDataTime) > STALE_SESSION_MS;
    box.classList.toggle('stale', isStale && !showAll && !minimizedSessions.has(sessionId));

    // Update minimized label info
    if (box.classList.contains('minimized')) {
        const pipEl = box.querySelector('.status-pip');
        if (pipEl) {
            pipEl.className = 'status-pip pip-' + session.mainAgent.state;
        }
        const nameEl = box.querySelector('.minimized-name');
        if (nameEl) {
            nameEl.textContent = session.customTitle || session.slug || sessionId.substring(0, 16);
        }
    }
}

// ---------------------------------------------------------------------------
// Minimize / Restore
// ---------------------------------------------------------------------------

function minimizeSession(sessionId) {
    minimizedSessions.add(sessionId);
    const box = document.querySelector(`[data-session-id="${sessionId}"]`);
    if (box) {
        box.classList.add('minimized');
        box.classList.remove('stale');
        minimizedTray.appendChild(box);
    }
    // Close detail panel if showing this session
    if (detailPanel && detailPanel.activeSessionId === sessionId) {
        detailPanel.hide();
    }
    updateSessionCount();
}

function restoreSession(sessionId) {
    minimizedSessions.delete(sessionId);
    const box = document.querySelector(`[data-session-id="${sessionId}"]`);
    if (box) {
        box.classList.remove('minimized');
        sessionGrid.appendChild(box);
    }
    updateSessionCount();
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function showEmptyState() {
    if (!DEMO_MODE && sessionGrid.children.length === 0) {
        const empty = document.createElement('div');
        empty.classList.add('empty-state');
        empty.id = 'empty-state';
        empty.innerHTML = `
            <div class="empty-icon">&#9694;</div>
            <div class="empty-title">No sessions loaded</div>
            <div class="empty-subtitle">
                Run <code>python serve.py</code> to monitor all Claude Code projects.
            </div>
        `;
        sessionGrid.appendChild(empty);
    }
}

function removeEmptyState() {
    const empty = document.getElementById('empty-state');
    if (empty) {
        empty.remove();
    }
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

function setConnected(connected) {
    if (connected) {
        statusIndicator.className = 'connected';
        statusIndicator.querySelector('.status-text').textContent = 'Connected';
    } else {
        statusIndicator.className = 'disconnected';
        statusIndicator.querySelector('.status-text').textContent = 'Disconnected';
    }
}

function updateSessionCount() {
    const total = sessionManager.sessionCount + (demoSessions.size > 0 ? demoSessions.size : 0);
    const minCount = minimizedSessions.size;
    let staleCount = 0;
    let filteredCount = 0;
    for (const [, session] of sessionManager.getSessions()) {
        if ((Date.now() - session.lastDataTime) > STALE_SESSION_MS && !minimizedSessions.has(session.sessionId)) {
            staleCount++;
        }
        if (activeProjectFilter && session.project !== activeProjectFilter) {
            filteredCount++;
        }
    }
    const visible = total - minCount - staleCount - filteredCount;
    let text = `${visible} session${visible !== 1 ? 's' : ''}`;
    if (minCount > 0) text += ` (${minCount} minimized)`;
    if (activeProjectFilter) {
        const label = getProjectLabel(activeProjectFilter);
        text += ` in ${label}`;
    }
    sessionCountEl.textContent = text;

    // Hide projects whose sessions are ALL stale from the dropdown
    updateProjectDropdown();
}

/**
 * Show/hide project options in the dropdown based on whether
 * the project has at least one non-stale session.
 */
function updateProjectDropdown() {
    const now = Date.now();
    // Build set of projects that have at least one visible session
    const activeProjects = new Set();
    for (const [, session] of sessionManager.getSessions()) {
        if ((now - session.lastDataTime) <= STALE_SESSION_MS || minimizedSessions.has(session.sessionId)) {
            if (session.project) activeProjects.add(session.project);
        }
    }
    // Demo sessions always keep their projects visible
    for (const [, demoInfo] of demoSessions) {
        if (demoInfo.session.project) activeProjects.add(demoInfo.session.project);
    }

    // Toggle visibility of each project option (skip "All Projects" at index 0)
    for (let i = 1; i < projectFilterEl.options.length; i++) {
        const opt = projectFilterEl.options[i];
        opt.hidden = !activeProjects.has(opt.value);
    }

    // If the active filter is now hidden, reset to "All Projects"
    if (activeProjectFilter && !activeProjects.has(activeProjectFilter)) {
        projectFilterEl.value = '';
        activeProjectFilter = null;
        applyProjectFilter();
    }
}

// ---------------------------------------------------------------------------
// Render loop
// ---------------------------------------------------------------------------

function startRenderLoop() {
    if (renderLoopActive) return;
    renderLoopActive = true;
    lastTimestamp = performance.now();
    requestAnimationFrame(renderLoop);
}

function renderLoop(timestamp) {
    const dt = timestamp - lastTimestamp;
    lastTimestamp = timestamp;

    // Render real sessions
    for (const [sessionId, renderer] of boxRenderers) {
        const session = sessionManager.getSession(sessionId);
        if (session) {
            // Ensure project label is set for the status bar
            if (session.project && !session.projectLabel) {
                session.projectLabel = getProjectLabel(session.project);
            }
            renderer.render(session, dt);
            updateSessionBoxClass(sessionId, session);
            // Update detail panel if it's showing this session
            if (detailPanel && detailPanel.activeSessionId === sessionId) {
                detailPanel.update(session);
            }
            // We render every frame for smooth animation (even if not dirty)
            // The dirty flag is used by the session manager to know new data arrived.
            session.dirty = false;
        }
    }

    // Render demo sessions (when active)
    for (const [sessionId, demoInfo] of demoSessions) {
        const renderer = boxRenderers.get(sessionId);
        if (renderer) {
            // Update demo state to cycle through states
            updateDemoState(demoInfo, dt);
            renderer.render(demoInfo.session, dt);
            updateSessionBoxClass(sessionId, demoInfo.session);
            // Update detail panel if it's showing this demo session
            if (detailPanel && detailPanel.activeSessionId === sessionId) {
                detailPanel.update(demoInfo.session);
            }
        }
    }

    if (renderLoopActive) {
        requestAnimationFrame(renderLoop);
    }
}

// ---------------------------------------------------------------------------
// DEMO MODE — Mock sessions for testing
// ---------------------------------------------------------------------------

/** @type {Map<string, {session: SessionState, timer: number}>} */
const demoSessions = new Map();

function setupDemoSessions() {
    removeEmptyState();

    // Demo session 1: Active session with 2 sub-agents
    const session1 = createDemoSession('demo-active-01', 'refactor-auth-module', 'demo-project', {
        agentState: 'active',
        currentTool: 'Edit',
        subAgentCount: 2,
        humanActive: false,
    });

    // Demo session 2: Idle session with no sub-agents
    const session2 = createDemoSession('demo-idle-02', 'fix-login-bug', 'demo-project', {
        agentState: 'idle',
        currentTool: null,
        subAgentCount: 0,
        humanActive: false,
    });

    // Demo session 3: Waiting session with 3 sub-agents
    const session3 = createDemoSession('demo-waiting-03', 'add-dark-mode', 'demo-project-2', {
        agentState: 'waiting',
        currentTool: null,
        subAgentCount: 3,
        humanActive: false,
    });

    demoSessions.set(session1.id, session1);
    demoSessions.set(session2.id, session2);
    demoSessions.set(session3.id, session3);

    // Populate demo project filter
    populateProjectFilter([
        { name: 'demo-project', label: 'demo-project' },
        { name: 'demo-project-2', label: 'demo-project-2' },
    ]);

    updateSessionCount();

    // Mark as connected for demo
    setConnected(true);
    pollStatusEl.textContent = 'Demo mode';
    pollStatusEl.classList.add('active');
}

function createDemoSession(id, slug, project, config) {
    const session = new SessionState(id, null, project);
    session.slug = slug;
    session.projectLabel = project;
    session.mainAgent.state = config.agentState;
    session.mainAgent.currentTool = config.currentTool;
    session.humanActive = config.humanActive;

    // Add sub-agents
    for (let i = 0; i < config.subAgentCount; i++) {
        session.subAgents.set(`sub-${id}-${i}`, {
            state: i === 0 ? 'active' : 'idle',
            description: `Sub-agent ${i + 1}`,
            lastTool: i === 0 ? 'Read' : null,
            spawnTime: Date.now() - (i * 10000),
        });
    }

    // Create the DOM box
    createSessionBox(id, project);

    return {
        id,
        session,
        timer: 0,
        cyclePhase: 0,
    };
}

/**
 * Cycle demo sessions through different states for visual interest.
 */
function updateDemoState(demoInfo, dt) {
    demoInfo.timer += dt;

    // Cycle states every 5 seconds
    if (demoInfo.timer > 5000) {
        demoInfo.timer = 0;
        demoInfo.cyclePhase = (demoInfo.cyclePhase + 1) % 4;

        const session = demoInfo.session;
        const tools = ['Read', 'Edit', 'Bash', 'Grep', 'Glob', 'Write'];

        switch (demoInfo.cyclePhase) {
            case 0:
                session.mainAgent.state = 'active';
                session.mainAgent.currentTool = tools[Math.floor(Math.random() * tools.length)];
                session.humanActive = false;
                break;
            case 1:
                session.mainAgent.state = 'active';
                session.mainAgent.currentTool = tools[Math.floor(Math.random() * tools.length)];
                session.humanActive = true;
                break;
            case 2:
                session.mainAgent.state = 'idle';
                session.mainAgent.currentTool = null;
                session.humanActive = false;
                break;
            case 3:
                session.mainAgent.state = 'waiting';
                session.mainAgent.currentTool = null;
                session.humanActive = false;
                break;
        }

        // Randomly toggle sub-agent states
        for (const [, sub] of session.subAgents) {
            sub.state = Math.random() > 0.5 ? 'active' : 'idle';
            if (sub.state === 'active') {
                sub.lastTool = tools[Math.floor(Math.random() * tools.length)];
            }
        }

        session.dirty = true;
    }
}

/**
 * Look up a demo session by ID (returns the SessionState or undefined).
 */
function getDemoSession(sessionId) {
    const demoInfo = demoSessions.get(sessionId);
    return demoInfo ? demoInfo.session : undefined;
}

function clearDemoSessions() {
    for (const [sessionId] of demoSessions) {
        removeSessionBox(sessionId);
    }
    demoSessions.clear();
}
