/**
 * report.js — Session Report Page
 *
 * Fetches the complete transcript for a session, processes it into
 * structured data, renders all report sections, and optionally requests
 * an AI-generated executive summary via the server.
 */

// ---------------------------------------------------------------------------
// Human time estimates per tool (minutes)
// ---------------------------------------------------------------------------

const TOOL_TIME_ESTIMATES = {
    Read:        2,
    Write:       15,
    Edit:        10,
    Grep:        2,
    Glob:        1,
    Bash:        5,
    WebSearch:   8,
    WebFetch:    10,
    Agent:       20,
    Task:        20,
    AskUserQuestion: 1,
    NotebookEdit: 10,
};

const DEFAULT_TOOL_TIME = 3; // minutes for unknown tools
const THINKING_OVERHEAD = 0.15; // 15% thinking time
const CONTEXT_SWITCH_MIN = 2; // minutes per turn

// ---------------------------------------------------------------------------
// URL params
// ---------------------------------------------------------------------------

const params = new URLSearchParams(window.location.search);
const PROJECT = params.get('project');
const SESSION = params.get('session');

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
    if (!PROJECT || !SESSION) {
        showError('Missing project or session parameters in URL.');
        return;
    }
    loadReport();

    document.getElementById('save-report-btn').addEventListener('click', saveReport);
});

async function loadReport() {
    try {
        const transcript = await fetchTranscript(PROJECT, SESSION);
        const processed = processTranscript(transcript);

        renderSessionInfo(processed, transcript.metadata);
        renderAgentCatalog(processed);
        renderTimeline(processed);

        // Show loading state for comparison, then fire both AI requests in parallel
        renderComparisonLoading();
        requestHumanTimeEstimate(processed, transcript);
        requestSummary(processed, transcript);
    } catch (err) {
        showError(`Failed to load transcript: ${err.message}`);
    }
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function fetchTranscript(project, session) {
    const url = `/api/session-transcript?project=${encodeURIComponent(project)}&session=${encodeURIComponent(session)}`;
    const res = await fetch(url);
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
    }
    return res.json();
}

// ---------------------------------------------------------------------------
// Transcript processing
// ---------------------------------------------------------------------------

function processTranscript(transcript) {
    const events = [];
    const toolCounts = {};
    const agentMap = new Map(); // agentId -> { description, tools, eventCount }
    let turnCount = 0;
    let userPromptCount = 0;
    let firstEventTime = null;
    let lastEventTime = null;

    // Process main transcript events
    for (const record of transcript.events) {
        const ts = record.timestamp ? new Date(record.timestamp).getTime() : null;
        if (ts) {
            if (!firstEventTime || ts < firstEventTime) firstEventTime = ts;
            if (!lastEventTime || ts > lastEventTime) lastEventTime = ts;
        }

        const parsed = parseRecord(record);
        for (const evt of parsed) {
            evt.ts = ts;
            evt.source = 'main';
            events.push(evt);

            if (evt.type === 'TOOL_START') {
                toolCounts[evt.toolName] = (toolCounts[evt.toolName] || 0) + 1;
            }
            if (evt.type === 'TURN_COMPLETE') turnCount++;
            if (evt.type === 'USER_PROMPT') userPromptCount++;
            if (evt.type === 'SUBAGENT_SPAWN') {
                agentMap.set(evt.agentId, {
                    description: evt.description || '',
                    tools: {},
                    eventCount: 0,
                });
            }
        }
    }

    // Process sub-agent transcripts
    if (transcript.subAgents) {
        for (const [agentId, records] of Object.entries(transcript.subAgents)) {
            if (!agentMap.has(agentId)) {
                agentMap.set(agentId, { description: '', tools: {}, eventCount: 0 });
            }
            const agent = agentMap.get(agentId);

            for (const record of records) {
                const ts = record.timestamp ? new Date(record.timestamp).getTime() : null;
                if (ts) {
                    if (!firstEventTime || ts < firstEventTime) firstEventTime = ts;
                    if (!lastEventTime || ts > lastEventTime) lastEventTime = ts;
                }

                const parsed = parseRecord(record);
                for (const evt of parsed) {
                    evt.ts = ts;
                    evt.source = 'sub-agent';
                    evt.agentId = agentId;
                    events.push(evt);
                    agent.eventCount++;

                    if (evt.type === 'TOOL_START') {
                        toolCounts[evt.toolName] = (toolCounts[evt.toolName] || 0) + 1;
                        agent.tools[evt.toolName] = (agent.tools[evt.toolName] || 0) + 1;
                    }
                    if (evt.type === 'USER_PROMPT' && !agent.description && evt.text) {
                        const line = evt.text.split('\n')[0].trim();
                        agent.description = line.length > 80 ? line.substring(0, 78) + '..' : line;
                    }
                }
            }
        }
    }

    // Sort events chronologically
    events.sort((a, b) => (a.ts || 0) - (b.ts || 0));

    const durationMs = (firstEventTime && lastEventTime) ? lastEventTime - firstEventTime : 0;

    return {
        events,
        toolCounts,
        agentMap,
        turnCount,
        userPromptCount,
        firstEventTime,
        lastEventTime,
        durationMs,
    };
}

