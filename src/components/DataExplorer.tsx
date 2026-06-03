/**
 * DataExplorer.tsx
 *
 * Multi-indicator explorer for the Netherlands, three views:
 *   Trend   - animated D3 line over time
 *   Heatmap - per-year intensity strip
 *   Map     - interactive Leaflet choropleth on an OpenStreetMap / Carto basemap,
 *             countries colored by the selected indicator, hover highlight,
 *             click for value + European rank, graduated legend.
 *
 * Data: /data/indicators.json (time series + per-country compare block)
 *       /data/europe.topo.json (compact TopoJSON, 28 countries)
 */

import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { feature } from "topojson-client";
import "leaflet/dist/leaflet.css"; // CSS only; Leaflet JS is imported lazily in the browser (SSR-safe)

interface Point { year: number; value: number; }
interface Indicator { label: string; unit: string; insight: string; series: Point[]; }
interface Dataset { country: string; indicators: Record<string, Indicator>; compare: Record<string, Record<string, number>>; }
type View = "trend" | "heatmap" | "map";

const TEAL = ["#E3EFEC", "#A7E7D6", "#5FDCC4", "#2FD3C0", "#15A98C", "#0E6E63"];

export default function DataExplorer() {
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const mapElRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const geoRef = useRef<any>(null);

  const [data, setData] = useState<Dataset | null>(null);
  const [topo, setTopo] = useState<any>(null);
  const [key, setKey] = useState("co2");
  const [view, setView] = useState<View>("trend");
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch("/data/indicators.json").then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(setData).catch((e: Error) => setErr(e.message));
    fetch("/data/europe.topo.json").then((r) => (r.ok ? r.json() : null)).then(setTopo).catch(() => setTopo(null));
  }, []);

  // ---- SVG views (trend, heatmap) ----
  useEffect(() => {
    if (view === "map" || !data || !svgRef.current || !wrapRef.current) return;
    const ind = data.indicators[key];
    if (!ind) return;

    const showTip = (e: MouseEvent, text: string) => {
      const t = tipRef.current; if (!t) return;
      const r = wrapRef.current!.getBoundingClientRect();
      t.style.opacity = "1"; t.style.left = `${e.clientX - r.left + 12}px`; t.style.top = `${e.clientY - r.top + 12}px`;
      t.textContent = text;
    };
    const hideTip = () => { if (tipRef.current) tipRef.current.style.opacity = "0"; };

    const render = () => {
      const W = wrapRef.current!.clientWidth, H = 340;
      const sel = d3.select(svgRef.current!).attr("viewBox", `0 0 ${W} ${H}`).attr("width", "100%").attr("height", H);
      sel.selectAll("*").remove();
      if (view === "trend") {
        const m = { top: 20, right: 24, bottom: 34, left: 52 }, iw = W - m.left - m.right, ih = H - m.top - m.bottom;
        const g = sel.append("g").attr("transform", `translate(${m.left},${m.top})`);
        const x = d3.scaleLinear().domain(d3.extent(ind.series, (d) => d.year) as [number, number]).range([0, iw]);
        const y = d3.scaleLinear().domain([0, d3.max(ind.series, (d) => d.value)! * 1.08]).range([ih, 0]);
        g.append("g").attr("transform", `translate(0,${ih})`).call(d3.axisBottom(x).tickFormat(d3.format("d")).ticks(7) as any);
        g.append("g").call(d3.axisLeft(y).ticks(5).tickFormat(d3.format("~s")) as any);
        g.selectAll("text").style("font-family", "JetBrains Mono, monospace").style("font-size", "11px").style("fill", "#46514F");
        g.selectAll("path.domain, line").style("stroke", "#D5E2E0");
        const grad = g.append("defs").append("linearGradient").attr("id", "de-grad").attr("x1", 0).attr("y1", 0).attr("x2", 0).attr("y2", 1);
        grad.append("stop").attr("offset", "0%").attr("stop-color", "rgba(13,190,148,0.32)");
        grad.append("stop").attr("offset", "100%").attr("stop-color", "rgba(13,190,148,0)");
        const area = d3.area<Point>().x((d) => x(d.year)).y0(ih).y1((d) => y(d.value)).curve(d3.curveMonotoneX);
        const line = d3.line<Point>().x((d) => x(d.year)).y((d) => y(d.value)).curve(d3.curveMonotoneX);
        g.append("path").datum(ind.series).attr("fill", "url(#de-grad)").attr("d", area as any);
        const p = g.append("path").datum(ind.series).attr("fill", "none").attr("stroke", "#0DBE94").attr("stroke-width", 2.5).attr("d", line as any);
        const len = (p.node() as SVGPathElement).getTotalLength();
        p.attr("stroke-dasharray", `${len} ${len}`).attr("stroke-dashoffset", len).transition().duration(900).attr("stroke-dashoffset", 0);
        g.selectAll("circle").data(ind.series).join("circle").attr("cx", (d: Point) => x(d.year)).attr("cy", (d: Point) => y(d.value)).attr("r", 3).attr("fill", "#0E6E63")
          .on("mousemove", (e: any, d: any) => showTip(e, `${d.year}: ${d.value} ${ind.unit}`)).on("mouseleave", hideTip);
      } else {
        const m = { top: 46, right: 24, bottom: 30, left: 24 }, iw = W - m.left - m.right;
        const g = sel.append("g").attr("transform", `translate(${m.left},${m.top})`);
        const vals = ind.series.map((d) => d.value);
        const color = d3.scaleQuantize<string>().domain([d3.min(vals)!, d3.max(vals)!]).range(TEAL);
        const cellW = iw / ind.series.length, cellH = 110;
        g.selectAll("rect").data(ind.series).join("rect").attr("x", (_d: Point, i: number) => i * cellW).attr("y", 0)
          .attr("width", cellW - 3).attr("height", cellH).attr("rx", 2).attr("fill", "#E3EFEC")
          .on("mousemove", (e: any, d: any) => showTip(e, `${d.year}: ${d.value} ${ind.unit}`)).on("mouseleave", hideTip)
          .transition().delay((_d: Point, i: number) => i * 40).attr("fill", (d: Point) => color(d.value));
        g.selectAll("text.yr").data(ind.series).join("text").attr("class", "yr").attr("x", (_d: Point, i: number) => i * cellW + (cellW - 3) / 2)
          .attr("y", cellH + 18).attr("text-anchor", "middle").style("font-family", "JetBrains Mono, monospace").style("font-size", "10px")
          .style("fill", "#46514F").text((d: Point) => `'${String(d.year).slice(2)}`);
        sel.append("text").attr("x", m.left).attr("y", 26).style("font-family", "JetBrains Mono, monospace").style("font-size", "11px")
          .style("fill", "#46514F").text(`${ind.label} by year, darker = higher (${ind.unit})`);
      }
    };
    render();
    const ro = new ResizeObserver(render); ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [data, key, view]);

  // ---- Leaflet map view ----
  useEffect(() => {
    if (view !== "map" || !data || !topo || !mapElRef.current) return;
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default; // browser-only import (SSR-safe)
      if (cancelled || !mapElRef.current) return;

      const cmp = data.compare[key] || {};
      const vals = Object.values(cmp);
      const color = d3.scaleQuantize<string>().domain([d3.min(vals)!, d3.max(vals)!]).range(TEAL);
      const unit = data.indicators[key].unit;
      const ranked = Object.entries(cmp).sort((a, b) => b[1] - a[1]);
      const rankOf = (name: string) => ranked.findIndex(([n]) => n === name) + 1;

      const styleFor = (name: string): any => {
        const v = cmp[name];
        return {
          fillColor: v == null ? "#EEF3F2" : color(v),
          fillOpacity: 0.82,
          color: name === "Netherlands" ? "#0E6E63" : "#ffffff",
          weight: name === "Netherlands" ? 2.4 : 0.7,
        };
      };

      // init map once
      if (!mapRef.current) {
        const map = L.map(mapElRef.current, { zoomControl: true, scrollWheelZoom: false, attributionControl: true })
          .setView([54, 9], 4);
        L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
          attribution: "&copy; OpenStreetMap &copy; CARTO", subdomains: "abcd", maxZoom: 19,
        }).addTo(map);
        mapRef.current = map;
      }
      const map = mapRef.current;

      // (re)build choropleth layer for the selected indicator
      if (geoRef.current) { geoRef.current.remove(); geoRef.current = null; }
      const fc: any = feature(topo, topo.objects.countries);
      const layer = L.geoJSON(fc, {
        style: (f: any) => styleFor(f.properties.name),
        onEachFeature: (f: any, lyr: any) => {
          const name = f.properties.name;
          const v = cmp[name];
          lyr.bindTooltip(`<b>${name}</b><br>${v == null ? "n/a" : v + " " + unit}`, { sticky: true });
          lyr.bindPopup(
            v == null ? `<b>${name}</b><br>no data`
              : `<b>${name}</b><br>${v} ${unit}<br><span style="color:#0E6E63">rank ${rankOf(name)} of ${ranked.length} in Europe</span>`
          );
          lyr.on("mouseover", () => lyr.setStyle({ weight: 2.2, color: "#0E6E63", fillOpacity: 0.95 }));
          lyr.on("mouseout", () => lyr.setStyle(styleFor(name)));
        },
      }).addTo(map);
      geoRef.current = layer;

      setTimeout(() => map.invalidateSize(), 60); // correct sizing after the panel becomes visible
    })();

    return () => { cancelled = true; };
  }, [data, topo, key, view]);

  // destroy map only on unmount
  useEffect(() => () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } }, []);

  if (err) return <div className="de-msg">⚠ couldn't load /data/indicators.json, run the pipeline.</div>;
  if (!data) return <div className="de-msg">loading data,</div>;

  const ind = data.indicators[key];
  const last = ind.series[ind.series.length - 1].value, first = ind.series[0].value;
  const delta = ((last - first) / first) * 100;
  const peak = Math.max(...ind.series.map((s) => s.value));
  const fmt = (n: number) => (n >= 1000 ? d3.format("~s")(n) : n % 1 === 0 ? `${n}` : n.toFixed(1));

  const cmp = data.compare[key] || {};
  const lo = Math.min(...Object.values(cmp)), hi = Math.max(...Object.values(cmp));
  const legendScale = d3.scaleQuantize<string>().domain([lo, hi]).range(TEAL);
  const bounds = [lo, ...(legendScale.thresholds() as number[]), hi];

  return (
    <div className="de" ref={wrapRef}>
      <div className="de-bars">
        <div className="de-controls">
          {Object.entries(data.indicators).map(([k, v]) => (
            <button key={k} className={`de-tab ${k === key ? "active" : ""}`} onClick={() => setKey(k)}>{v.label}</button>
          ))}
        </div>
        <div className="de-views">
          {(["trend", "heatmap", "map"] as View[]).map((vw) => (
            <button key={vw} className={`de-view ${vw === view ? "active" : ""}`} onClick={() => setView(vw)}>{vw}</button>
          ))}
        </div>
      </div>

      <div className="de-kpis">
        <div className="kpi"><div className="n">{fmt(last)}</div><div className="l">NL latest, {ind.unit}</div></div>
        <div className="kpi"><div className="n" style={{ color: delta >= 0 ? "#0E6E63" : "#b4543c" }}>{delta >= 0 ? "+" : ""}{delta.toFixed(0)}%</div><div className="l">since {ind.series[0].year}</div></div>
        <div className="kpi"><div className="n">{fmt(peak)}</div><div className="l">peak</div></div>
      </div>

      <div className="de-canvas">
        {view !== "map" && <svg ref={svgRef} />}
        <div ref={mapElRef} className="de-map" style={{ display: view === "map" ? "block" : "none" }} />
        {view === "map" && (
          <div className="de-legend">
            <span className="lg-cap">{ind.label} ({ind.unit})</span>
            <div className="lg-row">
              {TEAL.map((c, i) => <span key={i} className="lg-box" style={{ background: c }} />)}
            </div>
            <div className="lg-row lg-nums">
              {bounds.map((b, i) => <span key={i}>{d3.format("~s")(b)}</span>)}
            </div>
          </div>
        )}
        <div ref={tipRef} className="de-tip" />
      </div>

      <p className="de-insight">{ind.insight}{view === "map" ? " Hover for values, click a country for its European rank." : ""}</p>

      <style>{`
        .de { padding: 28px 32px; position: relative; }
        .de-msg { padding: 60px 32px; text-align: center; font-family: var(--mono); font-size: 13px; color: var(--ink-soft); }
        .de-bars { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 18px; }
        .de-controls, .de-views { display: flex; border: 1px solid var(--line-2); border-radius: var(--r); width: fit-content; overflow: hidden; }
        .de-tab, .de-view { font-family: var(--mono); font-size: 12px; padding: 9px 14px; background: var(--cream); border: none; border-right: 1px solid var(--line); color: var(--ink-soft); cursor: pointer; transition: all .2s; text-transform: capitalize; }
        .de-tab:last-child, .de-view:last-child { border-right: none; }
        .de-tab:hover, .de-view:hover { background: var(--cream-2); color: var(--ink); }
        .de-tab.active, .de-view.active { background: var(--ink); color: var(--cream); }
        .de-kpis { display: flex; border: 1px solid var(--line); border-radius: var(--r); width: fit-content; overflow: hidden; margin-bottom: 10px; }
        .de-kpis .kpi { padding: 12px 22px; border-right: 1px solid var(--line); }
        .de-kpis .kpi:last-child { border-right: none; }
        .de-kpis .n { font-size: 24px; font-weight: 700; letter-spacing: -.02em; }
        .de-kpis .l { font-family: var(--mono); font-size: 10px; color: var(--ink-soft); margin-top: 2px; }
        .de-canvas { position: relative; }
        .de-map { width: 100%; height: 420px; border: 1px solid var(--line); border-radius: var(--r); z-index: 0; }
        .leaflet-container { background: #F7F9F9; font-family: var(--mono); }
        .de-legend { position: absolute; left: 14px; bottom: 14px; z-index: 500; background: rgba(247,249,249,.94); border: 1px solid var(--line); border-radius: var(--r); padding: 8px 10px; }
        .de-legend .lg-cap { font-family: var(--mono); font-size: 10px; color: var(--ink-soft); display: block; margin-bottom: 5px; }
        .de-legend .lg-row { display: flex; }
        .de-legend .lg-box { width: 26px; height: 9px; }
        .de-legend .lg-nums { justify-content: space-between; margin-top: 3px; font-family: var(--mono); font-size: 8px; color: var(--ink-soft); }
        .de-legend .lg-nums span { width: 26px; text-align: center; margin-left: -13px; }
        .de-legend .lg-nums span:first-child { margin-left: 0; }
        .de-tip { position: absolute; pointer-events: none; opacity: 0; background: var(--ink); color: var(--cream); font-family: var(--mono); font-size: 11px; padding: 5px 9px; border-radius: var(--r); transition: opacity .12s; white-space: nowrap; z-index: 600; }
        .de-insight { border-left: 2px solid var(--c2); padding-left: 14px; font-size: 14px; color: var(--ink); margin-top: 14px; max-width: 640px; }
      `}</style>
    </div>
  );
}
