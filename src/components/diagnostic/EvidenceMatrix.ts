export interface EvidenceQuestion {
  level: "Base" | "Intermediate" | "Advanced";
  question: string;
}

export interface SkillEvidence {
  rank: number;
  name: string;
  category: string;
  tier: "High" | "Mid";
  questions: [EvidenceQuestion, EvidenceQuestion, EvidenceQuestion];
}

export const EVIDENCE_MATRIX: SkillEvidence[] = [
  {
    rank: 1,
    name: "Strategic Architecture",
    category: "Strategic",
    tier: "High",
    questions: [
      { level: "Base", question: "Do you own at least one end-to-end transformation framework currently used by a client?" },
      { level: "Intermediate", question: "Have you led a complex redesign of an operating model for a 1,000+ person organization?" },
      { level: "Advanced", question: "Have you successfully 're-architected' a failing multi-million dollar program under board-level scrutiny?" },
    ],
  },
  {
    rank: 2,
    name: "C-Suite Stewardship",
    category: "Strategic",
    tier: "High",
    questions: [
      { level: "Base", question: "Have you led a proposal or strategy session for a Ministerial or C-level stakeholder in the last 12 months?" },
      { level: "Intermediate", question: "Can you name 3 instances where you successfully navigated a conflict between competing government/entity heads?" },
      { level: "Advanced", question: "Have you ever served as a 'Trusted Advisor' to a CEO/VP where they sought your counsel privately on a non-project issue?" },
    ],
  },
  {
    rank: 3,
    name: "Sector Foresight",
    category: "Strategic",
    tier: "High",
    questions: [
      { level: "Base", question: "Have you published or presented a 'Future of the Sector' PoV (Point of View) in the last 6 months?" },
      { level: "Intermediate", question: "Can you identify 3 regulatory or technological shifts that will disrupt your sector by 2030?" },
      { level: "Advanced", question: "Have you influenced a client's long-term (5-year) capital investment plan based on your own market predictions?" },
    ],
  },
  {
    rank: 4,
    name: "Digital Synthesis",
    category: "Technical",
    tier: "High",
    questions: [
      { level: "Base", question: "Are you currently using Agentic AI or Advanced Analytics to reduce project delivery time by >20%?" },
      { level: "Intermediate", question: "Have you led a digital transformation where 'Culture Change' was the primary KPI, not just the technology?" },
      { level: "Advanced", question: "Can you demonstrate how your digital strategy directly resulted in a measurable ROI increase for a client?" },
    ],
  },
  {
    rank: 5,
    name: "Executive Presence",
    category: "Leadership",
    tier: "High",
    questions: [
      { level: "Base", question: "Do you regularly present to Boards without requiring a more senior Partner to 'shadow' or 'save' the room?" },
      { level: "Intermediate", question: "Have you mastered a 'Signature Voice' that is recognized by clients as uniquely yours (Authority + Style)?" },
      { level: "Advanced", question: "Can you maintain 'Command of the Room' even when presenting a controversial or negative strategic finding?" },
    ],
  },
  {
    rank: 6,
    name: "Commercial Velocity",
    category: "Commercial",
    tier: "Mid",
    questions: [
      { level: "Base", question: "Have you personally originated or significantly expanded a project account in the last fiscal year?" },
      { level: "Intermediate", question: "Do you manage a project pipeline worth more than 5x your own annual salary/target?" },
      { level: "Advanced", question: "Have you successfully negotiated 'Value-Based' pricing rather than just 'Time & Materials' for a major contract?" },
    ],
  },
  {
    rank: 7,
    name: "Human-Centric Leadership",
    category: "Leadership",
    tier: "Mid",
    questions: [
      { level: "Base", question: "Do you have a documented succession plan for your current project or team leads?" },
      { level: "Intermediate", question: "Have you successfully 're-engaged' a low-performing team during a high-stress delivery phase?" },
      { level: "Advanced", question: "Can you cite 3 examples where you prioritized 'Team Psychological Safety' over a short-term deadline?" },
    ],
  },
  {
    rank: 8,
    name: "Operational Resilience",
    category: "Technical",
    tier: "Mid",
    questions: [
      { level: "Base", question: "Have you managed a project crisis where the 'Path to Green' required a total pivot of the original scope?" },
      { level: "Intermediate", question: "Do you utilize a formal Risk Management Framework that predicts issues before they hit the budget?" },
      { level: "Advanced", question: "Can you maintain stable delivery across multiple, geographically dispersed or cross-functional teams?" },
    ],
  },
  {
    rank: 9,
    name: "Geopolitical Fluency",
    category: "Strategic",
    tier: "Mid",
    questions: [
      { level: "Base", question: "Can you articulate how Vision 2030's 'Giga Projects' specifically impact your client's supply chain?" },
      { level: "Intermediate", question: "Have you managed a project involving international stakeholders with conflicting regional interests?" },
      { level: "Advanced", question: "Do you adjust your strategic advice based on global macro-trends (e.g., Green Hydrogen, Trade Realignments)?" },
    ],
  },
  {
    rank: 10,
    name: "Value-Based P&L",
    category: "Commercial",
    tier: "Mid",
    questions: [
      { level: "Base", question: "Do you track project success based on 'Client Value Realized' rather than just 'Budget Spent'?" },
      { level: "Intermediate", question: "Have you successfully identified and cut 'Wasteful Spend' in a project that the client hadn't noticed?" },
      { level: "Advanced", question: "Can you prove that your leadership increased the 'Lifetime Value' (LTV) of a specific client account?" },
    ],
  },
];

export function calculateScore(checks: boolean[]): number {
  const count = checks.filter(Boolean).length;
  if (count === 0) return 10;
  if (count === 1) return 40;
  if (count === 2) return 70;
  return 100;
}