/**
 * Parse a single JSONL record into an array of typed events.
 * Simplified version of transcriptParser.js for report purposes.
 */
function parseRecord(record) {
    const events = [];

    if (record.type === 'custom-title' && record.customTitle) {
        events.push({ type: 'SESSION_META', customTitle: record.customTitle });
        return events;
    }

    if (record.slug) {
        events.push({ type: 'SESSION_META', slug: record.slug });
    }

    if (record.type === 'user') {
        const content = record.message?.content;
        if (Array.isArray(content)) {
            const toolResult = content.find(b => b.type === 'tool_result');
            if (toolResult) {
                events.push({ type: 'TOOL_END', toolId: toolResult.tool_use_id });
            }
            const textBlock = content.find(b => b.type === 'text');
            if (textBlock && textBlock.text?.trim()) {
                events.push({ type: 'USER_PROMPT', text: textBlock.text });
            }
        } else if (typeof content === 'string' && content.trim()) {
            events.push({ type: 'USER_PROMPT', text: content });
        }
    }

    if (record.type === 'assistant') {
        const content = record.message?.content;
        if (Array.isArray(content)) {
            for (const block of content) {
                if (block.type === 'text' && block.text?.trim()) {
                    events.push({ type: 'ASSISTANT_TEXT', text: block.text });
                }
            }
            for (const block of content) {
                if (block.type !== 'tool_use') continue;
                if (block.name === 'AskUserQuestion') {
                    events.push({ type: 'ASK_USER', toolId: block.id });
                }
                if (block.name === 'Task' || block.name === 'Agent') {
                    events.push({
                        type: 'SUBAGENT_SPAWN',
                        agentId: block.input?.agentId || block.id,
                        description: block.input?.description || block.input?.prompt || '',
                        toolId: block.id,
                    });
                }
                events.push({
                    type: 'TOOL_START',
                    toolName: block.name,
                    toolId: block.id,
                });
            }
        }
    }

    if (record.type === 'system' && record.subtype === 'turn_duration') {
        events.push({ type: 'TURN_COMPLETE', durationMs: record.durationMs || 0 });
    }

    return events;
}

// ---------------------------------------------------------------------------
// Summary generation
// ---------------------------------------------------------------------------

function buildTranscriptSummary(processed, transcript) {
    const lines = [];
    const meta = transcript.metadata || {};

    lines.push(`Session: ${meta.customTitle || meta.slug || SESSION}`);
    if (meta.cwd) lines.push(`Working directory: ${meta.cwd}`);
    if (meta.gitBranch) lines.push(`Git branch: ${meta.gitBranch}`);
    lines.push(`Duration: ${formatDuration(processed.durationMs)}`);
    lines.push(`Turns: ${processed.turnCount}, User prompts: ${processed.userPromptCount}`);
    lines.push(`Sub-agents: ${processed.agentMap.size}`);
    lines.push('');

    // Tool usage summary
    lines.push('Tool usage:');
    for (const [tool, count] of Object.entries(processed.toolCounts).sort((a, b) => b[1] - a[1])) {
        lines.push(`  ${tool}: ${count}`);
    }
    lines.push('');

    // Key events (user prompts and assistant texts, capped)
    lines.push('Key interactions:');
    let interactionCount = 0;
    for (const evt of processed.events) {
        if (interactionCount >= 30) { lines.push('  ...'); break; }
        if (evt.type === 'USER_PROMPT') {
            const text = (evt.text || '').substring(0, 200);
            lines.push(`  [USER] ${text}`);
            interactionCount++;
        } else if (evt.type === 'ASSISTANT_TEXT') {
            const text = (evt.text || '').substring(0, 200);
            lines.push(`  [AI] ${text}`);
            interactionCount++;
        }
    }

    // Cap at ~8000 chars
    let result = lines.join('\n');
    if (result.length > 8000) {
        result = result.substring(0, 7950) + '\n...(truncated)';
    }
    return result;
}

