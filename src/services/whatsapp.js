import twilio from 'twilio';
import { config } from '../config.js';

const client = twilio(config.twilio.accountSid, config.twilio.authToken);

// Cache for Twilio Content Template SIDs (keyed by template name)
const templateCache = new Map();

/**
 * Send a plain text WhatsApp message.
 */
export async function sendWhatsAppMessage(to, body) {
  return client.messages.create({
    from: config.twilio.whatsappNumber,
    to: to.startsWith('whatsapp:') ? to : `whatsapp:${to}`,
    body,
  });
}

/**
 * Send a WhatsApp message with interactive quick-reply buttons.
 * Uses Twilio Content API to create templates on-the-fly and caches them.
 * Falls back to text-based menu if Content API fails (e.g. sandbox).
 *
 * @param {string} to - Recipient phone number
 * @param {string} body - Message body text
 * @param {Array<{id: string, title: string}>} buttons - Up to 3 buttons
 */
export async function sendWhatsAppButtons(to, body, buttons) {
  const recipient = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;

  // Try sending with Content Template (interactive buttons)
  try {
    const contentSid = await getOrCreateTemplate(body, buttons);
    return await client.messages.create({
      from: config.twilio.whatsappNumber,
      to: recipient,
      contentSid,
    });
  } catch (err) {
    console.warn('Interactive buttons failed, falling back to text:', err.message);
  }

  // Fallback: text-based menu
  const fallbackBody = body + '\n\n' + buttons.map(b => `> ${b.title}`).join('\n');
  return client.messages.create({
    from: config.twilio.whatsappNumber,
    to: recipient,
    body: fallbackBody,
  });
}

/**
 * Get or create a Twilio Content Template for quick-reply buttons.
 * Templates are cached in memory by a hash of body + button IDs.
 */
async function getOrCreateTemplate(body, buttons) {
  const cacheKey = body + '|' + buttons.map(b => b.id).join(',');

  if (templateCache.has(cacheKey)) {
    return templateCache.get(cacheKey);
  }

  // Check if template already exists by friendly name
  const friendlyName = 'bal_' + hashCode(cacheKey);

  try {
    const existing = await client.content.v1.contents.list({ limit: 100 });
    const found = existing.find(c => c.friendlyName === friendlyName);
    if (found) {
      templateCache.set(cacheKey, found.sid);
      return found.sid;
    }
  } catch {
    // Content API not available (e.g. sandbox) - will throw and fall back
  }

  // Create new template
  const content = await client.content.v1.contents.create({
    friendlyName,
    language: 'de',
    types: {
      'twilio/quick-reply': {
        body,
        actions: buttons.map(b => ({ title: b.title, id: b.id })),
      },
    },
  });

  templateCache.set(cacheKey, content.sid);
  return content.sid;
}

/**
 * Send a WhatsApp interactive list message via Twilio Content API.
 * Used for property selection during checkout (supports up to 10 items per section).
 *
 * @param {string} to - Recipient phone number
 * @param {string} body - Message body text
 * @param {string} buttonText - Text on the list button (e.g., "Objekt waehlen")
 * @param {Array<{id: string, title: string, description?: string}>} items - List items
 */
export async function sendWhatsAppListMessage(to, body, buttonText, items) {
  const recipient = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;

  try {
    const cacheKey = `list_${body}_${items.map(i => i.id).join(',')}`;
    const friendlyName = 'bal_list_' + hashCode(cacheKey);

    // Try to find existing template
    const existing = await client.content.v1.contents.list({ limit: 100 });
    const found = existing.find(c => c.friendlyName === friendlyName);
    let contentSid;

    if (found) {
      contentSid = found.sid;
    } else {
      const content = await client.content.v1.contents.create({
        friendlyName,
        language: 'de',
        types: {
          'twilio/list-picker': {
            body,
            button: buttonText,
            items: items.map(item => ({
              id: item.id,
              title: item.title.substring(0, 24),
              description: item.description ? item.description.substring(0, 72) : undefined,
            })),
          },
        },
      });
      contentSid = content.sid;
    }

    return await client.messages.create({
      from: config.twilio.whatsappNumber,
      to: recipient,
      contentSid,
    });
  } catch (err) {
    console.warn('List message failed, falling back to numbered text:', err.message);

    // Fallback: numbered text list
    const lines = items.map((item, i) => `${i + 1}. ${item.title}`);
    const fallbackBody = `${body}\n\n${lines.join('\n')}\n\nSchreib die Nummer:`;
    return client.messages.create({
      from: config.twilio.whatsappNumber,
      to: recipient,
      body: fallbackBody,
    });
  }
}

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}
