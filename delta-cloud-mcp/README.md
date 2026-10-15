# Delta Exchange Cloud MCP (official package, testnet-only)

This is a separate remote MCP service for ChatGPT custom MCP connections. It does not modify the existing Render production services or the repository's main branch.

## Architecture
- Uses the official `delta-exchange-mcp` package for Delta API signing and exchange calls.
- Exposes MCP over Streamable HTTP at `/mcp`, with an API-key/Bearer authentication middleware.
- Locked to Delta India testnet. The process refuses to start if `DELTA_MCP_ENV` is anything other than `india_testnet`.
- Public market tools work without account credentials. Account reads require a matching testnet API key and secret.
- Order-changing tools are hidden by default while `ALLOW_ORDER_EXECUTION=false`.
- Never use production Delta credentials on this service. Do not send API secrets in chat.

## Render settings
Build command:
```bash
pip install -r delta-cloud-mcp/requirements.txt
```
Start command:
```bash
uvicorn main:app --app-dir delta-cloud-mcp --host 0.0.0.0 --port $PORT
```

Expected environment:
- `MCP_AUTH_TOKEN`: random secret of at least 32 characters, already configured in Render. Never commit it or print it in logs.
- `DELTA_MCP_ENV=india_testnet`
- `ALLOW_ORDER_EXECUTION=false`
- Optional later: `DELTA_API_KEY` and `DELTA_API_SECRET` from the Delta demo site, stored only as Render environment variables.

## Endpoints
- MCP: `https://YOUR-RENDER-SERVICE.onrender.com/mcp`
- Health: `https://YOUR-RENDER-SERVICE.onrender.com/health` (reports configuration status only; never returns credentials)

## Connection
In the ChatGPT custom connector setup, select API-key authentication if that option is available and send the configured secret using the `X-MCP-API-Key` header (Bearer token is also accepted by the server). The OAuth option is not implemented by this service. If the ChatGPT connector setup only offers OAuth, this endpoint cannot be connected until an OAuth-compatible authorization layer is added.

## Safety and validation
1. Verify the health endpoint and MCP initialize/tools-list handshake.
2. Connect the endpoint to ChatGPT using the supported API-key authentication mode.
3. Verify public ticker/market scanning.
4. Add a demo-only Delta API key and secret securely in Render, then verify balances and open positions.
5. Keep order-changing tools disabled until the read-only checks pass and demo order protections are reviewed.

The remote service is a tool endpoint, not an autonomous strategy runner. No background trading is enabled.
