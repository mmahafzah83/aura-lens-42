import { BLACKBOARD, SchematicSpec, annotationStyle } from './blackboard';

interface Props { spec: SchematicSpec; width: number; height: number; }

/** Nodes rendered bottom-up: nodes[0] is bottom layer. Highlighted layers use gold stroke. */
export default function LayersDiagram({ spec, width, height }: Props) {
  const layers = spec.nodes;
  const pad = 80;
  const layerH = (height - 80) / layers.length;
  const w = width - pad * 2;

  return (
    <g>
      {layers.map((l, i) => {
        const y = height - 40 - (i + 1) * layerH;
        const stroke = l.highlighted ? BLACKBOARD.gold : BLACKBOARD.chalkFaint;
        const fill = l.highlighted ? BLACKBOARD.nodeFillHighlighted : BLACKBOARD.nodeFill;
        return (
          <g key={l.id}>
            <rect x={pad} y={y} width={w} height={layerH - 6} fill={fill} stroke={stroke} strokeWidth={1.5} rx={2} />
            <text x={pad + 20} y={y + layerH / 2 + 4} fontFamily={BLACKBOARD.fonts.body}
              fontSize={15} fill={l.highlighted ? BLACKBOARD.goldBright : BLACKBOARD.chalk}>
              {l.label}
            </text>
            {l.value && (
              <text x={pad + w - 20} y={y + layerH / 2 + 4} textAnchor="end"
                fontFamily={BLACKBOARD.fonts.mono} fontSize={12} fill={BLACKBOARD.chalkDim}>
                {l.value}
              </text>
            )}
          </g>
        );
      })}
      {(spec.annotations ?? []).map((a, i) => {
        const s = annotationStyle(a);
        return (
          <text key={i} x={a.position.x} y={a.position.y}
            fontFamily={s.fontFamily} fontSize={s.fontSize} fill={s.fill}>
            {a.text}
          </text>
        );
      })}
    </g>
  );
}
