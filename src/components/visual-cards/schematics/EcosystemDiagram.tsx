import { BLACKBOARD, SchematicSpec, edgeStroke } from './blackboard';

interface Props { spec: SchematicSpec; width: number; height: number; }

/**
 * First node = central hub. Remaining nodes = satellites.
 * Edges define connection style: 'gold' (connected), 'solid' (chalk = neutral),
 * 'dashed' = disconnected. Edge with label === 'GAP' uses ember dashed.
 */
export default function EcosystemDiagram({ spec, width, height }: Props) {
  const center = spec.nodes[0];
  const satellites = spec.nodes.slice(1);
  const cx = width / 2;
  const cy = height / 2;
  const orbit = Math.min(width, height) * 0.36;
  const centerR = 70;
  const satR = 46;

  const positions: Record<string, { x: number; y: number }> = {};
  if (center) positions[center.id] = { x: cx, y: cy };
  satellites.forEach((s, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / satellites.length;
    positions[s.id] = { x: cx + orbit * Math.cos(angle), y: cy + orbit * Math.sin(angle) };
  });

  const renderEdge = (from: { x: number; y: number }, to: { x: number; y: number },
                      e: { style?: 'solid' | 'dashed' | 'gold'; label?: string }, key: string) => {
    const dx = to.x - from.x, dy = to.y - from.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const ux = dx / len, uy = dy / len;
    const x1 = from.x + ux * centerR;
    const y1 = from.y + uy * centerR;
    const x2 = to.x - ux * satR;
    const y2 = to.y - uy * satR;
    const isGap = e.label === 'GAP';
    const stroke = isGap ? BLACKBOARD.ember : (e.style === 'gold' ? BLACKBOARD.gold : BLACKBOARD.chalkDim);
    const dash = isGap || e.style === 'dashed' ? '5 5' : undefined;
    const sw = e.style === 'gold' ? 2 : 1.5;
    return (
      <g key={key}>
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={sw} strokeDasharray={dash} />
        {e.label && e.label !== 'GAP' && (
          <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 6} textAnchor="middle"
            fontFamily={BLACKBOARD.fonts.mono} fontSize={10} fill={BLACKBOARD.chalkDim}>
            {e.label}
          </text>
        )}
        {isGap && (
          <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 6} textAnchor="middle"
            fontFamily={BLACKBOARD.fonts.handwritten} fontSize={18} fill={BLACKBOARD.ember}>
            no direct link
          </text>
        )}
      </g>
    );
  };

  // Default: connect center to each satellite if no edges given
  const edges = spec.edges ?? satellites.map((s) => ({ from: center?.id ?? '', to: s.id, style: 'gold' as const }));

  return (
    <g>
      {edges.map((e, i) => {
        const a = positions[e.from], b = positions[e.to];
        if (!a || !b) return null;
        return renderEdge(a, b, e, `e-${i}`);
      })}

      {/* Satellites */}
      {satellites.map((s) => {
        const p = positions[s.id];
        const stroke = s.highlighted ? BLACKBOARD.gold : BLACKBOARD.chalkFaint;
        return (
          <g key={s.id}>
            <circle cx={p.x} cy={p.y} r={satR} fill={BLACKBOARD.nodeFill} stroke={stroke} strokeWidth={1.5} />
            <text x={p.x} y={p.y + 5} textAnchor="middle"
              fontFamily={BLACKBOARD.fonts.body} fontSize={12}
              fill={s.highlighted ? BLACKBOARD.goldBright : BLACKBOARD.chalk}>
              {s.label}
            </text>
          </g>
        );
      })}

      {/* Central node */}
      {center && (
        <g>
          <circle cx={cx} cy={cy} r={centerR} fill={BLACKBOARD.nodeFillHighlighted}
            stroke={BLACKBOARD.gold} strokeWidth={2.5} />
          <text x={cx} y={cy + 5} textAnchor="middle"
            fontFamily={BLACKBOARD.fonts.body} fontSize={15} fill={BLACKBOARD.goldBright}>
            {center.label}
          </text>
        </g>
      )}

      {/* Legend */}
      <g transform={`translate(60, ${height - 30})`}>
        <line x1={0} y1={0} x2={28} y2={0} stroke={BLACKBOARD.gold} strokeWidth={2} />
        <text x={36} y={4} fontFamily={BLACKBOARD.fonts.mono} fontSize={10} fill={BLACKBOARD.chalkDim}>CONNECTED</text>
        <line x1={140} y1={0} x2={168} y2={0} stroke={BLACKBOARD.chalkDim} strokeWidth={1.5} strokeDasharray="4 4" />
        <text x={176} y={4} fontFamily={BLACKBOARD.fonts.mono} fontSize={10} fill={BLACKBOARD.chalkDim}>DISCONNECTED</text>
        <line x1={300} y1={0} x2={328} y2={0} stroke={BLACKBOARD.ember} strokeWidth={1.5} strokeDasharray="4 4" />
        <text x={336} y={4} fontFamily={BLACKBOARD.fonts.mono} fontSize={10} fill={BLACKBOARD.ember}>CRITICAL GAP</text>
      </g>

      {/* swallow unused import */}
      {false && edgeStroke('solid')}
    </g>
  );
}
