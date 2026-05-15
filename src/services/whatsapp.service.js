import twilio from "twilio";

let client = null;

function getClient() {
  if (client) return client;

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;

  if (!sid || !token) {
    console.warn("[WhatsApp] Twilio credentials not configured — WhatsApp notifications disabled");
    return null;
  }

  client = twilio(sid, token);
  return client;
}

function formatPhone(phone) {
  if (!phone) return null;
  let cleaned = phone.replace(/[\s\-\(\)]/g, "");
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.startsWith("91") && cleaned.length === 12) return `+${cleaned}`;
  if (cleaned.length === 10) return `+91${cleaned}`;
  return `+${cleaned}`;
}

// In trial mode, redirect all messages to the verified test number
function resolveRecipient(to) {
  const trialMode = process.env.TWILIO_TRIAL_MODE === "true";
  const testPhone = process.env.TEST_PHONE_NUMBER;

  if (trialMode && testPhone) {
    const formatted = formatPhone(testPhone);
    const original = formatPhone(to);
    if (formatted !== original) {
      console.log(`[WhatsApp] Trial mode: redirecting ${original} → ${formatted}`);
    }
    return formatted;
  }
  return formatPhone(to);
}

/**
 * Send a WhatsApp message via Twilio.
 * @param {string} to      - recipient phone number
 * @param {string} message - message body
 */
export async function sendWhatsApp(to, message) {
  if (!to) return { success: false, message: "No phone number" };

  const enabled = process.env.TWILIO_WHATSAPP_ENABLED === "true";
  if (!enabled) {
    console.log(`[WhatsApp] DISABLED — would send to ${to}: ${message}`);
    return { success: true, skipped: true, message: "WhatsApp disabled" };
  }

  const c = getClient();
  if (!c) return { success: false, message: "Twilio not configured" };

  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!from) {
    console.warn("[WhatsApp] TWILIO_WHATSAPP_FROM not set");
    return { success: false, message: "WhatsApp sender not configured" };
  }

  const resolvedPhone = resolveRecipient(to);
  const formattedTo = `whatsapp:${resolvedPhone}`;

  console.log(`[WhatsApp] Attempting → from: ${from}, to: ${formattedTo}`);

  try {
    console.log("[WhatsApp] Sending:", {
      from,
      to: formattedTo,
      body: message
    });
    const result = await c.messages.create({
      from,
      to: formattedTo,
      body: message,
    });

    console.log(`[WhatsApp] ✅ Sent to ${formattedTo}. SID: ${result.sid}`);
    return { success: true, sid: result.sid };
  } catch (err) {
    console.error(`[WhatsApp] ❌ Failed — code: ${err.code}, message: ${err.message}, status: ${err.status}`);
    return { success: false, error: err.message, code: err.code };
  }
}