async function requestSummary(processed, transcript) {
    const summaryEl = document.getElementById('summary-content');
    const cacheKey = `report-summary-${PROJECT}-${SESSION}`;

    // Check sessionStorage cache
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
        summaryEl.innerHTML = '';
        renderSummaryText(summaryEl, cached);
        return;
    }

    try {
        const transcriptSummary = buildTranscriptSummary(processed, transcript);
        const res = await fetch('/api/generate-summary', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ project: PROJECT, session: SESSION, transcriptSummary }),
        });

        const data = await res.json();
        summaryEl.innerHTML = '';

        if (data.summary) {
            sessionStorage.setItem(cacheKey, data.summary);
            renderSummaryText(summaryEl, data.summary);
        } else {
            summaryEl.innerHTML = buildFallbackHTML(data.error);
        }
    } catch {
        summaryEl.innerHTML = buildFallbackHTML('Could not reach the server.');
    }
}

function renderSummaryText(container, text) {
    const paragraphs = text.split('\n\n').filter(p => p.trim());
    for (const p of paragraphs) {
        const el = document.createElement('p');
        el.textContent = p.trim();
        container.appendChild(el);
    }
}

function buildFallbackHTML(errorDetail) {
    const isWindows = navigator.platform.indexOf('Win') > -1;
    const errorLine = errorDetail ? `<strong>${errorDetail}</strong>` : 'The claude CLI is not on PATH.';

    const macInstructions = `<strong>macOS / Linux</strong><br>
Find the directory containing <code>claude</code> and add it to your shell profile:<br>
<code>echo 'export PATH="/path/to/directory:$PATH"' >> ~/.zshrc && source ~/.zshrc</code>`;

    const winInstructions = `<strong>Windows</strong><br>
Find the folder containing <code>claude.exe</code>, then:<br>
Start &gt; search "Environment Variables" &gt; Edit environment variables<br>
Under User variables, select Path &gt; Edit &gt; New &gt; paste the folder path`;

    return `<div class="summary-fallback">
<p>AI summary unavailable. ${errorLine}</p>
<details>
<summary>How to fix: add claude to PATH</summary>
<div class="fallback-instructions">
<p>${isWindows ? winInstructions : macInstructions}</p>
<hr>
<p>${isWindows ? macInstructions : winInstructions}</p>
</div>
</details>
<p>Restart the server after updating PATH. The timeline, agent catalog, and comparison sections work without the CLI.</p>
</div>`;
}

// ---------------------------------------------------------------------------
// Render: Session Info
// ---------------------------------------------------------------------------

function renderSessionInfo(processed, metadata) {
    const meta = metadata || {};
    const sessionName = meta.customTitle || meta.slug || SESSION.substring(0, 16);
    document.getElementById('report-title').textContent = `Session Report \u2014 ${sessionName}`;

    const fields = [
        { label: 'Session', value: sessionName },
        { label: 'Project', value: PROJECT },
        { label: 'Duration', value: formatDuration(processed.durationMs) },
        { label: 'Turns', value: String(processed.turnCount) },
        { label: 'User Prompts', value: String(processed.userPromptCount) },
        { label: 'Sub-agents', value: String(processed.agentMap.size) },
    ];

    if (meta.cwd) fields.push({ label: 'CWD', value: meta.cwd });
    if (meta.gitBranch) fields.push({ label: 'Branch', value: meta.gitBranch });
    if (meta.version) fields.push({ label: 'Version', value: meta.version });

    // Total tool count
    const totalTools = Object.values(processed.toolCounts).reduce((s, c) => s + c, 0);
    fields.push({ label: 'Tool Calls', value: String(totalTools) });

    const container = document.getElementById('session-info-fields');
    container.innerHTML = '';
    for (const f of fields) {
        const row = document.createElement('div');
        row.className = 'field-row';

        const label = document.createElement('span');
        label.className = 'field-label';
        label.textContent = f.label;
        row.appendChild(label);

        const value = document.createElement('span');
        value.className = 'field-value';
        value.textContent = f.value;
        row.appendChild(value);

        container.appendChild(row);
    }
}

