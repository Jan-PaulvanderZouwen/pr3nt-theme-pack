export function mailFrom() {
  const address = process.env.MAIL_FROM || process.env.SMTP_USER || 'bestellingen@pr3nt.nl';
  return address.includes('<') ? address : `pr3nt.nl <${address}>`;
}

export function mailTextFromHtml(html = '') {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/td>/gi, ' | ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+\n/g, '\n\n')
    .trim();
}

export function transactionalMailOptions(options = {}) {
  const html = options.html || '';
  return {
    ...options,
    from: options.from || mailFrom(),
    text: options.text || mailTextFromHtml(html),
    headers: {
      'X-Auto-Response-Suppress': 'OOF, AutoReply',
      'X-Entity-Ref-ID': options.entityRefId || `pr3nt-${Date.now()}`,
      ...(options.headers || {}),
    },
  };
}
