'use client';
import ErrorMessage from '@/components/common/ErrorMessage';
import { useApi } from '@/components/hooks';
import { useFilterParams } from '@/components/hooks/useFilterParams';
import { getWebsiteMetrics } from '@/metrics/screen';
import { MetricsResponse } from '@/metrics/types';
import { MetricTile } from './MetricTile';
import styles from './MetricsView.module.css';

export function MetricsView({ websiteId }: { websiteId: string }) {
  const { get, useQuery } = useApi();
  const { startAt, endAt } = useFilterParams(websiteId);
  const metrics = getWebsiteMetrics(websiteId);

  const { data, isLoading, error } = useQuery({
    queryKey: ['websites:success-metrics', { websiteId, startAt, endAt }],
    queryFn: () =>
      get(`/websites/${websiteId}/success-metrics`, { startAt, endAt }) as Promise<MetricsResponse>,
    enabled: !!websiteId && metrics.length > 0,
  });

  if (metrics.length === 0) {
    return <p className={styles.empty}>No metrics are defined for this website.</p>;
  }

  return (
    <div>
      {error && <ErrorMessage />}
      <div className={styles.grid}>
        {metrics.map(metric => (
          <MetricTile
            key={metric.id}
            metric={metric}
            result={isLoading ? undefined : data?.metrics.find(item => item.id === metric.id)}
          />
        ))}
      </div>
    </div>
  );
}
