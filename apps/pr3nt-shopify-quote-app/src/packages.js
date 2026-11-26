// Pakketmaten: wat de klant aan verzendkosten betaalt en hoe het pakket bij MyParcel wordt aangemeld.
// Prijzen zijn excl. btw, net als de offerteregels. Aanpassen kan bij Instellingen > Verzendkosten.

// MyParcel package_type: 1 = pakket, 2 = brievenbuspakje, 6 = klein pakket (PostNL, vanaf 2025).
export const myParcelTypes = [
  { id: 1, name: 'Pakket' },
  { id: 2, name: 'Brievenbuspakje' },
  { id: 6, name: 'Klein pakket' },
];

export const packageSizes = [
  { id: 'mailbox', name: 'Brievenbuspakje', hint: 'Past door de brievenbus: max. 38 × 26,5 × 3,2 cm en 2 kg', price: '4,95', packageType: 2, weight: 1000, largeFormat: false },
  { id: 'small', name: 'Klein pakket', hint: 'Kleine doos, tot ongeveer 2 kg', price: '7,95', packageType: 1, weight: 2000, largeFormat: false },
  { id: 'large', name: 'Groot pakket', hint: 'Grote doos, tot 10 kg', price: '11,95', packageType: 1, weight: 10000, largeFormat: false },
];
export const pickupOption = { id: 'pickup', name: 'Afhalen', hint: 'Geen verzendkosten en geen label' };

const order = ['mailbox', 'small', 'large'];
const clean = (value = '', max = 40) => String(value ?? '').replace(/[<>]/g, '').trim().slice(0, max);
const price = (value, fallback) => (/^\d{1,4}([.,]\d{1,2})?$/.test(clean(value)) ? clean(value).replace('.', ',') : fallback);

// Maten met de prijzen en MyParcel-keuzes uit de instellingen erover.
export function packageOptions(settings = {}) {
  const saved = settings.packages && typeof settings.packages === 'object' ? settings.packages : {};
  return packageSizes.map((size) => {
    const own = saved[size.id] || {};
    const type = Number(own.packageType);
    return {
      ...size,
      price: price(own.price, size.price),
      packageType: myParcelTypes.some((item) => item.id === type) ? type : size.packageType,
      largeFormat: own.largeFormat === undefined ? size.largeFormat : Boolean(own.largeFormat),
    };
  });
}

export function defaultPackageId(settings = {}) {
  return packageSizes.some((size) => size.id === settings.defaultPackage) ? settings.defaultPackage : 'small';
}

export function validPackageId(value = '') {
  return value === pickupOption.id || packageSizes.some((size) => size.id === value) ? value : '';
}

// Welke maat hoort bij deze order? Een gekozen maat wint, anders de standaardmaat.
export function packageOf(quote = {}, settings = {}) {
  const options = packageOptions(settings);
  return options.find((size) => size.id === quote.packageSize) || options.find((size) => size.id === defaultPackageId(settings));
}

// Meerdere orders in één doos: neem de grootste maat. Twee brievenbuspakjes samen worden een klein pakket.
export function bundlePackage(bundle = [], settings = {}) {
  const options = packageOptions(settings);
  const ranks = bundle.map((quote) => order.indexOf(packageOf(quote, settings).id));
  let rank = Math.max(...ranks, 0);
  if (bundle.length > 1 && rank === 0) rank = 1;
  return options.find((size) => size.id === order[rank]);
}

// Wat er naar MyParcel gaat bij deze maat.
export function myParcelOptions(size) {
  const options = { package_type: size.packageType };
  if (size.packageType === 1 && size.largeFormat) options.large_format = 1;
  return options;
}

export const isShippingLine = (line = {}) => /verzend|shipping|porto/i.test(String(line.label || ''));

export function shippingLineFor(size) {
  return { label: 'Verzendkosten', description: `${size.name}, incl. track & trace`, qty: '1', unit: size.price };
}

// Regels van het offerteformulier zo zetten dat ze bij de gekozen maat passen.
export function applyPackageToBody(body = {}, settings = {}) {
  const chosen = validPackageId(body.packageSize);
  if (!chosen || !('lineLabel' in body)) return false;
  const list = (value) => (Array.isArray(value) ? [...value] : value === undefined ? [] : [value]);
  const labels = list(body.lineLabel);
  const descriptions = list(body.lineDescription);
  const qtys = list(body.lineQty);
  const units = list(body.lineUnit);
  const index = labels.findIndex((label) => isShippingLine({ label }));
  // Alleen bij een andere keuze. In de browser past het script de regel al aan (en zet packageSizeWas gelijk),
  // dus dit is het vangnet zonder JavaScript. Een handmatig aangepaste prijs blijft zo staan.
  if (body.packageSize === body.packageSizeWas) return false;
  if (chosen === pickupOption.id) {
    if (index < 0) return false;
    [labels, descriptions, qtys, units].forEach((column) => column.splice(index, 1));
  } else {
    const line = shippingLineFor(packageOptions(settings).find((size) => size.id === chosen));
    const values = [line.label, line.description, line.qty, line.unit];
    const at = index >= 0 ? index : labels.length;
    [labels, descriptions, qtys, units].forEach((column, n) => { while (column.length < at) column.push(''); column[at] = values[n]; });
  }
  Object.assign(body, { lineLabel: labels, lineDescription: descriptions, lineQty: qtys, lineUnit: units });
  return true;
}

// Instellingen uit het formulier lezen. Zonder velden blijft alles zoals het was.
export function packagesFromBody(body = {}, settings = {}) {
  if (!('packagePrice_small' in body)) return { packages: settings.packages, defaultPackage: settings.defaultPackage };
  const current = packageOptions(settings);
  const packages = Object.fromEntries(current.map((size) => [size.id, {
    price: price(body[`packagePrice_${size.id}`], size.price),
    packageType: Number(body[`packageType_${size.id}`]) || size.packageType,
    largeFormat: body[`packageLarge_${size.id}`] === 'on',
  }]));
  return { packages, defaultPackage: packageSizes.some((size) => size.id === body.defaultPackage) ? body.defaultPackage : defaultPackageId(settings) };
}
