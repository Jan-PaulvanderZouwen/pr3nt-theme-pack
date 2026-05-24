(function () {
  function initShippingNotes(root) {
    (root || document).querySelectorAll('[data-pr3nt-form]:not([data-p-shipping-note-ready])').forEach(function (form) {
      form.setAttribute('data-p-shipping-note-ready', 'true');

      form.addEventListener('submit', function () {
        var note = form.querySelector('[data-p-note]');
        if (!note) return;

        var country = form.querySelector('[data-p-shipping-country]');
        var postal = form.querySelector('[data-p-shipping-postal]');
        var house = form.querySelector('[data-p-shipping-house]');
        var city = form.querySelector('[data-p-shipping-city]');

        var values = {
          country: country ? country.value.trim() : '',
          postal: postal ? postal.value.trim() : '',
          house: house ? house.value.trim() : '',
          city: city ? city.value.trim() : ''
        };

        if (!values.country && !values.postal && !values.house && !values.city) return;

        var marker = '\n\n--- Verzendadres ---\n';
        var baseNote = String(note.value || '').split(marker)[0].trim();
        var shippingNote = [
          'Land: ' + (values.country || '-'),
          'Postcode: ' + (values.postal || '-'),
          'Huisnummer: ' + (values.house || '-'),
          'Plaats: ' + (values.city || '-')
        ].join('\n');

        note.value = (baseNote ? baseNote + marker : marker.trimStart()) + shippingNote;
      }, true);
    });
  }

  document.addEventListener('DOMContentLoaded', function () { initShippingNotes(document); });
  document.addEventListener('shopify:section:load', function (event) { initShippingNotes(event.target); });
})();
