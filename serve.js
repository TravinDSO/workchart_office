/**
 * serve.js — Minimal Node.js HTTP Server for WorkChart Office
 *
 * Serves the static frontend (index.html, css/, js/) and provides API
 * endpoints for browsers that lack the File System Access API (e.g., Firefox).
 *
 * No external dependencies — uses only Node.js built-in modules.
 *
 * Usage:
 *   node serve.js
 *
 * Environment variables:
 *   PORT                 — Server port (default: 3200)
 *   CLAUDE_PROJECT_DIR   — Path to a specific Claude Code project directory.
 *                          If not set, auto-detects from ~/.claude/projects/
 *
 * API Endpoints:
 *   GET /api/sessions             — List .jsonl files in the project directory
 *   GET /api/read?file=X&offset=N — Read new lines from a file starting at offset
 *   GET /api/subagents?session=ID — List sub-agent files for a session
 *   GET /*                        — Serve static files
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.PORT, 10) || 3200;

/** Directory containing the static web files (same directory as this script) */
const STATIC_DIR = __dirname;

/** Project directory containing .jsonl transcript files */
let PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || null;

// Auto-detect project directory if not explicitly set
if (!PROJECT_DIR) {
    PROJECT_DIR = findProjectDir();
}

// ---------------------------------------------------------------------------
// MIME types for static file serving
// ---------------------------------------------------------------------------

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.js':   'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.svg':  'image/svg+xml',
    '.ico':  'image/x-icon',
};

// ---------------------------------------------------------------------------
// Project directory auto-detection
// ---------------------------------------------------------------------------

/**
 * Scan ~/.claude/projects/ for the directory matching our current working
 * directory (serve.js location). Falls back to the most recently modified
 * project if no match is found.
 *
 * Claude Code names project dirs by replacing non-alphanumeric/non-hyphen
 * chars in the workspace path with hyphens.
 *
 * @returns {string|null}
 */
function findProjectDir() {
    const claudeProjectsBase = path.join(os.homedir(), '.claude', 'projects');

    if (!fs.existsSync(claudeProjectsBase)) {
        console.warn(`Claude projects directory not found at: ${claudeProjectsBase}`);
        console.warn('Set CLAUDE_PROJECT_DIR environment variable to your project path.');
        return null;
    }

    try {
        const entries = fs.readdirSync(claudeProjectsBase, { withFileTypes: true });
        const dirs = entries.filter(e => e.isDirectory());

        if (dirs.length === 0) {
            console.warn('No project directories found in:', claudeProjectsBase);
            return null;
        }

        // Try to match a directory to our current working directory.
        // Claude Code converts workspace paths like "C:\foo\bar" to "c--foo-bar"
        const cwd = STATIC_DIR;
        const cwdSanitized = cwd.replace(/[^a-zA-Z0-9-]/g, '-');
        const cwdLower = cwdSanitized.toLowerCase();

        const cwdMatch = dirs.find(d => d.name.toLowerCase() === cwdLower);
        if (cwdMatch) {
            const matched = path.join(claudeProjectsBase, cwdMatch.name);
            console.log(`Matched project directory to cwd: ${matched}`);
            return matched;
        }

        // Fallback: sort by modification time (most recent first)
        const dirStats = dirs.map(d => {
            const fullPath = path.join(claudeProjectsBase, d.name);
            try {
                const stat = fs.statSync(fullPath);
                return { name: d.name, path: fullPath, mtime: stat.mtimeMs };
            } catch {
                return { name: d.name, path: fullPath, mtime: 0 };
            }
        });

        dirStats.sort((a, b) => b.mtime - a.mtime);
        const selected = dirStats[0];
        console.log(`Auto-detected project directory (most recent): ${selected.path}`);
        return selected.path;
    } catch (err) {
        console.error('Error scanning for project directories:', err);
        return null;
    }
}

// ---------------------------------------------------------------------------
// HTTP request handler
// ---------------------------------------------------------------------------

const server = http.createServer((req, res) => {
    // Add CORS headers to all responses
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);

    // Route API endpoints
    if (url.pathname === '/api/sessions') {
        return handleListSessions(req, res);
    }
    if (url.pathname === '/api/read') {
        return handleReadFile(req, res, url);
    }
    if (url.pathname === '/api/subagents') {
        return handleListSubAgents(req, res, url);
    }

    // Serve static files
    return handleStaticFile(req, res, url);
});

// ---------------------------------------------------------------------------
// API: GET /api/sessions
// ---------------------------------------------------------------------------

