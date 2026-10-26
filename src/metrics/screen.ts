/**
 * @fileoverview Success metrics for the website Metrics screen, keyed by website id.
 *
 * The page and the server both import this map. A website with no entry has no
 * cards, and the client does not send the definitions.
 *
 * @temporary Definitions live in code for now. They should probably be stored
 * per website in the database.
 */
import { SuccessMetric } from './types';

const cohortMetrics = [
  {
    id: 'cohort-size',
    question: 'How many patients enrolled?',
    numerator: { event: 'cohort_enrolled' },
  },
  {
    id: 'setup-rate',
    question: 'What share of enrolled patients completed setup?',
    numerator: { event: 'treatment_setup_complete' },
    denominator: { event: 'cohort_enrolled' },
    goal: 0.6,
  },
] as const satisfies readonly SuccessMetric[];

// TODO: Store these definitions per website in the database instead of this map.
export const websiteMetrics: Record<string, readonly SuccessMetric[]> = {
  'af94323e-95b5-4831-90fa-b757b9f32030': cohortMetrics,
};

export function getWebsiteMetrics(websiteId: string): readonly SuccessMetric[] {
  return websiteMetrics[websiteId] ?? [];
}
