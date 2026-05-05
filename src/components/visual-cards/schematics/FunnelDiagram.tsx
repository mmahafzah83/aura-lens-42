import { BLACKBOARD, SchematicSpec } from './blackboard';

interface Props { spec: SchematicSpec; width: number; height: number; }

export default function FunnelDiagram({ spec, width, height }: Props) {
  const layers = spec.nodes;
  const layerH = (height - 80) / layers.length;
  const topW = width * 0.75;
  const botW = width * 0.25;
  const cx = width / 2;
  const startY = 40;

  return (
    <g>
      {layers.map((layer, i) => {
        const t = i / layers.length;
        const tNext = (i + 1) / layers.length;
        const wTop = topW + (botW - topW) * t;
        const wBot = topW + (botW - topW) * tNext;
        const y = startY + i * layerH;
        const isLast = i === layers.length - 1;
        const stroke = isLast || layer.highlighted ? BLACKBOARD.gold : BLACKBOARD.chalkFaint;
        const fill = isLast || layer.highlighted ? BLACKBOARD.nodeFillHighlighted : BLACKBOARD.nodeFill;
        const points = [
          [cx - wTop / 2, y],
          [cx + wTop / 2, y],
          [cx + wBot / 2, y + layerH - 4],
          [cx - wBot / 2, y + layerH - 4],
        ].map((p) => p.join(',')).join(' ');
        return (
          <g key={layer.id}>
            <polygon points={points} fill={fill} stroke={stroke} strokeWidth={1.5} />
            <text x={cx} y={y + layerH / 2 + 4} textAnchor="middle"
              fontFamily={BLACKBOARD.fonts.body} fontSize={15}
              fill={isLast || layer.highlighted ? BLACKBOARD.goldBright : BLACKBOARD.chalk}>
              {layer.label}
            </text>
            {layer.value && (
              <text x={cx + wTop / 2 + 16} y={y + layerH / 2 + 4}
                fontFamily={BLACKBOARD.fonts.mono} fontSize={13} fill={BLACKBOARD.chalkDim}>
                {layer.value}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}
