import { BLACKBOARD, SchematicSpec } from './blackboard';

interface Props { spec: SchematicSpec; width: number; height: number; }

/** Nodes with id 'now' get gold treatment. Nodes with value === 'future' render dashed. */
export default function TimelineDiagram({ spec, width, height }: Props) {
  const events = spec.nodes;
  const pad = 80;
  const y = height / 2;
  const usable = width - pad * 2;
  const positions = events.map((e, i) => ({
    e,
    x: pad + (usable * i) / Math.max(1, events.length - 1),
    above: i % 2 === 0,
  }));

  return (
    <g>
      {/* Main timeline */}
      <line x1={pad} y1={y} x2={width - pad} y2={y} stroke={BLACKBOARD.chalkDim} strokeWidth={2} />

      {positions.map(({ e, x, above }) => {
        const isNow = e.id === 'now' || e.highlighted;
        const isFuture = e.value === 'future';
        const color = isNow ? BLACKBOARD.gold : BLACKBOARD.chalk;
        const labelY = above ? y - 50 : y + 70;
        const tickY1 = above ? y - 30 : y;
        const tickY2 = above ? y : y + 30;
        return (
          <g key={e.id}>
            <line x1={x} y1={tickY1} x2={x} y2={tickY2}
              stroke={color} strokeWidth={1.5}
              strokeDasharray={isFuture ? '4 4' : undefined} />
            <circle cx={x} cy={y} r={isNow ? 7 : 4}
              fill={isNow ? BLACKBOARD.gold : BLACKBOARD.bg}
              stroke={color} strokeWidth={1.5} />
            <text x={x} y={labelY} textAnchor="middle"
              fontFamily={BLACKBOARD.fonts.body} fontSize={13}
              fill={isNow ? BLACKBOARD.goldBright : BLACKBOARD.chalk}>
              {e.label}
            </text>
            {e.value && e.value !== 'future' && (
              <text x={x} y={labelY + (above ? -16 : 16)} textAnchor="middle"
                fontFamily={BLACKBOARD.fonts.mono} fontSize={11} fill={BLACKBOARD.chalkDim}>
                {e.value}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}
