import clickhouse from '@/lib/clickhouse';
import { CLICKHOUSE, PRISMA, runQuery } from '@/lib/db';
import prisma from '@/lib/prisma';

export async function countDistinctPeople(
  websiteId: string,
  eventName: string,
  startDate: Date,
  endDate: Date,
) {
  const rows = await runQuery({
    [PRISMA]: () => relationalQuery(websiteId, eventName, startDate, endDate),
    [CLICKHOUSE]: () => clickhouseQuery(websiteId, eventName, startDate, endDate),
  });

  return Number(rows?.[0]?.value ?? 0);
}

async function relationalQuery(
  websiteId: string,
  eventName: string,
  startDate: Date,
  endDate: Date,
) {
  const { rawQuery } = prisma;

  return rawQuery(
    `
    select count(distinct session.distinct_id) as value
    from website_event
    join session on session.session_id = website_event.session_id
    where website_event.website_id = {{websiteId::uuid}}
      and website_event.event_name = {{eventName}}
      and website_event.created_at between {{startDate}} and {{endDate}}
      and session.distinct_id is not null
      and session.distinct_id <> ''
    `,
    { websiteId, eventName, startDate, endDate },
  );
}

async function clickhouseQuery(
  websiteId: string,
  eventName: string,
  startDate: Date,
  endDate: Date,
) {
  const { rawQuery } = clickhouse;

  return rawQuery(
    `
    select count(distinct distinct_id) as value
    from website_event
    where website_id = {websiteId:UUID}
      and event_name = {eventName:String}
      and created_at between {startDate:DateTime64} and {endDate:DateTime64}
      and distinct_id != ''
    `,
    { websiteId, eventName, startDate, endDate },
  );
}
