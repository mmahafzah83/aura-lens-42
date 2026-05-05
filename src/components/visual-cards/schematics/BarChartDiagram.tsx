import { BLACKBOARD, SchematicSpec, annotationStyle } from './blackboard';

interface Props { spec: SchematicSpec; width: number; height: number; }

/**
 * Each node: label = category, value = "spend|value" e.g. "60|20".
 * Renders ember (spend) + gold (value) overlapping bars.
 */
export default function BarChartDiagram({ spec, width, height }: Props) {
  const rows = spec.nodes;
  const padL = 180;
  const padR = 60;
  const padTop = 30;
  const padBot = 70;
  const rowH = (height - padTop - padBot) / rows.length;
  const barH = Math.min(22, rowH * 0.5);
  const usable = width - padL - padR;
  const max = 100;

  return (
    <g>
      {rows.map((r, i) => {
        const [spendStr, valueStr] = (r.value ?? '0|0').split('|');
        const spend = Math.max(0, Math.min(max, parseFloat(spendStr) || 0));
        const value = Math.max(0, Math.min(max, parseFloat(valueStr) || 0));
        const y = padTop + i * rowH + rowH / 2;
        return (
          <g key={r.id}>
            <text x={padL - 14} y={y + 4} textAnchor="end"
              fontFamily={BLACKBOARD.fonts.body} fontSize={13} fill={BLACKBOARD.chalk}>
              {r.label}
            </text>
            {/* Spend (ember) */}
            <rect x={padL} y={y - barH} width={(spend / max) * usable} height={barH}
              fill={BLACKBOARD.ember} opacity={0.85} />
            {/* Value (gold) */}
            <rect x={padL} y={y + 2} width={(value / max) * usable} height={barH}
              fill={BLACKBOARD.gold} opacity={0.85} />
            <text x={padL + (spend / max) * usable + 6} y={y - barH / 2 + 4}
              fontFamily={BLACKBOARD.fonts.mono} fontSize={11} fill={BLACKBOARD.ember}>
              {spend}%
            </text>
            <text x={padL + (value / max) * usable + 6} y={y + 2 + barH / 2 + 4}
              fontFamily={BLACKBOARD.fonts.mono} fontSize={11} fill={BLACKBOARD.gold}>
              {value}%
            </text>
          </g>
        );
      })}
      {/* Legend */}
      <g transform={`translate(${padL}, ${height - 35})`}>
        <rect x={0} y={0} width={14} height={10} fill={BLACKBOARD.ember} />
        <text x={20} y={9} fontFamily={BLACKBOARD.fonts.mono} fontSize={11} fill={BLACKBOARD.chalkDim}>WHERE MONEY GOES</text>
        <rect x={200} y={0} width={14} height={10} fill={BLACKBOARD.gold} />
        <text x={220} y={9} fontFamily={BLACKBOARD.fonts.mono} fontSize={11} fill={BLACKBOARD.chalkDim}>WHERE VALUE IS CREATED</text>
      </g>
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
