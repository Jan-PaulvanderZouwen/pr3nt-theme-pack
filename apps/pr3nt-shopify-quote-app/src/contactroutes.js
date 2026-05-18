import nodemailer from 'nodemailer';
import { mailFrom, transactionalMailOptions } from './mailutils.js';

function clean(value = '', max = 2000) {
  return String(value || '').replace(/[<>]/g, '').trim().slice(0, max);
}

function transporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.transip.email',
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || 'true') === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function field(body, key) {
  if (body[key]) return body[key];
  if (body.contact && body.contact[key]) return body.contact[key];
  return '';
}

function adminHtml(message) {
  return `<div style="font-family:Arial,sans-serif;line-height:1.55;color:#101820"><h1>Nieuw contactbericht via pr3nt.nl</h1><table cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:720px"><tr><td style="border-bottom:1px solid #eee;font-weight:bold;width:170px">Naam</td><td style="border-bottom:1px solid #eee">${message.name}</td></tr><tr><td style="border-bottom:1px solid #eee;font-weight:bold">E-mail</td><td style="border-bottom:1px solid #eee">${message.email}</td></tr><tr><td style="border-bottom:1px solid #eee;font-weight:bold">Telefoon</td><td style="border-bottom:1px solid #eee">${message.phone || '-'}</td></tr><tr><td style="border-bottom:1px solid #eee;font-weight:bold">Onderwerp</td><td style="border-bottom:1px solid #eee">${message.subject}</td></tr><tr><td style="border-bottom:1px solid #eee;font-weight:bold;vertical-align:top">Bericht</td><td style="border-bottom:1px solid #eee;white-space:pre-wrap">${message.body}</td></tr></table></div>`;
}

function customerHtml(message) {
  return `<div style="font-family:Arial,sans-serif;line-height:1.55;color:#101820"><h1>We hebben je bericht ontvangen</h1><p>Hoi ${message.name},</p><p>Bedankt voor je bericht. We nemen zo snel mogelijk contact met je op.</p><p><strong>Onderwerp:</strong> ${message.subject}</p><p>Groet,<br><strong>pr3nt.nl</strong></p></div>`;
}

export function registerContactRoutes(app) {
  app.post('/api/contact', async (req, res) => {
    try {
      const message = {
        name: clean(field(req.body, 'name'), 160),
        email: clean(field(req.body, 'email'), 220),
        phone: clean(field(req.body, 'phone'), 80),
        subject: clean(field(req.body, 'onderwerp') || field(req.body, 'subject') || 'Contactformulier', 180),
        body: clean(field(req.body, 'body') || field(req.body, 'message'), 3000),
      };

      if (!message.name || !validEmail(message.email) || !message.body) {
        throw new Error('Niet alle verplichte velden zijn correct ingevuld.');
      }

      const mailer = transporter();
      const from = mailFrom();
      const to = process.env.MAIL_TO || 'bestellingen@pr3nt.nl';
      const reference = `pr3nt-contact-${Date.now()}`;

      await mailer.sendMail(transactionalMailOptions({
        from,
        to,
        replyTo: message.email,
        subject: `Nieuw contactbericht: ${message.subject}`,
        html: adminHtml(message),
        entityRefId: `${reference}-admin`,
      }));

      await mailer.sendMail(transactionalMailOptions({
        from,
        to: message.email,
        replyTo: to,
        subject: 'We hebben je bericht ontvangen',
        html: customerHtml(message),
        entityRefId: `${reference}-customer`,
      }));

      res.json({ ok: true });
    } catch (error) {
      console.error(error);
      res.status(400).json({ ok: false, error: error.message || 'Het bericht kon niet worden verstuurd.' });
    }
  });
}
