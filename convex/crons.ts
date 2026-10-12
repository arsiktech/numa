import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Sunday 17:00 UTC — early evening across EU/US, when a "your week is ready"
// recap is glanceable rather than annoying. The action itself no-ops on
// non-production deployments (SITE_URL guard) and skips users with no
// activity, so the schedule can stay unconditional.
crons.weekly(
  "weekly recap push",
  { dayOfWeek: "sunday", hourUTC: 17, minuteUTC: 0 },
  internal.recap.sendWeeklyRecaps
);

// Market prices for the iOS snapshot, which reads the stored marketQuotes
// table. Ticker symbols only; US equities need FINNHUB_API_KEY on Convex.
crons.interval("refresh market quotes", { minutes: 15 }, internal.marketQuotes.refreshQuotes);

// Bounded expiry of newly-stamped application abuse counters only.
crons.hourly("expire application rate-limit counters", { minuteUTC: 20 }, internal.privacyRetention.expireRateLimitBuckets);

export default crons;
