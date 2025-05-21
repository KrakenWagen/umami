import { z } from 'zod';
import { parseRequest } from '@/lib/request';
import { json, notFound, unauthorized } from '@/lib/response';
import { pagingParams } from '@/lib/schema';
import { canViewUsers } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { PageResult } from '@/lib/types';

export async function GET(request: Request) {
  const schema = z.object({
    ...pagingParams,
  });

  const { auth, error } = await parseRequest(request, schema);

  if (error) {
    return error();
  }

  if (!(await canViewUsers(auth))) {
    return unauthorized();
  }

  const res: PageResult<{ createdAt: Date }[]> = await prisma.pagedQuery(
    'websiteEvent',
    {},
    {
      orderBy: 'createdAt',
      sortDescending: true,
      pageSize: '1',
      page: 1,
    },
  );

  if (!res.count) {
    return notFound();
  }

  return json({ createdAt: res.data[0]['createdAt'].toISOString() });
}
