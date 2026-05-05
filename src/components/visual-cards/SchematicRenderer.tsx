import { BLACKBOARD, SchematicSpec } from './schematics/blackboard';
import FlowDiagram from './schematics/FlowDiagram';
import CycleDiagram from './schematics/CycleDiagram';
import MatrixDiagram from './schematics/MatrixDiagram';
import FunnelDiagram from './schematics/FunnelDiagram';
import TimelineDiagram from './schematics/TimelineDiagram';
import LayersDiagram from './schematics/LayersDiagram';
import RadarDiagram from './schematics/RadarDiagram';
import BarChartDiagram from './schematics/BarChartDiagram';
import BridgeDiagram from './schematics/BridgeDiagram';
import PyramidDiagram from './schematics/PyramidDiagram';
import GaugeDiagram from './schematics/GaugeDiagram';
import ScatterDiagram from './schematics/ScatterDiagram';
import VennDiagram from './schematics/VennDiagram';
import ProcessDiagram from './schematics/ProcessDiagram';
import EquationDiagram from './schematics/EquationDiagram';
import EcosystemDiagram from './schematics/EcosystemDiagram';

export type { SchematicSpec } from './schematics/blackboard';

interface SchematicRendererProps {
  spec: SchematicSpec;
  width?: number;
  height?: number;
}

export default function SchematicRenderer({ spec, width = 1080, height = 1350 }: SchematicRendererProps) {
  const titleAreaH = 200;
  const footerH = 110;
  const diagramH = height - titleAreaH - footerH;
  const diagramY = titleAreaH;

  const renderDiagram = () => {
    switch (spec.type) {
      case 'flow':      return <FlowDiagram spec={spec} width={width} height={diagramH} />;
      case 'cycle':     return <CycleDiagram spec={spec} width={width} height={diagramH} />;
      case 'matrix':    return <MatrixDiagram spec={spec} width={width} height={diagramH} />;
      case 'funnel':    return <FunnelDiagram spec={spec} width={width} height={diagramH} />;
      case 'timeline':  return <TimelineDiagram spec={spec} width={width} height={diagramH} />;
      case 'layers':    return <LayersDiagram spec={spec} width={width} height={diagramH} />;
      case 'radar':     return <RadarDiagram spec={spec} width={width} height={diagramH} />;
      case 'bar_chart': return <BarChartDiagram spec={spec} width={width} height={diagramH} />;
      case 'bridge':    return <BridgeDiagram spec={spec} width={width} height={diagramH} />;
      case 'pyramid':   return <PyramidDiagram spec={spec} width={width} height={diagramH} />;
      case 'gauge':     return <GaugeDiagram spec={spec} width={width} height={diagramH} />;
      case 'scatter':   return <ScatterDiagram spec={spec} width={width} height={diagramH} />;
      case 'venn':      return <VennDiagram spec={spec} width={width} height={diagramH} />;
      case 'process':   return <ProcessDiagram spec={spec} width={width} height={diagramH} />;
      case 'equation':  return <EquationDiagram spec={spec} width={width} height={diagramH} />;
      case 'ecosystem': return <EcosystemDiagram spec={spec} width={width} height={diagramH} />;
      default:
        return (
          <text x={width / 2} y={diagramH / 2} textAnchor="middle"
            fontFamily={BLACKBOARD.fonts.body} fontSize={16} fill={BLACKBOARD.chalkDim}>
            Diagram type "{spec.type}" not yet implemented.
          </text>
        );
    }
  };

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      style={{ display: 'block', maxWidth: '100%', height: 'auto' }}
    >
      <defs>
        <filter id="grain-noise" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix type="matrix" values="0 0 0 0 0.91  0 0 0 0 0.89  0 0 0 0 0.85  0 0 0 0.06 0" />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
      </defs>

      {/* Background */}
      <rect x={0} y={0} width={width} height={height} fill={BLACKBOARD.bg} />
      {/* Grain */}
      <rect x={0} y={0} width={width} height={height} fill={BLACKBOARD.chalk} opacity={0.04} filter="url(#grain-noise)" />

      {/* Title section */}
      <g>
        {spec.tag && (
          <text x={70} y={90} fontFamily={BLACKBOARD.fonts.mono} fontSize={18}
            fill={BLACKBOARD.gold} letterSpacing={3}>
            {spec.tag.toUpperCase()}
          </text>
        )}
        <text x={70} y={spec.tag ? 145 : 110} fontFamily={BLACKBOARD.fonts.title}
          fontSize={42} fontWeight={500} fill={BLACKBOARD.chalk}>
          {spec.title}
        </text>
        {spec.subtitle && (
          <text x={70} y={spec.tag ? 180 : 145} fontFamily={BLACKBOARD.fonts.body}
            fontSize={20} fill={BLACKBOARD.chalkDim}>
            {spec.subtitle}
          </text>
        )}
        <line x1={70} y1={titleAreaH - 10} x2={width - 70} y2={titleAreaH - 10}
          stroke={BLACKBOARD.chalkFaint} strokeWidth={1} />
      </g>

      {/* Diagram area */}
      <g transform={`translate(0, ${diagramY})`}>{renderDiagram()}</g>

      {/* Footer */}
      <g>
        <line x1={70} y1={height - footerH + 10} x2={width - 70} y2={height - footerH + 10}
          stroke={BLACKBOARD.chalkFaint} strokeWidth={1} />
        <text x={70} y={height - 50} fontFamily={BLACKBOARD.fonts.body}
          fontSize={20} fontWeight={500} fill={BLACKBOARD.chalk}>
          {spec.author.name}
        </text>
        <text x={70} y={height - 26} fontFamily={BLACKBOARD.fonts.mono}
          fontSize={13} fill={BLACKBOARD.chalkDim} letterSpacing={1.5}>
          {spec.author.title.toUpperCase()}
        </text>
        <text x={width - 70} y={height - 38} textAnchor="end"
          fontFamily={BLACKBOARD.fonts.display} fontSize={28}
          fontStyle="italic" fill={BLACKBOARD.gold}>
          Aura
        </text>
      </g>
    </svg>
  );
}
