import { parseRequest } from '@/lib/request';
import { serverError } from '@/lib/response';
import { collectSchema } from '@/server/collect-schema';
import { collect, collectResponse } from '@/server/collect';

export async function POST(request: Request) {
  try {
    const { body, error } = await parseRequest(request, collectSchema, { skipAuth: true });

    if (error) {
      return error();
    }

    return collectResponse(await collect(body, request));
  } catch (e) {
    return serverError(e);
  }
}
