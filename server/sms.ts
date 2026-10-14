import { getDb, saveDb, type MessageLog, type MessageTemplate } from './db.ts';

export interface SendSmsResult {
  success: boolean;
  messageId: string;
  status: 'queued' | 'sent' | 'delivered' | 'failed';
  providerReference?: string;
  error?: string;
}

/**
 * Normalizes phone numbers for Ethiopian telecom standards:
 * Accepts formats like: 0911234567, 0711234567, +251911234567, 251911234567
 * Returns standard international +251XXXXXXXXX or original if foreign.
 */
export function normalizeEthiopianPhone(phone: string): string {
  const cleaned = phone.replace(/[\s\-\(\)]/g, '');
  if (cleaned.startsWith('09') && cleaned.length === 10) {
    return `+251${cleaned.slice(1)}`;
  }
  if (cleaned.startsWith('07') && cleaned.length === 10) {
    return `+251${cleaned.slice(1)}`;
  }
  if (cleaned.startsWith('251') && (cleaned.length === 12 || cleaned.length === 13)) {
    return `+${cleaned}`;
  }
  if (cleaned.startsWith('+251')) {
    return cleaned;
  }
  return cleaned;
}

/**
 * Validates international/Ethiopian phone numbers
 */
export function isValidPhone(phone: string): boolean {
  const norm = normalizeEthiopianPhone(phone);
  return /^\+?[1-9]\d{7,14}$/.test(norm);
}

/**
 * Fills template placeholders with actual values
 */
export function renderTemplate(template: string, vars: Record<string, string | number>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    // support both [Key] and {{Key}}
    const strVal = String(value ?? '');
    result = result.split(`[${key}]`).join(strVal);
    result = result.split(`{{${key}}}`).join(strVal);
  }
  return result;
}

/**
 * Real dispatch to SMS Ethiopia official API endpoint
 */
