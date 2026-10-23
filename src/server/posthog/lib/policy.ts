// Stored as Umami pageviews: the collect payload has no event name.
export const PAGEVIEW_EVENTS = new Set(['$pageview', '$screen']);

// $create_alias and $groupidentify stay ordinary named events.
// Alias does not merge people, and groups are not created.

// Validated, then dropped. A batch of only these events still succeeds.
export const IGNORED_EVENTS = new Set(['$performance_event']);

export const IDENTIFY_EVENT = '$identify';

// Never copied into Umami event or session data.
export const DROPPED_PROPERTY_KEYS = new Set([
  '$elements',
  '$elements_chain',
  '$set',
  '$set_once',
  '$snapshot_data',
  '$token',
  'token',
  'api_key',
  'distinct_id',
  '$distinct_id',
]);

export const CLICK_PARAMS = ['gclid', 'fbclid', 'msclkid', 'ttclid', 'li_fat_id', 'twclid'];

// PostHog's own distinct_id cap. translate.ts applies the shorter relational
// column width when ClickHouse is not configured.
export const POSTHOG_DISTINCT_ID_LENGTH = 200;
export const RELATIONAL_DISTINCT_ID_LENGTH = 50;

export const SCREEN_LENGTH = 11;
export const LANGUAGE_LENGTH = 35;
export const HOSTNAME_LENGTH = 100;
