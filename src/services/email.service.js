import nodemailer from "nodemailer";
import sequelize from "../config/database.config.js";

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.warn("[Email] SMTP not configured — email notifications disabled");
    return null;
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  return transporter;
}

/**
 * Fetch an email template from DB by slug.
 * Falls back to a plain text template if not found.
 */
async function getTemplate(slug, vars = {}) {
  try {
    const [rows] = await sequelize.query(
      `SELECT subject, body_html FROM email_templates WHERE slug = :slug LIMIT 1`,
      { replacements: { slug }, type: sequelize.QueryTypes.SELECT }
    );

    if (!rows) return null;

    // Simple variable substitution: {{name}}, {{booking_id}}, etc.
    let subject = rows.subject;
    let body    = rows.body_html;

    for (const [key, val] of Object.entries(vars)) {
      const re = new RegExp(`{{\\s*${key}\\s*}}`, "g");
      subject  = subject.replace(re, val ?? "");
      body     = body.replace(re, val ?? "");
    }

    return { subject, body };
  } catch {
    return null;
  }
}

/**
 * Send an email notification.
 * @param {string} to      - recipient email
 * @param {string} title   - subject fallback if no template
 * @param {string} message - plain text body fallback
 * @param {string} [slug]  - optional email_templates slug
 * @param {object} [vars]  - template variable substitutions
 */
export async function sendEmail(to, title, message, slug = null, vars = {}) {
  if (!to) return { success: false, message: "No email address" };

  const t = getTransporter();
  if (!t) return { success: false, message: "SMTP not configured" };

  try {
    let subject = title;
    let html    = `<p>${message}</p>`;

    if (slug) {
      const tpl = await getTemplate(slug, { ...vars, message });
      if (tpl) {
        subject = tpl.subject;
        html    = tpl.body;
      }
    }

    await t.sendMail({
      from: `"${process.env.SMTP_FROM_NAME || "Book My Parcel"}" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html,
      text: message,
    });

    console.log(`[Email] Sent "${subject}" to ${to}`);
    return { success: true };
  } catch (err) {
    console.error(`[Email] Failed to send to ${to}:`, err.message);
    return { success: false, error: err.message };
  }
}
