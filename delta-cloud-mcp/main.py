"""Authenticated remote wrapper for the official Delta Exchange MCP.

This deployment is permanently locked to Delta India testnet. Trading tools remain
hidden unless a later, explicit demo-validation change enables them.
"""
from __future__ import annotations

import hmac
import os
from typing import Any

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

# Default safely to testnet and refuse a production environment.
os.environ.setdefault("DELTA_MCP_ENV", "india_testnet")
if os.getenv("DELTA_MCP_ENV", "").strip().lower() != "india_testnet":
    raise RuntimeError("This remote deployment is locked to india_testnet.")

from delta_exchange_mcp import config as config_mod
from delta_exchange_mcp.server import build_server
from delta_exchange_mcp.tools import trading

APP_NAME = "Delta Exchange Official MCP (testnet)"
MCP_AUTH_TOKEN = os.getenv("MCP_AUTH_TOKEN", "").strip()
ALLOW_ORDER_EXECUTION = os.getenv("ALLOW_ORDER_EXECUTION", "false").strip().lower() == "true"


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


# Build with the official Delta MCP package, so its request signing and API endpoint
# handling are maintained by Delta rather than reimplemented here.
cfg = config_mod.load()
mcp = build_server(cfg)

# Do not expose order-changing tools in this initial deployment. Public market data and
# authenticated account reads are allowed; order tools can be reviewed after demo validation.
if not ALLOW_ORDER_EXECUTION:
    for tool_name in trading.TOOL_NAMES:
        mcp.remove_tool(tool_name)

app = mcp.streamable_http_app()
app.add_middleware(BaseHTTPMiddleware, dispatch=auth_middleware)


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
