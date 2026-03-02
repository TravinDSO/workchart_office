/**
 * serve.js — Minimal Node.js HTTP Server for WorkChart Office
 *
 * Serves the static frontend and provides API endpoints for reading
 * Claude Code JSONL transcript files across ALL project directories.
 *
 * No external dependencies — uses only Node.js built-in modules.
 *
 * Usage:
 *   node serve.js
 *   node serve.js --port 8080
 *
 * Environment variables:
 *   PORT — Server port (default: 3200)
 *
 * Configuration:
 *   Place a workchart.config.json file in the same directory as this script
 *   to override defaults:
 *     {
 *       "projectsPath": "/custom/path/to/.claude/projects",
 *       "port": 3200
 *     }
 *   All fields are optional. CLI arguments override config file values.
 *
 * API Endpoints:
 *   GET /api/projects                              — List all project directories
 *   GET /api/sessions?project=<name>               — List .jsonl files (all projects if omitted)
 *   GET /api/read?project=<name>&file=X&offset=N   — Read new lines from a file starting at offset
 *   GET /api/subagents?project=<name>&session=ID   — List sub-agent files for a session
 *   GET /*                                         — Serve static files
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Directory containing the static web files (same directory as this script) */
const STATIC_DIR = __dirname;

/**
 * Load optional workchart.config.json from the same directory as this script.
 * @returns {object}
 */
function loadConfig() {
    const configPath = path.join(STATIC_DIR, 'workchart.config.json');
    try {
        if (fs.existsSync(configPath)) {
            return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        }
    } catch (err) {
        console.log(`  WARNING: Failed to read ${configPath}: ${err.message}`);
    }
    return {};
}

const _config = loadConfig();

let PORT = parseInt(process.env.PORT, 10) || _config.port || 3200;

/**
 * Resolve projectsPath: config value (with ~ expansion) or default.
 * @type {string}
 */
const _configuredPath = _config.projectsPath || null;
const PROJECTS_BASE = _configuredPath
    ? path.resolve(_configuredPath.replace(/^~(?=[/\\]|$)/, os.homedir()))
    : path.join(os.homedir(), '.claude', 'projects');

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
// Helpers
// ---------------------------------------------------------------------------

/**
 * Derive a short human-friendly label from a project directory name.
 *
 * Claude Code encodes paths like C:\foo\bar as c--foo-bar (non-alnum → hyphen).
 * The drive separator becomes '--' (e.g. C:\ → 'C--'). After stripping the
 * drive prefix, we take the last ~25 characters worth of hyphen-separated parts.
 *
 * @param {string} dirname
 * @returns {string}
 */
function projectLabel(dirname) {
    // Strip drive prefix (everything up to and including '--')
    const idx = dirname.indexOf('--');
    const tail = idx >= 0 ? dirname.slice(idx + 2) : dirname;

    if (!tail) return dirname;

    // If it's short enough, use it as-is
    if (tail.length <= 25) return tail;

    // Otherwise, take the last few hyphen-separated parts up to ~25 chars
    const parts = tail.split('-');
    const trailing = [];
    for (let i = parts.length - 1; i >= 0; i--) {
        const candidate = [parts[i], ...trailing].join('-');
        if (candidate.length > 25 && trailing.length > 0) break;
        trailing.unshift(parts[i]);
    }
    return trailing.length > 0 ? trailing.join('-') : tail.slice(-25);
}

/**
 * Send a JSON response with CORS headers.
 */
function sendJson(res, statusCode, data) {
    const body = JSON.stringify(data);
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Content-Length': Buffer.byteLength(body),
    });
    res.end(body);
}

/**
 * Send a plain text response.
 */
function sendText(res, statusCode, msg) {
    const body = Buffer.from(msg, 'utf-8');
    res.writeHead(statusCode, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Length': body.length,
    });
    res.end(body);
}

