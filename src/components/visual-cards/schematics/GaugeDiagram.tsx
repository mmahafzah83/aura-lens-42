import { BLACKBOARD, SchematicSpec, annotationStyle } from './blackboard';

interface Props { spec: SchematicSpec; width: number; height: number; }

/** First node value = score 0-100. */
export default function GaugeDiagram({ spec, width, height }: Props) {
  const score = Math.max(0, Math.min(100, parseFloat(spec.nodes[0]?.value ?? '50')));
  const cx = width / 2;
  const cy = height * 0.7;
  const r = Math.min(width * 0.38, height * 0.55);
  const startA = Math.PI; // 180°
  const endA = 0; // 0°

  const polar = (radius: number, angle: number) => ({
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(-angle),
  });

  // Build arc path 180° → 0°
  const start = polar(r, startA);
  const end = polar(r, endA);
  const arcPath = `M ${start.x} ${start.y} A ${r} ${r} 0 0 1 ${end.x} ${end.y}`;

  // Tick marks
  const ticks = [0, 25, 50, 75, 100];

  // Needle
  const needleAngle = Math.PI - (score / 100) * Math.PI;
  const needleEnd = polar(r - 30, needleAngle);

  return (
    <g>
      <defs>
        <linearGradient id="gauge-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={BLACKBOARD.ember} />
          <stop offset="55%" stopColor={BLACKBOARD.gold} />
          <stop offset="100%" stopColor={BLACKBOARD.teal} />
        </linearGradient>
      </defs>

      <path d={arcPath} stroke="url(#gauge-grad)" strokeWidth={28} fill="none" strokeLinecap="butt" />

      {ticks.map((t) => {
        const a = Math.PI - (t / 100) * Math.PI;
        const inner = polar(r - 20, a);
        const outer = polar(r + 16, a);
        const labelP = polar(r + 36, a);
        return (
          <g key={t}>
            <line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y}
              stroke={BLACKBOARD.chalkDim} strokeWidth={1.5} />
            <text x={labelP.x} y={labelP.y + 4} textAnchor="middle"
              fontFamily={BLACKBOARD.fonts.mono} fontSize={11} fill={BLACKBOARD.chalkDim}>
              {t}
            </text>
          </g>
        );
      })}

      {/* Needle */}
      <line x1={cx} y1={cy} x2={needleEnd.x} y2={needleEnd.y}
        stroke={BLACKBOARD.gold} strokeWidth={3} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={8} fill={BLACKBOARD.gold} />

      {/* Central score */}
      <text x={cx} y={cy - 30} textAnchor="middle"
        fontFamily={BLACKBOARD.fonts.display} fontSize={64} fill={BLACKBOARD.goldBright}>
        {Math.round(score)}
      </text>

      {/* Zone labels */}
      <g transform={`translate(0, ${cy + 50})`}>
        {[
          { label: 'CRITICAL', color: BLACKBOARD.ember, x: cx - 220 },
          { label: 'DEVELOPING', color: BLACKBOARD.chalk, x: cx - 70 },
          { label: 'MATURE', color: BLACKBOARD.gold, x: cx + 80 },
          { label: 'LEADING', color: BLACKBOARD.teal, x: cx + 210 },
        ].map((z) => (
          <text key={z.label} x={z.x} y={0} textAnchor="middle"
            fontFamily={BLACKBOARD.fonts.mono} fontSize={11} letterSpacing={2} fill={z.color}>
            {z.label}
          </text>
        ))}
      </g>

      {(spec.annotations ?? []).map((a, i) => {
        const s = annotationStyle(a);
        return (
          <text key={i} x={a.position.x} y={a.position.y}
            fontFamily={s.fontFamily} fontSize={s.fontSize} fill={s.fill}>
            {a.text}
          </text>
        );
      })}
    </g>
  );
}
