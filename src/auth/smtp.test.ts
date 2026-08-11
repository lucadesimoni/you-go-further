import { describe, it, expect, afterEach } from "vitest";
import { createServer, type Server, type Socket } from "node:net";
import { SmtpMailer, parseSmtpUrl } from "./smtp";
import { mailerFromEnv } from "./mailer";

/**
 * The protocol, driven against a real socket.
 *
 * A mailer tested with a mocked socket proves only that we call our own
 * functions. What actually breaks in production is the conversation: a
 * multiline greeting read as two replies, a password that contained an `@`, a
 * body line beginning with a dot that ended the message early. So the test
 * stands up a small SMTP server on a loopback port and reads back the bytes we
 * sent it.
 *
 * TLS is deliberately not exercised here — a self-signed certificate would need
 * a key pair this repository has no business generating at test time. What the
 * upgrade path *is* guarded by is the production preflight, which refuses to
 * start a deployment configured to send credentials in the clear.
 */

interface Recorded {
  commands: string[];
  message: string;
}

/** A minimal, deliberately chatty SMTP server: multiline EHLO, AUTH, DATA. */
function fakeSmtp(options: { auth?: "PLAIN" | "LOGIN" | "none"; failAt?: string } = {}) {
  const auth = options.auth ?? "PLAIN";
  const recorded: Recorded = { commands: [], message: "" };
  let server: Server;

  const ready = new Promise<number>((resolve) => {
    server = createServer((socket: Socket) => {
      let inData = false;
      let body = "";
      let awaiting: "user" | "password" | null = null;
      socket.setEncoding("utf8");
      // Multiline on purpose: a client that treats each line as one reply
      // desynchronises here and never recovers.
      socket.write("220-mail.example.ch ESMTP\r\n220 ready\r\n");

      socket.on("data", (chunk: string) => {
        for (const line of chunk.split(/\r\n/)) {
          if (inData) {
            if (line === ".") {
              inData = false;
              recorded.message = body;
              socket.write("250 queued\r\n");
            } else {
              body += `${line}\n`;
            }
            continue;
          }
          if (!line) continue;
          const verb = line.split(" ")[0].toUpperCase();
          recorded.commands.push(line);

          if (awaiting) {
            socket.write(awaiting === "user" ? "334 UGFzc3dvcmQ6\r\n" : "235 authenticated\r\n");
            awaiting = awaiting === "user" ? "password" : null;
            continue;
          }
          if (options.failAt && verb === options.failAt) {
            socket.write("550 refused\r\n");
            continue;
          }
          switch (verb) {
            case "EHLO":
              socket.write(
                auth === "none"
                  ? "250-mail.example.ch\r\n250-SIZE 35882577\r\n250 8BITMIME\r\n"
                  : `250-mail.example.ch\r\n250-SIZE 35882577\r\n250-AUTH ${auth}\r\n250 8BITMIME\r\n`,
              );
              break;
            case "AUTH":
              if (line.toUpperCase().startsWith("AUTH LOGIN")) {
                awaiting = "user";
                socket.write("334 VXNlcm5hbWU6\r\n");
              } else {
                socket.write("235 authenticated\r\n");
              }
              break;
            case "MAIL":
            case "RCPT":
              socket.write("250 ok\r\n");
              break;
            case "DATA":
              inData = true;
              socket.write("354 end with <CRLF>.<CRLF>\r\n");
              break;
            case "QUIT":
              socket.write("221 bye\r\n");
              socket.end();
              break;
            default:
              socket.write("502 not implemented\r\n");
          }
        }
      });
    });
    server.listen(0, "127.0.0.1", () => resolve((server.address() as { port: number }).port));
  });

  return { ready, recorded, close: () => new Promise<void>((r) => server.close(() => r())) };
}

const servers: (() => Promise<void>)[] = [];
afterEach(async () => {
  while (servers.length) await servers.pop()!();
});

async function start(options?: Parameters<typeof fakeSmtp>[0]) {
  const s = fakeSmtp(options);
  servers.push(s.close);
  return { port: await s.ready, recorded: s.recorded };
}

