// Opportunity scoring engine
// Score = 35% demand + 25% interest + 25% contacts + 15% growth

export interface OpportunityMetrics {
  demandCount: number;
  interestCount: number;
  contactCount: number;
  growthRate: number; // percentage, e.g. 38 for +38%
  totalResponses: number; // total responses in the system for normalization
}

export interface OpportunityScore {
  total: number; // 0-100
  demandScore: number;
  interestScore: number;
  contactScore: number;
  growthScore: number;
  interestRate: number; // percentage
  contactRate: number; // percentage
}

// Configurable weights (can be adjusted by admin in the future)
const WEIGHTS = {
  demand: 0.35,
  interest: 0.25,
  contacts: 0.25,
  growth: 0.15,
};

function normalize(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.min(100, (value / max) * 100);
}

export function calculateOpportunityScore(
  metrics: OpportunityMetrics
): OpportunityScore {
  const { demandCount, interestCount, contactCount, growthRate, totalResponses } = metrics;

  // Normalize each metric to 0-100
  const maxDemand = Math.max(totalResponses * 0.1, 1); // top opportunity = 10% of total
  const demandScore = Math.min(100, normalize(demandCount, maxDemand));

  const interestRate = demandCount > 0 ? (interestCount / demandCount) * 100 : 0;
  const interestScore = Math.min(100, interestRate); // already 0-100

  const contactRate = interestCount > 0 ? (contactCount / interestCount) * 100 : 0;
  const contactScore = Math.min(100, contactRate);

  // Growth: cap at +100% for max score
  const growthScore = Math.min(100, Math.max(0, growthRate));

  // Weighted total
  const total = Math.round(
    demandScore * WEIGHTS.demand +
    interestScore * WEIGHTS.interest +
    contactScore * WEIGHTS.contacts +
    growthScore * WEIGHTS.growth
  );

  return {
    total: Math.min(100, Math.max(0, total)),
    demandScore: Math.round(demandScore),
    interestScore: Math.round(interestScore),
    contactScore: Math.round(contactScore),
    growthScore: Math.round(growthScore),
    interestRate: Math.round(interestRate * 10) / 10,
    contactRate: Math.round(contactRate * 10) / 10,
  };
}

// Generate a human-readable explanation for why this opportunity is interesting
export function generateOpportunitySummary(
  name: string,
  score: OpportunityScore,
  metrics: OpportunityMetrics
): string {
  const parts: string[] = [];

  if (metrics.demandCount > 50) {
    parts.push(`Cette idée apparaît fréquemment avec ${metrics.demandCount} réponses similaires`);
  } else if (metrics.demandCount > 10) {
    parts.push(`Cette idée a été mentionnée par ${metrics.demandCount} personnes`);
  }

  if (score.interestRate > 60) {
    parts.push(`un taux d'intérêt élevé de ${score.interestRate}%`);
  } else if (score.interestRate > 40) {
    parts.push(`un taux d'intérêt de ${score.interestRate}%`);
  }

  if (metrics.contactCount > 20) {
    parts.push(`${metrics.contactCount} personnes souhaitant être contactées`);
  }

  if (metrics.growthRate > 20) {
    parts.push(`une croissance de +${Math.round(metrics.growthRate)}% sur les 30 derniers jours`);
  }

  if (parts.length === 0) {
    return `"${name}" est une opportunité identifiée à partir des données du sondage.`;
  }

  const intro = 'Cette opportunité présente ';
  if (parts.length === 1) {
    return intro + parts[0] + '.';
  }

  const last = parts.pop();
  return intro + parts.join(', ') + ' et ' + last + '.';
}

// Status labels and colors for display
export const OPPORTUNITY_STATUSES = {
  nouvelle: { label: 'Nouvelle', color: '#6c8ebf', icon: '🆕' },
  a_analyser: { label: 'À analyser', color: '#d4a843', icon: '🔍' },
  a_tester: { label: 'À tester', color: '#e8a838', icon: '🟡' },
  test_en_cours: { label: 'Test en cours', color: '#6ba368', icon: '🧪' },
  prometteuse: { label: 'Prometteuse', color: '#4caf50', icon: '🌟' },
  produit_lance: { label: 'Produit lancé', color: '#2196f3', icon: '🚀' },
  abandonnee: { label: 'Abandonnée', color: '#9e9e9e', icon: '❌' },
} as const;

export type OpportunityStatus = keyof typeof OPPORTUNITY_STATUSES;

// Category labels for display
export const CATEGORY_LABELS: Record<string, string> = {
  mode: 'Mode & accessoires',
  tech: 'Électronique & accessoires tech',
  beaute: 'Beauté & soins personnels',
  mixte: 'Mixte',
};

export const CATEGORY_ICONS: Record<string, string> = {
  mode: '👗',
  tech: '📱',
  beaute: '✨',
  mixte: '🔀',
};
