import { z } from 'zod';
import { anyObjectParam, urlOrPathParam } from '@/lib/schema';

export const collectSchema = z.object({
  type: z.enum(['event', 'identify']),
  payload: z.object({
    website: z.string().uuid(),
    data: anyObjectParam.optional(),
    hostname: z.string().max(100).optional(),
    language: z.string().max(35).optional(),
    referrer: urlOrPathParam.optional(),
    screen: z.string().max(11).optional(),
    title: z.string().optional(),
    url: urlOrPathParam.optional(),
    name: z.string().max(50).optional(),
    tag: z.string().max(50).optional(),
    ip: z.string().ip().optional(),
    userAgent: z.string().optional(),
    timestamp: z.coerce.number().int().optional(),
    id: z.string().optional(),
  }),
});

export type CollectInput = z.infer<typeof collectSchema>;
