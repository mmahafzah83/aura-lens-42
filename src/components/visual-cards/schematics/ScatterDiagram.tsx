import { BLACKBOARD, SchematicSpec, annotationStyle } from './blackboard';

interface Props { spec: SchematicSpec; width: number; height: number; }

/** Each node: position {x,y} 0-100; value optional = importance (1-5). Annotations 'x:' / 'y:' set axis labels. */
export default function ScatterDiagram({ spec, width, height }: Props) {
  const padL = 80, padR = 60, padT = 40, padB = 70;
  const w = width - padL - padR;
  const h = height - padT - padB;
  const x0 = padL, y0 = padT;

  const xLabel = spec.annotations?.find((a) => a.text.startsWith('x:'))?.text.slice(2).trim() ?? '';
  const yLabel = spec.annotations?.find((a) => a.text.startsWith('y:'))?.text.slice(2).trim() ?? '';

  const project = (px: number, py: number) => ({
    x: x0 + (px / 100) * w,
    y: y0 + h - (py / 100) * h,
  });

  const grid = [25, 50, 75];

  return (
    <g>
      {/* Grid */}
      {grid.map((g) => (
        <g key={g}>
          <line x1={x0 + (g / 100) * w} y1={y0} x2={x0 + (g / 100) * w} y2={y0 + h}
            stroke={BLACKBOARD.chalkFaint} strokeDasharray="3 5" />
          <line x1={x0} y1={y0 + h - (g / 100) * h} x2={x0 + w} y2={y0 + h - (g / 100) * h}
            stroke={BLACKBOARD.chalkFaint} strokeDasharray="3 5" />
        </g>
      ))}
      {/* Axes */}
      <line x1={x0} y1={y0 + h} x2={x0 + w} y2={y0 + h} stroke={BLACKBOARD.chalkDim} strokeWidth={1.5} />
      <line x1={x0} y1={y0} x2={x0} y2={y0 + h} stroke={BLACKBOARD.chalkDim} strokeWidth={1.5} />

      {/* Points */}
      {spec.nodes.map((n) => {
        const pos = n.position ?? { x: 50, y: 50 };
        const p = project(pos.x, pos.y);
        const importance = parseFloat(n.value ?? '2');
        const r = 5 + importance * 2;
        const fill = n.highlighted ? BLACKBOARD.gold : BLACKBOARD.chalk;
        return (
          <g key={n.id}>
            <circle cx={p.x} cy={p.y} r={r} fill={fill} opacity={0.85} />
            <text x={p.x + r + 6} y={p.y + 4} fontFamily={BLACKBOARD.fonts.body}
              fontSize={11} fill={BLACKBOARD.chalkDim}>
              {n.label}
            </text>
          </g>
        );
      })}

      {/* Axis labels */}
      <text x={x0 + w / 2} y={y0 + h + 36} textAnchor="middle"
        fontFamily={BLACKBOARD.fonts.mono} fontSize={12} fill={BLACKBOARD.chalkDim} letterSpacing={1.5}>
        {xLabel.toUpperCase()}
      </text>
      <text transform={`translate(${x0 - 28}, ${y0 + h / 2}) rotate(-90)`} textAnchor="middle"
        fontFamily={BLACKBOARD.fonts.mono} fontSize={12} fill={BLACKBOARD.chalkDim} letterSpacing={1.5}>
        {yLabel.toUpperCase()}
      </text>

      {(spec.annotations ?? []).filter((a) => !a.text.startsWith('x:') && !a.text.startsWith('y:')).map((a, i) => {
        const s = annotationStyle(a);
        return (
          <text key={i} x={a.position.x} y={a.position.y}
            fontFamily={s.fontFamily} fontSize={s.fontSize} fill={s.fill}
            transform={a.style === 'handwritten' ? `rotate(-3 ${a.position.x} ${a.position.y})` : undefined}>
            {a.text}
          </text>
        );
      })}
    </g>
  );
}
