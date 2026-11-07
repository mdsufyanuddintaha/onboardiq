import Icon from "./Icon";

export type Step = { label: string; detail?: string; state: "done" | "current" | "failed" | "todo" };

// The lifecycle tracker: shows exactly where a request is, and where it stopped if it failed.
export default function Stepper({ steps }: { steps: Step[] }) {
  return (
    <ol className="stepper" style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {steps.map((s) => (
        <li key={s.label} className={`step ${s.state}`} aria-current={s.state === "current" ? "step" : undefined}>
          <span className="step-dot">
            {s.state === "done" && <Icon name="check" size={13} />}
            {s.state === "failed" && <Icon name="x" size={13} />}
          </span>
          <div className="step-label">{s.label}</div>
          {s.detail && <div className="step-detail">{s.detail}</div>}
        </li>
      ))}
    </ol>
  );
}
