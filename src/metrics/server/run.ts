import { getWebsiteMetrics } from '@/metrics/screen';
import { MetricResult, MetricsResponse, SuccessMetric } from '@/metrics/types';
import { countDistinctPeople } from './query';

export async function runSuccessMetrics(
  websiteId: string,
  startDate: Date,
  endDate: Date,
): Promise<MetricsResponse> {
  const metrics = await Promise.all(
    getWebsiteMetrics(websiteId).map(metric => runMetric(websiteId, metric, startDate, endDate)),
  );

  return { metrics };
}

async function runMetric(
  websiteId: string,
  metric: SuccessMetric,
  startDate: Date,
  endDate: Date,
): Promise<MetricResult> {
  const [numerator, denominator] = await Promise.all([
    countDistinctPeople(websiteId, metric.numerator.event, startDate, endDate),
    metric.denominator
      ? countDistinctPeople(websiteId, metric.denominator.event, startDate, endDate)
      : Promise.resolve(null),
  ]);

  return {
    id: metric.id,
    numerator,
    denominator,
  };
}
