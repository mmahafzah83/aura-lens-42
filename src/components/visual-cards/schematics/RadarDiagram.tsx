import { BLACKBOARD, SchematicSpec, annotationStyle } from './blackboard';

interface Props { spec: SchematicSpec; width: number; height: number; }

/** Each node: label + value (0-100). Optional 'benchmark' annotation per node uses position to define benchmark value. */
export default function RadarDiagram({ spec, width, height }: Props) {
  const cx = width / 2, cy = height / 2 + 10;
  const radius = Math.min(width, height) * 0.34;
  const n = spec.nodes.length;
  const angles = spec.nodes.map((_, i) => -Math.PI / 2 + (i * 2 * Math.PI) / n);

  const point = (r: number, angle: number) => ({
    x: cx + r * Math.cos(angle),
    y: cy + r * Math.sin(angle),
  });

  const rings = [0.25, 0.5, 0.75, 1];

  const userPolygon = spec.nodes.map((node, i) => {
    const v = parseFloat(node.value ?? '60') / 100;
    return point(radius * v, angles[i]);
  });
  const benchmarkPolygon = spec.nodes.map((_, i) => point(radius * 0.85, angles[i]));

  const toPath = (pts: { x: number; y: number }[]) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';

  return (
    <g>
      {/* Concentric rings */}
      {rings.map((r, i) => (
        <polygon key={i}
          points={spec.nodes.map((_, j) => {
            const p = point(radius * r, angles[j]);
            return `${p.x},${p.y}`;
          }).join(' ')}
          fill="none" stroke={BLACKBOARD.chalkFaint} strokeWidth={1} strokeDasharray={r === 1 ? undefined : '3 4'} />
      ))}
      {/* Spokes */}
      {angles.map((a, i) => {
        const p = point(radius, a);
        return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke={BLACKBOARD.chalkFaint} strokeWidth={1} />;
      })}
      {/* Benchmark */}
      <path d={toPath(benchmarkPolygon)} fill="none" stroke={BLACKBOARD.chalkDim} strokeWidth={1.5} strokeDasharray="5 4" />
      {/* User */}
      <path d={toPath(userPolygon)} fill={BLACKBOARD.nodeFillHighlighted} stroke={BLACKBOARD.gold} strokeWidth={2} />
      {userPolygon.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={4} fill={BLACKBOARD.gold} />
      ))}
      {/* Axis labels */}
      {spec.nodes.map((node, i) => {
        const p = point(radius + 28, angles[i]);
        return (
          <text key={node.id} x={p.x} y={p.y} textAnchor="middle"
            fontFamily={BLACKBOARD.fonts.body} fontSize={12} fill={BLACKBOARD.chalkDim}>
            {node.label}
          </text>
        );
      })}
      {/* Annotations */}
      {(spec.annotations ?? []).map((a, i) => {
        const s = annotationStyle(a);
        return (
          <text key={i} x={a.position.x} y={a.position.y}
            fontFamily={s.fontFamily} fontSize={s.fontSize} fill={s.fill}
            transform={a.style === 'handwritten' ? `rotate(-4 ${a.position.x} ${a.position.y})` : undefined}>
            {a.text}
          </text>
        );
      })}
      {/* Legend */}
      <g transform={`translate(${width - 180}, ${height - 30})`}>
        <circle cx={0} cy={0} r={5} fill={BLACKBOARD.gold} />
        <text x={12} y={4} fontFamily={BLACKBOARD.fonts.mono} fontSize={11} fill={BLACKBOARD.chalkDim}>YOU</text>
        <rect x={70} y={-5} width={10} height={10} fill="none" stroke={BLACKBOARD.chalkDim} />
        <text x={88} y={4} fontFamily={BLACKBOARD.fonts.mono} fontSize={11} fill={BLACKBOARD.chalkDim}>BENCHMARK</text>
      </g>
    </g>
  );
}
