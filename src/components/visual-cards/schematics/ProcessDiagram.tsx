import { BLACKBOARD, SchematicSpec } from './blackboard';

interface Props { spec: SchematicSpec; width: number; height: number; }

/** Vertical top-down process. Node value === 'decision' renders as diamond. */
export default function ProcessDiagram({ spec, width, height }: Props) {
  const steps = spec.nodes;
  const stepH = 70;
  const gap = 28;
  const totalH = steps.length * stepH + (steps.length - 1) * gap;
  const startY = (height - totalH) / 2;
  const cx = width / 2;
  const stepW = Math.min(420, width * 0.55);

  return (
    <g>
      <defs>
        <marker id="proc-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill={BLACKBOARD.chalkDim} />
        </marker>
      </defs>
      {steps.map((s, i) => {
        const y = startY + i * (stepH + gap);
        const stroke = s.highlighted ? BLACKBOARD.gold : BLACKBOARD.chalkFaint;
        const fill = s.highlighted ? BLACKBOARD.nodeFillHighlighted : BLACKBOARD.nodeFill;
        const labelColor = s.highlighted ? BLACKBOARD.goldBright : BLACKBOARD.chalk;
        const isDecision = s.value === 'decision';
        return (
          <g key={s.id}>
            {isDecision ? (
              <polygon
                points={[
                  [cx, y], [cx + stepW / 2, y + stepH / 2],
                  [cx, y + stepH], [cx - stepW / 2, y + stepH / 2],
                ].map((p) => p.join(',')).join(' ')}
                fill={fill} stroke={stroke} strokeWidth={1.5} />
            ) : (
              <rect x={cx - stepW / 2} y={y} width={stepW} height={stepH} rx={6}
                fill={fill} stroke={stroke} strokeWidth={1.5} />
            )}
            <text x={cx - stepW / 2 + 18} y={y + stepH / 2 + 5}
              fontFamily={BLACKBOARD.fonts.mono} fontSize={13} fill={BLACKBOARD.gold}>
              {String(i + 1).padStart(2, '0')}
            </text>
            <text x={cx} y={y + stepH / 2 + 5} textAnchor="middle"
              fontFamily={BLACKBOARD.fonts.body} fontSize={15} fill={labelColor}>
              {s.label}
            </text>

            {i < steps.length - 1 && (
              <line x1={cx} y1={y + stepH + 2} x2={cx} y2={y + stepH + gap - 4}
                stroke={BLACKBOARD.chalkDim} strokeWidth={1.5} markerEnd="url(#proc-arrow)" />
            )}
          </g>
        );
      })}
    </g>
  );
}