const optionsFor = (port: number, extra: Record<string, string | undefined> = {}) =>
  parseSmtpUrl(`smtp://coach%40yougofurther.ch:p%40ss%3Aword@127.0.0.1:${port}`, "no-reply@yougofurther.ch", {
    MAIL_SMTP_STARTTLS: "false",
    ...extra,
  });

describe("SMTP mailer", () => {
  it("delivers a message a server would accept", async () => {
    const { port, recorded } = await start();
    await new SmtpMailer(optionsFor(port)).send({
      to: "athlete@example.ch",
      subject: "Your sign-in link",
      text: "Open this to sign in: https://yougofurther.ch/?magic=abc",
    });

    expect(recorded.commands.some((c) => c.startsWith("EHLO "))).toBe(true);
    expect(recorded.commands).toContain("MAIL FROM:<no-reply@yougofurther.ch>");
    expect(recorded.commands).toContain("RCPT TO:<athlete@example.ch>");
    expect(recorded.message).toContain("Subject: Your sign-in link");
    expect(recorded.message).toContain("To: athlete@example.ch");
    expect(recorded.message).toContain("https://yougofurther.ch/?magic=abc");
    // A body needs its headers separated by a blank line or the whole message
    // is headers and the athlete gets an empty mail.
    expect(recorded.message).toMatch(/\n\nOpen this to sign in/);
  });

  it("survives a multiline greeting rather than losing the conversation", async () => {
    // The fake writes "220-… / 220 ready" as one packet. Reaching MAIL FROM at
    // all is the assertion: a client reading line-by-line stalls before it.
    const { port, recorded } = await start();
    await new SmtpMailer(optionsFor(port)).send({ to: "a@example.ch", subject: "s", text: "t" });
    expect(recorded.commands).toContain("MAIL FROM:<no-reply@yougofurther.ch>");
  });

  it("sends the password the operator typed, not the URL-encoded one", async () => {
    const { port, recorded } = await start();
    await new SmtpMailer(optionsFor(port)).send({ to: "a@example.ch", subject: "s", text: "t" });
    const authLine = recorded.commands.find((c) => c.toUpperCase().startsWith("AUTH PLAIN"))!;
    const decoded = Buffer.from(authLine.split(" ")[2], "base64").toString("utf8");
    expect(decoded).toBe("\0coach@yougofurther.ch\0p@ss:word");
  });

  it("falls back to AUTH LOGIN when that is all the server offers", async () => {
    const { port, recorded } = await start({ auth: "LOGIN" });
    await new SmtpMailer(optionsFor(port)).send({ to: "a@example.ch", subject: "s", text: "t" });
    const at = recorded.commands.indexOf("AUTH LOGIN");
    expect(at).toBeGreaterThanOrEqual(0);
    // The two lines straight after the challenge are the credentials, in order.
    expect(Buffer.from(recorded.commands[at + 1], "base64").toString("utf8")).toBe("coach@yougofurther.ch");
    expect(Buffer.from(recorded.commands[at + 2], "base64").toString("utf8")).toBe("p@ss:word");
  });

  it("does not let a line of body text end the message early", async () => {
    const { port, recorded } = await start();
    await new SmtpMailer(optionsFor(port)).send({
      to: "a@example.ch",
      subject: "s",
      // A single dot on its own line is the end-of-data marker.
      text: "first\n.\nsecond",
    });
    expect(recorded.message).toContain("first");
    expect(recorded.message).toContain("second");
  });

  it("refuses a subject or recipient carrying an injected header", async () => {
    const { port, recorded } = await start();
    await new SmtpMailer(optionsFor(port)).send({
      to: "a@example.ch",
      subject: "Sign in\r\nBcc: everyone@example.ch",
      text: "t",
    });
    // The injected text survives as *content* of the Subject header, which is
    // harmless; what must never happen is a second header appearing. So the
    // assertion is about lines, not about the substring.
    expect(recorded.message.split("\n").some((l) => /^Bcc:/i.test(l))).toBe(false);
    expect(recorded.message.split("\n").filter((l) => /^Subject:/.test(l))).toHaveLength(1);

    await expect(
      new SmtpMailer(optionsFor(port)).send({ to: "not-an-address", subject: "s", text: "t" }),
    ).rejects.toThrow(/email address/);
  });

  it("encodes a non-ASCII subject instead of putting raw bytes on the wire", async () => {
    const { port, recorded } = await start();
    await new SmtpMailer(optionsFor(port)).send({
      to: "a@example.ch",
      subject: "Anmeldung — grüezi",
      text: "t",
    });
    const subject = recorded.message.split("\n").find((l) => l.startsWith("Subject:"))!;
    expect(subject).toMatch(/^Subject: =\?UTF-8\?B\?/);
    expect(Buffer.from(subject.replace(/^Subject: =\?UTF-8\?B\?/, "").replace(/\?=$/, ""), "base64").toString()).toBe(
      "Anmeldung — grüezi",
    );
  });

  it("reports a rejection without printing the credential that was rejected", async () => {
    const { port } = await start({ failAt: "MAIL" });
    await expect(
      new SmtpMailer(optionsFor(port)).send({ to: "a@example.ch", subject: "s", text: "t" }),
    ).rejects.toThrow(/MAIL rejected/);

    const { port: authPort } = await start({ failAt: "AUTH" });
    const error = await new SmtpMailer(optionsFor(authPort))
      .send({ to: "a@example.ch", subject: "s", text: "t" })
      .catch((e: Error) => e);
    expect(String(error)).toMatch(/AUTH rejected/);
    expect(String(error)).not.toContain("p@ss:word");
    expect(String(error)).not.toMatch(/[A-Za-z0-9+/]{20,}={0,2}/); // nor the base64 of it
  });

  it("errors rather than sending in the clear when the server offers no auth we know", async () => {
    const { port } = await start({ auth: "none" });
    await expect(
      new SmtpMailer(optionsFor(port)).send({ to: "a@example.ch", subject: "s", text: "t" }),
    ).rejects.toThrow(/no supported authentication/);
  });
});

