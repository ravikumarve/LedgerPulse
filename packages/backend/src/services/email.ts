import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import path from "path";
import fs from "fs";
import crypto from "crypto";

const DOWNLOAD_DIR = path.resolve(__dirname, "../../uploads/email");

if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

interface EmailAttachment {
  filename: string;
  filePath: string;
  contentType: string;
  size: number;
}

interface EmailResult {
  from: string;
  subject: string;
  date: Date;
  textBody: string;
  attachments: EmailAttachment[];
}

/**
 * Connect to IMAP and fetch unseen emails with invoice attachments.
 * Returns parsed email data with saved attachments.
 */
export async function fetchInvoiceEmails(): Promise<EmailResult[]> {
  const host = process.env.IMAP_HOST;
  const user = process.env.IMAP_USER;
  const pass = process.env.IMAP_PASS;

  if (!host || !user || !pass) {
    console.warn("⚠️ IMAP not configured — skipping email fetch. Set IMAP_HOST, IMAP_USER, IMAP_PASS");
    return [];
  }

  const client = new ImapFlow({
    host,
    port: parseInt(process.env.IMAP_PORT ?? "993", 10),
    secure: true,
    auth: { user, pass },
    logger: false,
  });

  const results: EmailResult[] = [];

  try {
    await client.connect();

    // Open INBOX
    await client.mailboxOpen("INBOX");

    // Search for unseen messages
    const messages = await client.search({ seen: false });
    if (!messages) return [];

    const toFetch = (messages as number[]).slice(0, 20); // Limit 20 per poll

    for (const seq of toFetch) {
      const msg = await client.fetchOne(seq, { source: true });
      if (!msg || !msg.source) continue;

      const parsed = await simpleParser(msg.source);

      const attachments: EmailAttachment[] = [];

      for (const att of parsed.attachments ?? []) {
        if (!att.filename || !att.content) continue;

        const ext = path.extname(att.filename).toLowerCase();
        if (![".pdf", ".jpg", ".jpeg", ".png", ".tiff", ".webp"].includes(ext)) continue;

        const safeName = `${crypto.randomUUID()}${ext}`;
        const filePath = path.join(DOWNLOAD_DIR, safeName);
        fs.writeFileSync(filePath, att.content as Buffer);

        attachments.push({
          filename: att.filename,
          filePath,
          contentType: typeof att.contentType === "string" ? att.contentType : "application/octet-stream",
          size: (att.content as Buffer).length,
        });
      }

      if (attachments.length > 0) {
        results.push({
          from: parsed.from?.text ?? "unknown",
          subject: parsed.subject ?? "(no subject)",
          date: parsed.date ?? new Date(),
          textBody: parsed.text ?? "",
          attachments,
        });
      }
    }
  } catch (err) {
    console.error("Email fetch error:", err);
  } finally {
    await client.logout();
  }

  return results;
}