// ---------------------------------------------------------------------------
// Render: Agent Catalog
// ---------------------------------------------------------------------------

function renderAgentCatalog(processed) {
    const container = document.getElementById('agent-catalog-list');
    container.innerHTML = '';

    // Main agent card
    const mainToolCount = Object.values(processed.toolCounts).reduce((s, c) => s + c, 0);
    const mainCard = createAgentCard('Main Agent', 'main', `${processed.turnCount} turns`, mainToolCount, processed.toolCounts);
    container.appendChild(mainCard);

    // Sub-agent cards
    for (const [agentId, agent] of processed.agentMap) {
        const toolCount = Object.values(agent.tools).reduce((s, c) => s + c, 0);
        const desc = agent.description || agentId.substring(0, 16);
        const card = createAgentCard(desc, 'sub', `${agent.eventCount} events`, toolCount, agent.tools);
        container.appendChild(card);
    }
}

function createAgentCard(name, type, subtitle, toolCount, toolBreakdown) {
    const card = document.createElement('div');
    card.className = 'agent-card';

    const header = document.createElement('div');
    header.className = 'agent-card-header';

    const icon = document.createElement('span');
    icon.className = `agent-card-icon ${type}`;
    icon.textContent = type === 'main' ? 'M' : 'S';
    header.appendChild(icon);

    const nameEl = document.createElement('span');
    nameEl.className = 'agent-card-name';
    nameEl.textContent = name;
    header.appendChild(nameEl);

    card.appendChild(header);

    const desc = document.createElement('div');
    desc.className = 'agent-card-desc';
    desc.textContent = subtitle;
    card.appendChild(desc);

    // Top tools
    const topTools = Object.entries(toolBreakdown)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    if (topTools.length > 0) {
        const stats = document.createElement('div');
        stats.className = 'agent-card-stats';
        for (const [tool, count] of topTools) {
            const stat = document.createElement('span');
            stat.innerHTML = `${tool}: <span class="stat-value">${count}</span>`;
            stats.appendChild(stat);
        }
        card.appendChild(stats);
    }

    return card;
}

// ---------------------------------------------------------------------------
// Render: Timeline
// ---------------------------------------------------------------------------

function renderTimeline(processed) {
    const container = document.getElementById('timeline-content');
    container.innerHTML = '';

    if (processed.events.length === 0) {
        container.innerHTML = '<div class="loading-placeholder">No events found.</div>';
        return;
    }

    for (const evt of processed.events) {
        // Skip SESSION_META and TOOL_END for cleaner timeline
        if (evt.type === 'SESSION_META' || evt.type === 'TOOL_END') continue;

        const row = document.createElement('div');
        const cssType = evt.type.toLowerCase().replace(/_/g, '-');
        row.className = `timeline-event type-${cssType}`;
        row.addEventListener('click', () => row.classList.toggle('expanded'));

        // Time
        const time = document.createElement('span');
        time.className = 'timeline-time';
        time.textContent = evt.ts ? formatTimestamp(evt.ts) : '--:--';
        row.appendChild(time);

        // Badge
        const badge = document.createElement('span');
        badge.className = `timeline-badge ${cssType}`;
        badge.textContent = formatEventType(evt.type);
        row.appendChild(badge);

        // Agent tag (for sub-agent events)
        if (evt.source === 'sub-agent' && evt.agentId) {
            const tag = document.createElement('span');
            tag.className = 'timeline-agent-tag';
            tag.textContent = evt.agentId.substring(0, 8);
            row.appendChild(tag);
        }

        // Detail
        const detail = document.createElement('span');
        detail.className = 'timeline-detail';
        detail.textContent = getEventDetail(evt);
        row.appendChild(detail);

        container.appendChild(row);
    }
}

function formatEventType(type) {
    switch (type) {
        case 'USER_PROMPT': return 'prompt';
        case 'TOOL_START': return 'tool';
        case 'TOOL_END': return 'done';
        case 'SUBAGENT_SPAWN': return 'spawn';
        case 'TURN_COMPLETE': return 'turn';
        case 'ASK_USER': return 'ask';
        case 'ASSISTANT_TEXT': return 'text';
        default: return type.toLowerCase();
    }
}

