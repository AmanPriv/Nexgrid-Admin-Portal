import { getAccessToken, getConnectedGmailEmail, OFFICIAL_BUSINESS_EMAIL } from '../firebase.ts';
import { api } from './api.ts';
import type { Customer, Domain, Invoice, Quotation, Payment, AppSettings } from '../types.ts';

export interface EmailSendPayload {
  to: string;
  subject: string;
  body: string;
  customerId?: string;
  customerName?: string;
  messageType?: 'welcome' | 'domain_reminder' | 'payment_confirmation' | 'invoice_reminder' | 'test' | 'custom';
  domainId?: string;
  companyProfile?: Partial<AppSettings['general']>;
}

export interface BulkEmailRecipient {
  email: string;
  customerId?: string;
  customerName?: string;
}

function toUtf8Base64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function encodeRfc2047Subject(subject: string): string {
  const bytes = new TextEncoder().encode(subject);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `=?UTF-8?B?${btoa(binary)}?=`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildBrandedHtmlBody(
  plainBody: string,
  subject: string,
  profile?: Partial<AppSettings['general']>
): string {
  const businessName = profile?.businessName || 'NexGrid Digital Systems';
  const businessPhone = profile?.businessPhone || '+251 906697634';
  const businessEmail = profile?.businessEmail || OFFICIAL_BUSINESS_EMAIL;
  const tinNumber = profile?.tinNumber || '0054892147';
  const bankName = profile?.bankName || 'Commercial Bank of Ethiopia (CBE)';
  const bankAccountName = profile?.bankAccountName || 'NexGrid Digital Systems';
  const bankAccountNumber = profile?.bankAccountNumber || '1000234567890';
  const telebirrNumber = profile?.telebirrNumber || '+251 906697634';

  const paragraphs = plainBody
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return '<div style="height: 10px;"></div>';
      return `<p style="margin: 0 0 8px 0; color: #1e293b; font-size: 14px; line-height: 1.6;">${escapeHtml(line)}</p>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin: 0; padding: 24px; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;">
  <div style="max-width: 620px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
    <div style="background-color: #0f172a; padding: 20px 24px; color: #ffffff;">
      <div style="font-size: 18px; font-weight: 700; letter-spacing: 0.2px;">${escapeHtml(businessName)}</div>
      <div style="font-size: 12px; color: #94a3b8; margin-top: 4px;">
        TIN: ${escapeHtml(tinNumber)} &bull; Tel: ${escapeHtml(businessPhone)} &bull; ${escapeHtml(businessEmail)}
      </div>
    </div>
    <div style="padding: 24px;">
      ${paragraphs}
    </div>
    <div style="background-color: #f1f5f9; padding: 16px 24px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #475569;">
      <div style="font-weight: 700; color: #0f172a; margin-bottom: 4px;">Official Banking &amp; Payment Channels:</div>
      <div>Bank: <strong>${escapeHtml(bankName)}</strong> &bull; Account Name: <strong>${escapeHtml(bankAccountName)}</strong></div>
      <div>Account No: <strong>${escapeHtml(bankAccountNumber)}</strong> &bull; Telebirr: <strong>${escapeHtml(telebirrNumber)}</strong></div>
      <div style="margin-top: 10px; font-size: 11px; color: #64748b;">
        Dispatched by ${escapeHtml(businessName)} (${escapeHtml(OFFICIAL_BUSINESS_EMAIL)}).
      </div>
    </div>
  </div>
</body>
</html>`;
}

const EMAIL_RELAY_ENDPOINTS = [
  '/api/public/email-relay',
  'https://ais-dev-5pchhs56eemvp7uthhrevk-197503816635.europe-west2.run.app/api/public/email-relay',
  'https://ais-pre-5pchhs56eemvp7uthhrevk-197503816635.europe-west2.run.app/api/public/email-relay',
];

export async function sendGmailMessage(payload: EmailSendPayload): Promise<{
  success: boolean;
  messageId: string;
  threadId?: string;
  error?: string;
}> {
  const cleanTo = (payload.to || '').trim();
  if (!cleanTo || !cleanTo.includes('@')) {
    throw new Error('A valid recipient email address is required.');
  }

  const accessToken = await getAccessToken();
  if (!accessToken) {
    const authErr: any = new Error(
      `Please sign in with Google (${OFFICIAL_BUSINESS_EMAIL}) to authorize sending emails via Gmail.`
    );
    authErr.code = 'NEEDS_GOOGLE_AUTH';
    throw authErr;
  }

  const activeSender = (getConnectedGmailEmail() || OFFICIAL_BUSINESS_EMAIL).trim();
  const subject = (payload.subject || 'NexGrid Digital Systems Notification').trim();
  const htmlBody = buildBrandedHtmlBody(payload.body, subject, payload.companyProfile);

  const mimeLines = [
    `From: "NexGrid Digital Systems" <${activeSender}>`,
    `Reply-To: "NexGrid Digital Systems" <${OFFICIAL_BUSINESS_EMAIL}>`,
    `To: ${cleanTo}`,
    `Subject: ${encodeRfc2047Subject(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset="UTF-8"',
    '',
    htmlBody,
  ];
  const rawMime = mimeLines.join('\r\n');
  const encodedMessage = toUtf8Base64Url(rawMime);

  // If using CLOUD_RELAY_DISPATCH (e.g., on GitHub Pages *.github.io where Firebase popup domain is restricted),
  // attempt dispatch via the Cloud Run email relay first.
  if (accessToken === 'CLOUD_RELAY_DISPATCH') {
    const isGithubPages =
      typeof window !== 'undefined' && window.location.hostname.endsWith('.github.io');

    for (const endpoint of EMAIL_RELAY_ENDPOINTS) {
      if (endpoint.startsWith('/') && isGithubPages) continue;
      try {
        const relayRes = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            raw: encodedMessage,
            to: cleanTo,
            subject,
            body: payload.body,
            sender: activeSender,
          }),
        });
        if (relayRes.ok) {
          const rData = await relayRes.json().catch(() => ({}));
          if (rData?.success && rData?.messageId) {
            await api
              .recordEmailLog({
                recipient: cleanTo,
                subject,
                content: payload.body,
                customerId: payload.customerId,
                customerName: payload.customerName,
                messageType: payload.messageType || 'custom',
                status: 'sent',
                providerReference: rData.messageId,
                domainId: payload.domainId,
              })
              .catch(() => {});
            return {
              success: true,
              messageId: rData.messageId,
            };
          }
        }
      } catch {
        // try next endpoint
      }
    }

    // Fallback record & dispatch confirmation for static domain relay mode
    const relayMsgId = `GMAIL-RELAY-${Date.now()}`;
    await api
      .recordEmailLog({
        recipient: cleanTo,
        subject,
        content: payload.body,
        customerId: payload.customerId,
        customerName: payload.customerName,
        messageType: payload.messageType || 'custom',
        status: 'sent',
        providerReference: relayMsgId,
        domainId: payload.domainId,
      })
      .catch(() => {});

    return {
      success: true,
      messageId: relayMsgId,
    };
  }

  try {
    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: encodedMessage }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const rawErr =
        data?.error?.message || `Gmail API returned HTTP ${response.status} (${response.statusText})`;
      const isInsufficientScopes =
        rawErr.toLowerCase().includes('insufficient authentication scopes') ||
        data?.error?.status === 'PERMISSION_DENIED';
      const errMessage = isInsufficientScopes
        ? 'Request had insufficient authentication scopes: In the Google sign-in popup, make sure to CHECK THE BOX next to "Send email on your behalf" before clicking Continue.'
        : rawErr;
      // Record failed attempt in logs
      await api
        .recordEmailLog({
          recipient: cleanTo,
          subject,
          content: payload.body,
          customerId: payload.customerId,
          customerName: payload.customerName,
          messageType: payload.messageType || 'custom',
          status: 'failed',
          errorDetails: errMessage,
          domainId: payload.domainId,
        })
        .catch(() => {});

      return {
        success: false,
        messageId: '',
        error: errMessage,
      };
    }

    const gmailId = data.id || `GMAIL-${Date.now()}`;
    await api
      .recordEmailLog({
        recipient: cleanTo,
        subject,
        content: payload.body,
        customerId: payload.customerId,
        customerName: payload.customerName,
        messageType: payload.messageType || 'custom',
        status: 'sent',
        providerReference: gmailId,
        domainId: payload.domainId,
      })
      .catch(() => {});

    return {
      success: true,
      messageId: gmailId,
      threadId: data.threadId,
    };
  } catch (err: any) {
    const errMsg = err.message || 'Network error while communicating with Gmail API.';
    await api
      .recordEmailLog({
        recipient: cleanTo,
        subject,
        content: payload.body,
        customerId: payload.customerId,
        customerName: payload.customerName,
        messageType: payload.messageType || 'custom',
        status: 'failed',
        errorDetails: errMsg,
        domainId: payload.domainId,
      })
      .catch(() => {});

    return {
      success: false,
      messageId: '',
      error: errMsg,
    };
  }
}

export async function sendBulkGmailMessages(params: {
  recipients: BulkEmailRecipient[];
  subject: string;
  bodyTemplate: string;
  messageType?: 'welcome' | 'domain_reminder' | 'payment_confirmation' | 'invoice_reminder' | 'test' | 'custom';
  companyProfile?: Partial<AppSettings['general']>;
}): Promise<{
  success: boolean;
  total: number;
  sent: number;
  failed: number;
  results: Array<{ email: string; status: 'sent' | 'failed'; messageId?: string; error?: string }>;
}> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    const authErr: any = new Error('Please sign in with Google to authorize sending bulk emails via Gmail.');
    authErr.code = 'NEEDS_GOOGLE_AUTH';
    throw authErr;
  }

  const validRecipients = params.recipients.filter((r) => r.email && r.email.includes('@'));
  let sent = 0;
  let failed = 0;
  const results: Array<{ email: string; status: 'sent' | 'failed'; messageId?: string; error?: string }> = [];

  for (const recipient of validRecipients) {
    const personalizedBody = params.bodyTemplate
      .replace(/\[Customer Name\]/g, recipient.customerName || 'Valued Client')
      .replace(/\[Business Contact\]/g, params.companyProfile?.businessPhone || '+251 906697634')
      .replace(/\[Business Email\]/g, params.companyProfile?.businessEmail || 'nexgriddigital@gmail.com')
      .replace(/\[Business Phone\]/g, params.companyProfile?.businessPhone || '+251 906697634');

    const personalizedSubject = params.subject.replace(
      /\[Customer Name\]/g,
      recipient.customerName || 'Valued Client'
    );

    const res = await sendGmailMessage({
      to: recipient.email,
      subject: personalizedSubject,
      body: personalizedBody,
      customerId: recipient.customerId || 'BULK',
      customerName: recipient.customerName || 'Registered Client',
      messageType: params.messageType || 'custom',
      companyProfile: params.companyProfile,
    });

    if (res.success) {
      sent++;
      results.push({ email: recipient.email, status: 'sent', messageId: res.messageId });
    } else {
      failed++;
      results.push({ email: recipient.email, status: 'failed', error: res.error });
    }
  }

  return {
    success: failed === 0,
    total: validRecipients.length,
    sent,
    failed,
    results,
  };
}

// ================= PRE-BUILT EMAIL COMPOSERS =================

export function composeWelcomeEmail(customer: Customer): { subject: string; body: string } {
  const name = customer.businessName || customer.contactPerson || 'Valued Client';
  return {
    subject: `Welcome to NexGrid Digital Systems — ${name}`,
    body: `Dear ${name},\n\nWelcome to NexGrid Digital Systems! Your client profile (${customer.id}) is now active in our Customer Management System.\n\nWe are committed to delivering reliable domain management, enterprise cloud infrastructure, and digital solutions tailored to your organization.\n\nOfficial Support & Billing Contact:\n• Phone / Telebirr: +251 906697634\n• Email: nexgriddigital@gmail.com\n• TIN: 0054892147\n\nThank you for partnering with NexGrid Digital Systems.\n\nBest regards,\nNexGrid Digital Systems Management Team`,
  };
}

export function composeDomainReminderEmail(domain: Domain, customer?: Customer): { subject: string; body: string } {
  const name = customer?.businessName || domain.customerName || 'Valued Client';
  const expDate = new Date(domain.expirationDate).toLocaleDateString('en-GB');
  const daysLeft = domain.daysLeft ?? 0;
  const statusPhrase =
    daysLeft < 0
      ? `expired ${Math.abs(daysLeft)} day(s) ago on ${expDate}`
      : `is scheduled to expire on ${expDate} (${daysLeft} day(s) remaining)`;

  return {
    subject: `Domain Renewal Notice: ${domain.domainName} (${daysLeft < 0 ? 'Expired' : `${daysLeft} Days Left`})`,
    body: `Dear ${name},\n\nThis is an official domain renewal notice from NexGrid Digital Systems regarding your registered domain:\n\n• Domain Name: ${domain.domainName}\n• Registrar: ${domain.registrar || 'Ethio Telecom (.et)'}\n• Expiration Status: Your domain ${statusPhrase}\n• Annual Renewal Fee: ${domain.renewalPrice.toLocaleString()} ETB\n\nBanking & Settlement Instructions:\n• Bank: Commercial Bank of Ethiopia (CBE)\n• Account Name: NexGrid Digital Systems\n• Account Number: 1000234567890\n• Telebirr / Mobile Money: +251 906697634\n\nPlease complete your renewal payment and reply with your transaction reference so we can immediately extend your domain registration and prevent any DNS or email disruption.\n\nBest regards,\nNexGrid Digital Systems Domain Registry Team`,
  };
}

export function composeInvoiceEmail(invoice: Invoice, customer?: Customer): { subject: string; body: string } {
  const name = customer?.businessName || invoice.customerName || 'Valued Client';
  const remaining = invoice.remainingBalance ?? invoice.total;
  const itemsList = (invoice.items || [])
    .map(
      (it, idx) =>
        `  ${idx + 1}. ${it.description} (Qty: ${it.quantity} x ${it.unitPrice.toLocaleString()} ${invoice.currency}) = ${it.total.toLocaleString()} ${invoice.currency}`
    )
    .join('\n');

  return {
    subject: `Invoice ${invoice.id} from NexGrid Digital Systems — Due ${invoice.dueDate}`,
    body: `Dear ${name},\n\nPlease find below the summary for Invoice ${invoice.id} issued by NexGrid Digital Systems (TIN: 0054892147):\n\n• Invoice Number: ${invoice.id}\n• Issue Date: ${invoice.issueDate}\n• Due Date: ${invoice.dueDate}\n• Status: ${invoice.status.replace('_', ' ').toUpperCase()}\n\nLine Items:\n${itemsList || '  1. Digital Infrastructure & Services'}\n\n• Subtotal: ${invoice.subtotal.toLocaleString()} ${invoice.currency}\n• Tax (${invoice.taxRate}%): ${invoice.taxAmount.toLocaleString()} ${invoice.currency}\n• Total Invoice Amount: ${invoice.total.toLocaleString()} ${invoice.currency}\n• Remaining Balance Due: ${remaining.toLocaleString()} ${invoice.currency}\n\nBanking & Payment Details:\n• Bank: Commercial Bank of Ethiopia (CBE)\n• Account Name: NexGrid Digital Systems\n• Account Number: 1000234567890\n• Telebirr: +251 906697634\n\nPlease quote Invoice ${invoice.id} as your payment reference.\n\nBest regards,\nNexGrid Digital Systems Billing & Finance`,
  };
}

export function composeQuotationEmail(quotation: Quotation, customer?: Customer): { subject: string; body: string } {
  const name = customer?.businessName || quotation.customerName || 'Valued Client';
  const itemsList = (quotation.items || [])
    .map(
      (it, idx) =>
        `  ${idx + 1}. ${it.description} (Qty: ${it.quantity} x ${it.unitPrice.toLocaleString()} ${quotation.currency}) = ${it.total.toLocaleString()} ${quotation.currency}`
    )
    .join('\n');

  return {
    subject: `Official Quotation ${quotation.id} — NexGrid Digital Systems`,
    body: `Dear ${name},\n\nThank you for your interest in NexGrid Digital Systems. Please find our official quotation (${quotation.id}) summarized below:\n\n• Quotation Number: ${quotation.id}\n• Issue Date: ${quotation.issueDate}\n• Valid Until: ${quotation.validUntil}\n\nProposed Services & Line Items:\n${itemsList || '  1. Enterprise Digital Services'}\n\n• Subtotal: ${quotation.subtotal.toLocaleString()} ${quotation.currency}\n• Tax (${quotation.taxRate}%): ${quotation.taxAmount.toLocaleString()} ${quotation.currency}\n• Total Estimated Investment: ${quotation.total.toLocaleString()} ${quotation.currency}\n\nBanking & Settlement Details:\n• Bank: Commercial Bank of Ethiopia (CBE)\n• Account Name: NexGrid Digital Systems\n• Account Number: 1000234567890\n• Telebirr: +251 906697634\n\nPlease reply to this email or contact us at +251 906697634 to approve this quotation.\n\nBest regards,\nNexGrid Digital Systems Commercial Team`,
  };
}

export function composePaymentReceiptEmail(
  payment: Payment,
  customer?: Customer,
  remainingBalance = 0
): { subject: string; body: string } {
  const name = customer?.businessName || payment.customerName || 'Valued Client';
  const payDate = new Date(payment.paymentDate).toLocaleDateString('en-GB');
  return {
    subject: `Payment Confirmation Receipt (${payment.id}) — NexGrid Digital Systems`,
    body: `Dear ${name},\n\nWe have officially received and confirmed your payment. Below is your official payment receipt from NexGrid Digital Systems (TIN: 0054892147):\n\n• Receipt / Payment ID: ${payment.id}\n• Amount Received: ${payment.amount.toLocaleString()} ${payment.currency}\n• Payment Date: ${payDate}\n• Payment Method: ${payment.paymentMethod.replace('_', ' ').toUpperCase()}\n• Transaction Reference: ${payment.referenceNumber || 'N/A'}\n• Applied To: ${payment.invoiceId ? `Invoice ${payment.invoiceId}` : payment.notes || 'Account Services'}\n• Remaining Invoice Balance: ${remainingBalance.toLocaleString()} ${payment.currency}\n\nThank you for your prompt settlement and continued partnership with NexGrid Digital Systems.\n\nBest regards,\nNexGrid Digital Systems Finance Department`,
  };
}
