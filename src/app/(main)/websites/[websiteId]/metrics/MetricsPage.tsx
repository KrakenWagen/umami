'use client';
import WebsiteDateFilter from '@/components/input/WebsiteDateFilter';
import { MetricsView } from '@/metrics/components/MetricsView';
import { Flexbox } from 'react-basics';
import WebsiteHeader from '../WebsiteHeader';

export function MetricsPage({ websiteId }: { websiteId: string }) {
  return (
    <>
      <WebsiteHeader websiteId={websiteId} />
      <Flexbox justifyContent="end">
        <WebsiteDateFilter websiteId={websiteId} />
      </Flexbox>
      <MetricsView websiteId={websiteId} />
    </>
  );
}
