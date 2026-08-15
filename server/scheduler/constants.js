const ONE_HOUR_MS = 60 * 60 * 1000;
const CHECK_INTERVAL_MS = ONE_HOUR_MS;
const RETRY_INITIAL_DELAY_MS = 5 * 60 * 1000; // 5 mins
const RETRY_MAX_DELAY_MS = 60 * 60 * 1000; // 1 hour max backoff
const MAX_CONSECUTIVE_FAILURES = 5;
const LOCK_TTL_MS = 10 * 60 * 1000; // 10 mins
const DEFAULT_CONCURRENCY = 5;
const PER_DOMAIN_DELAY_MS = 1000; // 1 second delay between requests to same domain
const SCHEDULER_TICK_CRON = "* * * * *"; // Runs every minute to process due items

module.exports = {
  ONE_HOUR_MS,
  CHECK_INTERVAL_MS,
  RETRY_INITIAL_DELAY_MS,
  RETRY_MAX_DELAY_MS,
  MAX_CONSECUTIVE_FAILURES,
  LOCK_TTL_MS,
  DEFAULT_CONCURRENCY,
  PER_DOMAIN_DELAY_MS,
  SCHEDULER_TICK_CRON,
};