/**
 * Safely resolve a project subdirectory under PROJECTS_BASE.
 * Returns the full path string if valid, or null.
 *
 * @param {string} projectName
 * @returns {string|null}
 */
function resolveProjectDir(projectName) {
    if (!projectName || projectName.includes('..') || path.isAbsolute(projectName)) {
        return null;
    }
    const d = path.join(PROJECTS_BASE, projectName);
    try {
        const stat = fs.statSync(d);
        return stat.isDirectory() ? d : null;
    } catch {
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
    if (url.pathname === '/api/projects') {
        return handleListProjects(req, res);
    }
    if (url.pathname === '/api/sessions') {
        return handleListSessions(req, res, url);
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
// API: GET /api/projects
// ---------------------------------------------------------------------------

function handleListProjects(req, res) {
    if (!fs.existsSync(PROJECTS_BASE)) {
        return sendJson(res, 200, { projects: [] });
    }

    try {
        const entries = fs.readdirSync(PROJECTS_BASE, { withFileTypes: true });
        const projects = entries
            .filter(e => e.isDirectory())
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(e => ({
                name: e.name,
                label: projectLabel(e.name),
            }));

        sendJson(res, 200, { projects });
    } catch (err) {
        sendJson(res, 500, { error: `Failed to list projects: ${err.message}` });
    }
}

// ---------------------------------------------------------------------------
// API: GET /api/sessions?project=<name>
// ---------------------------------------------------------------------------

function handleListSessions(req, res, url) {
    if (!fs.existsSync(PROJECTS_BASE)) {
        return sendJson(res, 200, { files: [] });
    }

    const projectName = url.searchParams.get('project');

    try {
        const files = [];

        if (projectName) {
            // Single project
            const projDir = resolveProjectDir(projectName);
            if (projDir) {
                const entries = fs.readdirSync(projDir, { withFileTypes: true });
                for (const e of entries) {
                    if (e.isFile() && e.name.endsWith('.jsonl')) {
                        const stat = fs.statSync(path.join(projDir, e.name));
                        files.push({
                            name: e.name,
                            project: projectName,
                            mtime: stat.mtimeMs,
                        });
                    }
                }
            }
        } else {
            // All projects
            const projEntries = fs.readdirSync(PROJECTS_BASE, { withFileTypes: true });
            for (const d of projEntries) {
                if (!d.isDirectory()) continue;
                const projDir = path.join(PROJECTS_BASE, d.name);
                try {
                    const entries = fs.readdirSync(projDir, { withFileTypes: true });
                    for (const e of entries) {
                        if (e.isFile() && e.name.endsWith('.jsonl')) {
                            const stat = fs.statSync(path.join(projDir, e.name));
                            files.push({
                                name: e.name,
                                project: d.name,
                                mtime: stat.mtimeMs,
                            });
                        }
                    }
                } catch {
                    // Permission error — skip this project
                    continue;
                }
            }
        }

        sendJson(res, 200, { files });
    } catch (err) {
        sendJson(res, 500, { error: `Failed to list sessions: ${err.message}` });
    }
}

// ---------------------------------------------------------------------------
// API: GET /api/read?project=<name>&file=<name>&offset=<n>
// ---------------------------------------------------------------------------

function handleReadFile(req, res, url) {
    const projectName = url.searchParams.get('project');
    const fileName = url.searchParams.get('file');
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);

    if (!projectName) {
        return sendJson(res, 400, { error: "Missing 'project' parameter." });
    }
    if (!fileName) {
        return sendJson(res, 400, { error: "Missing 'file' parameter." });
    }

    const projDir = resolveProjectDir(projectName);
    if (!projDir) {
        return sendJson(res, 404, { error: 'Project not found.' });
    }

    // Sanitize: allow forward-slash-separated relative paths but block
    // directory traversal (no ".." components, no absolute paths)
    const normalized = fileName.replace(/\\/g, '/');
    if (normalized.includes('..') || path.isAbsolute(normalized)) {
        return sendJson(res, 400, { error: 'Invalid filename.' });
    }

    const filePath = path.join(projDir, normalized);

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
// API: GET /api/subagents?project=<name>&session=<id>
// ---------------------------------------------------------------------------

function handleListSubAgents(req, res, url) {
    const projectName = url.searchParams.get('project');
    const sessionId = url.searchParams.get('session');

    if (!projectName) {
        return sendJson(res, 400, { error: "Missing 'project' parameter." });
    }
    if (!sessionId) {
        return sendJson(res, 400, { error: "Missing 'session' parameter." });
    }

    const projDir = resolveProjectDir(projectName);
    if (!projDir) {
        return sendJson(res, 200, { files: [] });
    }

    // Sanitize session ID
    const sanitized = path.basename(sessionId);
    const subagentsDir = path.join(projDir, sanitized, 'subagents');

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
        return sendText(res, 403, 'Forbidden');
    }

    try {
        if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) {
            return sendText(res, 404, 'Not Found');
        }

        const ext = path.extname(resolvedPath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        const content = fs.readFileSync(resolvedPath);
        res.writeHead(200, {
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*',
            'Content-Length': content.length,
        });
        res.end(content);
    } catch (err) {
        sendText(res, 500, `Server error: ${err.message}`);
    }
}

// ---------------------------------------------------------------------------
// CLI argument parsing & startup
// ---------------------------------------------------------------------------

function main() {
    // Simple arg parsing
    const args = process.argv.slice(2);
    let i = 0;
    while (i < args.length) {
        if ((args[i] === '--port' || args[i] === '-p') && i + 1 < args.length) {
            PORT = parseInt(args[i + 1], 10);
            i += 2;
        } else if (args[i] === '--help' || args[i] === '-h') {
            console.log('Usage: node serve.js [--port PORT]');
            console.log('');
            console.log('Options:');
            console.log('  --port, -p PORT    Server port (default: 3200)');
            console.log('');
            console.log('Monitors all projects under ~/.claude/projects/');
            console.log('');
            console.log('Configuration:');
            console.log('  Place workchart.config.json in the same directory as serve.js');
            console.log('  to override the projects path or default port:');
            console.log('    { "projectsPath": "/path/to/.claude/projects", "port": 3200 }');
            process.exit(0);
        } else {
            console.log(`Unknown argument: ${args[i]}`);
            process.exit(1);
        }
    }

    // Discover projects
    let projectCount = 0;
    if (fs.existsSync(PROJECTS_BASE)) {
        const entries = fs.readdirSync(PROJECTS_BASE, { withFileTypes: true });
        const projectDirs = entries.filter(e => e.isDirectory());
        projectCount = projectDirs.length;
    }

    server.listen(PORT, () => {
        const projectsSrc = _configuredPath ? '(from config)' : '(default)';
        console.log('');
        console.log('  WorkChart Office');
        console.log('  ================');
        console.log(`  URL:          http://localhost:${PORT}/`);
        console.log(`  Static dir:   ${STATIC_DIR}`);
        console.log(`  Projects dir: ${PROJECTS_BASE}  ${projectsSrc}`);
        console.log(`  Projects:     ${projectCount} found`);
        if (fs.existsSync(PROJECTS_BASE)) {
            const entries = fs.readdirSync(PROJECTS_BASE, { withFileTypes: true });
            for (const d of entries.filter(e => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
                console.log(`                  - ${projectLabel(d.name)} (${d.name})`);
            }
        }
        console.log('');

        if (!fs.existsSync(PROJECTS_BASE)) {
            console.log('  WARNING: ~/.claude/projects/ does not exist.');
            console.log('  No sessions will be available until Claude Code creates projects.');
            console.log('');
        }

        console.log(`  Listening on port ${PORT} (Ctrl+C to stop)`);
        console.log('');
    });
}

main();
