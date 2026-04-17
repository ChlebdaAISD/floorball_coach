import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { emailSends } from "../shared/schema";

/**
 * Notification delivery. Today this POSTs to an n8n webhook that the user
 * routes as they see fit (email, Telegram, etc.). The function name and
 * templates still say "email" because that is the user-facing concept; swap
 * the transport without changing the domain vocabulary.
 */
const DEFAULT_WEBHOOK =
  "https://adrian264-20264.wykr.es/webhook/Notify_Floorball_IQ";

export interface SendEmailArgs {
  userId: number;
  to: string;
  kind: "morning_readiness" | "post_workout";
  dedupKey: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Deliver a notification once per (userId, dedupKey). No-op if already sent.
 */
export async function sendEmailOnce(args: SendEmailArgs): Promise<
  | { sent: true }
  | { sent: false; reason: "duplicate" | "error"; error?: string }
> {
  const existing = await db
    .select({ id: emailSends.id })
    .from(emailSends)
    .where(
      and(
        eq(emailSends.userId, args.userId),
        eq(emailSends.dedupKey, args.dedupKey),
      ),
    )
    .limit(1);
  if (existing.length > 0) return { sent: false, reason: "duplicate" };

  const webhook = process.env.NOTIFY_WEBHOOK_URL || DEFAULT_WEBHOOK;

  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: args.userId,
        to: args.to,
        kind: args.kind,
        dedupKey: args.dedupKey,
        subject: args.subject,
        text: args.text,
        html: args.html,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { sent: false, reason: "error", error: `${res.status}: ${body}` };
    }
    await db.insert(emailSends).values({
      userId: args.userId,
      kind: args.kind,
      dedupKey: args.dedupKey,
    });
    return { sent: true };
  } catch (err) {
    return {
      sent: false,
      reason: "error",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Templates ──────────────────────────────────────────────
const APP_URL = process.env.APP_URL ?? "http://localhost:3001";

export function renderMorningReadiness(username: string): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = "Wpisz dzisiejszą gotowość";
  const greeting = username ? `Cześć ${username},` : "Cześć,";
  const text = `${greeting}

Zacznij dzień od wpisania dzisiejszej gotowości — sen, HRV, body battery, ból. Trener AI dostroi plan pod to jak się czujesz.

Wejdź: ${APP_URL}/

— Floorball Coach`;
  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111">
  <p>${greeting}</p>
  <p>Zacznij dzień od wpisania dzisiejszej gotowości — sen, HRV, body battery, ból. Trener AI dostroi plan pod to jak się czujesz.</p>
  <p><a href="${APP_URL}/" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#111;color:#fff;text-decoration:none;font-weight:600">Wpisz gotowość</a></p>
  <p style="color:#888;font-size:12px">Floorball Coach</p>
  </body></html>`;
  return { subject, html, text };
}

export function renderPostWorkout(
  username: string,
  eventTitle: string,
  eventId: number,
): { subject: string; html: string; text: string } {
  const subject = `Jak poszło: ${eventTitle}?`;
  const greeting = username ? `Cześć ${username},` : "Cześć,";
  const link = `${APP_URL}/?logEvent=${eventId}`;
  const text = `${greeting}

Właśnie skończył się Twój trening — "${eventTitle}". Zapisz jak poszło, dopóki pamiętasz RPE i czucie.

Wejdź: ${link}

— Floorball Coach`;
  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111">
  <p>${greeting}</p>
  <p>Właśnie skończył się Twój trening — <strong>${eventTitle}</strong>. Zapisz jak poszło, dopóki pamiętasz RPE i czucie.</p>
  <p><a href="${link}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#111;color:#fff;text-decoration:none;font-weight:600">Uzupełnij wpis</a></p>
  <p style="color:#888;font-size:12px">Floorball Coach</p>
  </body></html>`;
  return { subject, html, text };
}
