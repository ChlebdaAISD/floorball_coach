import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
const url = env.match(/^DATABASE_URL\s*=\s*(.+)$/m)?.[1].trim().replace(/^["']|["']$/g, "");
const sql = neon(url);

const dupes = await sql`
  SELECT user_id, date, workout_type, COUNT(*) AS cnt,
         array_agg(id ORDER BY created_at ASC) AS ids,
         array_agg(calendar_event_id ORDER BY created_at ASC) AS event_ids,
         array_agg(rpe ORDER BY created_at ASC) AS rpes,
         array_agg(created_at ORDER BY created_at ASC) AS created_ats
  FROM workout_logs
  GROUP BY user_id, date, workout_type
  HAVING COUNT(*) > 1
  ORDER BY date DESC
`;

console.log(`Duplicate (user, date, type) groups: ${dupes.length}`);
for (const d of dupes) {
  console.log(`  user=${d.user_id} date=${d.date} type=${d.workout_type} cnt=${d.cnt}`);
  console.log(`    ids=${JSON.stringify(d.ids)}`);
  console.log(`    event_ids=${JSON.stringify(d.event_ids)}`);
  console.log(`    rpes=${JSON.stringify(d.rpes)}`);
  console.log(`    created_ats=${JSON.stringify(d.created_ats)}`);
}
