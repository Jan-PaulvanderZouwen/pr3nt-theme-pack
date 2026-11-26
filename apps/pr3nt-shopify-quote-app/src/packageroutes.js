// Zet de verzendregel van een offerte gelijk aan de gekozen pakketmaat, vóórdat de andere opslaan-routes
// (Mollie-betaallink, offertemail, admin.js) de regels lezen. Zo klopt het bedrag overal meteen.
import { readSettings } from './myparcel.js';
import { readQuotes } from './admin.js';
import { applyPackageToBody } from './packages.js';

export function registerPackageRoutes(app) {
  app.post('/admin/quotes/:id', async (req, res, next) => {
    try {
      if (!req.body?.packageSize) return next();
      const [quotes, settings] = await Promise.all([readQuotes(), readSettings()]);
      const quote = quotes.find((item) => item.id === req.params.id);
      // Betaald is betaald: dan verandert alleen de maat voor het label, niet wat de klant betaalt.
      if (!quote || quote.paidAt || ['paid', 'print_queue', 'ready_to_ship', 'shipped', 'delivered'].includes(quote.status)) return next();
      applyPackageToBody(req.body, settings);
    } catch (error) {
      console.warn('Pakketmaat kon niet worden toegepast:', error.message);
    }
    return next();
  });
}
