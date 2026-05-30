import type { Tone } from "../metrics";

interface Props {
  value: number;
  label?: string;
  displayValue?: string;
  tone?: Tone;
  size?: "sm" | "md" | "lg";
  empty?: boolean;
  onClick?: () => void;
  title?: string;
}

const SIZES = {
  sm: { w: 76, arcH: 36, r: 26, stroke: 4, needle: 20 },
  md: { w: 108, arcH: 52, r: 40, stroke: 6, needle: 32 },
  lg: { w: 140, arcH: 68, r: 52, stroke: 7, needle: 42 },
} as const;

function toneColor(tone: Tone | undefined, empty: boolean): string {
  if (empty) return "var(--text-tertiary)";
  if (tone === "good") return "var(--good)";
  if (tone === "warn") return "var(--warn)";
  if (tone === "bad") return "var(--bad)";
  return "var(--accent)";
}

function clamp(n: number) {
  return Math.max(0, Math.min(100, n));
}

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy - r * Math.sin(rad),
  };
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const start = polar(cx, cy, r, startDeg);
  const end = polar(cx, cy, r, endDeg);
  const sweep = startDeg - endDeg;
  const large = sweep > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y}`;
}

export function Speedometer({
  value,
  label,
  displayValue,
  tone = "neutral",
  size = "md",
  empty = false,
  onClick,
  title,
}: Props) {
  const s = SIZES[size];
  const cx = s.w / 2;
  const cy = s.arcH - 4;
  const startAngle = 180;
  const endAngle = 0;
  const pct = empty ? 0 : clamp(value);
  const needleAngle = startAngle - (pct / 100) * (startAngle - endAngle);
  const needleTip = polar(cx, cy, s.needle, needleAngle);
  const color = toneColor(tone, empty);
  const track = "var(--border)";
  const valueArc = empty ? track : color;

  const body = (
    <>
      <svg
        viewBox={`0 0 ${s.w} ${s.arcH}`}
        width={s.w}
        height={s.arcH}
        className="speedometer-svg"
        aria-hidden
      >
        <path
          d={arcPath(cx, cy, s.r, startAngle, endAngle)}
          fill="none"
          stroke={track}
          strokeWidth={s.stroke}
          strokeLinecap="round"
        />
        {!empty && pct > 0 && (
          <path
            d={arcPath(cx, cy, s.r, startAngle, needleAngle)}
            fill="none"
            stroke={valueArc}
            strokeWidth={s.stroke}
            strokeLinecap="round"
          />
        )}
        <line
          x1={cx}
          y1={cy}
          x2={needleTip.x}
          y2={needleTip.y}
          stroke={empty ? track : "var(--text)"}
          strokeWidth={size === "sm" ? 1.5 : 2}
          strokeLinecap="round"
        />
        <circle cx={cx} cy={cy} r={size === "sm" ? 2.5 : 3.5} fill={empty ? track : "var(--text)"} />
      </svg>
      {displayValue && (
        <span
          className={`speedometer-value size-${size}${empty ? " empty" : ""}`}
          aria-label={label ? `${label}: ${displayValue}` : displayValue}
        >
          {displayValue}
        </span>
      )}
      {label && <span className={`speedometer-label size-${size}`}>{label}</span>}
    </>
  );

  const className = `speedometer size-${size} tone-${empty ? "neutral" : tone}${onClick ? " clickable" : ""}`;

  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick} title={title}>
        {body}
      </button>
    );
  }

  return (
    <div className={className} title={title}>
      {body}
    </div>
  );
}
