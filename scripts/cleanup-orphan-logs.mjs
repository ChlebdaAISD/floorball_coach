import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
const url = env.match(/^DATABASE_URL\s*=\s*(.+)$/m)?.[1].trim().replace(/^["']|["']$/g, "");
if (!url) throw new Error("DATABASE_URL not found in .env");

const sql = neon(url);

const orphans = await sql`
  SELECT wl.id, wl.user_id, wl.date, wl.workout_type, wl.calendar_event_id, wl.rpe
  FROM workout_logs wl
  LEFT JOIN calendar_events ce ON ce.id = wl.calendar_event_id
  WHERE wl.calendar_event_id IS NOT NULL AND ce.id IS NULL
  ORDER BY wl.date DESC, wl.id DESC
`;

console.log(`Found ${orphans.length} orphaned workout_logs:`);
for (const o of orphans) {
  console.log(`  id=${o.id} user=${o.user_id} date=${o.date} type=${o.workout_type} calEvent=${o.calendar_event_id} rpe=${o.rpe}`);
}

if (process.argv.includes("--delete")) {
  const res = await sql`
    DELETE FROM workout_logs
    WHERE calendar_event_id IS NOT NULL
      AND calendar_event_id NOT IN (SELECT id FROM calendar_events)
    RETURNING id
  `;
  console.log(`Deleted ${res.length} rows.`);
} else {
  console.log("\nDry run. Re-run with --delete to actually remove them.");
}
