"""Authenticated remote wrapper for Delta Exchange Global production.

This deployment is locked to Global production and read-only account inspection.
"""
from __future__ import annotations

import hmac
import os
from typing import Any

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

os.environ.setdefault("DELTA_MCP_ENV", "global_prod")
if os.getenv("DELTA_MCP_ENV", "").strip().lower() != "global_prod":
    raise RuntimeError("This remote deployment is locked to global_prod.")

from delta_exchange_mcp import config as config_mod
from delta_exchange_mcp.server import build_server
from delta_exchange_mcp.tools import trading

# Upstream package lists India environments only; add Global production endpoint.
config_mod.BASE_URLS["global_prod"] = "https://api.delta.exchange/v2"

APP_NAME = "Delta Exchange Official MCP (Global production, read-only)"
MCP_AUTH_TOKEN = os.getenv("MCP_AUTH_TOKEN", "").strip()
# Hard lock: never expose order-changing tools on this service.
ALLOW_ORDER_EXECUTION = False


def auth_configured() -> bool:
    return len(MCP_AUTH_TOKEN) >= 32


async def auth_middleware(request: Request, call_next: Any) -> Response:
    if request.url.path in {"/", "/health"}:
        return await call_next(request)
    if not auth_configured():
        return JSONResponse({"error": "server_auth_not_configured"}, status_code=503)
    candidate = request.headers.get("x-mcp-api-key", "").strip()
    authorization = request.headers.get("authorization", "")
    if not candidate and authorization.lower().startswith("bearer "):
        candidate = authorization[7:].strip()
    if not candidate or not hmac.compare_digest(candidate, MCP_AUTH_TOKEN):
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    return await call_next(request)


cfg = config_mod.load()
mcp = build_server(cfg)

# Preserve read-only account tools (positions/balances); remove order-changing tools.
if cfg.has_credentials:
    for tool_name in trading.TOOL_NAMES:
        mcp.remove_tool(tool_name)

app = mcp.streamable_http_app()


async def health(request: Request) -> JSONResponse:
    return JSONResponse({
        "status": "ok",
        "service": APP_NAME,
        "environment": cfg.env,
        "auth_configured": auth_configured(),
        "account_credentials_configured": cfg.has_credentials,
        "order_execution_enabled": False,
        "transport": "streamable-http",
    })


async def root(request: Request) -> JSONResponse:
    return JSONResponse({
        "service": APP_NAME,
        "status": "running",
        "mcp_endpoint": "/mcp",
        "environment": cfg.env,
        "order_execution": "disabled",
    })


app.add_route("/health", health, methods=["GET"])
app.add_route("/", root, methods=["GET"])
