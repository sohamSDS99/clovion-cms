/**
 * Email sending (FR-USER-01 invites, FR-CONTENT-06 notifications).
 *
 * Uses SMTP via nodemailer when configured (SMTP_URL, or SMTP_HOST/PORT/USER/
 * PASS), otherwise falls back to logging the message — so the app runs in dev
 * and CI without an email provider, and invite links are still recoverable
 * from the logs. Set EMAIL_FROM for the sender address.
 */
import nodemailer, { type Transporter } from "nodemailer";

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

let cachedTransport: Transporter | null | undefined;

/** Build (and cache) an SMTP transport from env, or null if unconfigured. */
function getTransport(): Transporter | null {
  if (cachedTransport !== undefined) return cachedTransport;

  if (process.env.SMTP_URL) {
    cachedTransport = nodemailer.createTransport(process.env.SMTP_URL);
  } else if (process.env.SMTP_HOST) {
    cachedTransport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === "true",
      auth:
        process.env.SMTP_USER && process.env.SMTP_PASS
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
    });
  } else {
    cachedTransport = null;
  }
  return cachedTransport;
}

const FROM = process.env.EMAIL_FROM ?? "Clovion CMS <no-reply@clovion.ai>";

/**
 * Send an email. Returns { delivered } — false (not an error) when no SMTP is
 * configured, in which case the message is logged instead.
 */
export async function sendEmail(input: SendEmailInput): Promise<{ delivered: boolean }> {
  const transport = getTransport();
  if (!transport) {
    console.info(
      `[email] (no SMTP configured) would send to ${input.to}: ${input.subject}\n${input.text ?? input.html}`
    );
    return { delivered: false };
  }
  await transport.sendMail({
    from: FROM,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  });
  return { delivered: true };
}

/** App base URL for links in emails (AUTH_URL / NEXTAUTH_URL / fallback). */
export function appBaseUrl(): string {
  return (
    process.env.AUTH_URL ??
    process.env.NEXTAUTH_URL ??
    process.env.PUBLIC_APP_URL ??
    "http://localhost:3007"
  );
}

/** Compose + send a user invite email with the accept link. */
export async function sendInviteEmail(args: {
  to: string;
  name?: string | null;
  token: string;
  role: string;
}): Promise<{ delivered: boolean; acceptUrl: string }> {
  const acceptUrl = `${appBaseUrl()}/accept-invite?token=${encodeURIComponent(args.token)}`;
  const greeting = args.name ? `Hi ${args.name},` : "Hi,";
  const html = `<p>${greeting}</p>
<p>You've been invited to Clovion CMS as <strong>${args.role}</strong>.</p>
<p><a href="${acceptUrl}">Accept your invite and set a password</a></p>
<p>Or paste this link: ${acceptUrl}</p>`;
  const text = `${greeting}\n\nYou've been invited to Clovion CMS as ${args.role}.\nAccept here: ${acceptUrl}`;
  const { delivered } = await sendEmail({
    to: args.to,
    subject: "You're invited to Clovion CMS",
    html,
    text,
  });
  return { delivered, acceptUrl };
}
