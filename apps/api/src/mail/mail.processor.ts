import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { createTransport, Transporter } from 'nodemailer';
import { MAIL_QUEUE, MailJob } from './mail.service';

@Processor(MAIL_QUEUE, { concurrency: 5 })
export class MailProcessor extends WorkerHost {
  private readonly logger = new Logger(MailProcessor.name);
  private readonly transporter?: Transporter;
  private readonly from: string;

  constructor(config: ConfigService) {
    super();
    const host = config.get<string>('SMTP_HOST');
    this.from = config.get<string>('SMTP_FROM') ?? 'Kahal <no-reply@kahal.app>';
    if (host) {
      this.transporter = createTransport({
        host,
        port: Number(config.get('SMTP_PORT') ?? 587),
        secure: config.get('SMTP_SECURE') === 'true',
        auth: config.get('SMTP_USER')
          ? { user: config.get('SMTP_USER'), pass: config.get('SMTP_PASS') }
          : undefined,
      });
    }
  }

  async process(job: Job<MailJob>) {
    if (!this.transporter) {
      this.logger.log(`[SMTP no configurado] Email a ${job.data.to}: "${job.data.subject}"`);
      return;
    }
    await this.transporter.sendMail({ from: this.from, ...job.data });
  }
}
