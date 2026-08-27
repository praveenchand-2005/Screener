# Screener

Professional Nifty 50 + Nifty Next 50 intraday stock-selection and paper-trading platform.

## Workflow

Pre-market Screener → Narrow CPR → 5m/15m Setup Analysis → FVG/Order Block/Liquidity → Risk Plan → Paper-Live → Daily Results

## Risk defaults

- Starting demo capital: ₹3,500
- Maximum risk per trade: ₹700
- No automatic real-money orders
- Demo and Paper-Live are explicitly separated from Live Broker mode

## Data

The application uses a pluggable market-data adapter. Public/permitted NSE web data can be used for initial testing; production real-time data must use an appropriately authorized source.

## Deployment target

- Frontend: Vercel
- Backend/worker: Render
- Database: Postgres
- Source: GitHub
