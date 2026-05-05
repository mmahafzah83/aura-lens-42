import { BLACKBOARD, SchematicSpec, edgeStroke } from './blackboard';

interface Props { spec: SchematicSpec; width: number; height: number; }

export default function FlowDiagram({ spec, width, height }: Props) {
  const nodes = spec.nodes;
  const wrap = nodes.length > 5;
  const rows = wrap ? 2 : 1;
  const perRow = Math.ceil(nodes.length / rows);
  const nodeW = Math.min(180, (width - 80) / perRow - 30);
  const nodeH = 70;
  const positions: Record<string, { x: number; y: number }> = {};
  nodes.forEach((n, i) => {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const rowCount = row === rows - 1 ? nodes.length - perRow * (rows - 1) : perRow;
    const totalRowW = rowCount * nodeW + (rowCount - 1) * 40;
    const startX = (width - totalRowW) / 2;
    positions[n.id] = {
      x: startX + col * (nodeW + 40),
      y: rows === 1 ? height / 2 - nodeH / 2 : height / 2 - nodeH - 20 + row * (nodeH + 60),
    };
  });

  return (
    <g>
      <defs>
        <marker id="flow-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill={BLACKBOARD.chalkDim} />
        </marker>
        <marker id="flow-arrow-gold" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill={BLACKBOARD.gold} />
        </marker>
      </defs>
      {(spec.edges ?? nodes.slice(0, -1).map((n, i) => ({ from: n.id, to: nodes[i + 1].id }))).map((e, i) => {
        const a = positions[e.from], b = positions[e.to];
        if (!a || !b) return null;
        const x1 = a.x + nodeW, y1 = a.y + nodeH / 2;
        const x2 = b.x, y2 = b.y + nodeH / 2;
        const s = edgeStroke(e.style);
        return (
          <line key={i} x1={x1} y1={y1} x2={x2 - 4} y2={y2}
            stroke={s.stroke} strokeWidth={s.strokeWidth} strokeDasharray={s.strokeDasharray}
            markerEnd={e.style === 'gold' ? 'url(#flow-arrow-gold)' : 'url(#flow-arrow)'} />
        );
      })}
      {nodes.map((n) => {
        const p = positions[n.id];
        const stroke = n.highlighted ? BLACKBOARD.nodeStrokeHighlighted : BLACKBOARD.nodeStroke;
        const fill = n.highlighted ? BLACKBOARD.nodeFillHighlighted : BLACKBOARD.nodeFill;
        return (
          <g key={n.id}>
            <rect x={p.x} y={p.y} width={nodeW} height={nodeH} rx={2} fill={fill} stroke={stroke} strokeWidth={1.5} />
            <text x={p.x + nodeW / 2} y={p.y + nodeH / 2 + 5} textAnchor="middle"
              fontFamily={BLACKBOARD.fonts.body} fontSize={15} fill={n.highlighted ? BLACKBOARD.goldBright : BLACKBOARD.chalk}>
              {n.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}
