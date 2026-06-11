"""
fetch_owid.py — multi-indicator ETL for the Netherlands.

Pulls several Our World in Data series, validates with Pydantic, reshapes
with pandas, writes public/data/indicators.json. Runs locally or weekly
via .github/workflows/refresh-data.yml.
"""

from __future__ import annotations
import json, sys, time
from datetime import datetime, timezone
from pathlib import Path
import pandas as pd
from pydantic import BaseModel, Field, ValidationError

ISO = "NLD"
MIN_YEAR = 1990

# ISO3 -> display name (matches public/data/europe.topo.json properties.name).
# Used to emit the per-country "compare" block that drives the map view.
EUROPE = {
    "NLD": "Netherlands", "BEL": "Belgium", "DEU": "Germany", "FRA": "France",
    "GBR": "United Kingdom", "IRL": "Ireland", "DNK": "Denmark", "NOR": "Norway",
    "SWE": "Sweden", "FIN": "Finland", "POL": "Poland", "CZE": "Czechia",
    "AUT": "Austria", "CHE": "Switzerland", "ITA": "Italy", "ESP": "Spain",
    "PRT": "Portugal", "LUX": "Luxembourg", "SVK": "Slovakia", "SVN": "Slovenia",
    "HUN": "Hungary", "HRV": "Croatia", "ROU": "Romania", "BGR": "Bulgaria",
    "GRC": "Greece", "EST": "Estonia", "LVA": "Latvia", "LTU": "Lithuania",
}
HERE = Path(__file__).resolve().parent
OUT_PATH = HERE.parent / "public" / "data" / "indicators.json"

# OWID grapher slug + substring to locate the value column.
INDICATORS = {
    "co2":        {"slug": "co-emissions-per-capita", "match": "emissions", "label": "CO\u2082 per capita", "unit": "t/person",
                   "insight": "Down ~34% from the 2000s peak. Still above the EU average."},
    "population": {"slug": "population", "match": "population", "label": "Population", "unit": "millions", "scale": 1e-6,
                   "insight": "Steady growth from ~15M in 1990 to ~17.8M."},
    "gdp":        {"slug": "gdp-per-capita-worldbank", "match": "gdp", "label": "GDP per capita", "unit": "$ (PPP)",
                   "insight": "Among the highest in the EU; recovering above $60k."},
    "life":       {"slug": "life-expectancy", "match": "life", "label": "Life expectancy", "unit": "years",
                   "insight": "Climbed from ~77 to ~82 years."},
    "renewables": {"slug": "renewable-share-energy", "match": "renewab", "label": "Renewable energy", "unit": "% of energy",
                   "insight": "Late but steep as wind and solar scaled."},
}
BASE = "https://ourworldindata.org/grapher/{slug}.csv"


class Point(BaseModel):
    year: int = Field(ge=1900, le=2100)
    value: float


def read_owid_csv(slug: str) -> pd.DataFrame:
    """Download a grapher CSV with simple retry (OWID can be flaky)."""
    last_err: Exception | None = None
    for attempt in range(3):
        try:
            return pd.read_csv(BASE.format(slug=slug))
        except Exception as e:
            last_err = e
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"download failed after retries: {last_err}")


def fetch_indicator(cfg: dict) -> tuple[list[Point], dict[str, float]]:
    """Return (NL time series, latest value per European country)."""
    df = read_owid_csv(cfg["slug"])
    col = next((c for c in df.columns if cfg["match"].lower() in c.lower()), None)
    if col is None:
        raise RuntimeError(f"no column matching '{cfg['match']}' in {cfg['slug']}")
    scale = cfg.get("scale", 1.0)

    # NL time series
    nl = (df[df["Code"] == ISO][["Year", col]]
          .rename(columns={"Year": "year", col: "value"})
          .dropna().query("year >= @MIN_YEAR").sort_values("year"))
    series = [Point(year=int(r.year), value=round(float(r.value) * scale, 3)) for r in nl.itertuples()]

    # Latest value per European country (most recent non-null year each).
    # Isolated: a failure here must never take the NL series down with it.
    compare: dict[str, float] = {}
    try:
        eu = df[df["Code"].isin(EUROPE)][["Code", "Year", col]].dropna()
        latest = eu.sort_values("Year").groupby("Code").tail(1)
        compare = {EUROPE[c]: round(float(v) * scale, 3)
                   for c, v in zip(latest["Code"], latest[col])}
    except Exception as e:
        print(f"[warn] compare failed for {cfg['slug']}: {e}", file=sys.stderr)
    return series, compare


def main() -> int:
    # Previous output, used as fallback so one bad fetch never loses an indicator.
    prev = {}
    if OUT_PATH.exists():
        try:
            prev = json.loads(OUT_PATH.read_text())
        except Exception:
            prev = {}

    out = {"refreshed_at": datetime.now(timezone.utc).isoformat(),
           "country": "Netherlands", "source": "Our World in Data (CC-BY)",
           "indicators": {}, "compare": {}}
    for key, cfg in INDICATORS.items():
        try:
            pts, compare = fetch_indicator(cfg)
            out["indicators"][key] = {"label": cfg["label"], "unit": cfg["unit"],
                                      "insight": cfg["insight"], "series": [p.model_dump() for p in pts]}
            out["compare"][key] = compare or prev.get("compare", {}).get(key, {})
            print(f"[ok]  {key:11s} {len(pts)} points · {len(out['compare'][key])} countries")
        except Exception as e:
            print(f"[skip] {key}: {e}", file=sys.stderr)
            # keep last good data rather than dropping the indicator
            if key in prev.get("indicators", {}):
                out["indicators"][key] = prev["indicators"][key]
                out["compare"][key] = prev.get("compare", {}).get(key, {})
                print(f"[keep] {key}: reused previous data", file=sys.stderr)
    if not out["indicators"]:
        print("[error] no indicators fetched", file=sys.stderr); return 1
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(out, indent=2))
    print(f"[write] {OUT_PATH} · {len(out['indicators'])} indicators")
    return 0


if __name__ == "__main__":
    sys.exit(main())
