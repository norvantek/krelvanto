"""Vercel Python entrypoint for WindDesk.

Vercel's file-based Python functions map this file to the /api route (see
vercel.json, which rewrites /api/* to this function so the FastAPI app's
own /api/* routes receive their paths intact). The top-level ``app`` name
is the ASGI application Vercel loads.

The application itself lives in backend/main.py (shared with the local /
Docker deployment, which runs it directly under uvicorn). This shim only
makes that module importable from the project-root layout used by the
serverless bundle, then re-exports its FastAPI app:

- Local/Docker layout:  backend/main.py run by uvicorn (unchanged).
- Vercel layout:        api/index.py (this file) -> backend/main.py,
                        with data/*.csv and backend/** included in the
                        function bundle via vercel.json `includeFiles`.
"""

import os
import sys

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

try:
    from backend.main import app
except ImportError:  # Fallback: load by file path if package import fails.
    import importlib.util

    _spec = importlib.util.spec_from_file_location(
        "winddesk_backend_main", os.path.join(PROJECT_ROOT, "backend", "main.py")
    )
    _module = importlib.util.module_from_spec(_spec)
    _spec.loader.exec_module(_module)
    app = _module.app

__all__ = ["app"]
