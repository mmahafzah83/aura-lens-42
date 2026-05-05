import { BLACKBOARD, SchematicSpec, annotationStyle } from './blackboard';

interface Props { spec: SchematicSpec; width: number; height: number; }

/** nodes[0] = bottom layer ... nodes[n-1] = apex. */
export default function PyramidDiagram({ spec, width, height }: Props) {
  const layers = spec.nodes;
  const n = layers.length;
  const pad = 60;
  const totalH = height - 100;
  const layerH = totalH / n;
  const baseW = width - pad * 2;
  const apexW = baseW * 0.15;
  const cx = width / 2;
  const startY = 50;

  return (
    <g>
      {layers.map((layer, i) => {
        // i=0 bottom, i=n-1 apex
        const fromBottom = i;
        const tBot = fromBottom / n;
        const tTop = (fromBottom + 1) / n;
        const wBot = baseW + (apexW - baseW) * tBot;
        const wTop = baseW + (apexW - baseW) * tTop;
        const yBot = startY + totalH - fromBottom * layerH;
        const yTop = yBot - layerH + 4;
        const isUpper = i >= Math.ceil(n / 2);
        const stroke = isUpper || layer.highlighted ? BLACKBOARD.gold : BLACKBOARD.chalkFaint;
        const fill = layer.highlighted ? BLACKBOARD.nodeFillHighlighted : BLACKBOARD.nodeFill;
        const points = [
          [cx - wTop / 2, yTop],
          [cx + wTop / 2, yTop],
          [cx + wBot / 2, yBot],
          [cx - wBot / 2, yBot],
        ].map((p) => p.join(',')).join(' ');
        return (
          <g key={layer.id}>
            <polygon points={points} fill={fill} stroke={stroke} strokeWidth={1.5} />
            <text x={cx} y={(yTop + yBot) / 2 + 5} textAnchor="middle"
              fontFamily={BLACKBOARD.fonts.body} fontSize={14}
              fill={isUpper || layer.highlighted ? BLACKBOARD.goldBright : BLACKBOARD.chalk}>
              {layer.label}
            </text>
          </g>
        );
      })}
      {/* Crown annotation above apex */}
      <text x={cx} y={startY - 8} textAnchor="middle"
        fontFamily={BLACKBOARD.fonts.handwritten} fontSize={26} fill={BLACKBOARD.gold}
        transform={`rotate(-4 ${cx} ${startY - 8})`}>
        ↑ the goal
      </text>
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
