import bcrypt from "bcrypt";
import { db, pool } from "./db";
import { users } from "../shared/schema";

const password = process.env.ADMIN_PASSWORD;
if (!password) throw new Error("ADMIN_PASSWORD not set");

const hash = await bcrypt.hash(password, 10);
await db.update(users).set({ passwordHash: hash });
console.log("Hasło zaktualizowane");
await pool.end();
process.exit(0);
