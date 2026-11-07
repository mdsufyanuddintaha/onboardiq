import Icon from "./Icon";

// Charts are plain server-rendered SVG/HTML: no chart library, works with JS disabled.
// Every chart has a "View as table" fallback so nothing depends on colour alone.

export function DataTable({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  return (
    <details className="viz-table">
      <summary>
        <Icon name="list" size={14} />
        View as table
      </summary>
      <div className="tablewrap">
        <table className="table mini">
          <thead>
            <tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export type Stage = { key: string; label: string; value: number; hint: string };

// Where every request currently sits in its lifecycle. One bar, proportional, directly labelled.
export function Pipeline({ stages }: { stages: Stage[] }) {
  const total = stages.reduce((a, s) => a + s.value, 0);
  const indexed = stages.map((s, i) => ({ ...s, n: i + 1 }));
  return (
    <div>
      {total === 0 ? (
        <div className="empty small">
          <strong>No requests yet</strong>
          <span>Create a new hire request to see it move through the lifecycle.</span>
        </div>
      ) : (
        <div className="pipe-bar" role="img" aria-label={stages.map((s) => `${s.label}: ${s.value}`).join(", ")}>
          {indexed
            .filter((s) => s.value > 0)
            .map((s) => (
              <span key={s.key} className={`pipe-seg st-${s.n}`} style={{ flexGrow: s.value }} data-tip={`${s.label}: ${s.value}`} />
            ))}
        </div>
      )}
      <ul className="pipe-legend">
        {indexed.map((s) => (
          <li key={s.key}>
            <span className="pl-head">
              <i className={`sw st-${s.n}`} aria-hidden="true" />
              {s.label}
            </span>
            <span className="pl-value">{s.value}</span>
            <span className="pl-hint">{s.hint}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ColumnChart({ data, noun, valueLabel }: { data: { label: string; value: number }[]; noun: string; valueLabel: string }) {
  const W = 560, H = 214, pl = 30, pr = 6, pt = 22, pb = 28;
  const max = Math.max(1, ...data.map((d) => d.value));
  const top = max <= 4 ? 4 : Math.ceil(max / 2) * 2;
  const innerW = W - pl - pr;
  const innerH = H - pt - pb;
  const step = innerW / data.length;
  const bw = Math.min(36, step * 0.58);
  const y = (v: number) => pt + innerH - (v / top) * innerH;
  const ticks = [0, top / 2, top];
  const maxIdx = data.reduce((m, d, i) => (d.value > data[m].value ? i : m), 0);
  const lastIdx = data.length - 1;

  return (
    <div>
      <svg className="cols" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${valueLabel} per week: ${data.map((d) => `${d.label} ${d.value}`).join(", ")}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid" x1={pl} x2={W - pr} y1={y(t)} y2={y(t)} />
            <text x={pl - 8} y={y(t) + 4} textAnchor="end">{t}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = pl + step * i + (step - bw) / 2;
          const h = (d.value / top) * innerH;
          const r = Math.min(4, h);
          const by = y(d.value);
          const showVal = d.value > 0 && (i === maxIdx || i === lastIdx);
          return (
            <g className="col" key={d.label + i}>
              <title>{`Week of ${d.label}: ${d.value} ${noun}`}</title>
              <rect x={pl + step * i} y={pt} width={step} height={innerH} fill="transparent" />
              {d.value > 0 && (
                <path
                  className="bar"
                  d={`M${x},${by + h} V${by + r} Q${x},${by} ${x + r},${by} H${x + bw - r} Q${x + bw},${by} ${x + bw},${by + r} V${by + h} Z`}
                />
              )}
              {showVal && (
                <text className="val" x={x + bw / 2} y={by - 6} textAnchor="middle">{d.value}</text>
              )}
              <text x={pl + step * i + step / 2} y={H - 8} textAnchor="middle">{d.label}</text>
            </g>
          );
        })}
      </svg>
      <DataTable headers={["Week of", valueLabel]} rows={data.map((d) => [d.label, d.value])} />
    </div>
  );
}

export function HBars({ data, empty }: { data: { label: string; value: number }[]; empty: string }) {
  if (data.length === 0) return <div className="empty small"><strong>{empty}</strong></div>;
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div>
      <div className="hbars">
        {data.map((d) => (
          <div className="hbar-row" key={d.label} data-tip={`${d.label}: ${d.value}`}>
            <span className="hbar-label" title={d.label}>{d.label}</span>
            <span className="hbar-track"><span className="hbar-fill" style={{ width: `${(d.value / max) * 100}%` }} /></span>
            <span className="hbar-value">{d.value}</span>
          </div>
        ))}
      </div>
      <DataTable headers={["Department", "Requests"]} rows={data.map((d) => [d.label, d.value])} />
    </div>
  );
}

// On-time vs late: two states, so two validated categorical colours plus an icon and a label in the legend.
export function SplitMeter({ onTime, late }: { onTime: number; late: number }) {
  const total = onTime + late;
  if (total === 0) {
    return (
      <div className="empty small">
        <strong>No accounts disabled yet</strong>
        <span>Once IT disables an offboarded account, its on-time or late result shows here.</span>
      </div>
    );
  }
  const pct = Math.round((onTime / total) * 100);
  return (
    <div>
      <div className="big">{pct}%</div>
      <div className="muted" style={{ marginBottom: 16 }}>of accounts were disabled by their deadline</div>
      <div className="meter" role="img" aria-label={`${onTime} on time, ${late} late`}>
        {onTime > 0 && <span className="c-1" style={{ flexGrow: onTime }} data-tip={`On time: ${onTime}`} />}
        {late > 0 && <span className="c-2" style={{ flexGrow: late }} data-tip={`Late: ${late}`} />}
      </div>
      <div className="legend">
        <span className="legend-item"><i className="sw c-1" aria-hidden="true" /><Icon name="check" size={14} />On time <b>{onTime}</b></span>
        <span className="legend-item"><i className="sw c-2" aria-hidden="true" /><Icon name="clock" size={14} />Late <b>{late}</b></span>
      </div>
      <DataTable headers={["Result", "Accounts"]} rows={[["On time", onTime], ["Late", late]]} />
    </div>
  );
}
