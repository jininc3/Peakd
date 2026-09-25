/**
 * Every email the app sends, in one registry, so the admin panel's Emails tab
 * can list, preview and test-send each of them from the same source the real
 * sends use. Adding an email means adding it here, or it can't be tested.
 */

import {WELCOME_HTML_DARK, WELCOME_HTML_LIGHT, WELCOME_SUBJECT, WELCOME_TEXT} from "./welcome";
import {VERIFICATION_SUBJECT, verificationCodeHtml} from "./verificationCode";

export interface RenderedEmail {
  subject: string;
  html: string;
  text?: string;
}

export interface EmailTemplate {
  id: string;
  name: string;
  /** When it goes out, for the admin list. */
  trigger: string;
  /** Named looks of the same email; the first is the one real sends use. */
  variants: string[];
  /** Rendered with sample data, as a test send or preview shows it. */
  render: (variant: string) => RenderedEmail;
}

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: "welcome",
    name: "Welcome",
    trigger: "Once, when a new account finishes signup (after the rules step).",
    variants: ["dark", "light"],
    render: (variant) => ({
      subject: WELCOME_SUBJECT,
      html: variant === "light" ? WELCOME_HTML_LIGHT : WELCOME_HTML_DARK,
      text: WELCOME_TEXT,
    }),
  },
  {
    id: "verification-code",
    name: "Verification code",
    trigger: "Signup email verification, email login and password reset.",
    variants: ["default"],
    render: () => ({
      subject: VERIFICATION_SUBJECT,
      html: verificationCodeHtml("123456", 10),
    }),
  },
];

export function findTemplate(id: string): EmailTemplate | undefined {
  return EMAIL_TEMPLATES.find((t) => t.id === id);
}
