import { getDb, saveDb, logAudit } from './db.ts';
import { queueAndSendSms, renderTemplate } from './sms.ts';

export interface SchedulerRunResult {
  runAt: string;
  domainsChecked: number;
  remindersSent: number;
  remindersSkipped: number;
  errors: string[];
}

/**
 * Calculates days remaining until a given expiration date.
 * Returns negative numbers if expired.
 */
export function getDaysRemaining(expirationDateStr: string): number {
  const now = new Date();
  const exp = new Date(expirationDateStr);
  const diffTime = exp.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Checks all domains, updates statuses based on current date,
 * and triggers automated notifications for configured intervals.
 */
export async function runDomainReminderScheduler(): Promise<SchedulerRunResult> {
  const db = getDb();
  const result: SchedulerRunResult = {
    runAt: new Date().toISOString(),
    domainsChecked: 0,
    remindersSent: 0,
    remindersSkipped: 0,
    errors: [],
  };

  const reminderIntervals = db.settings.reminders.domainReminderDays || [30, 14, 7, 3, 1];
  const autoDomainRemindersEnabled = db.settings.sms.autoDomainReminders;
  const currency = db.settings.general.currency || 'ETB';

  const domainReminderTemplate = db.templates.find(
    (t) => t.type === 'domain_reminder' && t.channel === 'sms'
  );

  for (const domain of db.domains) {
    result.domainsChecked++;
    if (domain.status === 'cancelled') continue;

    const daysLeft = getDaysRemaining(domain.expirationDate);

    // Update status based on expiration date (without auto-renewing!)
    if (daysLeft < 0) {
      if (domain.status !== 'expired') {
        domain.status = 'expired';
        domain.updatedAt = new Date().toISOString();
      }
    } else if (daysLeft <= 30) {
      if (domain.status === 'active') {
        domain.status = 'expiring_soon';
        domain.updatedAt = new Date().toISOString();
      }
    } else {
      if (domain.status === 'expiring_soon') {
        domain.status = 'active';
        domain.updatedAt = new Date().toISOString();
      }
    }

    // Check automated reminders
    if (!autoDomainRemindersEnabled) continue;

    const customer = db.customers.find((c) => c.id === domain.customerId);
    if (!customer || customer.status === 'archived' || !customer.phone) {
      result.remindersSkipped++;
      continue;
    }

    if (!domain.sentReminderIntervals) {
      domain.sentReminderIntervals = [];
    }

    // Check each interval to see if daysLeft matches or is just below this interval threshold
    for (const interval of reminderIntervals) {
      // If days left is within interval range [interval - 1, interval] and not yet sent
      if (daysLeft <= interval && daysLeft > (interval === 1 ? -1 : 0)) {
        if (!domain.sentReminderIntervals.includes(interval)) {
          // Check if already logged in message logs
          const alreadyLogged = db.messageLogs.some(
            (m) =>
              m.domainId === domain.id &&
              m.reminderInterval === interval &&
              (m.status === 'sent' || m.status === 'delivered')
          );

          if (alreadyLogged) {
            domain.sentReminderIntervals.push(interval);
            result.remindersSkipped++;
            continue;
          }

          // Build message text
          const templateStr =
            domainReminderTemplate?.bodyTemplate ||
            'Hello [Customer Name], your domain [Domain Name] is scheduled to expire on [Expiration Date] ([Days Remaining] days left). Renewal price: [Amount] [Currency]. Please contact NexGrid Digital Systems to arrange renewal.';

          const expDateFormatted = new Date(domain.expirationDate).toISOString().split('T')[0];
          const messageContent = renderTemplate(templateStr, {
            'Customer Name': customer.businessName || customer.contactPerson,
            'Domain Name': domain.domainName,
            'Expiration Date': expDateFormatted,
            'Days Remaining': daysLeft,
            'Amount': domain.renewalPrice.toLocaleString(),
            'Currency': currency,
            'Business Contact': db.settings.general.businessPhone || db.settings.general.businessContact,
          });

          try {
            await queueAndSendSms({
              customerId: customer.id,
              customerName: customer.businessName,
              recipient: customer.phone,
              messageType: 'domain_reminder',
              content: messageContent,
              domainId: domain.id,
              reminderInterval: interval,
            });

            domain.sentReminderIntervals.push(interval);
            domain.lastReminderSentAt = new Date().toISOString();
            result.remindersSent++;
          } catch (err: any) {
            result.errors.push(`Failed sending to ${customer.phone} for ${domain.domainName}: ${err.message}`);
          }
        }
      }
    }
  }

  db.settings.reminders.lastSchedulerRun = result.runAt;
  saveDb(db);

  return result;
}

let intervalTimer: NodeJS.Timeout | null = null;

export function initScheduler(): void {
  // Run on startup after 5 seconds
  setTimeout(() => {
    runDomainReminderScheduler().catch((err) =>
      console.error('Error during initial domain reminder scheduler run:', err)
    );
  }, 5000);

  // Run every 30 minutes in background
  if (!intervalTimer) {
    intervalTimer = setInterval(() => {
      runDomainReminderScheduler().catch((err) =>
        console.error('Error during scheduled domain reminder run:', err)
      );
    }, 30 * 60 * 1000);
  }
}
