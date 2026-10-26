import { Metadata } from 'next';
import { MetricsPage } from './MetricsPage';

export default async function ({ params }: { params: { websiteId: string } }) {
  const { websiteId } = await params;

  return <MetricsPage websiteId={websiteId} />;
}

export const metadata: Metadata = {
  title: 'Metrics',
};
