#!/usr/bin/env python3
"""
WorkChart Office — Local Server

Serves the static frontend and provides API endpoints for reading
Claude Code JSONL transcript files across ALL project directories.

Usage:
    python serve.py
    python serve.py --port 8080

No external dependencies — uses only the Python standard library.
"""

import http.server
import json
import os
import re
import socketserver
import sys
import webbrowser
from pathlib import Path
from urllib.parse import urlparse, parse_qs

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

PORT = int(os.environ.get("PORT", 3200))
STATIC_DIR = Path(__file__).parent.resolve()
PROJECTS_BASE = Path.home() / ".claude" / "projects"

MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
}


def project_label(dirname: str) -> str:
    """Derive a short human-friendly label from a project directory name.

    Claude Code encodes paths like C:\\foo\\bar as c--foo-bar (non-alnum → hyphen).
    The drive separator becomes '--' (e.g. C:\\ → 'C--'). After stripping the
    drive prefix, we take the last ~25 characters worth of hyphen-separated parts.
    """
    # Strip drive prefix (everything up to and including '--')
    idx = dirname.find("--")
    tail = dirname[idx + 2:] if idx >= 0 else dirname

    if not tail:
        return dirname

    # If it's short enough, use it as-is
    if len(tail) <= 25:
        return tail

    # Otherwise, take the last few hyphen-separated parts up to ~25 chars
    parts = tail.split("-")
    trailing = []
    for p in reversed(parts):
        candidate = "-".join([p] + trailing)
        if len(candidate) > 25 and trailing:
            break
        trailing.insert(0, p)
    return "-".join(trailing) if trailing else tail[-25:]

# ---------------------------------------------------------------------------
# Request handler
# ---------------------------------------------------------------------------

class WorkChartHandler(http.server.BaseHTTPRequestHandler):
    """Handle static files and API endpoints."""

    def log_message(self, format, *args):
        """Suppress default request logging for cleaner output."""
        pass

    def send_json(self, code: int, data: dict):
        body = json.dumps(data).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_file(self, filepath: Path):
        ext = filepath.suffix.lower()
        content_type = MIME_TYPES.get(ext, "application/octet-stream")
        data = filepath.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def send_text(self, code: int, msg: str):
        body = msg.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    # -- Routing ----------------------------------------------------------

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        params = parse_qs(parsed.query)

        if path == "/api/projects":
            return self.handle_projects()
        if path == "/api/sessions":
            return self.handle_sessions(params)
        if path == "/api/read":
            return self.handle_read(params)
        if path == "/api/subagents":
            return self.handle_subagents(params)

        # Static file
        self.handle_static(path)

    # -- Helpers ----------------------------------------------------------

    def _resolve_project_dir(self, project_name: str) -> Path | None:
        """Safely resolve a project subdirectory under PROJECTS_BASE."""
        if not project_name or ".." in project_name or os.path.isabs(project_name):
            return None
        d = PROJECTS_BASE / project_name
        return d if d.is_dir() else None

    # -- API: /api/projects -----------------------------------------------

    def handle_projects(self):
        if not PROJECTS_BASE.is_dir():
            return self.send_json(200, {"projects": []})

        try:
            projects = []
            for d in sorted(PROJECTS_BASE.iterdir()):
                if d.is_dir():
                    projects.append({
                        "name": d.name,
                        "label": project_label(d.name),
                    })
            self.send_json(200, {"projects": projects})
        except Exception as e:
            self.send_json(500, {"error": f"Failed to list projects: {e}"})

    # -- API: /api/sessions?project=<name> --------------------------------

    def handle_sessions(self, params):
        if not PROJECTS_BASE.is_dir():
            return self.send_json(200, {"files": []})

        project_name = params.get("project", [None])[0]

        try:
            files = []
            if project_name:
                # Single project
                proj_dir = self._resolve_project_dir(project_name)
                if proj_dir:
                    for f in proj_dir.iterdir():
                        if f.is_file() and f.suffix == ".jsonl":
                            files.append({"name": f.name, "project": project_name})
            else:
                # All projects
                for d in PROJECTS_BASE.iterdir():
                    if not d.is_dir():
                        continue
                    try:
                        for f in d.iterdir():
                            if f.is_file() and f.suffix == ".jsonl":
                                files.append({"name": f.name, "project": d.name})
                    except PermissionError:
                        continue

            self.send_json(200, {"files": files})
        except Exception as e:
            self.send_json(500, {"error": f"Failed to list sessions: {e}"})

    # -- API: /api/read?project=<name>&file=<name>&offset=<n> -------------

    def handle_read(self, params):
        project_name = params.get("project", [None])[0]
        file_name = params.get("file", [None])[0]
        offset = int(params.get("offset", [0])[0])

        if not project_name:
            return self.send_json(400, {"error": "Missing 'project' parameter."})
        if not file_name:
            return self.send_json(400, {"error": "Missing 'file' parameter."})

        proj_dir = self._resolve_project_dir(project_name)
        if not proj_dir:
            return self.send_json(404, {"error": "Project not found."})

        # Sanitize: allow relative paths but block traversal
        normalized = file_name.replace("\\", "/")
        if ".." in normalized or os.path.isabs(normalized):
            return self.send_json(400, {"error": "Invalid filename."})

        file_path = proj_dir / normalized

        try:
            size = file_path.stat().st_size
            if size <= offset:
                return self.send_json(200, {"lines": [], "newOffset": offset})

            with open(file_path, "r", encoding="utf-8") as f:
                f.seek(offset)
                text = f.read()

            lines = [ln for ln in text.split("\n") if ln.strip()]
            self.send_json(200, {"lines": lines, "newOffset": size})
        except FileNotFoundError:
            self.send_json(404, {"error": "File not found."})
        except Exception as e:
            self.send_json(500, {"error": f"Failed to read file: {e}"})

    # -- API: /api/subagents?project=<name>&session=<id> ------------------

    def handle_subagents(self, params):
        project_name = params.get("project", [None])[0]
        session_id = params.get("session", [None])[0]

        if not project_name:
            return self.send_json(400, {"error": "Missing 'project' parameter."})
        if not session_id:
            return self.send_json(400, {"error": "Missing 'session' parameter."})

        proj_dir = self._resolve_project_dir(project_name)
        if not proj_dir:
            return self.send_json(200, {"files": []})

        # Sanitize session ID
        sanitized = os.path.basename(session_id)
        subagents_dir = proj_dir / sanitized / "subagents"

        try:
            if not subagents_dir.is_dir():
                return self.send_json(200, {"files": []})

            files = []
            for f in subagents_dir.iterdir():
                if f.is_file() and f.suffix == ".jsonl":
                    m = re.match(r"^agent-(.+)\.jsonl$", f.name)
                    files.append({
                        "name": f.name,
                        "agentId": m.group(1) if m else f.stem,
                    })

            self.send_json(200, {"files": files})
        except Exception as e:
            self.send_json(500, {"error": f"Failed to list sub-agents: {e}"})

    # -- Static files -----------------------------------------------------

    def handle_static(self, url_path: str):
        if url_path in ("/", ""):
            url_path = "/index.html"

        # Resolve and verify the path is within STATIC_DIR
        try:
            file_path = (STATIC_DIR / url_path.lstrip("/")).resolve()
        except (ValueError, OSError):
            return self.send_text(400, "Bad request")

        if not str(file_path).startswith(str(STATIC_DIR)):
            return self.send_text(403, "Forbidden")

        if not file_path.is_file():
            return self.send_text(404, "Not Found")

        self.send_file(file_path)

# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    global PORT

    # Simple arg parsing
    args = sys.argv[1:]
    i = 0
    while i < len(args):
        if args[i] in ("--port", "-p") and i + 1 < len(args):
            PORT = int(args[i + 1])
            i += 2
        elif args[i] in ("--help", "-h"):
            print("Usage: python serve.py [--port PORT]")
            print()
            print("Options:")
            print("  --port, -p PORT    Server port (default: 3200)")
            print()
            print("Monitors all projects under ~/.claude/projects/")
            sys.exit(0)
        else:
            print(f"Unknown argument: {args[i]}")
            sys.exit(1)

    # Discover projects
    project_count = 0
    if PROJECTS_BASE.is_dir():
        project_dirs = [d for d in PROJECTS_BASE.iterdir() if d.is_dir()]
        project_count = len(project_dirs)

    print()
    print("  WorkChart Office")
    print("  ================")
    print(f"  URL:          http://localhost:{PORT}/")
    print(f"  Static dir:   {STATIC_DIR}")
    print(f"  Projects dir: {PROJECTS_BASE}")
    print(f"  Projects:     {project_count} found")
    if PROJECTS_BASE.is_dir():
        for d in sorted(PROJECTS_BASE.iterdir()):
            if d.is_dir():
                print(f"                  - {project_label(d.name)} ({d.name})")
    print()

    if not PROJECTS_BASE.is_dir():
        print("  WARNING: ~/.claude/projects/ does not exist.")
        print("  No sessions will be available until Claude Code creates projects.")
        print()

    class ThreadedHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
        daemon_threads = True

    server = ThreadedHTTPServer(("", PORT), WorkChartHandler)

    # Open browser automatically
    webbrowser.open(f"http://localhost:{PORT}/")

    try:
        print(f"  Listening on port {PORT} (Ctrl+C to stop)")
        print()
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Shutting down.")
        server.shutdown()


if __name__ == "__main__":
    main()
