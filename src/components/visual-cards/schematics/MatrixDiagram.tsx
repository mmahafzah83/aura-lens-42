import { BLACKBOARD, SchematicSpec } from './blackboard';

interface Props { spec: SchematicSpec; width: number; height: number; }

/**
 * Expects 4 nodes with ids: tl, tr, bl, br (or first 4 nodes).
 * Annotations with ids 'x-axis' / 'y-axis' (text only) used for axis labels.
 */
export default function MatrixDiagram({ spec, width, height }: Props) {
  const pad = 90;
  const x0 = pad, y0 = 40;
  const w = width - pad * 2, h = height - 100;
  const cx = x0 + w / 2, cy = y0 + h / 2;
  const cells = [
    { id: 'tl', x: x0, y: y0, w: w / 2, h: h / 2 },
    { id: 'tr', x: cx, y: y0, w: w / 2, h: h / 2 },
    { id: 'bl', x: x0, y: cy, w: w / 2, h: h / 2 },
    { id: 'br', x: cx, y: cy, w: w / 2, h: h / 2 },
  ];
  const nodesById: Record<string, (typeof spec.nodes)[0]> = {};
  spec.nodes.forEach((n, i) => {
    nodesById[n.id] = n;
    if (!nodesById[cells[i]?.id] && cells[i]) nodesById[cells[i].id] = n;
  });

  const xAxis = spec.annotations?.find((a) => a.text.startsWith('x:'))?.text.slice(2).trim() ?? '';
  const yAxis = spec.annotations?.find((a) => a.text.startsWith('y:'))?.text.slice(2).trim() ?? '';

  return (
    <g>
      {/* Frame */}
      <rect x={x0} y={y0} width={w} height={h} fill="none" stroke={BLACKBOARD.chalkFaint} strokeWidth={1.5} />
      {/* Dashed dividers */}
      <line x1={cx} y1={y0} x2={cx} y2={y0 + h} stroke={BLACKBOARD.chalkFaint} strokeDasharray="6 6" />
      <line x1={x0} y1={cy} x2={x0 + w} y2={cy} stroke={BLACKBOARD.chalkFaint} strokeDasharray="6 6" />

      {cells.map((c) => {
        const n = nodesById[c.id];
        if (!n) return null;
        const fill = n.highlighted ? BLACKBOARD.nodeFillHighlighted : 'transparent';
        return (
          <g key={c.id}>
            <rect x={c.x + 4} y={c.y + 4} width={c.w - 8} height={c.h - 8} fill={fill} />
            <text x={c.x + c.w / 2} y={c.y + c.h / 2} textAnchor="middle"
              fontFamily={BLACKBOARD.fonts.body} fontSize={16}
              fill={n.highlighted ? BLACKBOARD.goldBright : BLACKBOARD.chalk}>
              {n.label}
            </text>
            {n.value && (
              <text x={c.x + c.w / 2} y={c.y + c.h / 2 + 24} textAnchor="middle"
                fontFamily={BLACKBOARD.fonts.mono} fontSize={12} fill={BLACKBOARD.chalkDim}>
                {n.value}
              </text>
            )}
          </g>
        );
      })}

      {/* X-axis label */}
      <text x={cx} y={y0 + h + 36} textAnchor="middle" fontFamily={BLACKBOARD.fonts.mono}
        fontSize={12} fill={BLACKBOARD.chalkDim} letterSpacing={1.5}>
        {xAxis.toUpperCase()}
      </text>
      {/* Y-axis label rotated */}
      <text transform={`translate(${x0 - 30}, ${cy}) rotate(-90)`} textAnchor="middle"
        fontFamily={BLACKBOARD.fonts.mono} fontSize={12} fill={BLACKBOARD.chalkDim} letterSpacing={1.5}>
        {yAxis.toUpperCase()}
      </text>
    </g>
  );
}
