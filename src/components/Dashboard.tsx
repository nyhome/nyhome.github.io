"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ROOMS } from "@/data/gifts";
import { fetchAll, type AdminData } from "@/lib/admin";
import { formatBRL } from "@/lib/catalog";
import { summarize } from "@/lib/dashboard";
import styles from "./Dashboard.module.css";

// Validated with the dataviz palette checker against the card surface (CVD-safe; the terracotta sits under 3:1,
// so every figure is also printed as text and the latest purchases come as a table).
const C = { bought: "#3d6b22", reserved: "#d48f5f", track: "#e6e2d3", grid: "#ece8d9", ink3: "#8a8f7c" };
const roomName = (id: string) => ROOMS.find((r) => r.id === id)?.name ?? id;
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const compact = (v: number) =>
  v >= 1000 ? `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : formatBRL(v);
const day = (ms: number) => new Date(ms).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });

type Tip = { x: number; y: number; lines: string[] } | null;

export function Dashboard() {
  const [data, setData] = useState<AdminData | null>(null);
  const [now, setNow] = useState(0);
  const [failed, setFailed] = useState(false);
  const [tip, setTip] = useState<Tip>(null);

  const load = useCallback(
    () =>
      fetchAll()
        .then((d) => {
          setData(d);
          setNow(Date.now());
        })
        .catch(() => setFailed(true)),
    [],
  );
  useEffect(() => {
    load();
  }, [load]);

  if (!data) return <p>{failed ? "Não deu para carregar. Recarregue a página." : "Carregando…"}</p>;

  const s = summarize(data.gifts, data.purchases, now);
  const show = (e: React.MouseEvent, lines: string[]) => setTip({ x: e.clientX, y: e.clientY, lines });
  const hide = () => setTip(null);
  const parts = [
    { name: "Comprado", value: s.bought, bg: C.bought, fg: "#fff" },
    { name: "Reservado", value: s.reserved, bg: C.reserved, fg: "#2c3322" },
    { name: "Falta", value: s.left, bg: C.track, fg: "#2c3322" },
  ];

  return (
    <div className={styles.dash}>
      <section className={`${styles.card} ${styles.hero}`} aria-labelledby="d-hero">
        <div>
          <div className={styles.heroLabel} id="d-hero">Já ganhamos</div>
          <div className={styles.heroValue}>{formatBRL(s.bought)}</div>
          <div className={styles.heroOf}>de {formatBRL(s.total)} da lista · {pct(s.bought, s.total)}% comprado</div>
        </div>
        <div>
          <div className={styles.seg} role="img" aria-label={parts.map((p) => `${p.name} ${formatBRL(p.value)}`).join(", ")}>
            {parts.map((p) =>
              p.value > 0 ? (
                <div
                  key={p.name}
                  style={{ flex: p.value, background: p.bg, color: p.fg }}
                  onMouseMove={(e) => show(e, [`${p.name}: ${formatBRL(p.value)} (${pct(p.value, s.total)}%)`])}
                  onMouseLeave={hide}
                >
                  {p.value / s.total > 0.12 && `${pct(p.value, s.total)}%`}
                </div>
              ) : null,
            )}
          </div>
          <div className={styles.legend}>
            {parts.map((p) => (
              <span key={p.name}><i className={styles.sw} style={{ background: p.bg }} />{p.name === "Reservado" ? "Reservado (aguardando compra)" : p.name}</span>
            ))}
          </div>
        </div>
        <div className={styles.kpis}>
          <Kpi label="Valor total da lista" value={formatBRL(s.total)} detail={`${s.gifts} presentes · ${s.units.total} unidades`} />
          <Kpi label="Comprado" color={C.bought} value={formatBRL(s.bought)} detail={`${s.units.bought} unidades · ${pct(s.bought, s.total)}%`} />
          <Kpi label="Reservado" color={C.reserved} value={formatBRL(s.reserved)} detail={`${s.units.held} unidades aguardando compra`} />
          <Kpi
            label="Falta comprar"
            color={C.track}
            value={formatBRL(s.left)}
            detail={`${s.units.total - s.units.bought - s.units.held} unidades · ${pct(s.left, s.total)}%`}
          />
        </div>
      </section>

      <div className={styles.grid}>
        <section className={`${styles.card} ${styles.wide}`} aria-labelledby="d-time">
          <h2 id="d-time">Valor comprado ao longo do tempo</h2>
          <p className={styles.sub}>Compras confirmadas pelos convidados, nos últimos 30 dias</p>
          <Timeline timeline={s.timeline} daily={s.daily} start={s.start} onTip={show} onLeave={hide} />
        </section>
        <section className={`${styles.card} ${styles.narrow}`} aria-labelledby="d-tier">
          <h2 id="d-tier">Quem mais presenteou</h2>
          <p className={styles.sub}>Valor comprado por parentesco{s.couple ? ` · nós compramos ${compact(s.couple)}` : ""}</p>
          {s.tiers.length ? (
            <div className={styles.tiers}>
              {s.tiers.map((t) => (
                <div key={t.tier} className={styles.tierRow} onMouseMove={(e) => show(e, [`${t.tier}: ${formatBRL(t.value)}`])} onMouseLeave={hide}>
                  <span className={styles.tierName}>{t.tier}</span>
                  <span className={styles.tierBar}><span style={{ width: `${Math.max(2, (t.value / s.tiers[0].value) * 100)}%`, background: C.bought }} /></span>
                  <span className={styles.tierVal}>{compact(t.value)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.empty}>Ainda ninguém comprou.</p>
          )}
        </section>

        <section className={`${styles.card} ${styles.full}`} aria-labelledby="d-rooms">
          <h2 id="d-rooms">Por cômodo</h2>
          <p className={styles.sub}>Comprado e reservado sobre o valor total de cada cômodo</p>
          <div className={styles.meters}>
            {s.rooms.map((r) => (
              <div
                key={r.id}
                className={styles.meter}
                onMouseMove={(e) => show(e, [roomName(r.id), `Comprado ${formatBRL(r.bought)}`, `Reservado ${formatBRL(r.reserved)}`, `Falta ${formatBRL(r.total - r.bought - r.reserved)}`])}
                onMouseLeave={hide}
              >
                <span className={styles.meterName}>{roomName(r.id)}</span>
                <span className={styles.bar}>
                  {r.bought > 0 && <span style={{ flex: r.bought, background: C.bought }} />}
                  {r.reserved > 0 && <span style={{ flex: r.reserved, background: C.reserved }} />}
                  {r.total - r.bought - r.reserved > 0 && <span style={{ flex: r.total - r.bought - r.reserved, background: C.track }} />}
                </span>
                <span className={styles.meterFig}><b>{formatBRL(r.bought)}</b> de {compact(r.total)} · {pct(r.bought, r.total)}%</span>
              </div>
            ))}
          </div>
        </section>

        <section className={`${styles.card} ${styles.full}`} aria-labelledby="d-last">
          <h2 id="d-last">Últimas compras</h2>
          <p className={styles.sub}>Os presentes mais recentes confirmados pelos convidados</p>
          {s.latest.length ? (
            <table className={styles.table}>
              <thead><tr><th>Data</th><th>Presente</th><th>Quem deu</th><th>Cômodo</th><th className={styles.num}>Valor</th></tr></thead>
              <tbody>
                {s.latest.map((p, i) => (
                  <tr key={i}>
                    <td>{day(p.at)}</td>
                    <td>{p.gift}{p.units > 1 && ` ×${p.units}`}</td>
                    <td>{p.name} <span className={styles.muted}>· {p.tier}</span></td>
                    <td>{roomName(p.room)}</td>
                    <td className={styles.num}>{formatBRL(p.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className={styles.empty}>Quando um convidado confirmar a compra, ela aparece aqui.</p>
          )}
        </section>
      </div>

      {tip && (
        <div className={styles.tip} role="tooltip" style={{ left: Math.min(tip.x + 14, window.innerWidth - 220), top: tip.y + 14 }}>
          {tip.lines.map((l, i) => (i === 0 ? <b key={i}>{l}</b> : <div key={i}>{l}</div>))}
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, detail, color }: { label: string; value: string; detail: string; color?: string }) {
  return (
    <div className={styles.kpi}>
      <div className={styles.kpiLabel}>{color && <i className={styles.sw} style={{ background: color }} />}{label}</div>
      <div className={styles.kpiValue}>{value}</div>
      <div className={styles.kpiDetail}>{detail}</div>
    </div>
  );
}

function Timeline({
  timeline, daily, start, onTip, onLeave,
}: {
  timeline: number[];
  daily: number[];
  start: number;
  onTip: (e: React.MouseEvent, lines: string[]) => void;
  onLeave: () => void;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const n = timeline.length, W = 640, H = 240, m = { t: 12, r: 14, b: 26, l: 60 };
  // Round axis steps (1, 2, 5 × 10ⁿ) so the ticks read R$ 50, R$ 100… instead of R$ 33, R$ 66.
  const top = Math.max(...timeline, 1);
  const p = 10 ** Math.floor(Math.log10(top / 4));
  const step = [1, 2, 5, 10].find((f) => f * p >= top / 4)! * p;
  const max = Math.ceil(top / step) * step;
  const X = (i: number) => m.l + (i / (n - 1)) * (W - m.l - m.r);
  const Y = (v: number) => H - m.b - (v / max) * (H - m.t - m.b);
  const at = (i: number) => start + i * 864e5;
  const line = timeline.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join("");
  const last = timeline[n - 1];
  if (!last) return <p className={styles.empty}>Quando um convidado confirmar a compra, a curva começa a subir.</p>;

  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className={styles.svg} role="img" aria-label={`Valor comprado acumulado: ${formatBRL(last)}`}>
      {Array.from({ length: max / step + 1 }, (_, k) => k * step).map((v) => (
        <g key={v}>
          <line x1={m.l} x2={W - m.r} y1={Y(v)} y2={Y(v)} stroke={C.grid} />
          <text x={m.l - 8} y={Y(v) + 4} textAnchor="end" className={styles.axis}>{compact(v)}</text>
        </g>
      ))}
      {[0, Math.round(n / 4), Math.round(n / 2), Math.round((3 * n) / 4), n - 1].map((i) => (
        <text key={i} x={X(i)} y={H - 6} textAnchor="middle" className={styles.axis}>{day(at(i))}</text>
      ))}
      <path d={`${line}L${X(n - 1)},${Y(0)}L${X(0)},${Y(0)}Z`} fill={C.bought} opacity={0.12} />
      <path d={line} fill="none" stroke={C.bought} strokeWidth={2} strokeLinejoin="round" />
      <circle cx={X(n - 1)} cy={Y(last)} r={4.5} fill={C.bought} stroke="#fbf9f3" strokeWidth={2} />
      <text x={X(n - 1) - 8} y={Y(last) - 10} textAnchor="end" fontSize={12} fontWeight={600} fill="#2c3322">{formatBRL(last)}</text>
      {hover !== null && (
        <g>
          <line x1={X(hover)} x2={X(hover)} y1={m.t} y2={H - m.b} stroke={C.ink3} strokeDasharray="3 3" />
          <circle cx={X(hover)} cy={Y(timeline[hover])} r={5} fill={C.bought} stroke="#fbf9f3" strokeWidth={2} />
        </g>
      )}
      <rect
        x={m.l}
        y={m.t}
        width={W - m.l - m.r}
        height={H - m.t - m.b}
        fill="transparent"
        onMouseMove={(e) => {
          const r = ref.current!.getBoundingClientRect();
          const x = ((e.clientX - r.left) / r.width) * W;
          const i = Math.max(0, Math.min(n - 1, Math.round(((x - m.l) / (W - m.l - m.r)) * (n - 1))));
          setHover(i);
          onTip(e, [day(at(i)), `Acumulado ${formatBRL(timeline[i])}`, ...(daily[i] ? [`No dia +${formatBRL(daily[i])}`] : [])]);
        }}
        onMouseLeave={() => {
          setHover(null);
          onLeave();
        }}
      />
    </svg>
  );
}
