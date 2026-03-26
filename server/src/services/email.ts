import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL = process.env.EMAIL_FROM || "Sides <onboarding@resend.dev>";

export async function sendVerificationCode(email: string, code: string): Promise<void> {
  await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: `${code} is your Sides verification code`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 400px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="font-size: 24px; font-weight: 700; margin-bottom: 8px;">Your verification code</h1>
        <p style="color: #666; margin-bottom: 24px;">Enter this code in the Sides app to sign in.</p>
        <div style="background: #f5f5f5; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;">
          <span style="font-size: 32px; font-weight: 700; letter-spacing: 8px;">${code}</span>
        </div>
        <p style="color: #999; font-size: 13px;">This code expires in 10 minutes. If you didn't request this, you can ignore this email.</p>
      </div>
    `,
  });
}

export async function sendInviteEmail(
  email: string,
  inviterName: string,
  playTitle: string,
  characterName: string,
  inviteUrl: string
): Promise<void> {
  await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: `${inviterName} invited you to rehearse ${playTitle}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 400px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="font-size: 24px; font-weight: 700; margin-bottom: 8px;">You've been cast!</h1>
        <p style="color: #666; margin-bottom: 24px;">
          <strong>${inviterName}</strong> wants you to play <strong>${characterName}</strong> in <strong>${playTitle}</strong>.
        </p>
        <a href="${inviteUrl}" style="display: inline-block; background: #e8998d; color: white; text-decoration: none; padding: 14px 32px; border-radius: 999px; font-weight: 600; font-size: 16px;">
          Join the cast
        </a>
        <p style="color: #999; font-size: 13px; margin-top: 24px;">This invite expires in 7 days.</p>
      </div>
    `,
  });
}
