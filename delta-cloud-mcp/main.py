import hashlib
import hmac
import json
import os
import time
from typing import Any
from urllib.parse import urlencode

import requests
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response

APP_NAME = "Delta Exchange Cloud MCP"
APP_VERSION = "0.1.0"
ENVIRONMENT = os.getenv("DELTA_MCP_ENV", "india_testnet").strip().lower()
BASE_URLS = {
    "india_testnet": "https://cdn-ind.testnet.deltaex.org",
    "india_prod": "https://api.india.delta.exchange",
}
BASE_URL = BASE_URLS.get(ENVIRONMENT, BASE_URLS["india_testnet"])
API_KEY = os.getenv("DELTA_API_KEY", "")
API_SECRET = os.getenv("DELTA_API_SECRET", "")
MCP_AUTH_TOKEN = os.getenv("MCP_AUTH_TOKEN", "")
ALLOW_ORDER_EXECUTION = os.getenv("ALLOW_ORDER_EXECUTION", "false").lower() == "true"
MAX_ORDER_SIZE = max(1, int(os.getenv("MAX_ORDER_SIZE", "10")))
HTTP_TIMEOUT = float(os.getenv("DELTA_HTTP_TIMEOUT", "10"))

app = FastAPI(title=APP_NAME, version=APP_VERSION)


def configured_auth() -> bool:
    return bool(MCP_AUTH_TOKEN and len(MCP_AUTH_TOKEN) >= 32 and MCP_AUTH_TOKEN not in {"CHANGE_ME_SET_IN_RENDER", "replace-me"})


def auth_ok(request: Request) -> bool:
    if not configured_auth():
        return False
    supplied = request.headers.get("authorization", "")
    if not supplied.lower().startswith("bearer "):
        return False
    candidate = supplied[7:].strip()
    return hmac.compare_digest(candidate, MCP_AUTH_TOKEN)


def delta_request(method: str, path: str, params: dict[str, Any] | None = None, body: dict[str, Any] | None = None, private: bool = False) -> Any:
    params = params or {}
    # Stable query serialization is used both for the URL and signature.
    query = urlencode(sorted((str(k), str(v)) for k, v in params.items()), doseq=True)
    signed_path = path + (("?" + query) if query else "")
    body_text = json.dumps(body, separators=(",", ":"), ensure_ascii=False) if body is not None else ""
    headers = {"Accept": "application/json", "Content-Type": "application/json"}
    if private:
        if not API_KEY or not API_SECRET:
            raise RuntimeError("Delta demo API credentials are not configured in Render.")
        timestamp = str(int(time.time()))
        signature_payload = method.upper() + timestamp + signed_path + body_text
        signature = hmac.new(API_SECRET.encode(), signature_payload.encode(), hashlib.sha256).hexdigest()
        headers.update({"api-key": API_KEY, "timestamp": timestamp, "signature": signature})
    url = BASE_URL + signed_path
    response = requests.request(
        method.upper(), url, headers=headers,
        data=body_text if body is not None else None,
        timeout=HTTP_TIMEOUT,
    )
    try:
        payload = response.json()
    except ValueError:
        payload = {"raw": response.text[:1000]}
    if not response.ok or (isinstance(payload, dict) and payload.get("success") is False):
        raise RuntimeError(json.dumps({"http_status": response.status_code, "delta_response": payload}, ensure_ascii=False))
    return payload


