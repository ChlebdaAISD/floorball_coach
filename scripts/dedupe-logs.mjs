import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
const url = env.match(/^DATABASE_URL\s*=\s*(.+)$/m)?.[1].trim().replace(/^["']|["']$/g, "");
const sql = neon(url);

// Within each (user_id, calendar_event_id) group, keep the MOST RECENT log
// (highest id = last written = most up-to-date state from upsert).
const toDelete = await sql`
  WITH ranked AS (
    SELECT id,
           row_number() OVER (
             PARTITION BY user_id, calendar_event_id
             ORDER BY id DESC
           ) AS rn
    FROM workout_logs
    WHERE calendar_event_id IS NOT NULL
  )
  SELECT id FROM ranked WHERE rn > 1
`;

console.log(`Will delete ${toDelete.length} duplicate logs (keeping latest per event):`);
console.log(toDelete.map((r) => r.id).join(", "));

if (process.argv.includes("--delete")) {
  const ids = toDelete.map((r) => r.id);
  if (ids.length === 0) {
    console.log("Nothing to delete.");
  } else {
    // Cascade delete exercise_logs first (FK without cascade)
    await sql`DELETE FROM exercise_logs WHERE workout_log_id = ANY(${ids}::int[])`;
    const res = await sql`DELETE FROM workout_logs WHERE id = ANY(${ids}::int[]) RETURNING id`;
    console.log(`Deleted ${res.length} workout_logs rows.`);
  }
} else {
  console.log("\nDry run. Re-run with --delete to actually remove them.");
}
