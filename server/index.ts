import express from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pg from "pg";
import { registerRoutes } from "./routes";
import { registerCronRoutes } from "./cron";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isProduction = process.env.NODE_ENV === "production";
if (isProduction && !process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET must be set in production");
}
const sessionSecret = process.env.SESSION_SECRET || "dev-secret-change-me";

// Neon serverless occasionally drops its WebSocket mid-query; a single
// unhandled rejection would otherwise take the whole process down.
process.on("unhandledRejection", (err) => {
  console.error("unhandledRejection:", err);
});
process.on("uncaughtException", (err) => {
  console.error("uncaughtException:", err);
});

const app = express();
app.set("trust proxy", 1);
const PgSession = connectPgSimple(session);

// Use standard pg Pool for sessions (Neon driver is incompatible with connect-pg-simple)
const sessionPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
});

app.use(express.json());

app.use(
  session({
    store: new PgSession({
      pool: sessionPool,
      tableName: "session",
      createTableIfMissing: true,
    }),
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
    },
  }),
);

registerRoutes(app);
registerCronRoutes(app);

if (isProduction) {
  const publicDir = path.resolve(__dirname, "public");
  app.use(express.static(publicDir));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });
}

const port = parseInt(process.env.PORT || "5000", 10);
app.listen(port, "0.0.0.0", () => {
  console.log(`Server running on port ${port}`);
});
