import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../env';
import type { Mail } from './templates';

let transporter: Transporter | undefined;

function getTransporter(): Transporter {
  if (!transporter) {
    const e = env();
    transporter = nodemailer.createTransport({
      host: e.SMTP_HOST,
      port: e.SMTP_PORT,
      secure: e.SMTP_SECURE,
      ...(e.SMTP_USER ? { auth: { user: e.SMTP_USER, pass: e.SMTP_PASS } } : {}),
    });
  }
  return transporter;
}

/** Envoi SMTP direct. Utilisé par le job `mail.send` (et en direct pour les e-mails d'authentification). */
export async function sendMailNow(mail: Mail): Promise<void> {
  await getTransporter().sendMail({ from: env().MAIL_FROM, to: mail.to, subject: mail.subject, html: mail.html, text: mail.text });
}
