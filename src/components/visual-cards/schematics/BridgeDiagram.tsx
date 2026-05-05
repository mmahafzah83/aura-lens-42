import { BLACKBOARD, SchematicSpec, annotationStyle } from './blackboard';

interface Props { spec: SchematicSpec; width: number; height: number; }

/** First node = left cliff label, second = right cliff label, third (optional) = arch label. */
export default function BridgeDiagram({ spec, width, height }: Props) {
  const cliffW = width * 0.28;
  const cliffH = height * 0.45;
  const cliffY = height * 0.45;
  const leftX = width * 0.06;
  const rightX = width - cliffW - width * 0.06;
  const gapX1 = leftX + cliffW;
  const gapX2 = rightX;
  const gapMid = (gapX1 + gapX2) / 2;
  const archTop = cliffY - 80;

  const left = spec.nodes[0];
  const right = spec.nodes[1];
  const arch = spec.nodes[2];

  return (
    <g>
      {/* Left cliff */}
      <rect x={leftX} y={cliffY} width={cliffW} height={cliffH} fill={BLACKBOARD.nodeFill}
        stroke={BLACKBOARD.chalkFaint} strokeWidth={1.5} />
      <text x={leftX + cliffW / 2} y={cliffY + cliffH / 2} textAnchor="middle"
        fontFamily={BLACKBOARD.fonts.body} fontSize={18} fill={BLACKBOARD.chalk}>
        {left?.label ?? ''}
      </text>
      {left?.value && (
        <text x={leftX + cliffW / 2} y={cliffY + cliffH / 2 + 28} textAnchor="middle"
          fontFamily={BLACKBOARD.fonts.mono} fontSize={12} fill={BLACKBOARD.chalkDim}>
          {left.value}
        </text>
      )}

      {/* Right cliff */}
      <rect x={rightX} y={cliffY} width={cliffW} height={cliffH} fill={BLACKBOARD.nodeFill}
        stroke={BLACKBOARD.chalkFaint} strokeWidth={1.5} />
      <text x={rightX + cliffW / 2} y={cliffY + cliffH / 2} textAnchor="middle"
        fontFamily={BLACKBOARD.fonts.body} fontSize={18} fill={BLACKBOARD.chalk}>
        {right?.label ?? ''}
      </text>
      {right?.value && (
        <text x={rightX + cliffW / 2} y={cliffY + cliffH / 2 + 28} textAnchor="middle"
          fontFamily={BLACKBOARD.fonts.mono} fontSize={12} fill={BLACKBOARD.chalkDim}>
          {right.value}
        </text>
      )}

      {/* Gap (dashed border on top edge) */}
      <line x1={gapX1} y1={cliffY} x2={gapX2} y2={cliffY}
        stroke={BLACKBOARD.ember} strokeWidth={1.5} strokeDasharray="5 5" />
      <text x={gapMid} y={cliffY + 24} textAnchor="middle"
        fontFamily={BLACKBOARD.fonts.mono} fontSize={13} fill={BLACKBOARD.ember} letterSpacing={3}>
        THE GAP
      </text>

      {/* Bridge supports (dashed gold vertical) */}
      <line x1={gapX1 + 30} y1={cliffY} x2={gapX1 + 30} y2={archTop + 40}
        stroke={BLACKBOARD.gold} strokeWidth={1.5} strokeDasharray="4 4" />
      <line x1={gapX2 - 30} y1={cliffY} x2={gapX2 - 30} y2={archTop + 40}
        stroke={BLACKBOARD.gold} strokeWidth={1.5} strokeDasharray="4 4" />

      {/* Arch (gold curve over the gap) */}
      <path d={`M ${gapX1 - 10} ${cliffY} Q ${gapMid} ${archTop} ${gapX2 + 10} ${cliffY}`}
        stroke={BLACKBOARD.gold} strokeWidth={2.5} fill="none" />
      {arch && (
        <text x={gapMid} y={archTop - 12} textAnchor="middle"
          fontFamily={BLACKBOARD.fonts.body} fontSize={16} fill={BLACKBOARD.goldBright}>
          {arch.label}
        </text>
      )}

      {(spec.annotations ?? []).map((a, i) => {
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
