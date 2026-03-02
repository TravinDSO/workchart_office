/**
 * fileReader.js — File Access Abstraction Layer
 *
 * Provides a unified interface for reading Claude Code JSONL transcript files,
 * supporting two modes:
 *
 *   1. "fsapi" — Uses the browser File System Access API (showDirectoryPicker).
 *      Works in Chrome/Edge when opening index.html directly or via HTTPS.
 *
 *   2. "http" — Falls back to HTTP fetch against the local serve.js server.
 *      Used when the File System Access API is unavailable (Firefox, etc.).
 *
 * Named FileReaderLayer to avoid collision with the built-in FileReader API.
 */

export class FileReaderLayer {
    constructor() {
        /** @type {'fsapi'|'http'|null} */
        this.mode = null;

        /** @type {FileSystemDirectoryHandle|null} */
        this.dirHandle = null;

        /** Base URL for HTTP mode (defaults to current origin) */
        this.httpBase = '';
    }

    // -----------------------------------------------------------------------
    // Directory access
    // -----------------------------------------------------------------------

    /**
     * Open a directory using the File System Access API.
     * Falls back to HTTP mode if the API is unavailable.
     *
     * @returns {Promise<boolean>} True if a directory was successfully opened.
     */
    async openDirectory() {
        // Try File System Access API first
        if (typeof window.showDirectoryPicker === 'function') {
            try {
                this.dirHandle = await window.showDirectoryPicker({ mode: 'read' });
                this.mode = 'fsapi';
                return true;
            } catch (err) {
                // User cancelled the picker or permission was denied
                if (err.name === 'AbortError') {
                    return false;
                }
                console.warn('File System Access API failed, falling back to HTTP:', err);
            }
        }

        // Fallback: HTTP mode (assumes serve.js is running)
        this.mode = 'http';
        return true;
    }

    /**
     * Check if a directory (or HTTP server) is available.
     *
     * @returns {boolean}
     */
    isConnected() {
        return this.mode !== null;
    }

    // -----------------------------------------------------------------------
    // File listing
    // -----------------------------------------------------------------------

    /**
     * List all .jsonl files across all projects (HTTP) or the opened directory (fsapi).
     *
     * @returns {Promise<Array<{name: string, handle: FileSystemFileHandle|null, project: string|null}>>}
     */
    async listJsonlFiles() {
        if (this.mode === 'fsapi') {
            return this._fsapiListJsonlFiles();
        }
        if (this.mode === 'http') {
            return this._httpListJsonlFiles();
        }
        return [];
    }

    /**
     * List sub-agent files for a given session.
     *
     * @param {string} sessionId - The session UUID.
     * @param {string|null} [project] - Project directory name (HTTP mode).
     * @returns {Promise<Array<{agentId: string, name: string, handle: FileSystemFileHandle|null}>>}
     */
    async listSubAgentFiles(sessionId, project) {
        if (this.mode === 'fsapi') {
            return this._fsapiListSubAgentFiles(sessionId);
        }
        if (this.mode === 'http') {
            return this._httpListSubAgentFiles(sessionId, project);
        }
        return [];
    }

    // -----------------------------------------------------------------------
    // File reading
    // -----------------------------------------------------------------------

    /**
     * Read new lines from a file starting at a byte offset.
     *
     * @param {FileSystemFileHandle|string} fileHandle - FS API handle or filename (HTTP mode).
     * @param {number} offset - Byte offset to start reading from.
     * @param {string|null} [project] - Project directory name (HTTP mode).
     * @returns {Promise<{lines: string[], newOffset: number}>}
     */
    async readNewLines(fileHandle, offset, project) {
        if (this.mode === 'fsapi') {
            return this._fsapiReadNewLines(fileHandle, offset);
        }
        if (this.mode === 'http') {
            return this._httpReadNewLines(fileHandle, offset, project);
        }
        return { lines: [], newOffset: offset };
    }

