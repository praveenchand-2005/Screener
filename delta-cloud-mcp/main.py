"""Authenticated Delta Exchange India MCP wrapper.

Production is read-only: all order-changing tools are removed before serving.
Supports Auth0-issued bearer tokens and a legacy high-entropy service token.
"""
from __future__ import annotations

import hmac
import os
from functools import lru_cache
from typing import Any
from urllib.parse import urlparse

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

os.environ["DELTA_MCP_ENV"] = "india_prod"

from delta_exchange_mcp import config as config_mod
from delta_exchange_mcp.server import build_server
from delta_exchange_mcp.tools import trading

config_mod.BASE_URLS["india_prod"] = "https://api.india.delta.exchange/v2"

APP_NAME = "Delta Exchange India (production, read-only)"
MCP_AUTH_TOKEN = os.getenv("MCP_AUTH_TOKEN", "").strip()
AUTH0_DOMAIN = os.getenv("AUTH0_DOMAIN", "").strip().rstrip("/")
AUTH0_AUDIENCE = os.getenv("AUTH0_AUDIENCE", "").strip()
PUBLIC_BASE_URL = os.getenv(
    "PUBLIC_BASE_URL", "https://delta-cloud-mcp-demo.onrender.com"
).strip().rstrip("/")
ALLOW_ORDER_EXECUTION = False

METADATA_PATHS = {
    "/.well-known/oauth-protected-resource",
    "/.well-known/oauth-protected-resource/mcp",
    "/mcp/.well-known/oauth-protected-resource",
}


def auth0_configured() -> bool:
    return bool(AUTH0_DOMAIN and AUTH0_AUDIENCE)


def auth_configured() -> bool:
    return len(MCP_AUTH_TOKEN) >= 32 or auth0_configured()


def auth0_issuer() -> str:
    domain = AUTH0_DOMAIN
    if domain and not domain.startswith(("https://", "http://")):
        domain = "https://" + domain
    return domain.rstrip("/") + "/" if domain else ""


@lru_cache(maxsize=1)
def jwks_client():
    if not auth0_configured():
        return None
    from jwt import PyJWKClient
    return PyJWKClient(auth0_issuer() + ".well-known/jwks.json", cache_jwk_set=True)


def valid_auth0_token(token: str) -> bool:
    if not auth0_configured() or not token:
        return False
    try:
        import jwt
        signing_key = jwks_client().get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            audience=AUTH0_AUDIENCE,
            issuer=auth0_issuer(),
            options={"require": ["exp", "iat", "iss", "aud"]},
        )
        return bool(claims.get("sub"))
    except Exception:
        # Fail closed for invalid, expired, wrong-issuer, or wrong-audience tokens.
        return False


def protected_resource_metadata() -> dict[str, Any]:
    issuer = auth0_issuer()
    result: dict[str, Any] = {
        "resource": PUBLIC_BASE_URL + "/mcp",
        "authorization_servers": [issuer] if issuer else [],
        "bearer_methods_supported": ["header"],
    }
    if auth0_configured():
        result["scopes_supported"] = ["openid", "profile", "offline_access"]
    return result


async def auth_middleware(request: Request, call_next: Any) -> Response:
    path = request.url.path
    # Discovery must be publicly readable so OAuth clients can find the issuer.
    if path in {"/", "/health"} or path in METADATA_PATHS:
        return await call_next(request)

    if not auth_configured():
        return JSONResponse({"error": "server_auth_not_configured"}, status_code=503)

    authorization = request.headers.get("authorization", "")
    bearer = ""
    if authorization.lower().startswith("bearer "):
        bearer = authorization[7:].strip()

    # Prefer validating an Auth0 JWT. A failed JWT never grants access.
    if bearer and valid_auth0_token(bearer):
        return await call_next(request)

    # Preserve the existing high-entropy service-token path for existing clients.
    candidate = request.headers.get("x-mcp-api-key", "").strip()
    if not candidate and bearer:
        candidate = bearer
    if candidate and len(MCP_AUTH_TOKEN) >= 32 and hmac.compare_digest(candidate, MCP_AUTH_TOKEN):
        return await call_next(request)

    metadata_url = PUBLIC_BASE_URL + "/.well-known/oauth-protected-resource"
    return JSONResponse(
        {"error": "unauthorized"},
        status_code=401,
        headers={"WWW-Authenticate": f'Bearer resource_metadata="{metadata_url}"'},
    )


cfg = config_mod.load()
mcp = build_server(cfg)

# Fail-safe read-only lock: remove every order-changing tool.
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
        "auth0_configured": auth0_configured(),
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


async def oauth_protected_resource(request: Request) -> JSONResponse:
    return JSONResponse(protected_resource_metadata())


app.add_route("/health", health, methods=["GET"])
app.add_route("/", root, methods=["GET"])
for metadata_path in METADATA_PATHS:
    app.add_route(metadata_path, oauth_protected_resource, methods=["GET"])