describe("SMTP configuration", () => {
  it("reads host, port and transport from the URL", () => {
    const implicit = parseSmtpUrl("smtps://u:p@mail.infomaniak.com", "a@b.ch", {});
    expect(implicit).toMatchObject({ host: "mail.infomaniak.com", port: 465, implicitTls: true, startTls: false });

    const submission = parseSmtpUrl("smtp://u:p@mail.infomaniak.com", "a@b.ch", {});
    // Port 587 defaults to STARTTLS: the failure mode of forgetting it is that
    // the password crosses the network in the clear, so it is opt-out.
    expect(submission).toMatchObject({ port: 587, implicitTls: false, startTls: true });
    expect(parseSmtpUrl("smtp://u:p@h:2525", "a@b.ch", { MAIL_SMTP_STARTTLS: "false" }).startTls).toBe(false);
  });

  it("verifies certificates unless a test explicitly says not to", () => {
    expect(parseSmtpUrl("smtps://u:p@h", "a@b.ch", {}).rejectUnauthorized).toBe(true);
    expect(parseSmtpUrl("smtps://u:p@h", "a@b.ch", { MAIL_SMTP_INSECURE: "true" }).rejectUnauthorized).toBe(false);
  });

  it("is chosen over the HTTP mailer, and both over the console", () => {
    const original = { ...process.env };
    try {
      process.env.MAIL_SMTP_URL = "smtps://u:p@mail.infomaniak.com";
      process.env.MAIL_API_URL = "https://api.example/send";
      process.env.MAIL_API_KEY = "k";
      expect(mailerFromEnv().id).toBe("smtp");

      delete process.env.MAIL_SMTP_URL;
      expect(mailerFromEnv().id).toBe("http");

      delete process.env.MAIL_API_URL;
      delete process.env.MAIL_API_KEY;
      expect(mailerFromEnv().id).toBe("console");
    } finally {
      process.env = original;
    }
  });
});
