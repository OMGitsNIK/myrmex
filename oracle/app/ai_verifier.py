"""
Claude-powered claim verifier.
Before posting an on-chain oracle report, Claude independently assesses
the raw sensor data and confirms whether the event meets the trigger criteria.
"""
import anthropic
from app.config import ANTHROPIC_API_KEY

_client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)


def verify_rainfall_event(rainfall_mm: float, threshold_mm: float) -> dict:
    """
    Ask Claude to assess whether a rainfall reading constitutes a genuine
    drought trigger (i.e., actual low-rainfall event, not a sensor glitch).
    Returns {"approved": bool, "reasoning": str}.
    """
    prompt = f"""You are an independent claim verifier for a parametric crop insurance protocol.

Raw sensor data:
- Measured rainfall today: {rainfall_mm:.2f} mm
- Policy trigger threshold: {threshold_mm:.2f} mm (payout triggered if rainfall < threshold)

Assess:
1. Is {rainfall_mm:.2f} mm of rainfall a plausible real-world reading (not obviously erroneous)?
2. Does it clearly fall below the {threshold_mm:.2f} mm drought threshold?
3. Should the parametric policy payout be approved?

Respond in JSON: {{"approved": true/false, "reasoning": "one sentence"}}
Only respond with JSON, no markdown."""

    msg = _client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=256,
        messages=[{"role": "user", "content": prompt}],
    )
    import json
    try:
        return json.loads(msg.content[0].text)
    except Exception:
        return {"approved": False, "reasoning": "AI verification parsing failed"}


def verify_defi_hack(
    current_tvl: float, baseline_tvl: float, drop_threshold_pct: float
) -> dict:
    """
    Ask Claude to assess whether a TVL drop constitutes a genuine hack/exploit
    vs. normal market movement.
    """
    pct_drop = ((baseline_tvl - current_tvl) / baseline_tvl * 100) if baseline_tvl > 0 else 0

    prompt = f"""You are an independent claim verifier for a parametric DeFi hack insurance protocol.

Observed data:
- Baseline TVL (7-day average): ${baseline_tvl:,.0f}
- Current TVL: ${current_tvl:,.0f}
- TVL drop: {pct_drop:.1f}%
- Policy trigger threshold: {drop_threshold_pct:.1f}% TVL drop (payout if drop >= threshold)

Assess:
1. Is a {pct_drop:.1f}% TVL drop consistent with an exploit or hack (not just market downturn)?
2. Is the reading plausible and not a data error?
3. Should the parametric policy payout be approved?

Respond in JSON: {{"approved": true/false, "reasoning": "one sentence"}}
Only respond with JSON, no markdown."""

    msg = _client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=256,
        messages=[{"role": "user", "content": prompt}],
    )
    import json
    try:
        return json.loads(msg.content[0].text)
    except Exception:
        return {"approved": False, "reasoning": "AI verification parsing failed"}


def verify_flight_delay(delay_minutes: int, threshold_minutes: int) -> dict:
    """
    Ask Claude to assess whether flight delay data is plausible.
    """
    prompt = f"""You are an independent claim verifier for a parametric flight delay insurance protocol.

Observed data:
- Reported flight delay: {delay_minutes} minutes
- Policy trigger threshold: {threshold_minutes} minutes (payout if delay >= threshold)

Assess:
1. Is a {delay_minutes}-minute delay a plausible aviation event?
2. Does it clearly exceed the {threshold_minutes}-minute threshold?
3. Should the parametric policy payout be approved?

Respond in JSON: {{"approved": true/false, "reasoning": "one sentence"}}
Only respond with JSON, no markdown."""

    msg = _client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=256,
        messages=[{"role": "user", "content": prompt}],
    )
    import json
    try:
        return json.loads(msg.content[0].text)
    except Exception:
        return {"approved": False, "reasoning": "AI verification parsing failed"}