export async function dispatchSmsEthiopia(
  recipient: string,
  message: string
): Promise<{ status: 'sent' | 'delivered' | 'failed'; providerRef?: string; error?: string }> {
  const db = getDb();
  const smsConfig = db.settings.sms;

  if (!smsConfig.enabled) {
    return {
      status: 'failed',
      error: 'SMS notification service is disabled in NexGrid settings.',
    };
  }

  if (!smsConfig.apiKey || smsConfig.apiKey.trim() === '') {
    return {
      status: 'failed',
      error: 'SMS Ethiopia API key is not configured in Settings. Please provide your API Key.',
    };
  }

  const endpoint = smsConfig.apiEndpoint || 'https://sms.et/api/v1/send';
  const normRecipient = normalizeEthiopianPhone(recipient);

  // SMS Ethiopia / Ethiopian SMS Gateway standard payload
  // We send standard JSON with Authorization Bearer header, and fallback headers and body tokens
  const payload = {
    to: normRecipient,
    phone: normRecipient,
    recipient: normRecipient,
    sender: smsConfig.senderId || 'NexGrid',
    sender_id: smsConfig.senderId || 'NexGrid',
    from: smsConfig.senderId || 'NexGrid',
    message: message,
    body: message,
    text: message,
    api_key: smsConfig.apiKey,
    key: smsConfig.apiKey,
    token: smsConfig.apiKey,
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000); // 12s timeout

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${smsConfig.apiKey}`,
        'api-key': smsConfig.apiKey,
        'x-api-key': smsConfig.apiKey,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const rawText = await response.text();
    let responseData: any = null;
    try {
      responseData = JSON.parse(rawText);
    } catch {
      responseData = { raw: rawText };
    }

    if (response.ok) {
      const providerRef =
        responseData?.message_id ||
        responseData?.id ||
        responseData?.reference ||
        responseData?.data?.id ||
        `SMSET-${Date.now()}`;

      const deliveryStatus =
        responseData?.status === 'delivered' ? 'delivered' : 'sent';

      return {
        status: deliveryStatus,
        providerRef: String(providerRef),
      };
    } else {
      let errorMsg = `HTTP ${response.status} (${response.statusText})`;
      if (response.status === 401 || response.status === 403) {
        errorMsg = `Authentication Failed: Invalid SMS Ethiopia API Key (${response.status})`;
      } else if (response.status === 402) {
        errorMsg = 'Insufficient Account Balance / Credit on SMS Ethiopia';
      } else if (responseData?.message || responseData?.error) {
        errorMsg += `: ${responseData.message || responseData.error}`;
      } else if (typeof responseData?.raw === 'string' && responseData.raw) {
        errorMsg += `: ${responseData.raw.slice(0, 150)}`;
      }

      return {
        status: 'failed',
        error: errorMsg,
      };
    }
  } catch (err: any) {
    const errorMsg =
      err.name === 'AbortError'
        ? 'Connection timed out while reaching SMS Ethiopia API endpoint'
        : `Network or Gateway Connection Error: ${err.message || 'Unable to connect to SMS Ethiopia'}`;
    return {
      status: 'failed',
      error: errorMsg,
    };
  }
}

/**
 * Creates a message log and triggers dispatch
 */
export async function queueAndSendSms(params: {
  customerId: string;
  customerName?: string;
  recipient: string;
  messageType: MessageLog['messageType'];
  content: string;
  domainId?: string;
  reminderInterval?: number;
}): Promise<SendSmsResult> {
  const db = getDb();
  const id = `MSG-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  // Deduplication check: prevent duplicate reminders for the exact same domain & interval
  if (params.domainId && params.reminderInterval !== undefined) {
    const existing = db.messageLogs.find(
      (m) =>
        m.domainId === params.domainId &&
        m.reminderInterval === params.reminderInterval &&
        (m.status === 'sent' || m.status === 'delivered')
    );
    if (existing) {
      return {
        success: true,
        messageId: existing.id,
        status: existing.status,
        providerReference: existing.providerReference,
        error: `Duplicate avoided: A reminder for ${params.reminderInterval} days was already sent on ${existing.createdAt}`,
      };
    }
  }

  const log: MessageLog = {
    id,
    customerId: params.customerId,
    customerName: params.customerName,
    recipient: params.recipient,
    channel: 'sms',
    messageType: params.messageType,
    content: params.content,
    status: 'queued',
    attemptCount: 1,
    lastAttemptAt: new Date().toISOString(),
    domainId: params.domainId,
    reminderInterval: params.reminderInterval,
    createdAt: new Date().toISOString(),
  };

  db.messageLogs.unshift(log);
  saveDb(db);

  // Dispatch to SMS Ethiopia
  const dispatchRes = await dispatchSmsEthiopia(params.recipient, params.content);

  log.status = dispatchRes.status;
  log.providerReference = dispatchRes.providerRef;
  log.errorDetails = dispatchRes.error;
  log.lastAttemptAt = new Date().toISOString();

  // If domain reminder succeeded, mark domain sent intervals
  if (dispatchRes.status === 'sent' || dispatchRes.status === 'delivered') {
    if (params.domainId && params.reminderInterval !== undefined) {
      const domain = db.domains.find((d) => d.id === params.domainId);
      if (domain) {
        domain.lastReminderSentAt = new Date().toISOString();
        if (!domain.sentReminderIntervals) {
          domain.sentReminderIntervals = [];
        }
        if (!domain.sentReminderIntervals.includes(params.reminderInterval)) {
          domain.sentReminderIntervals.push(params.reminderInterval);
        }
      }
    }
  }

  saveDb(db);

  return {
    success: log.status === 'sent' || log.status === 'delivered',
    messageId: log.id,
    status: log.status,
    providerReference: log.providerReference,
    error: log.errorDetails,
  };
}

/**
 * Manual retry for failed messages with backoff limit
 */
export async function retryMessage(messageId: string): Promise<SendSmsResult> {
  const db = getDb();
  const log = db.messageLogs.find((m) => m.id === messageId);
  if (!log) {
    throw new Error('Message log record not found');
  }

  if (log.attemptCount >= 5) {
    throw new Error('Maximum retry attempts (5) reached for this message.');
  }

  log.attemptCount += 1;
  log.lastAttemptAt = new Date().toISOString();
  saveDb(db);

  const dispatchRes = await dispatchSmsEthiopia(log.recipient, log.content);
  log.status = dispatchRes.status;
  log.providerReference = dispatchRes.providerRef;
  log.errorDetails = dispatchRes.error;

  saveDb(db);

  return {
    success: log.status === 'sent' || log.status === 'delivered',
    messageId: log.id,
    status: log.status,
    providerReference: log.providerReference,
    error: log.errorDetails,
  };
}
