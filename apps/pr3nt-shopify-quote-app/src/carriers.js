// Vervoerders voor track & trace. Gebruikt in beheer (keuze), klantportaal (knop) en statusmails (link).

export const carriers = [
  { id: 'postnl', name: 'PostNL' },
  { id: 'dhl', name: 'DHL' },
  { id: 'dpd', name: 'DPD' },
  { id: 'gls', name: 'GLS' },
  { id: 'ups', name: 'UPS' },
  { id: 'bpost', name: 'bpost' },
  { id: 'other', name: 'Anders (plak de volledige link)' },
];

// Zonder gekozen vervoerder: UPS-codes beginnen met 1Z, verder PostNL (MyParcel-standaard).
export function carrierOf(quote = {}) {
  const chosen = carriers.find((carrier) => carrier.id === quote.trackingCarrier);
  if (chosen) return chosen;
  if (/^1Z/i.test(String(quote.trackingCode || '').trim())) return carriers.find((carrier) => carrier.id === 'ups');
  return carriers[0];
}

export function carrierName(quote = {}) {
  const carrier = carrierOf(quote);
  return carrier.id === 'other' ? 'de vervoerder' : carrier.name;
}

export function trackingUrl(quote = {}, shipping = {}) {
  const raw = String(quote.trackingCode || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  const code = encodeURIComponent(raw.replace(/\s+/g, ''));
  const country = /belgi|^be$/i.test(String(shipping.country || '')) ? 'BE' : 'NL';
  const postal = encodeURIComponent(String(shipping.postalCode || '').replace(/\s+/g, '').toUpperCase());
  switch (carrierOf(quote).id) {
    case 'postnl':
      return postal ? `https://jouw.postnl.nl/track-and-trace/${code}-${country}-${postal}` : `https://postnl.nl/tracktrace/?B=${code}&D=${country}&T=C`;
    case 'dhl':
      return postal ? `https://my.dhlecommerce.nl/home/tracktrace/${code}/${postal}` : `https://www.dhl.com/nl-nl/home/tracking.html?tracking-id=${code}`;
    case 'dpd':
      return `https://tracking.dpd.de/status/nl_NL/parcel/${code}`;
    case 'gls':
      return `https://gls-group.com/NL/nl/pakket-volgen?match=${code}`;
    case 'ups':
      return `https://www.ups.com/track?loc=nl_NL&tracknum=${code}`;
    case 'bpost':
      return `https://track.bpost.cloud/btr/web/#/search?itemCode=${code}&lang=nl`;
    default:
      return '';
  }
}