TOOLS = [
    {"name": "get_connection_status", "description": "Show safe configuration status. Never returns credentials or their fingerprints.",
     "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False}},
    {"name": "get_ticker", "description": "Fetch public ticker data for one Delta product symbol, for example BTCUSD. No API key required.",
     "inputSchema": {"type": "object", "properties": {"symbol": {"type": "string", "minLength": 1, "maxLength": 40}}, "required": ["symbol"], "additionalProperties": False}},
    {"name": "scan_market", "description": "Scan public perpetual-futures tickers. Optionally filter to a list of symbols. This returns market data only and never places trades.",
     "inputSchema": {"type": "object", "properties": {"symbols": {"type": "array", "items": {"type": "string"}, "maxItems": 30}, "limit": {"type": "integer", "minimum": 1, "maximum": 100}}, "additionalProperties": False}},
    {"name": "get_wallet_balances", "description": "Read wallet balances for the configured Delta environment. Requires a matching API key with Read Data permission.",
     "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False}},
    {"name": "get_open_positions", "description": "Read all margined open positions for the configured Delta environment. Requires a matching API key with Read Data permission.",
     "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False}},
    {"name": "place_bracket_order", "description": "Place a demo order with BOTH stop-loss and take-profit attached. Execution is disabled unless the service is in india_testnet, demo credentials are configured, and ALLOW_ORDER_EXECUTION=true. Size is contracts and capped by MAX_ORDER_SIZE.",
     "inputSchema": {"type": "object", "properties": {
       "symbol": {"type": "string", "minLength": 1, "maxLength": 40},
       "side": {"type": "string", "enum": ["buy", "sell"]},
       "order_type": {"type": "string", "enum": ["market_order", "limit_order"]},
       "size": {"type": "integer", "minimum": 1},
       "limit_price": {"type": "string", "pattern": "^[0-9]+(\\.[0-9]+)?$"},
       "stop_loss_price": {"type": "string", "pattern": "^[0-9]+(\\.[0-9]+)?$"},
       "take_profit_price": {"type": "string", "pattern": "^[0-9]+(\\.[0-9]+)?$"},
       "stop_trigger_method": {"type": "string", "enum": ["mark_price", "last_traded_price", "spot_price"]}
     }, "required": ["symbol", "side", "order_type", "size", "stop_loss_price", "take_profit_price"], "additionalProperties": False}},
    {"name": "cancel_order", "description": "Cancel a specific order by its Delta order ID in the configured environment. Requires a matching Trading API key; demo environment only.",
     "inputSchema": {"type": "object", "properties": {"order_id": {"type": "integer", "minimum": 1}, "product_id": {"type": "integer", "minimum": 1}}, "required": ["order_id", "product_id"], "additionalProperties": False}},
]


def run_tool(name: str, args: dict[str, Any]) -> Any:
    if name == "get_connection_status":
        return {
            "service": APP_NAME, "version": APP_VERSION,
            "environment": ENVIRONMENT,
            "base_url": BASE_URL,
            "mcp_auth_configured": configured_auth(),
            "delta_api_key_configured": bool(API_KEY),
            "delta_api_secret_configured": bool(API_SECRET),
            "order_execution_enabled": ALLOW_ORDER_EXECUTION and ENVIRONMENT == "india_testnet",
            "max_order_size_contracts": MAX_ORDER_SIZE,
            "live_trading_supported_by_this_deployment": False,
        }
    if name == "get_ticker":
        symbol = args["symbol"].strip().upper()
        if not symbol.replace("_", "").replace("-", "").isalnum():
            raise ValueError("Invalid product symbol.")
        return delta_request("GET", "/v2/tickers/" + symbol)
    if name == "scan_market":
        limit = int(args.get("limit", 50))
        payload = delta_request("GET", "/v2/tickers", {"contract_types": "perpetual_futures"})
        rows = payload.get("result", [])
        if isinstance(rows, dict):
            rows = rows.get("tickers", rows.get("data", []))
        wanted = {str(s).strip().upper() for s in args.get("symbols", [])}
        if wanted:
            rows = [row for row in rows if str(row.get("symbol", "")).upper() in wanted]
        return {"environment": ENVIRONMENT, "count": min(len(rows), limit), "tickers": rows[:limit]}
    if name == "get_wallet_balances":
        return delta_request("GET", "/v2/wallet/balances", private=True)
    if name == "get_open_positions":
        return delta_request("GET", "/v2/positions/margined", private=True)
    if name == "place_bracket_order":
        if ENVIRONMENT != "india_testnet":
            raise RuntimeError("This deployment is locked to demo/testnet; live trading is disabled.")
        if not ALLOW_ORDER_EXECUTION:
            raise RuntimeError("Demo order execution is disabled. Set ALLOW_ORDER_EXECUTION=true only after demo credentials are installed and reviewed.")
        if not API_KEY or not API_SECRET:
            raise RuntimeError("Demo API credentials are not configured.")
        size = int(args["size"])
        if size < 1 or size > MAX_ORDER_SIZE:
            raise ValueError(f"size must be between 1 and {MAX_ORDER_SIZE} contracts.")
        side = args["side"]
        order_type = args["order_type"]
        sl = float(args["stop_loss_price"])
        tp = float(args["take_profit_price"])
        if sl <= 0 or tp <= 0 or sl == tp:
            raise ValueError("Stop-loss and take-profit must be positive and different.")
        if (side == "buy" and sl >= tp) or (side == "sell" and sl <= tp):
            raise ValueError("Bracket direction is inconsistent: buy requires stop-loss < take-profit; sell requires stop-loss > take-profit.")
        order = {
            "product_symbol": args["symbol"].strip().upper(),
            "side": side,
            "order_type": order_type,
            "size": size,
            "bracket_stop_loss_price": str(args["stop_loss_price"]),
            "bracket_take_profit_price": str(args["take_profit_price"]),
            "bracket_stop_trigger_method": args.get("stop_trigger_method", "mark_price"),
        }
        if order_type == "limit_order":
            if not args.get("limit_price"):
                raise ValueError("limit_price is required for limit_order.")
            limit_price = float(args["limit_price"])
            if limit_price <= 0:
                raise ValueError("limit_price must be positive.")
            if side == "buy" and not (sl < limit_price < tp):
                raise ValueError("For a buy limit order, expected stop_loss < limit_price < take_profit.")
            if side == "sell" and not (tp < limit_price < sl):
                raise ValueError("For a sell limit order, expected take_profit < limit_price < stop_loss.")
            order["limit_price"] = str(args["limit_price"])
        return delta_request("POST", "/v2/orders", body=order, private=True)
    if name == "cancel_order":
        if ENVIRONMENT != "india_testnet":
            raise RuntimeError("This deployment is locked to demo/testnet; live order cancellation is disabled.")
        if not ALLOW_ORDER_EXECUTION:
            raise RuntimeError("Demo order actions are disabled.")
        body = {"id": int(args["order_id"]), "product_id": int(args["product_id"])}
        return delta_request("DELETE", "/v2/orders", body=body, private=True)
    raise ValueError("Unknown tool: " + name)


@app.get("/")
def root():
    return {"service": APP_NAME, "status": "running", "mcp_endpoint": "/mcp", "environment": ENVIRONMENT, "live_trading": "disabled"}


@app.get("/health")
def health():
    # Never expose secrets, account data, or the configured auth token here.
    return {"status": "ok", "service": APP_NAME, "environment": ENVIRONMENT, "auth_configured": configured_auth()}


@app.post("/mcp")
async def mcp_endpoint(request: Request):
    if not auth_ok(request):
        return JSONResponse({"error": "unauthorized", "message": "Configure MCP_AUTH_TOKEN in Render and send it as a Bearer token."}, status_code=401)
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"jsonrpc": "2.0", "error": {"code": -32700, "message": "Parse error"}, "id": None}, status_code=400)
    if not isinstance(body, dict) or body.get("jsonrpc") != "2.0":
        return JSONResponse({"jsonrpc": "2.0", "error": {"code": -32600, "message": "Invalid Request"}, "id": body.get("id") if isinstance(body, dict) else None}, status_code=400)
    method = body.get("method")
    request_id = body.get("id")
    params = body.get("params") or {}
    if method == "notifications/initialized" or (request_id is None and str(method).startswith("notifications/")):
        return Response(status_code=202)
    if method == "initialize":
        return JSONResponse({"jsonrpc": "2.0", "id": request_id, "result": {
            "protocolVersion": params.get("protocolVersion", "2025-03-26"),
            "capabilities": {"tools": {}},
            "serverInfo": {"name": APP_NAME, "version": APP_VERSION},
        }})
    if method == "ping":
        return JSONResponse({"jsonrpc": "2.0", "id": request_id, "result": {}})
    if method == "tools/list":
        return JSONResponse({"jsonrpc": "2.0", "id": request_id, "result": {"tools": TOOLS}})
    if method == "tools/call":
        name = (params.get("name") or "").strip()
        args = params.get("arguments") or {}
        try:
            result = run_tool(name, args)
            return JSONResponse({"jsonrpc": "2.0", "id": request_id, "result": {
                "content": [{"type": "text", "text": json.dumps(result, ensure_ascii=False)}],
                "structuredContent": result,
                "isError": False,
            }})
        except Exception as exc:
            # Error messages are sanitized by not including request headers or credentials.
            message = str(exc)[:1500]
            return JSONResponse({"jsonrpc": "2.0", "id": request_id, "result": {
                "content": [{"type": "text", "text": message}],
                "isError": True,
            }})
    return JSONResponse({"jsonrpc": "2.0", "id": request_id, "error": {"code": -32601, "message": "Method not found"}})
