from __future__ import annotations
from datetime import datetime, timezone
from fastapi import FastAPI
from breakfast_strategy import Signal

app = FastAPI(title="Breakfast Strategy A API", version="0.1.0")

@app.get("/health")
def health():
    return {"status": "ok", "strategy": "BREAKFAST_A", "execution": "PAPER_ONLY"}

@app.get("/breakfast/signal")
def breakfast_signal():
    # Live NSE adapter is intentionally fail-closed until a verified public-data
    # source is reachable. Never fabricate a signal or market price.
    return {
        "strategy": "BREAKFAST_A",
        "status": "NO_TRADE",
        "direction": None,
        "data_status": "UNVERIFIED",
        "execution": "PAPER_ONLY",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "reason": "Verified NSE 09:15-09:20 market data adapter is not connected."
    }
