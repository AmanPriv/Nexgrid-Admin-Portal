import { getDb, saveDb, type MessageLog, type MessageTemplate } from './db.ts';

export interface SendSmsResult {
  success: boolean;
  messageId: string;
  status: 'queued' | 'sent' | 'delivered' | 'failed';
  providerReference?: string;
  error?: string;
}

export function formatMsisdn(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('2510') && digits.length === 13) {
    return `251${digits.slice(4)}`;
  }
  if (digits.startsWith('251') && digits.length >= 12) {
    return digits.slice(0, 12);
  }
  if ((digits.startsWith('09') || digits.startsWith('07')) && digits.length === 10) {
    return `251${digits.slice(1)}`;
  }
  if ((digits.startsWith('9') || digits.startsWith('7')) && digits.length === 9) {
    return `251${digits}`;
  }
  return digits;
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
 * Real dispatch to SMS Gateway (supports SMS Ethiopia, AfroMessage, and Custom HTTP Gateway)
 */
export async function dispatchSms(
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
      error: 'SMS Gateway API key is not configured in Settings. Please provide your API Key from smsethiopia.com or your SMS provider.',
    };
  }

  const cleanKey = smsConfig.apiKey.trim();
  const msisdn = formatMsisdn(recipient);
  const provider = (smsConfig.provider as string) || 'sms_et';

  // 1. AfroMessage Provider
  if (provider === 'afro_message') {
    const endpoint = smsConfig.apiEndpoint?.trim() || 'https://api.afromessage.com/api/send';
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${cleanKey}`,
        },
        body: JSON.stringify({
          to: msisdn,
          message,
          ...(smsConfig.senderId ? { from: smsConfig.senderId } : {}),
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = (await res.json().catch(() => ({}))) as any;
      if (res.ok && (data.acknowledge === 'success' || data.status === 'success' || !data.error)) {
        return {
          status: 'sent',
          providerRef: String(data.response?.id || data.id || `AFRO-${Date.now()}`),
        };
      }
      return {
        status: 'failed',
        error: data.message || data.error || `AfroMessage Gateway Error (${res.status})`,
      };
    } catch (err: any) {
      return {
        status: 'failed',
        error: `AfroMessage Connection Error: ${err.message}`,
      };
    }
  }

  // 2. Custom HTTP / Webhook Gateway
  if (provider === 'custom_webhook') {
    const endpoint = smsConfig.apiEndpoint?.trim();
    if (!endpoint) {
      return { status: 'failed', error: 'Custom SMS Gateway URL is not configured.' };
    }
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${cleanKey}`,
          'X-API-KEY': cleanKey,
        },
        body: JSON.stringify({
          to: msisdn,
          recipient: msisdn,
          message,
          text: message,
          sender: smsConfig.senderId || 'NexGrid',
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const raw = await res.text();
      if (res.ok) {
        return {
          status: 'sent',
          providerRef: `HOOK-${Date.now()}`,
        };
      }
      return {
        status: 'failed',
        error: `Custom Gateway Error (${res.status}): ${raw.slice(0, 180)}`,
      };
    } catch (err: any) {
      return {
        status: 'failed',
        error: `Custom Gateway Connection Error: ${err.message}`,
      };
    }
  }

  // 3. Official SMS Ethiopia Gateway (smsethiopia.com) - Default Campaign & Registered Company Support
  let endpoint = smsConfig.apiEndpoint?.trim() || 'https://smsethiopia.com/api/sms/send';
  if (endpoint.includes('sms.et')) {
    endpoint = 'https://smsethiopia.com/api/sms/send';
  }

  // Per SMS Ethiopia (Alet Support Team):
  // If using the Default Campaign (business not yet registered for custom Sender ID),
  // we must use SMS Ethiopia's default sender ID (do not override with unapproved sender_id).
  const customSender = smsConfig.senderId ? smsConfig.senderId.trim() : '';
  const useCustomSender =
    customSender !== '' &&
    customSender.toLowerCase() !== 'default' &&
    customSender.toLowerCase() !== 'nexgrid';

  const payload: Record<string, any> = {
    msisdn,
    text: message,
  };
  if (useCustomSender) {
    payload.sender_id = customSender;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000); // 12s timeout

    let response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'KEY': cleanKey,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    // If a custom sender_id was sent and rejected, fallback automatically to SMS Ethiopia's Default Sender ID
    if (!response.ok && useCustomSender) {
      const retryPayload = { msisdn, text: message };
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'KEY': cleanKey,
        },
        body: JSON.stringify(retryPayload),
        signal: controller.signal,
      });
    }

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
        responseData?.id ||
        responseData?.message_id ||
        responseData?.reference ||
        responseData?.data?.id ||
        `SMSET-${Date.now()}`;

      const deliveryStatus =
        responseData?.status === 'DELIVERED' || responseData?.status === 'delivered'
          ? 'delivered'
          : 'sent';

      return {
        status: deliveryStatus,
        providerRef: String(providerRef),
      };
    } else {
      const rawMsg = responseData?.error_message || responseData?.message || responseData?.error || '';
      const isWhitelistError =
        responseData?.error_code === 10007 ||
        responseData?.status === 'DEFAULT_CAMPAIGN_RECIPIENT_NOT_WHITELISTED' ||
        rawMsg.includes('10007') ||
        rawMsg.includes('DEFAULT_CAMPAIGN_RECIPIENT_NOT_WHITELISTED');

      let errorMsg = `HTTP ${response.status} (${response.statusText})`;
      if (isWhitelistError) {
        errorMsg = `Default Campaign Whitelist Required (Code 10007): Recipient ${msisdn} is not yet whitelisted in your SMS Ethiopia Default Campaign. Per SMS Ethiopia (Alet Support Team): while using the Default Campaign (with the default Sender ID), you must whitelist "${msisdn}" in your smsethiopia.com dashboard before sending, OR submit your business registration documents for company registration and custom Sender ID approval.`;
      } else if (response.status === 401 || response.status === 403) {
        errorMsg = `Authentication Failed: Invalid SMS Ethiopia API Key (${response.status}). Verify your key at https://smsethiopia.com`;
      } else if (response.status === 402) {
        errorMsg = 'Insufficient Account Balance / Credit on SMS Ethiopia. Please top up your account at smsethiopia.com.';
      } else if (rawMsg) {
        errorMsg = `SMS Gateway Error: ${rawMsg}`;
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

// Alias for backwards compatibility
export const dispatchSmsEthiopia = dispatchSms;

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
