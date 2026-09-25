/**
 * The 6-digit code email: signup email verification, email login and password
 * reset all send it (sendEmailVerificationCode). Moved out of that function
 * unchanged so the admin panel's Emails tab can preview and test it too.
 */

export const VERIFICATION_SUBJECT = "Your Peakd verification code";

export function verificationCodeHtml(code: string, expiryMinutes: number): string {
  return `
        <div style="font-family: -apple-system, sans-serif; max-width: 400px; margin: 0 auto; padding: 32px;">
          <h2 style="color: #fff; background: #0f0f0f; padding: 24px; border-radius: 12px; text-align: center;">
            Your verification code
          </h2>
          <p style="font-size: 36px; font-weight: 800; letter-spacing: 8px; text-align: center; margin: 24px 0;">
            ${code}
          </p>
          <p style="color: #666; font-size: 14px; text-align: center;">
            This code expires in ${expiryMinutes} minutes.
          </p>
        </div>
      `;
}
