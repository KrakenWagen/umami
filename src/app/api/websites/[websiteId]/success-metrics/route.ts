import { canViewWebsite } from '@/lib/auth';
import { getRequestDateRange, parseRequest } from '@/lib/request';
import { json, unauthorized } from '@/lib/response';
import { runSuccessMetrics } from '@/metrics/server/run';
import { z } from 'zod';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ websiteId: string }> },
) {
  const schema = z.object({
    startAt: z.coerce.number().int(),
    endAt: z.coerce.number().int(),
  });

  const { auth, query, error } = await parseRequest(request, schema);

  if (error) {
    return error();
  }

  const { websiteId } = await params;

  if (!(await canViewWebsite(auth, websiteId))) {
    return unauthorized();
  }

  const { startDate, endDate } = await getRequestDateRange({ ...query, websiteId });
  const data = await runSuccessMetrics(websiteId, startDate, endDate);

  return json(data);
}
