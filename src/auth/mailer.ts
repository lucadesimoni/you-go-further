/**
 * Outbound email. A real deployment points MAIL_API_URL / MAIL_API_KEY at a
 * transactional provider (Resend, Brevo, Postmark, Mailgun — they all accept a
 * JSON POST of this shape); without them the console mailer logs the message so
 * the sign-in flow stays walkable in dev.
 *
 * Server-only.
 */
import { SmtpMailer, parseSmtpUrl } from "./smtp";

export interface OutboundEmail {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  readonly id: "http" | "console" | "smtp";
  send(email: OutboundEmail): Promise<void>;
}

export class ConsoleMailer implements Mailer {
  readonly id = "console" as const;
  async send(email: OutboundEmail): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(`\n[mail:dev] to=${email.to}\n  ${email.subject}\n  ${email.text}\n`);
  }
}

export class HttpApiMailer implements Mailer {
  readonly id = "http" as const;

  constructor(
    private readonly url: string,
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(email: OutboundEmail): Promise<void> {
    const res = await fetch(this.url, {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from: this.from, to: [email.to], subject: email.subject, text: email.text }),
    });
    if (!res.ok) throw new Error(`Mail send failed (${res.status})`);
  }
}

const env = (k: string): string | undefined =>
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[k];

export function mailerFromEnv(): Mailer {
  const url = env("MAIL_API_URL");
  const key = env("MAIL_API_KEY");
  const from = env("MAIL_FROM") ?? "no-reply@yougofurther.ch";
  // SMTP first: a deployment that has configured a mailbox of its own meant to
  // use it, and it is the transport a Swiss host actually offers.
  const smtpUrl = env("MAIL_SMTP_URL");
  if (smtpUrl) {
    const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
    return new SmtpMailer(parseSmtpUrl(smtpUrl, from, proc));
  }
  if (url && key) return new HttpApiMailer(url, key, from);
  return new ConsoleMailer();
}