function getEventDetail(evt) {
    switch (evt.type) {
        case 'USER_PROMPT': return (evt.text || '').substring(0, 200);
        case 'TOOL_START': return evt.toolName || 'unknown tool';
        case 'SUBAGENT_SPAWN': return evt.description || 'sub-agent';
        case 'TURN_COMPLETE': return evt.durationMs ? `${(evt.durationMs / 1000).toFixed(1)}s` : 'completed';
        case 'ASK_USER': return 'waiting for user';
        case 'ASSISTANT_TEXT': return (evt.text || '').substring(0, 200);
        default: return '';
    }
}

// ---------------------------------------------------------------------------
// Render: Human vs AI Comparison
// ---------------------------------------------------------------------------

function renderComparisonLoading() {
    const container = document.getElementById('comparison-content');
    container.innerHTML = `<div class="loading-placeholder summary-loading">
        <div class="loading-dots"><span></span><span></span><span></span></div>
        Estimating human time...
    </div>`;
}

async function requestHumanTimeEstimate(processed, transcript) {
    const container = document.getElementById('comparison-content');
    const cacheKey = `report-estimate-${PROJECT}-${SESSION}`;

    // Check sessionStorage cache
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
        try {
            const estimate = JSON.parse(cached);
            renderAIComparison(processed, estimate);
            return;
        } catch { /* fall through */ }
    }

    try {
        const transcriptSummary = buildTranscriptSummary(processed, transcript);
        const aiDurationMinutes = processed.durationMs / 60000;

        const res = await fetch('/api/estimate-human-time', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transcriptSummary, aiDurationMinutes }),
        });

        const data = await res.json();

        if (data.estimate && data.estimate.totalMinutes) {
            sessionStorage.setItem(cacheKey, JSON.stringify(data.estimate));
            renderAIComparison(processed, data.estimate);
        } else {
            renderHumanComparison(processed, true);
        }
    } catch {
        renderHumanComparison(processed, true);
    }
}

