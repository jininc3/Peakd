/**
 * The admin panel's Emails tab: list every template, render one for preview,
 * and send a test copy. Admin-only — the same allowlist as the other admin
 * callables (repairRiotRegions).
 */

import {onCall, HttpsError, type CallableRequest} from "firebase-functions/v2/https";
import {logger} from "firebase-functions/v2";
import {resendApiKey, sendEmail} from "./sendEmail";
import {EMAIL_TEMPLATES, findTemplate} from "./templates";

const ADMIN_EMAILS = ["jininc3@gmail.com"];

function requireAdmin(request: CallableRequest): void {
  const email = (request.auth?.token.email ?? "").toLowerCase();
  if (!request.auth || !ADMIN_EMAILS.includes(email)) {
    throw new HttpsError("permission-denied", "Admins only.");
  }
}

function resolve(templateId: unknown, variant: unknown) {
  const template = typeof templateId === "string" ? findTemplate(templateId) : undefined;
  if (!template) throw new HttpsError("invalid-argument", "Unknown email template.");
  const v = typeof variant === "string" && template.variants.includes(variant) ? variant : template.variants[0];
  return {template, variant: v, email: template.render(v)};
}

/** Every template with its rendered variants, for the list and preview. */
export const adminListEmails = onCall(async (request) => {
  requireAdmin(request);
  return {
    templates: EMAIL_TEMPLATES.map((t) => ({
      id: t.id,
      name: t.name,
      trigger: t.trigger,
      variants: t.variants.map((v) => ({id: v, ...t.render(v)})),
    })),
  };
});

/** Sends one template to an address, subject prefixed so it reads as a test. */
export const adminSendTestEmail = onCall({secrets: [resendApiKey]}, async (request) => {
  requireAdmin(request);
  const {templateId, variant, to} = (request.data ?? {}) as {templateId?: string; variant?: string; to?: string};
  const address = typeof to === "string" ? to.trim() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
    throw new HttpsError("invalid-argument", "Enter a valid email address.");
  }
  const {template, variant: v, email} = resolve(templateId, variant);
  try {
    const id = await sendEmail(address, {...email, subject: `[Test] ${email.subject}`});
    logger.info(`Test email "${template.id}" (${v}) sent to ${address} by ${request.auth?.token.email}`);
    return {id: id ?? null};
  } catch (err) {
    throw new HttpsError("internal", `Resend refused the email: ${(err as Error).message}`);
  }
});
