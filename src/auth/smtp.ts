import { createConnection, type Socket } from "node:net";
import { connect as tlsConnect, type TLSSocket } from "node:tls";
import type { Mailer, OutboundEmail } from "./mailer";

/**
 * Sending mail over SMTP, with no dependency.
 *
 * The HTTP mailer already here works with Resend, Brevo, Postmark and the rest,
 * and every one of those is a foreign company processing an address book. A
 * Swiss deployment usually already has a Swiss mailbox — Infomaniak's, its own
 * — and those speak SMTP submission, not a bespoke JSON API. Roughly a hundred
 * lines of protocol is a smaller thing to own than a data-processing agreement
 * with a fourth country.
 *
 * Scope is deliberately narrow, because this sends exactly one kind of message:
 * one recipient, a plain-text body, UTF-8, no attachments. Anything richer is a
 * different problem and should use a library.
 *
 * Two transports, the two that submission actually uses:
 * - `smtps://host:465` — TLS from the first byte (implicit TLS).
 * - `smtp://host:587`  — plain, then `STARTTLS` upgrades the same socket.
 *
 * Plaintext without STARTTLS stays possible because a test needs it, and the
 * production preflight refuses to start a deployment configured that way.
 */

export interface SmtpOptions {
  host: string;
  port: number;
  /** TLS from the first byte, as on port 465. */
  implicitTls: boolean;
  /** Upgrade a plain connection with STARTTLS, as on port 587. */
  startTls: boolean;
  user?: string;
  password?: string;
  /** Envelope + header sender. */
  from: string;
  /** Give up on a silent server rather than hanging a sign-in request. */
  timeoutMs: number;
  /** Test seam: accept a self-signed certificate. Never set in production. */
  rejectUnauthorized: boolean;
}

/**
 * Parse `smtps://user:pass@host:port` into options.
 *
 * Credentials are percent-decoded, because a mailbox password is chosen by a
 * human and regularly contains `@`, `:` or `/` — encoded in the URL, they must
 * come back out before they reach the AUTH command.
 */
export function parseSmtpUrl(url: string, from: string, env: Record<string, string | undefined> = {}): SmtpOptions {
  const parsed = new URL(url);
  const implicitTls = parsed.protocol === "smtps:";
  const port = Number(parsed.port) || (implicitTls ? 465 : 587);
  return {
    host: parsed.hostname,
    port,
    implicitTls,
    // On a plain connection, STARTTLS is the default and has to be switched
    // off explicitly — the safe direction for a setting nobody will revisit.
    startTls: implicitTls ? false : !/^(0|false|no|off)$/i.test(env.MAIL_SMTP_STARTTLS ?? "true"),
    user: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    from,
    timeoutMs: Number(env.MAIL_SMTP_TIMEOUT_MS) || 15_000,
    rejectUnauthorized: !/^(1|true|yes|on)$/i.test(env.MAIL_SMTP_INSECURE ?? ""),
  };
}

/** One SMTP conversation, line by line. */
class SmtpSession {
  private socket: Socket | TLSSocket;
  private buffer = "";
  private waiting?: { resolve: (reply: string) => void; reject: (e: Error) => void };

  constructor(socket: Socket | TLSSocket) {
    this.socket = socket;
    this.attach();
  }

  private attach() {
    this.socket.setEncoding("utf8");
    this.socket.on("data", (chunk: string) => {
      this.buffer += chunk;
      // A reply is complete at a line whose 4th character is a space:
      // "250-EXTENSION" continues, "250 OK" ends. Reading one line at a time
      // would desynchronise the whole conversation on any multiline greeting.
      const lines = this.buffer.split(/\r?\n/).filter(Boolean);
      const last = lines.length ? lines[lines.length - 1] : "";
      if (!/^\d{3} /.test(last)) return;
      const reply = this.buffer;
      this.buffer = "";
      this.waiting?.resolve(reply);
      this.waiting = undefined;
    });
    const fail = (e: Error) => {
      this.waiting?.reject(e);
      this.waiting = undefined;
    };
    this.socket.on("error", fail);
    this.socket.on("close", () => fail(new Error("SMTP connection closed unexpectedly")));
  }

  /** Wait for the next complete reply. */
  read(): Promise<string> {
    return new Promise((resolve, reject) => {
      this.waiting = { resolve, reject };
    });
  }

  /** Send a command and return the reply, asserting the expected status. */
  async command(line: string, expect: number): Promise<string> {
    const pending = this.read();
    this.socket.write(`${line}\r\n`);
    const reply = await pending;
    const code = Number(reply.slice(0, 3));
    if (code !== expect) {
      // Never echo the command: for AUTH the command *is* the password.
      const verb = line.split(" ")[0];
      throw new Error(`SMTP ${verb} rejected: ${reply.trim().split(/\r?\n/)[0]}`);
    }
    return reply;
  }

  /** Hand the socket to `startTls` and keep talking on the encrypted one. */
  replaceSocket(socket: TLSSocket) {
    this.socket.removeAllListeners("data");
    this.socket.removeAllListeners("error");
    this.socket.removeAllListeners("close");
    this.socket = socket;
    this.buffer = "";
    this.attach();
  }

