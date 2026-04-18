import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
const url = env.match(/^DATABASE_URL\s*=\s*(.+)$/m)?.[1].trim().replace(/^["']|["']$/g, "");
const sql = neon(url);

const orphans = await sql`
  SELECT wl.id, wl.calendar_event_id, wl.rpe, wl.workout_type, ce.title, ce.status
  FROM workout_logs wl
  JOIN calendar_events ce ON ce.id = wl.calendar_event_id
  WHERE ce.status = 'cancelled'
  ORDER BY wl.id
`;

console.log(`Workout logs tied to cancelled events: ${orphans.length}`);
for (const o of orphans) console.log("  ", o);

if (process.argv.includes("--delete")) {
  const ids = orphans.map((r) => r.id);
  if (ids.length === 0) {
    console.log("Nothing to delete.");
  } else {
    await sql`DELETE FROM exercise_logs WHERE workout_log_id = ANY(${ids}::int[])`;
    const res = await sql`DELETE FROM workout_logs WHERE id = ANY(${ids}::int[]) RETURNING id`;
    console.log(`Deleted ${res.length} workout_logs.`);
  }
} else {
  console.log("\nDry run. Re-run with --delete to remove them.");
}
