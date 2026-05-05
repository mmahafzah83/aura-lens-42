import { BLACKBOARD, SchematicSpec } from './blackboard';

interface Props { spec: SchematicSpec; width: number; height: number; }

/** 2 or 3 circles. Last node (highlighted=true) acts as overlap label. */
export default function VennDiagram({ spec, width, height }: Props) {
  const circles = spec.nodes.filter((n) => !n.highlighted);
  const overlap = spec.nodes.find((n) => n.highlighted);
  const cx = width / 2, cy = height / 2;
  const r = Math.min(width, height) * 0.26;
  const accents = [BLACKBOARD.teal, BLACKBOARD.ember, BLACKBOARD.chalk];

  let positions: { x: number; y: number }[] = [];
  if (circles.length === 2) {
    positions = [
      { x: cx - r * 0.55, y: cy },
      { x: cx + r * 0.55, y: cy },
    ];
  } else {
    positions = [
      { x: cx, y: cy - r * 0.5 },
      { x: cx - r * 0.55, y: cy + r * 0.4 },
      { x: cx + r * 0.55, y: cy + r * 0.4 },
    ];
  }

  return (
    <g>
      {circles.map((c, i) => {
        const p = positions[i] ?? { x: cx, y: cy };
        const accent = accents[i % accents.length];
        return (
          <g key={c.id}>
            <circle cx={p.x} cy={p.y} r={r} fill={accent} fillOpacity={0.08} stroke={accent} strokeWidth={2} />
            <text x={p.x} y={p.y - r - 14} textAnchor="middle"
              fontFamily={BLACKBOARD.fonts.body} fontSize={16} fill={accent}>
              {c.label}
            </text>
          </g>
        );
      })}
      {/* Overlap badge */}
      {overlap && (
        <g>
          <circle cx={cx} cy={cy + (circles.length === 3 ? r * 0.1 : 0)} r={r * 0.45}
            fill={BLACKBOARD.gold} fillOpacity={0.18} stroke={BLACKBOARD.gold} strokeWidth={2} />
          <text x={cx} y={cy + (circles.length === 3 ? r * 0.1 : 0) + 5} textAnchor="middle"
            fontFamily={BLACKBOARD.fonts.body} fontSize={14} fill={BLACKBOARD.goldBright}>
            {overlap.label}
          </text>
        </g>
      )}
    </g>
  );
}
