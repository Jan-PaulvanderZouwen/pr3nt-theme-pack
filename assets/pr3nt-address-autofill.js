(function(){
  function value(input){ return String(input && input.value ? input.value : '').trim(); }
  function normalizePostcode(value){ return String(value || '').replace(/\s+/g, '').toUpperCase(); }
  function debounce(fn, wait){
    var timer;
    return function(){
      var args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function(){ fn.apply(null, args); }, wait);
    };
  }

  function setStatus(form, message, state){
    var status = form.querySelector('[data-p-address-status]');
    if (!status) return;
    status.textContent = message || '';
    status.classList.toggle('is-success', state === 'success');
    status.classList.toggle('is-error', state === 'error');
  }

  function ensureStreetField(form){
    var cityInput = form.querySelector('[data-p-shipping-city]');
    if (!cityInput) return null;
    var existing = form.querySelector('[data-p-shipping-street]');
    if (existing) return existing;

    var cityField = cityInput.closest('label');
    if (!cityField || !cityField.parentNode) return null;

    var streetField = document.createElement('label');
    streetField.className = 'p-field p-compact-field';
    streetField.innerHTML = '<span>Straat</span><input type="text" placeholder="Wordt automatisch ingevuld" data-p-shipping-street autocomplete="address-line1">';
    cityField.parentNode.insertBefore(streetField, cityField);
    return streetField.querySelector('[data-p-shipping-street]');
  }

  function ensureStatus(form){
    if (form.querySelector('[data-p-address-status]')) return;
    var cityInput = form.querySelector('[data-p-shipping-city]');
    var cityField = cityInput && cityInput.closest('label');
    if (!cityField || !cityField.parentNode) return;
    var status = document.createElement('p');
    status.className = 'p-address-lookup-status';
    status.setAttribute('data-p-address-status', '');
    cityField.insertAdjacentElement('afterend', status);
  }

  function appendStreetToNote(form){
    var note = form.querySelector('[data-p-note]');
    var street = value(form.querySelector('[data-p-shipping-street]'));
    if (!note || !street) return;
    var line = 'Straat: ' + street;
    var current = value(note).replace(/(^|\n)Straat: .*$/m, '').trim();
    note.value = current ? current + '\n' + line : line;
  }

  async function lookupAddress(form){
    var country = value(form.querySelector('[data-p-shipping-country]'));
    var postalInput = form.querySelector('[data-p-shipping-postal]');
    var houseInput = form.querySelector('[data-p-shipping-house]');
    var cityInput = form.querySelector('[data-p-shipping-city]');
    var streetInput = ensureStreetField(form);
    if (!postalInput || !houseInput || !cityInput || !streetInput) return;

    var postcode = normalizePostcode(postalInput.value);
    var house = value(houseInput);
    if (country && country !== 'Nederland') {
      setStatus(form, '', '');
      return;
    }
    if (!/^[1-9][0-9]{3}[A-Z]{2}$/.test(postcode) || !house) {
      setStatus(form, '', '');
      return;
    }

    var key = postcode + '-' + house;
    if (form.dataset.pAddressLookupKey === key) return;
    form.dataset.pAddressLookupKey = key;
    setStatus(form, 'Adres ophalen...', '');

    try {
      var url = 'https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?q=' + encodeURIComponent(postcode + ' ' + house) + '&fq=type:adres&fl=straatnaam,woonplaatsnaam,postcode,huisnummer,weergavenaam&rows=1';
      var response = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (!response.ok) throw new Error('Adres kon niet worden opgehaald.');
      var data = await response.json();
      var doc = data && data.response && data.response.docs && data.response.docs[0];
      if (!doc) {
        setStatus(form, 'Geen adres gevonden voor deze postcode en huisnummer.', 'error');
        return;
      }
      if (doc.straatnaam) streetInput.value = doc.straatnaam;
      if (doc.woonplaatsnaam) cityInput.value = doc.woonplaatsnaam;
      appendStreetToNote(form);
      ['input', 'change'].forEach(function(type){
        cityInput.dispatchEvent(new Event(type, { bubbles: true }));
        streetInput.dispatchEvent(new Event(type, { bubbles: true }));
      });
      setStatus(form, 'Adres automatisch ingevuld.', 'success');
    } catch(error) {
      form.dataset.pAddressLookupKey = '';
      setStatus(form, 'Adres automatisch invullen lukte niet. Vul het adres handmatig aan.', 'error');
    }
  }

  function initForm(form){
    if (!form || form.dataset.pAddressAutofillReady) return;
    form.dataset.pAddressAutofillReady = 'true';
    ensureStreetField(form);
    ensureStatus(form);
    var run = debounce(function(){ lookupAddress(form); }, 450);
    ['[data-p-shipping-postal]', '[data-p-shipping-house]', '[data-p-shipping-country]'].forEach(function(selector){
      var input = form.querySelector(selector);
      if (!input) return;
      input.addEventListener('input', run);
      input.addEventListener('change', run);
    });
    form.addEventListener('submit', function(){ appendStreetToNote(form); }, true);
  }

  function init(scope){
    (scope || document).querySelectorAll('[data-pr3nt-form][data-p-native-steps]').forEach(initForm);
  }

  document.addEventListener('DOMContentLoaded', function(){ init(document); });
  document.addEventListener('shopify:section:load', function(event){ init(event.target); });
})();
