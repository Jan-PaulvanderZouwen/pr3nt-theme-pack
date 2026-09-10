const oldTemplate = `const quoteTemplate=[["Fillament","€0,12 per gram","","0,12"],["Print-uren","€0,35 per uur","","0,35"],["Verwerkingskosten","","1","7,50"],["Verzendkosten","incl. track & trace","1","6,55"],["Verpakkingskosten","","1","3,50"]];`;

const newTemplate = `const quoteTemplate=[["Fillament","€0,12 per gram","","0,12"],["Print-uren","€0,35 per uur","","0,35"],["Verwerkingskosten","","1","7,50"],["Verzendkosten","incl. track & trace","1","7,95"],["Verpakkingskosten","","1","3,50"],["BTW 21%","Wordt automatisch berekend over het subtotaal","",""]];`;

export function registerQuoteTemplateRoutes(app) {
  app.use('/admin', (req, res, next) => {
    if (req.method !== 'GET') return next();
    const originalSend = res.send.bind(res);
    res.send = (body) => {
      if (typeof body === 'string') {
        let output = body.replace(oldTemplate, newTemplate);
        output = output.replace('Start met één regel, of laad de standaard pr3nt-offerte in.', 'Start met één regel, of laad de standaard pr3nt-offerte in. Bedragen zijn excl. btw; 21% btw wordt automatisch apart berekend.');
        output = output.replace(/Verzendkosten([\s\S]{0,120}?)6,55/g, 'Verzendkosten$17,95');
        return originalSend(output);
      }
      return originalSend(body);
    };
    return next();
  });
}
