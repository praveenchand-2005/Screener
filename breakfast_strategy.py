from __future__ import annotations
from dataclasses import dataclass, asdict
from datetime import datetime, time
from zoneinfo import ZoneInfo
from typing import Any

IST = ZoneInfo("Asia/Kolkata")

@dataclass
class Signal:
    strategy: str = "BREAKFAST_A"
    status: str = "NO_TRADE"
    direction: str | None = None
    sector: str | None = None
    stock: str | None = None
    underlying_price: float | None = None
    opening_return_pct: float | None = None
    option_symbol: str | None = None
    option_premium: float | None = None
    entry: float | None = None
    stop: float | None = None
    target: float | None = None
    risk: float | None = None
    capital_required: float | None = None
    trigger_time: str | None = None
    data_status: str = "UNVERIFIED"
    reason: str = ""


def extreme_move_guard(open_price: float, five_min_price: float, threshold_pct: float = 5.0) -> tuple[bool, float]:
    if open_price <= 0:
        return False, 0.0
    move = (five_min_price - open_price) / open_price * 100.0
    return abs(move) < threshold_pct, move


def build_signal(*, sector: str, stock: str, open_price: float, price_0920: float,
                 option_symbol: str | None = None, option_premium: float | None = None,
                 lot_size: int = 1, nifty_positive: bool = True) -> dict[str, Any]:
    valid, move = extreme_move_guard(open_price, price_0920)
    if not valid:
        return asdict(Signal(reason="Opening move reached the ~5% extreme-move filter", data_status="VERIFIED"))

    target_pct = 1.0 if nifty_positive else 0.5
    stop_pct = 1.0
    entry = price_0920
    stop = entry * (1 - stop_pct / 100)
    target = entry * (1 + target_pct / 100)

    if option_premium is not None:
        capital = option_premium * lot_size
        risk = capital
    else:
        capital = entry
        risk = entry * stop_pct / 100

    if capital > 3500 or risk > 700:
        return asdict(Signal(reason="Risk guard rejected position", data_status="VERIFIED"))

    return asdict(Signal(
        status="SIGNAL", direction="LONG", sector=sector, stock=stock,
        underlying_price=price_0920, opening_return_pct=move,
        option_symbol=option_symbol, option_premium=option_premium,
        entry=entry, stop=stop, target=target, risk=risk,
        capital_required=capital,
        trigger_time=datetime.now(IST).isoformat(),
        data_status="VERIFIED",
        reason="Strongest valid stock in strongest sector; opening move passed filter"
    ))
