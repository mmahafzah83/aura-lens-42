import { BLACKBOARD, SchematicSpec, edgeStroke } from './blackboard';

interface Props { spec: SchematicSpec; width: number; height: number; }

export default function CycleDiagram({ spec, width, height }: Props) {
  const cx = width / 2, cy = height / 2;
  const radius = Math.min(width, height) * 0.35;
  const nodeR = 56;
  const n = spec.nodes.length;
  const positions = spec.nodes.map((node, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return { node, x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle), angle };
  });

  return (
    <g>
      <defs>
        <marker id="cycle-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill={BLACKBOARD.gold} />
        </marker>
      </defs>
      {positions.map((p, i) => {
        const next = positions[(i + 1) % n];
        const mx = (p.x + next.x) / 2;
        const my = (p.y + next.y) / 2;
        const dx = next.x - p.x, dy = next.y - p.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const nx = -dy / len, ny = dx / len;
        const bend = 40;
        const ctrlX = mx + nx * bend, ctrlY = my + ny * bend;
        // start/end on node edge
        const sa = Math.atan2(ctrlY - p.y, ctrlX - p.x);
        const ea = Math.atan2(ctrlY - next.y, ctrlX - next.x);
        const sx = p.x + nodeR * Math.cos(sa), sy = p.y + nodeR * Math.sin(sa);
        const ex = next.x + nodeR * Math.cos(ea), ey = next.y + nodeR * Math.sin(ea);
        return (
          <path key={i} d={`M ${sx} ${sy} Q ${ctrlX} ${ctrlY} ${ex} ${ey}`}
            stroke={BLACKBOARD.gold} strokeWidth={1.5} fill="none" markerEnd="url(#cycle-arrow)" />
        );
      })}
      {positions.map(({ node, x, y }) => {
        const stroke = node.highlighted ? BLACKBOARD.nodeStrokeHighlighted : BLACKBOARD.nodeStroke;
        const fill = node.highlighted ? BLACKBOARD.nodeFillHighlighted : BLACKBOARD.nodeFill;
        return (
          <g key={node.id}>
            <circle cx={x} cy={y} r={nodeR} fill={fill} stroke={stroke} strokeWidth={1.5} />
            <text x={x} y={y + 5} textAnchor="middle" fontFamily={BLACKBOARD.fonts.body}
              fontSize={14} fill={node.highlighted ? BLACKBOARD.goldBright : BLACKBOARD.chalk}>
              {node.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}
