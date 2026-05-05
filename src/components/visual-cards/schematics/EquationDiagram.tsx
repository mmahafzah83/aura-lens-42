import { BLACKBOARD, SchematicSpec, annotationStyle } from './blackboard';

interface Props { spec: SchematicSpec; width: number; height: number; }

/**
 * Convention:
 * - nodes with value === 'wrong' form the struck-through equation (top row).
 * - nodes with value === 'right' form the gold equation (middle row).
 * - last node with value === 'result' renders as result box.
 * Operators alternate (×, +, =) automatically.
 */
export default function EquationDiagram({ spec, width, height }: Props) {
  const wrong = spec.nodes.filter((n) => n.value === 'wrong');
  const right = spec.nodes.filter((n) => n.value === 'right');
  const result = spec.nodes.find((n) => n.value === 'result');

  const renderRow = (
    items: typeof wrong,
    y: number,
    opts: { color: string; stroke: string; strikeThrough?: boolean }
  ) => {
    if (!items.length) return null;
    const boxW = 140, boxH = 70, gap = 60;
    const totalW = items.length * boxW + (items.length - 1) * gap;
    const startX = (width - totalW) / 2;
    const operators = ['×', '+', '=', '+'];
    return (
      <g>
        {items.map((it, i) => {
          const x = startX + i * (boxW + gap);
          return (
            <g key={it.id}>
              <rect x={x} y={y} width={boxW} height={boxH} rx={4}
                fill={BLACKBOARD.nodeFill} stroke={opts.stroke} strokeWidth={1.5} />
              <text x={x + boxW / 2} y={y + boxH / 2 + 5} textAnchor="middle"
                fontFamily={BLACKBOARD.fonts.body} fontSize={14} fill={opts.color}>
                {it.label}
              </text>
              {i < items.length - 1 && (
                <text x={x + boxW + gap / 2} y={y + boxH / 2 + 8} textAnchor="middle"
                  fontFamily={BLACKBOARD.fonts.display} fontSize={28} fill={opts.color}>
                  {operators[i]}
                </text>
              )}
            </g>
          );
        })}
        {opts.strikeThrough && (
          <line x1={startX - 10} y1={y + boxH / 2} x2={startX + totalW + 10} y2={y + boxH / 2}
            stroke={BLACKBOARD.ember} strokeWidth={2.5} />
        )}
      </g>
    );
  };

  const wrongY = 30;
  const rightY = 170;
  const resultY = 310;

  return (
    <g>
      {wrong.length > 0 && (
        <text x={width / 2} y={wrongY - 8} textAnchor="middle"
          fontFamily={BLACKBOARD.fonts.mono} fontSize={11} fill={BLACKBOARD.chalkDim} letterSpacing={2}>
          WHAT EVERYONE THINKS
        </text>
      )}
      {renderRow(wrong, wrongY, { color: BLACKBOARD.chalkDim, stroke: BLACKBOARD.chalkFaint, strikeThrough: true })}

      {right.length > 0 && (
        <text x={width / 2} y={rightY - 8} textAnchor="middle"
          fontFamily={BLACKBOARD.fonts.mono} fontSize={11} fill={BLACKBOARD.gold} letterSpacing={2}>
          WHAT ACTUALLY WORKS
        </text>
      )}
      {renderRow(right, rightY, { color: BLACKBOARD.goldBright, stroke: BLACKBOARD.gold })}

      {result && (
        <g>
          <rect x={width / 2 - 200} y={resultY} width={400} height={80} rx={4}
            fill={BLACKBOARD.nodeFillHighlighted} stroke={BLACKBOARD.gold} strokeWidth={2.5} />
          <text x={width / 2} y={resultY + 50} textAnchor="middle"
            fontFamily={BLACKBOARD.fonts.display} fontSize={28} fontStyle="italic"
            fill={BLACKBOARD.goldBright}>
            {result.label}
          </text>
        </g>
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
