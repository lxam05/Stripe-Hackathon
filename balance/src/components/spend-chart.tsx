"use client";

import { useState } from "react";

const eur = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Single-series column chart (no legend: the title names the series). Hover/focus shows the exact value. */
export function SpendChart({ data }: { data: { month: string; cents: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!data.length) return <p className="py-10 text-center text-sm text-ink-3">No spending recorded yet.</p>;
  const max = Math.max(...data.map((d) => d.cents), 1);
  const niceMax = niceCeil(max / 100);
  const ticks = [0, niceMax / 2, niceMax];
  const W = 640;
  const H = 200;
  const padL = 44;
  const padB = 24;
  const plotW = W - padL - 8;
  const plotH = H - padB - 8;
  const band = plotW / data.length;
  const bw = Math.min(24, band * 0.6);
  const peak = data.reduce((m, d, i) => (d.cents > data[m].cents ? i : m), 0);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Monthly spend, Sept 2025 onwards">
        {ticks.map((t) => {
          const y = 8 + plotH - (t / niceMax) * plotH;
          return (
            <g key={t}>
              <line x1={padL} x2={W - 8} y1={y} y2={y} stroke="var(--viz-grid)" strokeWidth={1} />
              <text x={padL - 8} y={y + 4} textAnchor="end" className="fill-[var(--ink-3)] text-[11px] tabular">
                {eur.format(t)}
              </text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const h = Math.max(2, (d.cents / 100 / niceMax) * plotH);
          const x = padL + i * band + (band - bw) / 2;
          const y = 8 + plotH - h;
          const m = Number(d.month.slice(5)) - 1;
          return (
            <g key={d.month}>
              <path
                d={`M${x},${y + h} V${y + 4} q0,-4 4,-4 h${bw - 8} q4,0 4,4 V${y + h} Z`}
                fill="var(--viz-spent)"
                opacity={hover === null || hover === i ? 1 : 0.45}
              />
              <text x={x + bw / 2} y={H - 6} textAnchor="middle" className="fill-[var(--ink-3)] text-[11px]">
                {MONTHS[m]}
              </text>
              {i === peak && hover === null && (
                <text x={x + bw / 2} y={y - 6} textAnchor="middle" className="fill-[var(--ink-2)] text-[11px] font-medium tabular">
                  {eur.format(d.cents / 100)}
                </text>
              )}
              <rect
                x={padL + i * band}
                y={8}
                width={band}
                height={plotH}
                fill="transparent"
                tabIndex={0}
                aria-label={`${MONTHS[m]} ${d.month.slice(0, 4)}: ${eur.format(d.cents / 100)}`}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
              />
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-lg bg-ink px-2.5 py-1.5 text-xs text-white shadow-lg"
          style={{ left: `${((padL + hover * band + band / 2) / W) * 100}%` }}
        >
          <div className="text-white/70">
            {MONTHS[Number(data[hover].month.slice(5)) - 1]} {data[hover].month.slice(0, 4)}
          </div>
          <div className="font-semibold tabular">{eur.format(data[hover].cents / 100)}</div>
        </div>
      )}
    </div>
  );
}

function niceCeil(v: number) {
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}
