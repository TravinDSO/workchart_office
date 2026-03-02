/**
 * transcriptParser.js — JSONL Record Parser
 *
 * Parses individual JSONL lines from Claude Code transcript files into
 * structured event objects consumed by the SessionManager.
 *
 * Event types produced:
 *   USER_PROMPT      — Human sent a text prompt
 *   TOOL_START       — Agent invoked a tool
 *   TOOL_END         — Tool returned a result
 *   SUBAGENT_SPAWN   — Agent spawned a sub-agent via Task/Agent tool
 *   SUBAGENT_ACTIVITY— Sub-agent used a tool (from progress records)
 *   TURN_COMPLETE    — Agent turn finished
 *   ASK_USER         — Agent is asking user a question
 *   SESSION_META     — Session metadata (slug, sessionId) extracted from record
 */

export const TranscriptParser = {

    /**
     * Parse a single JSON line from a transcript file.
     *
     * @param {string} jsonLine - A single line of JSON text.
     * @returns {object|object[]|null} Event object, array of events, or null.
     */
    parse(jsonLine) {
        let record;
        try {
            record = JSON.parse(jsonLine);
        } catch {
            return null; // Skip malformed JSON lines
        }

        // Record timestamp — used for accurate spawn/activity times
        const ts = record.timestamp ? new Date(record.timestamp).getTime() : null;

        // Extract session metadata from any record that carries it
        const meta = record.slug
            ? { type: 'SESSION_META', slug: record.slug, sessionId: record.sessionId, ts }
            : null;

        // Custom title set via /rename — stored separately so auto-slug
        // from later records can't overwrite it.
        if (record.type === 'custom-title' && record.customTitle) {
            return { type: 'SESSION_META', customTitle: record.customTitle };
        }

        let result;
        switch (record.type) {
            case 'user': {
                const event = this._parseUserRecord(record);
                result = event || meta;
                break;
            }
            case 'assistant': {
                const events = this._parseAssistantRecord(record);
                if (events) {
                    // If we also have meta, prepend it
                    if (meta) {
                        const arr = Array.isArray(events) ? events : [events];
                        result = [meta, ...arr];
                    } else {
                        result = events;
                    }
                } else {
                    result = meta;
                }
                break;
            }
            case 'progress':
                result = this._parseProgressRecord(record) || meta;
                break;
            case 'system':
                result = this._parseSystemRecord(record) || meta;
                break;
            default:
                result = meta;
        }

        // Stamp the record timestamp onto all returned events
        if (ts && result) {
            if (Array.isArray(result)) {
                for (const e of result) { e.ts = ts; }
            } else {
                result.ts = ts;
            }
        }
        return result;
    },

    // -----------------------------------------------------------------------
    // Private parsing methods
    // -----------------------------------------------------------------------

    /**
     * Parse a "user" type record.
     * Can be a human text prompt or a tool_result returning from a tool call.
     */
    _parseUserRecord(record) {
        const content = record.message?.content;
        if (!content) return null;

        // Array content — may contain tool_result or text blocks
        if (Array.isArray(content)) {
            // Check for tool results first (they appear as responses to tool_use)
            const toolResult = content.find(b => b.type === 'tool_result');
            if (toolResult) {
                return { type: 'TOOL_END', toolId: toolResult.tool_use_id };
            }
            // Check for text content (human prompt)
            const textBlock = content.find(b => b.type === 'text');
            if (textBlock && textBlock.text?.trim()) {
                return { type: 'USER_PROMPT', text: textBlock.text };
            }
        }

        // String content — simple human prompt
        if (typeof content === 'string' && content.trim()) {
            return { type: 'USER_PROMPT', text: content };
        }

        return null;
    },

    /**
     * Parse an "assistant" type record.
     * Can contain multiple tool_use blocks — returns array if more than one event.
     */
    _parseAssistantRecord(record) {
        const content = record.message?.content;
        if (!Array.isArray(content)) return null;

        const events = [];

        // Capture assistant text output (Claude's comments/responses)
        for (const block of content) {
            if (block.type === 'text' && block.text?.trim()) {
                events.push({ type: 'ASSISTANT_TEXT', text: block.text });
            }
        }

        for (const block of content) {
            if (block.type !== 'tool_use') continue;

            // Check for AskUserQuestion — agent is waiting for user input
            if (block.name === 'AskUserQuestion') {
                // Return immediately; the ask event takes priority
                events.push({ type: 'ASK_USER', toolId: block.id });
                continue;
            }

            // Check for sub-agent spawn (Task or Agent tool)
            if (block.name === 'Task' || block.name === 'Agent') {
                const desc = block.input?.description
                    || block.input?.prompt
                    || '';
                const agentId = block.input?.agentId || block.id;
                events.push({
                    type: 'SUBAGENT_SPAWN',
                    agentId,
                    description: desc,
                    toolId: block.id,
                });
            }

            // All tool_use blocks also produce a TOOL_START
            events.push({
                type: 'TOOL_START',
                toolName: block.name,
                toolId: block.id,
                input: block.input,
            });
        }

        if (events.length === 0) return null;
        if (events.length === 1) return events[0];
        return events;
    },

    /**
     * Parse a "progress" type record.
     * We care about agent_progress sub-type for sub-agent activity.
     */
    _parseProgressRecord(record) {
        if (record.data?.type === 'agent_progress') {
            const agentId = record.data.agentId;
            let toolName = null;

            // Try to extract the tool name from the nested message
            const msg = record.data.message;
            if (msg?.message?.content && Array.isArray(msg.message.content)) {
                const toolUse = msg.message.content.find(b => b.type === 'tool_use');
                if (toolUse) {
                    toolName = toolUse.name;
                }
            }

            return { type: 'SUBAGENT_ACTIVITY', agentId, toolName };
        }

        return null;
    },

    /**
     * Parse a "system" type record.
     * We look for turn_duration subtype indicating a turn has completed.
     */
    _parseSystemRecord(record) {
        if (record.subtype === 'turn_duration') {
            return {
                type: 'TURN_COMPLETE',
                durationMs: record.durationMs || 0,
            };
        }
        return null;
    },
};
