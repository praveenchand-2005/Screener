# Delta Exchange Cloud MCP (demo-first)

This is a separate remote MCP service for ChatGPT custom MCP connections. It does not modify the existing Render production services or their main branch.

## Safety defaults
- Defaults to Delta India testnet: `DELTA_MCP_ENV=india_testnet` and `https://cdn-ind.testnet.deltaex.org`.
- Live trading is explicitly disabled in this deployment.
- Order execution is disabled until `ALLOW_ORDER_EXECUTION=true` is set after demo credentials are configured.
- The API key/secret are supplied only as Render environment variables; never commit them or send them in chat.
- The MCP endpoint requires a Bearer token. The placeholder token is deliberately rejected.
- Bracket orders require both stop-loss and take-profit. Contract size is capped by `MAX_ORDER_SIZE` (default 10).
- No withdrawal, transfer, close-all, or automatic retry tools are exposed.

## Render environment variables
Required before using the MCP endpoint:
- `MCP_AUTH_TOKEN`: generate a unique random secret of at least 32 characters. Enter the same token into ChatGPT's custom MCP authentication settings as a Bearer token.
- `DELTA_MCP_ENV=india_testnet`
- `ALLOW_ORDER_EXECUTION=false` initially
- `DELTA_API_KEY` and `DELTA_API_SECRET`: create demo/testnet credentials on Delta's demo site and add them in Render's Environment page, not in chat.
- After read-only account checks succeed, set `ALLOW_ORDER_EXECUTION=true` to enable demo orders.

Trading keys on Delta require an IP allowlist. Before adding a trading key, check Render's outbound IP guidance and allowlist only the required egress addresses. Do not use a production key with this demo service.

## Deploy
- Runtime: Python
- Build: `pip install -r delta-cloud-mcp/requirements.txt`
- Start: `uvicorn main:app --app-dir delta-cloud-mcp --host 0.0.0.0 --port $PORT`
- MCP endpoint: `https://YOUR-RENDER-SERVICE.onrender.com/mcp`
- Health endpoint: `https://YOUR-RENDER-SERVICE.onrender.com/health`

## MCP tools
- `get_connection_status`
- `get_ticker`
- `scan_market`
- `get_wallet_balances`
- `get_open_positions`
- `place_bracket_order` (demo only, disabled by default)
- `cancel_order` (demo only, disabled by default)

## Notes
This is a deliberately constrained first deployment, not an autonomous strategy. A tool call must explicitly request an order with symbol, side, size, order type, stop-loss and take-profit. Do not connect live credentials or enable live trading in this deployment.
