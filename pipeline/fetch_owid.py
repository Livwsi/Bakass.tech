"""
fetch_owid.py — multi-indicator ETL for the Netherlands.

Pulls several Our World in Data series, validates with Pydantic, reshapes
with pandas, writes public/data/indicators.json. Runs locally or weekly
via .github/workflows/refresh-data.yml.
"""

from __future__ import annotations
import json, sys
from datetime import datetime, timezone
from pathlib import Path
import pandas as pd
from pydantic import BaseModel, Field, ValidationError

ISO = "NLD"
MIN_YEAR = 1990
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


def fetch_indicator(cfg: dict) -> list[Point]:
    df = pd.read_csv(BASE.format(slug=cfg["slug"]))
    col = next((c for c in df.columns if cfg["match"].lower() in c.lower()), None)
    if col is None:
        raise RuntimeError(f"no column matching '{cfg['match']}' in {cfg['slug']}")
    nl = (df[df["Code"] == ISO][["Year", col]]
          .rename(columns={"Year": "year", col: "value"})
          .dropna().query("year >= @MIN_YEAR").sort_values("year"))
    scale = cfg.get("scale", 1.0)
    return [Point(year=int(r.year), value=round(float(r.value) * scale, 3)) for r in nl.itertuples()]


def main() -> int:
    out = {"refreshed_at": datetime.now(timezone.utc).isoformat(),
           "country": "Netherlands", "source": "Our World in Data (CC-BY)", "indicators": {}}
    for key, cfg in INDICATORS.items():
        try:
            pts = fetch_indicator(cfg)
            out["indicators"][key] = {"label": cfg["label"], "unit": cfg["unit"],
                                      "insight": cfg["insight"], "series": [p.model_dump() for p in pts]}
            print(f"[ok]  {key:11s} {len(pts)} points")
        except Exception as e:
            print(f"[skip] {key}: {e}", file=sys.stderr)
    if not out["indicators"]:
        print("[error] no indicators fetched", file=sys.stderr); return 1
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(out, indent=2))
    print(f"[write] {OUT_PATH} · {len(out['indicators'])} indicators")
    return 0


if __name__ == "__main__":
    sys.exit(main())
