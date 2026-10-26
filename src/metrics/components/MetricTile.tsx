import { formatLongNumber } from '@/lib/format';
import { MetricResult, SuccessMetric } from '@/metrics/types';
import styles from './MetricTile.module.css';

export function MetricTile({ metric, result }: { metric: SuccessMetric; result?: MetricResult }) {
  const value = result ? formatValue(metric, result) : '—';
  const detail = result ? formatDetail(metric, result) : null;

  return (
    <div className={styles.tile}>
      <div className={styles.question}>{metric.question}</div>
      <div className={styles.value}>{value}</div>
      {detail && <div className={styles.detail}>{detail}</div>}
    </div>
  );
}

function formatValue(metric: SuccessMetric, result: MetricResult) {
  if (metric.denominator) {
    if (!result.denominator) {
      return '0%';
    }

    return `${Math.round((result.numerator / result.denominator) * 100)}%`;
  }

  return formatLongNumber(result.numerator);
}

function formatDetail(metric: SuccessMetric, result: MetricResult) {
  const parts: string[] = [];

  if (metric.denominator && result.denominator != null) {
    parts.push(`${formatLongNumber(result.numerator)} of ${formatLongNumber(result.denominator)}`);
  }

  if (metric.goal != null) {
    const goal = metric.denominator
      ? `${Math.round(metric.goal * 100)}%`
      : formatLongNumber(metric.goal);
    parts.push(`Goal ${goal}`);
  }

  return parts.join(' · ');
}