    // -----------------------------------------------------------------------
    // File System Access API implementation
    // -----------------------------------------------------------------------

    async _fsapiListJsonlFiles() {
        const results = [];
        try {
            for await (const entry of this.dirHandle.values()) {
                if (entry.kind === 'file' && entry.name.endsWith('.jsonl')) {
                    let mtime = null;
                    try {
                        const file = await entry.getFile();
                        mtime = file.lastModified;
                    } catch { /* ignore */ }
                    results.push({ name: entry.name, handle: entry, mtime });
                }
            }
        } catch (err) {
            console.error('Error listing JSONL files:', err);
        }
        return results;
    }

    async _fsapiListSubAgentFiles(sessionId) {
        const results = [];
        try {
            // Navigate into <sessionId>/subagents/ directory
            const sessionDir = await this.dirHandle.getDirectoryHandle(sessionId, { create: false });
            const subagentsDir = await sessionDir.getDirectoryHandle('subagents', { create: false });

            for await (const entry of subagentsDir.values()) {
                if (entry.kind === 'file' && entry.name.endsWith('.jsonl')) {
                    // Extract agentId from filename like "agent-<id>.jsonl"
                    const match = entry.name.match(/^agent-(.+)\.jsonl$/);
                    if (match) {
                        results.push({
                            agentId: match[1],
                            name: entry.name,
                            handle: entry,
                        });
                    }
                }
            }
        } catch {
            // Directory might not exist yet — that is fine
        }
        return results;
    }

    async _fsapiReadNewLines(fileHandle, offset) {
        try {
            const file = await fileHandle.getFile();

            // Nothing new to read
            if (file.size <= offset) {
                return { lines: [], newOffset: offset };
            }

            const slice = file.slice(offset);
            const text = await slice.text();
            const lines = text.split('\n').filter(l => l.trim().length > 0);
            return { lines, newOffset: file.size };
        } catch (err) {
            console.error('Error reading file:', err);
            return { lines: [], newOffset: offset };
        }
    }

    // -----------------------------------------------------------------------
    // HTTP mode implementation (for use with serve.js)
    // -----------------------------------------------------------------------

    async _httpListJsonlFiles() {
        try {
            const resp = await fetch(`${this.httpBase}/api/sessions`);
            if (!resp.ok) return [];
            const data = await resp.json();
            // Server returns array of { name, project, mtime } objects
            return (data.files || []).map(f => ({
                name: f.name,
                handle: f.name, // In HTTP mode, handle is the filename
                project: f.project || null,
                mtime: f.mtime || null,
            }));
        } catch (err) {
            console.error('HTTP listJsonlFiles failed:', err);
            return [];
        }
    }

    async _httpListSubAgentFiles(sessionId, project) {
        try {
            let url = `${this.httpBase}/api/subagents?session=${encodeURIComponent(sessionId)}`;
            if (project) url += `&project=${encodeURIComponent(project)}`;
            const resp = await fetch(url);
            if (!resp.ok) return [];
            const data = await resp.json();
            return (data.files || []).map(f => ({
                agentId: f.agentId,
                name: f.name,
                // In HTTP mode, handle is the relative path so /api/read can find it
                handle: `${sessionId}/subagents/${f.name}`,
            }));
        } catch (err) {
            console.error('HTTP listSubAgentFiles failed:', err);
            return [];
        }
    }

    async _httpReadNewLines(fileName, offset, project) {
        try {
            let url = `${this.httpBase}/api/read?file=${encodeURIComponent(fileName)}&offset=${offset}`;
            if (project) url += `&project=${encodeURIComponent(project)}`;
            const resp = await fetch(url);
            if (!resp.ok) return { lines: [], newOffset: offset };
            const data = await resp.json();
            return {
                lines: data.lines || [],
                newOffset: data.newOffset ?? offset,
            };
        } catch (err) {
            console.error('HTTP readNewLines failed:', err);
            return { lines: [], newOffset: offset };
        }
    }
}