function renderAIComparison(processed, estimate) {
    const container = document.getElementById('comparison-content');
    container.innerHTML = '';

    const aiTimeMin = processed.durationMs / 60000;
    const humanTimeMin = estimate.totalMinutes;

    if (aiTimeMin < 0.1 || humanTimeMin < 1) {
        container.innerHTML = '<div class="loading-placeholder">Not enough data for comparison.</div>';
        return;
    }

    // Source badge
    const sourceBadge = document.createElement('div');
    sourceBadge.className = 'estimate-source ai-powered';
    sourceBadge.textContent = 'AI-powered estimate';
    container.appendChild(sourceBadge);

    const multiplier = humanTimeMin / Math.max(aiTimeMin, 0.1);

    // Speed badge
    const badgeEl = document.createElement('div');
    badgeEl.className = 'speed-badge';
    badgeEl.innerHTML = `<span class="multiplier">~${Math.round(multiplier)}x</span><span class="label">faster than manual</span>`;
    container.appendChild(badgeEl);

    // Comparison bars
    const barsEl = document.createElement('div');
    barsEl.className = 'comparison-bars';
    const maxTime = Math.max(aiTimeMin, humanTimeMin);
    barsEl.appendChild(createComparisonBar('AI Time', aiTimeMin, maxTime, 'ai'));
    barsEl.appendChild(createComparisonBar('Est. Human Time', humanTimeMin, maxTime, 'human'));
    container.appendChild(barsEl);

    // Reasoning paragraph
    if (estimate.reasoning) {
        const reasoning = document.createElement('p');
        reasoning.className = 'estimate-reasoning';
        reasoning.textContent = estimate.reasoning;
        container.appendChild(reasoning);
    }

    // Workflow breakdown table
    if (estimate.breakdown && estimate.breakdown.length > 0) {
        const table = document.createElement('table');
        table.className = 'breakdown-table';

        const thead = document.createElement('thead');
        thead.innerHTML = '<tr><th>Workflow Step</th><th class="time-col">Est. Time</th><th>Description</th></tr>';
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        for (const step of estimate.breakdown) {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${step.category}</td><td class="time-col">${formatMinutes(step.minutes)}</td><td class="desc-col">${step.description || ''}</td>`;
            tbody.appendChild(tr);
        }

        // Total row
        const trTotal = document.createElement('tr');
        trTotal.innerHTML = `<td><strong>Total</strong></td><td class="time-col"><strong>${formatMinutes(humanTimeMin)}</strong></td><td class="desc-col"></td>`;
        tbody.appendChild(trTotal);

        table.appendChild(tbody);
        container.appendChild(table);
    }
}

function renderHumanComparison(processed, isFallback) {
    const container = document.getElementById('comparison-content');
    container.innerHTML = '';

    // Source badge for fallback
    if (isFallback) {
        const sourceBadge = document.createElement('div');
        sourceBadge.className = 'estimate-source static-estimate';
        sourceBadge.textContent = 'Static estimate (approximate)';
        container.appendChild(sourceBadge);
    }

    const aiTimeMs = processed.durationMs;
    const humanTimeMin = estimateHumanTime(processed);
    const aiTimeMin = aiTimeMs / 60000;

    if (aiTimeMin < 0.1 || humanTimeMin < 1) {
        container.innerHTML = '<div class="loading-placeholder">Not enough data for comparison.</div>';
        return;
    }

    const multiplier = humanTimeMin / Math.max(aiTimeMin, 0.1);

    // Speed badge
    const badgeEl = document.createElement('div');
    badgeEl.className = 'speed-badge';
    badgeEl.innerHTML = `<span class="multiplier">~${Math.round(multiplier)}x</span><span class="label">faster than manual</span>`;
    container.appendChild(badgeEl);

    // Comparison bars
    const barsEl = document.createElement('div');
    barsEl.className = 'comparison-bars';

    const maxTime = Math.max(aiTimeMin, humanTimeMin);

    barsEl.appendChild(createComparisonBar('AI Time', aiTimeMin, maxTime, 'ai'));
    barsEl.appendChild(createComparisonBar('Est. Human Time', humanTimeMin, maxTime, 'human'));

    container.appendChild(barsEl);

    // Breakdown table
    const table = document.createElement('table');
    table.className = 'breakdown-table';

    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>Tool</th><th class="count-col">Count</th><th class="time-col">Est. Human Time</th></tr>';
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    const sorted = Object.entries(processed.toolCounts).sort((a, b) => b[1] - a[1]);

    for (const [tool, count] of sorted) {
        const perUse = TOOL_TIME_ESTIMATES[tool] || DEFAULT_TOOL_TIME;
        const total = perUse * count;
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${tool}</td><td class="count-col">${count}</td><td class="time-col">${formatMinutes(total)}</td>`;
        tbody.appendChild(tr);
    }

    // Add overhead rows
    const baseTime = sorted.reduce((s, [tool, count]) => s + (TOOL_TIME_ESTIMATES[tool] || DEFAULT_TOOL_TIME) * count, 0);
    const thinkingTime = baseTime * THINKING_OVERHEAD;
    const switchTime = processed.turnCount * CONTEXT_SWITCH_MIN;

    const trThink = document.createElement('tr');
    trThink.innerHTML = `<td>Thinking overhead (15%)</td><td class="count-col">-</td><td class="time-col">${formatMinutes(thinkingTime)}</td>`;
    tbody.appendChild(trThink);

    const trSwitch = document.createElement('tr');
    trSwitch.innerHTML = `<td>Context switches</td><td class="count-col">${processed.turnCount}</td><td class="time-col">${formatMinutes(switchTime)}</td>`;
    tbody.appendChild(trSwitch);

    // Total row
    const trTotal = document.createElement('tr');
    trTotal.innerHTML = `<td><strong>Total</strong></td><td class="count-col"></td><td class="time-col"><strong>${formatMinutes(humanTimeMin)}</strong></td>`;
    tbody.appendChild(trTotal);

    table.appendChild(tbody);
    container.appendChild(table);
}

function estimateHumanTime(processed) {
    let totalMin = 0;

    // Tool-based estimates
    for (const [tool, count] of Object.entries(processed.toolCounts)) {
        const perUse = TOOL_TIME_ESTIMATES[tool] || DEFAULT_TOOL_TIME;
        totalMin += perUse * count;
    }

    // Thinking overhead
    totalMin *= (1 + THINKING_OVERHEAD);

    // Context-switch overhead per turn
    totalMin += processed.turnCount * CONTEXT_SWITCH_MIN;

    // Sub-agent work is already counted in tool counts
    // but add small overhead for coordination
    totalMin += processed.agentMap.size * 5;

    return totalMin;
}

function createComparisonBar(label, timeMin, maxTime, type) {
    const row = document.createElement('div');
    row.className = 'comparison-bar-row';

    const labelEl = document.createElement('div');
    labelEl.className = 'comparison-bar-label';
    labelEl.innerHTML = `<span>${label}</span><span>${formatMinutes(timeMin)}</span>`;
    row.appendChild(labelEl);

    const track = document.createElement('div');
    track.className = 'comparison-bar-track';

    const fill = document.createElement('div');
    fill.className = `comparison-bar-fill ${type}`;
    fill.style.width = `${(timeMin / maxTime) * 100}%`;
    track.appendChild(fill);

    row.appendChild(track);
    return row;
}

// ---------------------------------------------------------------------------
// Formatting utilities
// ---------------------------------------------------------------------------

function formatDuration(ms) {
    if (!ms || ms <= 0) return '0s';
    const sec = Math.floor(ms / 1000) % 60;
    const min = Math.floor(ms / 60000) % 60;
    const hr = Math.floor(ms / 3600000);

    if (hr > 0) return `${hr}h ${min}m ${sec}s`;
    if (min > 0) return `${min}m ${sec}s`;
    return `${sec}s`;
}

function formatTimestamp(ts) {
    const d = new Date(ts);
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    return `${h}:${m}:${s}`;
}

function formatMinutes(min) {
    if (min < 60) return `${Math.round(min)}m`;
    const hr = Math.floor(min / 60);
    const rem = Math.round(min % 60);
    return rem > 0 ? `${hr}h ${rem}m` : `${hr}h`;
}

// ---------------------------------------------------------------------------
// Error display
// ---------------------------------------------------------------------------

function showError(msg) {
    const main = document.getElementById('report-main');
    if (main) {
        main.innerHTML = `<div style="grid-column: 1 / -1; padding: 40px;"><div class="error-state">${msg}</div></div>`;
    }
}

// ---------------------------------------------------------------------------
// Save Report as self-contained HTML
// ---------------------------------------------------------------------------

async function saveReport() {
    const btn = document.getElementById('save-report-btn');

    // Warn if summary is still loading
    if (document.querySelector('.summary-loading')) {
        if (!confirm('The AI summary is still loading. Save without it?')) return;
    }

    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
        // Fetch CSS to inline
        const cssText = await fetch('css/report.css').then(r => r.text());

        // Clone the document
        const clone = document.documentElement.cloneNode(true);

        // Remove no-export elements (save button, back link)
        clone.querySelectorAll('.no-export').forEach(el => el.remove());

        // Remove all script tags
        clone.querySelectorAll('script').forEach(el => el.remove());

        // Replace stylesheet link with inline style
        const linkEl = clone.querySelector('link[rel="stylesheet"]');
        if (linkEl) {
            const styleEl = document.createElement('style');
            styleEl.textContent = cssText;
            linkEl.replaceWith(styleEl);
        }

        // Add minimal inline JS for timeline expand/collapse
        const script = document.createElement('script');
        script.textContent = `document.addEventListener('click', function(e) {
    var row = e.target.closest('.timeline-event');
    if (row) row.classList.toggle('expanded');
});`;
        clone.querySelector('body').appendChild(script);

        // Add export footer
        const footer = document.createElement('footer');
        footer.style.cssText = 'text-align:center;padding:16px;font-size:0.7rem;color:#555577;font-family:Consolas,Monaco,monospace;border-top:1px solid #2a2a4a;margin-top:24px;';
        footer.textContent = `Exported from WorkChart Office on ${new Date().toLocaleDateString()}`;
        clone.querySelector('body').appendChild(footer);

        // Build HTML string and trigger download
        const html = '<!DOCTYPE html>\n' + clone.outerHTML;
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        const sessionName = (document.getElementById('report-title').textContent || 'session')
            .replace(/^Session Report\s*[—–-]\s*/, '')
            .replace(/[^a-zA-Z0-9_-]/g, '_')
            .substring(0, 60);
        const dateStr = new Date().toISOString().slice(0, 10);
        a.download = `report-${sessionName}-${dateStr}.html`;
        a.href = url;
        a.click();

        URL.revokeObjectURL(url);
    } catch (err) {
        alert('Failed to save report: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Save Report';
    }
}
