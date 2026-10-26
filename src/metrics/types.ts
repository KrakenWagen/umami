export type EventCount = {
  event: string;
};

export type SuccessMetric = {
  id: string;
  question: string;
  numerator: EventCount;
  /** When set, the card is a rate. Otherwise it is a count of distinct people. */
  denominator?: EventCount;
  /** Absolute count, or a rate from 0 to 1 when the metric has a denominator. */
  goal?: number;
};

export type MetricResult = {
  id: string;
  numerator: number;
  denominator: number | null;
};

export type MetricsResponse = {
  metrics: MetricResult[];
};