  end() {
    this.socket.end();
  }

  raw(): Socket | TLSSocket {
    return this.socket;
  }
}

/**
 * A header value that is safe to write.
 *
 * A newline in a subject or an address is header injection — the attacker
 * continues the header block and adds their own `Bcc:`. Non-ASCII is encoded
 * per RFC 2047 so "Anmeldung bei You Go Further" survives the wire.
 */
function headerValue(raw: string): string {
  const oneLine = raw.replace(/[\r\n]+/g, " ").trim();
  // eslint-disable-next-line no-control-regex
  if (/^[\x20-\x7E]*$/.test(oneLine)) return oneLine;
  return `=?UTF-8?B?${Buffer.from(oneLine, "utf8").toString("base64")}?=`;
}

/** An address for MAIL FROM / RCPT TO, with the same injection rule. */
function address(raw: string): string {
  const clean = raw.replace(/[\r\n<>]/g, "").trim();
  if (!clean.includes("@")) throw new Error(`Not an email address: ${raw}`);
  return clean;
}

/**
 * Body encoding: a line starting with "." would end the message early, so it
 * is doubled, and bare newlines become CRLF.
 */
function dotStuff(text: string): string {
  return text.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
}

export class SmtpMailer implements Mailer {
  readonly id = "smtp" as const;

  constructor(private readonly options: SmtpOptions) {}

  async send(email: OutboundEmail): Promise<void> {
    const o = this.options;
    const to = address(email.to);
    const from = address(o.from);

    const socket = o.implicitTls
      ? tlsConnect({ host: o.host, port: o.port, servername: o.host, rejectUnauthorized: o.rejectUnauthorized })
      : createConnection({ host: o.host, port: o.port });
    socket.setTimeout(o.timeoutMs, () => socket.destroy(new Error(`SMTP timeout after ${o.timeoutMs} ms`)));

    const session = new SmtpSession(socket);
    try {
      await new Promise<void>((resolve, reject) => {
        socket.once(o.implicitTls ? "secureConnect" : "connect", () => resolve());
        socket.once("error", reject);
      });
      const greeting = await session.read();
      if (!greeting.startsWith("220")) throw new Error(`SMTP greeting: ${greeting.trim()}`);

      let capabilities = await session.command(`EHLO ${clientName(o.host)}`, 250);

      if (o.startTls) {
        await session.command("STARTTLS", 220);
        const secure = tlsConnect({
          socket: session.raw() as Socket,
          servername: o.host,
          rejectUnauthorized: o.rejectUnauthorized,
        });
        await new Promise<void>((resolve, reject) => {
          secure.once("secureConnect", () => resolve());
          secure.once("error", reject);
        });
        session.replaceSocket(secure);
        // The capability list before and after the upgrade are different
        // documents; AUTH is normally only advertised on the encrypted one.
        capabilities = await session.command(`EHLO ${clientName(o.host)}`, 250);
      }

      if (o.user && o.password) {
        await this.authenticate(session, capabilities);
      }

      await session.command(`MAIL FROM:<${from}>`, 250);
      await session.command(`RCPT TO:<${to}>`, 250);
      await session.command("DATA", 354);

      const message = [
        `From: ${headerValue(o.from)}`,
        `To: ${to}`,
        `Subject: ${headerValue(email.subject)}`,
        `Date: ${new Date().toUTCString()}`,
        "MIME-Version: 1.0",
        'Content-Type: text/plain; charset="utf-8"',
        "Content-Transfer-Encoding: 8bit",
        "",
        dotStuff(email.text),
      ].join("\r\n");
      await session.command(`${message}\r\n.`, 250);

      await session.command("QUIT", 221).catch(() => {
        /* a server that hangs up on QUIT has still accepted the message */
      });
    } finally {
      session.end();
    }
  }

  private async authenticate(session: SmtpSession, capabilities: string): Promise<void> {
    const { user, password } = this.options;
    const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
    if (/AUTH[^\n]*\bPLAIN\b/i.test(capabilities)) {
      await session.command(`AUTH PLAIN ${b64(`\0${user}\0${password}`)}`, 235);
      return;
    }
    if (/AUTH[^\n]*\bLOGIN\b/i.test(capabilities)) {
      await session.command("AUTH LOGIN", 334);
      await session.command(b64(user ?? ""), 334);
      await session.command(b64(password ?? ""), 235);
      return;
    }
    throw new Error("SMTP server advertises no supported authentication method (PLAIN or LOGIN)");
  }
}

/**
 * The name we introduce ourselves by.
 *
 * Some submission servers reject a bare or bracketed-IP EHLO argument, and the
 * one name we can be sure resolves is the server's own — `MAIL_SMTP_CLIENT_NAME`
 * overrides it where a provider insists on a matching hostname.
 */
function clientName(host: string): string {
  return process.env.MAIL_SMTP_CLIENT_NAME || host;
}
