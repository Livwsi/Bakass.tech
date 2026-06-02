/**
 * DataExplorer.tsx
 *
 * Multi-indicator explorer for the Netherlands with three views:
 *   Trend   - animated D3 line over time
 *   Heatmap - per-year intensity strip
 *   Map     - interactive D3-geo choropleth of Europe (50m geometry)
 *
 * Map interactivity: hover highlight + tooltip, click a country to pin it and
 * see its value and European rank, graduated legend with numeric thresholds,
 * NL always outlined. Data: /data/indicators.json + /data/europe.topo.json
 */

import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { feature } from "topojson-client";

interface Point { year: number; value: number; }
interface Indicator { label: string; unit: string; insight: string; series: Point[]; }
interface Dataset { country: string; indicators: Record<string, Indicator>; compare: Record<string, Record<string, number>>; }
type View = "trend" | "heatmap" | "map";

const TEAL = ["#E3EFEC", "#A7E7D6", "#5FDcC4", "#2FD3C0", "#15A98C", "#0E6E63"];

export default function DataExplorer() {
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  const [data, setData] = useState<Dataset | null>(null);
  const [topo, setTopo] = useState<any>(null);
  const [key, setKey] = useState("co2");
  const [view, setView] = useState<View>("trend");
  const [selected, setSelected] = useState<string | null>("Netherlands");
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch("/data/indicators.json").then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(setData).catch((e: Error) => setErr(e.message));
    fetch("/data/europe.topo.json").then((r) => (r.ok ? r.json() : null)).then(setTopo).catch(() => setTopo(null));
  }, []);

  useEffect(() => {
    if (!data || !svgRef.current || !wrapRef.current) return;
    const ind = data.indicators[key];
    if (!ind) return;

    const render = () => {
      const wrap = wrapRef.current!, svg = svgRef.current!;
      const W = wrap.clientWidth, H = 340;
      const sel = d3.select(svg).attr("viewBox", `0 0 ${W} ${H}`).attr("width", "100%").attr("height", H);
      sel.selectAll("*").remove();
      if (view === "trend") drawTrend(sel, W, H, ind);
      else if (view === "heatmap") drawHeatmap(sel, W, H, ind);
      else drawMap(sel, W, H);
    };

    const showTip = (e: MouseEvent, text: string) => {
      const t = tipRef.current; if (!t) return;
      const r = wrapRef.current!.getBoundingClientRect();
      t.style.opacity = "1"; t.style.left = `${e.clientX - r.left + 12}px`; t.style.top = `${e.clientY - r.top + 12}px`;
      t.textContent = text;
    };
    const hideTip = () => { if (tipRef.current) tipRef.current.style.opacity = "0"; };

    const drawTrend = (sel: any, W: number, H: number, ind: Indicator) => {
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
      g.selectAll("circle").data(ind.series).join("circle").attr("cx", (d) => x(d.year)).attr("cy", (d) => y(d.value)).attr("r", 3).attr("fill", "#0E6E63")
        .on("mousemove", (e: any, d: any) => showTip(e, `${d.year}: ${d.value} ${ind.unit}`)).on("mouseleave", hideTip);
    };

    const drawHeatmap = (sel: any, W: number, H: number, ind: Indicator) => {
      const m = { top: 46, right: 24, bottom: 30, left: 24 }, iw = W - m.left - m.right;
      const g = sel.append("g").attr("transform", `translate(${m.left},${m.top})`);
      const vals = ind.series.map((d) => d.value);
      const color = d3.scaleQuantize<string>().domain([d3.min(vals)!, d3.max(vals)!]).range(TEAL);
      const cellW = iw / ind.series.length, cellH = 110;
      g.selectAll("rect").data(ind.series).join("rect").attr("x", (_d, i) => i * cellW).attr("y", 0)
        .attr("width", cellW - 3).attr("height", cellH).attr("rx", 2).attr("fill", "#E3EFEC")
        .on("mousemove", (e: any, d: any) => showTip(e, `${d.year}: ${d.value} ${ind.unit}`)).on("mouseleave", hideTip)
        .transition().delay((_d, i) => i * 40).attr("fill", (d) => color(d.value));
      g.selectAll("text.yr").data(ind.series).join("text").attr("class", "yr").attr("x", (_d, i) => i * cellW + (cellW - 3) / 2)
        .attr("y", cellH + 18).attr("text-anchor", "middle").style("font-family", "JetBrains Mono, monospace").style("font-size", "10px")
        .style("fill", "#46514F").text((d) => `'${String(d.year).slice(2)}`);
      sel.append("text").attr("x", m.left).attr("y", 26).style("font-family", "JetBrains Mono, monospace").style("font-size", "11px")
        .style("fill", "#46514F").text(`${ind.label} by year, darker = higher (${ind.unit})`);
    };

    const drawMap = (sel: any, W: number, H: number) => {
      if (!topo) { sel.append("text").attr("x", W / 2).attr("y", H / 2).attr("text-anchor", "middle").style("fill", "#46514F").text("map unavailable"); return; }
      const cmp = data!.compare[key] || {};
      const fc: any = feature(topo, topo.objects.countries);
      const vals = Object.values(cmp);
      const lo = d3.min(vals)!, hi = d3.max(vals)!;
      const color = d3.scaleQuantize<string>().domain([lo, hi]).range(TEAL);
      const proj = d3.geoMercator().center([10, 54]).scale(W * 0.6).translate([W / 2, H / 2 + 70]);
      const path = d3.geoPath(proj);

      const gMap = sel.append("g");
      gMap.selectAll("path").data(fc.features).join("path").attr("d", path as any)
        .attr("fill", (f: any) => { const v = cmp[f.properties.name]; return v == null ? "#EEF3F2" : color(v); })
        .attr("stroke", (f: any) => f.properties.name === selected ? "#0E6E63" : f.properties.name === "Netherlands" ? "#0E6E63" : "#FFFFFF")
        .attr("stroke-width", (f: any) => (f.properties.name === selected ? 2.4 : f.properties.name === "Netherlands" ? 1.6 : 0.6))
        .style("cursor", "pointer")
        .on("mousemove", (e: any, f: any) => { const v = cmp[f.properties.name]; showTip(e, `${f.properties.name}: ${v == null ? "n/a" : v + " " + data!.indicators[key].unit}`); d3.select(e.currentTarget).attr("stroke", "#0E6E63").attr("stroke-width", 2).raise(); })
        .on("mouseleave", (e: any, f: any) => { hideTip(); if (f.properties.name !== selected && f.properties.name !== "Netherlands") d3.select(e.currentTarget).attr("stroke", "#FFFFFF").attr("stroke-width", 0.6); })
        .on("click", (_e: any, f: any) => setSelected(f.properties.name));

      // graduated legend with numeric thresholds
      const thresholds = (color.thresholds() as number[]);
      const bounds = [lo, ...thresholds, hi];
      const lx = 14, ly = H - 30, sw = 30;
      const lg = sel.append("g").attr("transform", `translate(${lx},${ly})`);
      lg.selectAll("rect").data(TEAL).join("rect").attr("x", (_d, i) => i * sw).attr("y", 0).attr("width", sw).attr("height", 9).attr("fill", (d) => d);
      lg.selectAll("text").data(bounds).join("text").attr("x", (_d, i) => i * sw).attr("y", 24)
        .style("font-family", "JetBrains Mono, monospace").style("font-size", "9px").style("fill", "#46514F").attr("text-anchor", "middle")
        .text((d) => d3.format("~s")(d));
    };

    render();
    const ro = new ResizeObserver(render); ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [data, topo, key, view, selected]);

  if (err) return <div className="de-msg">⚠ couldn't load /data/indicators.json, run the pipeline.</div>;
  if (!data) return <div className="de-msg">loading data,</div>;

  const ind = data.indicators[key];
  const first = ind.series[0].value, last = ind.series[ind.series.length - 1].value;
  const delta = ((last - first) / first) * 100;
  const peak = Math.max(...ind.series.map((s) => s.value));
  const fmt = (n: number) => (n >= 1000 ? d3.format("~s")(n) : n % 1 === 0 ? `${n}` : n.toFixed(1));

  // map selection callout: value + rank among compare countries
  let callout: string | null = null;
  if (view === "map" && selected) {
    const cmp = data.compare[key] || {};
    const v = cmp[selected];
    if (v != null) {
      const sorted = Object.entries(cmp).sort((a, b) => b[1] - a[1]);
      const rank = sorted.findIndex(([n]) => n === selected) + 1;
      callout = `${selected}: ${fmt(v)} ${ind.unit}, rank ${rank} of ${sorted.length} in Europe`;
    }
  }

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
        <svg ref={svgRef} />
        <div ref={tipRef} className="de-tip" />
      </div>

      {view === "map" && callout && <p className="de-callout">📍 {callout}</p>}
      <p className="de-insight">{ind.insight}{view === "map" ? " Click any country to compare." : ""}</p>

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
        .de-tip { position: absolute; pointer-events: none; opacity: 0; background: var(--ink); color: var(--cream); font-family: var(--mono); font-size: 11px; padding: 5px 9px; border-radius: var(--r); transition: opacity .12s; white-space: nowrap; z-index: 5; }
        .de-callout { font-family: var(--mono); font-size: 12px; color: var(--ink); background: var(--cream-2); border: 1px solid var(--line); border-radius: var(--r); padding: 8px 12px; margin-top: 12px; width: fit-content; }
        .de-insight { border-left: 2px solid var(--c2); padding-left: 14px; font-size: 14px; color: var(--ink); margin-top: 12px; max-width: 640px; }
      `}</style>
    </div>
  );
}
