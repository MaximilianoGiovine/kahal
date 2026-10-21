import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';

export const MAIL_QUEUE = 'mail';

export interface MailJob {
  to: string;
  subject: string;
  html: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(@InjectQueue(MAIL_QUEUE) private readonly queue: Queue<MailJob>) {}

  /** Encola el envío; nunca hace fallar la operación que lo dispara. */
  async send(job: MailJob) {
    try {
      await this.queue.add('send', job, {
        attempts: 5,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      });
    } catch (err) {
      this.logger.error(`No se pudo encolar el email a ${job.to}: ${err}`);
    }
  }
}

export function mailLayout(churchName: string, title: string, body: string) {
  return `<!doctype html><html><body style="margin:0;background:#f5f5f4;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;padding:32px">
<tr><td style="color:#78716c;font-size:13px">${escapeHtml(churchName)} · Kahal</td></tr>
<tr><td style="padding-top:12px;font-size:20px;font-weight:bold;color:#1c1917">${escapeHtml(title)}</td></tr>
<tr><td style="padding-top:16px;font-size:15px;line-height:1.6;color:#44403c">${body}</td></tr>
</table></td></tr></table></body></html>`;
}

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
