/**
 * The one place a templated email leaves the app, so real sends and the admin
 * panel's test sends can't drift apart.
 */

import {defineSecret} from "firebase-functions/params";
import {Resend} from "resend";
import type {RenderedEmail} from "./templates";

export const resendApiKey = defineSecret("RESEND_API_KEY");

const FROM = "Peakd <noreply@peakd.gg>";

/** Throws with Resend's own message on failure; resolves to the message id. */
export async function sendEmail(to: string, email: RenderedEmail): Promise<string | undefined> {
  const resend = new Resend(resendApiKey.value());
  const {data, error} = await resend.emails.send({
    from: FROM,
    to,
    subject: email.subject,
    html: email.html,
    ...(email.text ? {text: email.text} : {}),
  });
  if (error) throw new Error(error.message);
  return data?.id;
}