function handleListSessions(req, res) {
    if (!PROJECT_DIR) {
        return sendJson(res, 500, { error: 'No project directory configured.' });
    }

    try {
        const entries = fs.readdirSync(PROJECT_DIR, { withFileTypes: true });
        const jsonlFiles = entries
            .filter(e => e.isFile() && e.name.endsWith('.jsonl'))
            .map(e => ({ name: e.name }));

        sendJson(res, 200, { files: jsonlFiles, projectDir: PROJECT_DIR });
    } catch (err) {
        sendJson(res, 500, { error: `Failed to list sessions: ${err.message}` });
    }
}

// ---------------------------------------------------------------------------
// API: GET /api/read?file=<name>&offset=<n>
// ---------------------------------------------------------------------------

function handleReadFile(req, res, url) {
    if (!PROJECT_DIR) {
        return sendJson(res, 500, { error: 'No project directory configured.' });
    }

    const fileName = url.searchParams.get('file');
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);

    if (!fileName) {
        return sendJson(res, 400, { error: 'Missing "file" parameter.' });
    }

    // Sanitize: allow forward-slash-separated relative paths but block
    // directory traversal (no ".." components, no absolute paths)
    const normalized = fileName.replace(/\\/g, '/');
    if (normalized.includes('..') || path.isAbsolute(normalized)) {
        return sendJson(res, 400, { error: 'Invalid filename.' });
    }

    const filePath = path.join(PROJECT_DIR, normalized);

    try {
        const stat = fs.statSync(filePath);

        if (stat.size <= offset) {
            return sendJson(res, 200, { lines: [], newOffset: offset });
        }

        // Read from offset to end of file
        const fd = fs.openSync(filePath, 'r');
        const bufSize = stat.size - offset;
        const buffer = Buffer.alloc(bufSize);
        fs.readSync(fd, buffer, 0, bufSize, offset);
        fs.closeSync(fd);

        const text = buffer.toString('utf-8');
        const lines = text.split('\n').filter(l => l.trim().length > 0);

        sendJson(res, 200, { lines, newOffset: stat.size });
    } catch (err) {
        if (err.code === 'ENOENT') {
            return sendJson(res, 404, { error: 'File not found.' });
        }
        sendJson(res, 500, { error: `Failed to read file: ${err.message}` });
    }
}

// ---------------------------------------------------------------------------
// API: GET /api/subagents?session=<id>
// ---------------------------------------------------------------------------

function handleListSubAgents(req, res, url) {
    if (!PROJECT_DIR) {
        return sendJson(res, 500, { error: 'No project directory configured.' });
    }

    const sessionId = url.searchParams.get('session');
    if (!sessionId) {
        return sendJson(res, 400, { error: 'Missing "session" parameter.' });
    }

    // Sanitize sessionId
    const sanitized = path.basename(sessionId);
    const subagentsDir = path.join(PROJECT_DIR, sanitized, 'subagents');

    try {
        if (!fs.existsSync(subagentsDir)) {
            return sendJson(res, 200, { files: [] });
        }

        const entries = fs.readdirSync(subagentsDir, { withFileTypes: true });
        const files = entries
            .filter(e => e.isFile() && e.name.endsWith('.jsonl'))
            .map(e => {
                const match = e.name.match(/^agent-(.+)\.jsonl$/);
                return {
                    name: e.name,
                    agentId: match ? match[1] : e.name.replace('.jsonl', ''),
                };
            });

        sendJson(res, 200, { files });
    } catch (err) {
        sendJson(res, 500, { error: `Failed to list sub-agents: ${err.message}` });
    }
}

// ---------------------------------------------------------------------------
// Static file serving
// ---------------------------------------------------------------------------

function handleStaticFile(req, res, url) {
    let filePath = url.pathname;

    // Default to index.html
    if (filePath === '/' || filePath === '') {
        filePath = '/index.html';
    }

    // Resolve the file path relative to the static directory
    const fullPath = path.join(STATIC_DIR, filePath);

    // Security check: ensure the resolved path is within STATIC_DIR
    const resolvedPath = path.resolve(fullPath);
    if (!resolvedPath.startsWith(path.resolve(STATIC_DIR))) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden');
        return;
    }

    try {
        if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
            return;
        }

        const ext = path.extname(resolvedPath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        const content = fs.readFileSync(resolvedPath);
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
    } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(`Server error: ${err.message}`);
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sendJson(res, statusCode, data) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data));
}

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

server.listen(PORT, () => {
    console.log('');
    console.log('  WorkChart Office Server');
    console.log('  ========================');
    console.log(`  URL:          http://localhost:${PORT}/`);
    console.log(`  Static dir:   ${STATIC_DIR}`);
    console.log(`  Project dir:  ${PROJECT_DIR || '(not configured)'}`);
    console.log('');
    if (!PROJECT_DIR) {
        console.log('  WARNING: No project directory found.');
        console.log('  Set CLAUDE_PROJECT_DIR environment variable or ensure');
        console.log('  ~/.claude/projects/ exists with project directories.');
        console.log('');
    }
});
