(function () {
  var menuKeydownReady = false;

  function filesOf(input) {
    return Array.prototype.slice.call(input && input.files ? input.files : []);
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"]/g, function (match) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[match];
    });
  }

  function showError(form, message) {
    var box = form.querySelector('[data-p-bridge-error]');
    if (!box) return;
    box.textContent = message;
    box.classList.add('is-visible');
  }

  function hideError(form) {
    var box = form.querySelector('[data-p-bridge-error]');
    if (box) box.classList.remove('is-visible');
  }

  function getHeaderOffset() {
    var header = document.querySelector('[data-p-header]');
    return Math.ceil((header ? header.getBoundingClientRect().height : 0) + 18);
  }

  function quoteTarget() {
    return document.querySelector('[data-pr3nt-quote-target]') || document.getElementById('offerte-formulier');
  }

  function scrollToQuote() {
    var target = quoteTarget();
    if (!target) return false;
    var top = target.getBoundingClientRect().top + window.pageYOffset - getHeaderOffset();
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    return true;
  }

  function initQuoteAnchors(scope) {
    var root = scope || document;
    var selector = 'a[href="#upload"], a[href="/#upload"], a[href="#offerte-formulier"], a[href="/#offerte-formulier"]';
    root.querySelectorAll(selector).forEach(function (link) {
      if (link.dataset.pQuoteAnchorReady) return;
      link.dataset.pQuoteAnchorReady = 'true';
      link.addEventListener('click', function (event) {
        if (quoteTarget()) {
          event.preventDefault();
          scrollToQuote();
          return;
        }
        event.preventDefault();
        window.location.href = '/#offerte-formulier';
      });
    });
  }

  function initMobileMenu(scope) {
    var root = scope || document;
    root.querySelectorAll('[data-p-header]:not([data-p-menu-ready])').forEach(function (header) {
      header.dataset.pMenuReady = 'true';
      var toggle = header.querySelector('[data-p-menu-toggle]');
      var menu = header.querySelector('[data-p-mobile-menu]');
      if (!toggle || !menu) return;

      function close() {
        menu.hidden = true;
        toggle.setAttribute('aria-expanded', 'false');
        document.documentElement.classList.remove('p-menu-open');
      }

      function open() {
        menu.hidden = false;
        toggle.setAttribute('aria-expanded', 'true');
        document.documentElement.classList.add('p-menu-open');
      }

      toggle.addEventListener('click', function () { menu.hidden ? open() : close(); });
      menu.querySelectorAll('a').forEach(function (link) { link.addEventListener('click', close); });
    });

    if (!menuKeydownReady) {
      menuKeydownReady = true;
      document.addEventListener('keydown', function (event) {
        if (event.key !== 'Escape') return;
        document.querySelectorAll('[data-p-mobile-menu]').forEach(function (menu) { menu.hidden = true; });
        document.querySelectorAll('[data-p-menu-toggle]').forEach(function (toggle) { toggle.setAttribute('aria-expanded', 'false'); });
        document.documentElement.classList.remove('p-menu-open');
      });
    }
  }

  async function submitQuote(form, fields) {
    var endpoint = form.getAttribute('data-p-endpoint');
    if (!endpoint) throw new Error('De offerte-app is nog niet gekoppeld.');

    var chosenFiles = filesOf(fields.fileInput);
    var requestTypeLabel = fields.requestType === 'no_model' ? 'Nog geen 3D-bestand' : '3D-bestand aanwezig';
    var intakeNote = [
      '--- Aanvraagtype ---',
      requestTypeLabel,
      fields.description ? '\n--- Omschrijving / referentie ---\n' + fields.description : '',
      '\n--- Printkeuze ---',
      'Materiaal: ' + (fields.material || '-'),
      'Kleur: ' + (fields.color || '-'),
      'Oppervlak: ' + (fields.printSize || '-'),
      'Richtprijs: ' + (fields.printSizePrice || '-'),
      fields.paymentLink ? 'Betaallink: ' + fields.paymentLink : '',
      '\n--- Verzendadres ---',
      'Land: ' + (fields.shippingCountry || '-'),
      'Postcode: ' + (fields.shippingPostal || '-'),
      'Huisnummer: ' + (fields.shippingHouse || '-'),
      'Plaats: ' + (fields.shippingCity || '-')
    ].filter(Boolean).join('\n');
    var noteWithIntake = String(fields.note || '').trim();
    noteWithIntake = noteWithIntake ? noteWithIntake + '\n\n' + intakeNote : intakeNote;

    var data = new FormData();
    chosenFiles.forEach(function (file) { data.append('file', file); });
    data.append('file_name', chosenFiles.map(function (file) { return file.name; }).join(', '));
    data.append('request_type', fields.requestType || '3d_file');
    data.append('description', fields.description || '');
    data.append('color', fields.color || '');
    data.append('material', fields.material || '');
    data.append('print_size', fields.printSize || '');
    data.append('print_size_price', fields.printSizePrice || '');
    data.append('payment_link', fields.paymentLink || '');
    data.append('name', fields.name);
    data.append('email', fields.email);
    data.append('phone', fields.phone || '');
    data.append('note', noteWithIntake);
    data.append('rush', fields.rush || 'Nee');
    data.append('shipping_country', fields.shippingCountry || '');
    data.append('shipping_postal', fields.shippingPostal || '');
    data.append('shipping_house', fields.shippingHouse || '');
    data.append('shipping_city', fields.shippingCity || '');

    var response = await fetch(endpoint, { method: 'POST', body: data });
    var type = response.headers.get('content-type') || '';
    var json = type.indexOf('application/json') !== -1 ? await response.json().catch(function () { return {}; }) : {};
    if (!response.ok || json.ok === false) throw new Error(json.error || 'De aanvraag kon niet worden verstuurd. Probeer het opnieuw.');
    return json || { ok: true, redirect: '/pages/offerte-aanvraag-ontvangen' };
  }

  function initForms(scope) {
    var root = scope || document;
    var modelExtensions = ['stl', '3mf', 'obj', 'step', 'stp'];
    var referenceExtensions = modelExtensions.concat(['jpg', 'jpeg', 'png', 'webp', 'pdf', 'heic']);

    root.querySelectorAll('[data-pr3nt-form]:not([data-pr3nt-ready])').forEach(function (form) {
      form.dataset.pr3ntReady = 'true';
      var step = 1;
      var pending = false;
      var fileInput = form.querySelector('[data-p-file]');
      var fileLabel = form.querySelector('[data-p-file-label]');
      var uploadHelp = form.querySelector('[data-p-upload-help]');
      var fileError = form.querySelector('[data-p-file-error]');
      var nextButtons = form.querySelectorAll('[data-p-next]');
      var prevButtons = form.querySelectorAll('[data-p-prev]');
      var submitButton = form.querySelector('[data-p-submit]');
      var paymentHint = form.querySelector('[data-p-payment-hint]');
      var steps = form.querySelectorAll('[data-p-step]');
      var tabs = form.querySelectorAll('[data-p-tab]');
      var materialInput = form.querySelector('[data-p-material-input]');
      var materialButtons = form.querySelectorAll('[data-p-material]');
      var colorInput = form.querySelector('[data-p-color]');
      var printSizeInput = form.querySelector('[data-p-print-size-input]');
      var printPriceInput = form.querySelector('[data-p-print-price-input]');
      var paymentLinkInput = form.querySelector('[data-p-payment-link-input]');
      var rushInput = form.querySelector('[data-p-rush-input]');
      var rushButton = form.querySelector('[data-p-rush]');
      var requestTypeInput = form.querySelector('[data-p-request-type-input]');
      var requestTypeButtons = form.querySelectorAll('[data-p-request-type]');
      var designHelp = form.querySelector('[data-p-design-help]');
      var descriptionInput = form.querySelector('[data-p-description]');
      var descriptionField = form.querySelector('[data-p-description-field]');
      var descriptionLabel = form.querySelector('[data-p-description-label]');
      var nameInput = form.querySelector('[data-p-name]');
      var emailInput = form.querySelector('[data-p-email]');
      var phoneInput = form.querySelector('[data-p-phone]');
      var countryInput = form.querySelector('[data-p-shipping-country]');
      var postalInput = form.querySelector('[data-p-shipping-postal]');
      var houseInput = form.querySelector('[data-p-shipping-house]');
      var cityInput = form.querySelector('[data-p-shipping-city]');
      var noteInput = form.querySelector('[data-p-note]');
      var summary = form.querySelector('[data-p-summary]');
      var fileNameInput = form.querySelector('[data-p-file-name]');
      var formTitle = form.querySelector('[data-p-form-title]');
      var stepIcon = form.querySelector('[data-p-step-icon]');
      var maxStep = steps.length || 2;

      function requestType() { return requestTypeInput ? requestTypeInput.value : '3d_file'; }

      function validFile(file) {
        if (!file || !file.name) return false;
        var ext = file.name.split('.').pop().toLowerCase();
        return (requestType() === 'no_model' ? referenceExtensions : modelExtensions).indexOf(ext) !== -1;
      }

      function validFiles() {
        var chosenFiles = filesOf(fileInput);
        if (!chosenFiles.length) return requestType() === 'no_model';
        return chosenFiles.every(validFile);
      }

      function validEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim()); }
      function validPhone(value) {
        var cleaned = String(value || '').replace(/[\s().-]/g, '');
        return cleaned === '' || /^\+?[0-9]{8,15}$/.test(cleaned);
      }
      function valueOk(input, min) { return !!input && String(input.value || '').trim().length >= (min || 1); }

      function fileText() {
        var chosenFiles = filesOf(fileInput);
        if (!chosenFiles.length) return requestType() === 'no_model' ? 'Geen bestand toegevoegd' : 'Geen bestand gekozen';
        return chosenFiles.length === 1 ? chosenFiles[0].name : chosenFiles.length + ' bestanden gekozen';
      }

      function selectedSizeOption() {
        return printSizeInput && printSizeInput.selectedOptions ? printSizeInput.selectedOptions[0] : null;
      }

      function syncPrintMeta() {
        var option = selectedSizeOption();
        if (!option) return;
        if (printPriceInput) printPriceInput.value = option.getAttribute('data-p-print-price') || '';
        if (paymentLinkInput) paymentLinkInput.value = option.getAttribute('data-p-payment-link') || '';
      }

      function paymentLink() { return paymentLinkInput ? String(paymentLinkInput.value || '').trim() : ''; }
      function descriptionOk() { return requestType() === '3d_file' || valueOk(descriptionInput, 12); }
      function stepOneOk() { return validFiles() && descriptionOk(); }
      function stepTwoOk() { return valueOk(materialInput, 2) && valueOk(colorInput, 2); }
      function stepThreeOk() { return valueOk(printSizeInput, 2); }
      function addressOk() { return valueOk(countryInput, 2) && valueOk(postalInput, 4) && valueOk(houseInput, 1) && valueOk(cityInput, 2); }
      function contactOk() { return valueOk(nameInput, 2) && validEmail(emailInput && emailInput.value) && validPhone(phoneInput && phoneInput.value) && addressOk(); }
      function formOk() { return stepOneOk() && stepTwoOk() && stepThreeOk() && contactOk(); }

      function stepOk(number) {
        if (number === 1) return stepOneOk();
        if (number === 2) return stepTwoOk();
        if (number === 3) return stepThreeOk();
        return contactOk();
      }

      function canReach(targetStep) {
        if (targetStep <= step) return true;
        for (var i = 1; i < targetStep; i += 1) {
          if (!stepOk(i)) return false;
        }
        return true;
      }

      function updateSummary() {
        if (!summary) return;
        var chosenFiles = filesOf(fileInput);
        var rushText = rushInput && rushInput.value === 'Ja' ? 'spoed' : 'standaard';
        var typeLabel = requestType() === 'no_model' ? 'Idee/foto' : '3D-bestand';
        var fileSummary = requestType() === 'no_model' && !chosenFiles.length ? 'Omschrijving zonder bestand' : fileText();
        var sizeText = printSizeInput && printSizeInput.value ? printSizeInput.value : 'oppervlak niet gekozen';
        var priceText = printPriceInput && printPriceInput.value ? printPriceInput.value : 'prijs volgt';
        var detailSummary = typeLabel + ' · ' + (materialInput ? materialInput.value : '') + ' · ' + (colorInput && colorInput.value ? colorInput.value : 'kleur niet gekozen') + ' · ' + sizeText + ' · ' + priceText + ' · ' + rushText;
        summary.innerHTML = '<strong style="display:block;font-weight:900;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.2">' + escapeHtml(fileSummary) + '</strong><span style="display:block;margin-top:2px;color:rgba(16,24,32,.55);font-size:12.5px;line-height:1.25;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escapeHtml(detailSummary) + '</span>';
        summary.style.overflow = 'hidden';
        summary.title = chosenFiles.map(function (file) { return file.name; }).join(', ') + ' · ' + detailSummary;
        if (fileNameInput) fileNameInput.value = chosenFiles.map(function (file) { return file.name; }).join(', ');
      }

      function titleForStep(number) {
        if (number === 1) return 'Bestand of idee';
        if (number === 2) return 'Materiaal & kleur';
        if (number === 3) return 'Formaat & snelheid';
        return 'Gegevens';
      }

      function updateHeader() {
        if (formTitle) formTitle.textContent = titleForStep(step);
        if (stepIcon) stepIcon.textContent = String(step);
      }

      function updateRequestTypeUi() {
        var noModel = requestType() === 'no_model';
        requestTypeButtons.forEach(function (button) { button.classList.toggle('is-active', button.dataset.pRequestType === requestType()); });
        if (fileLabel) fileLabel.textContent = noModel ? (filesOf(fileInput).length ? fileText() : 'Upload eventueel foto’s of een schets') : (filesOf(fileInput).length ? fileText() : 'Sleep je 3D-bestand hierheen');
        if (uploadHelp) uploadHelp.textContent = noModel ? 'Optioneel: JPG, PNG, WEBP, PDF, HEIC of 3D-bestand' : 'STL, 3MF, OBJ, STEP of STP';
        if (designHelp) designHelp.hidden = !noModel;
        if (descriptionField) descriptionField.hidden = !noModel;
        if (descriptionLabel) descriptionLabel.innerHTML = noModel ? 'Omschrijving <small>(verplicht)</small>' : 'Omschrijving <small>(optioneel)</small>';
        if (fileError) fileError.textContent = noModel ? 'Upload een geldig referentiebestand of laat het uploadveld leeg.' : 'Upload een geldig 3D-bestand.';
      }

      function updateSubmitUi() {
        if (submitButton && !pending) submitButton.textContent = paymentLink() ? 'Bestand uploaden & afrekenen' : 'Offerte aanvragen';
        if (paymentHint) paymentHint.textContent = paymentLink() ? 'Na upload sturen we je door naar de juiste Rabobank-betaallink.' : 'Voor dit formaat is nog geen betaallink ingevuld; de aanvraag wordt als offerte verstuurd.';
      }

      function updateTabs() {
        tabs.forEach(function (tab) {
          var tabStep = Number(tab.dataset.pTab);
          var reachable = canReach(tabStep);
          tab.classList.toggle('is-active', tabStep === step);
          tab.classList.toggle('is-complete', tabStep < step || stepOk(tabStep));
          tab.setAttribute('aria-disabled', reachable ? 'false' : 'true');
        });
      }

      function update() {
        syncPrintMeta();
        updateRequestTypeUi();
        nextButtons.forEach(function (button) { button.disabled = pending || !stepOk(step); });
        prevButtons.forEach(function (button) { button.disabled = pending || step <= 1; });
        if (submitButton && !pending) submitButton.disabled = !formOk();
        updateHeader();
        updateSummary();
        updateSubmitUi();
        updateTabs();
      }

      function setStep(nextStep) {
        nextStep = Math.max(1, Math.min(maxStep, nextStep));
        if (!canReach(nextStep)) return;
        step = nextStep;
        steps.forEach(function (stepEl) { stepEl.hidden = Number(stepEl.dataset.pStep) !== step; });
        update();
      }

      if (fileInput) {
        fileInput.addEventListener('change', function () {
          var chosenFiles = filesOf(fileInput);
          if (!chosenFiles.length) { if (fileError) fileError.classList.remove('is-visible'); update(); return; }
          if (!chosenFiles.every(validFile)) { fileInput.value = ''; if (fileError) fileError.classList.add('is-visible'); update(); return; }
          if (fileError) fileError.classList.remove('is-visible');
          update();
        });
      }

      requestTypeButtons.forEach(function (button) {
        button.addEventListener('click', function () {
          requestTypeInput.value = button.dataset.pRequestType || '3d_file';
          if (fileInput) fileInput.value = '';
          if (descriptionInput && requestType() === '3d_file') descriptionInput.value = '';
          if (fileError) fileError.classList.remove('is-visible');
          update();
        });
      });

      materialButtons.forEach(function (button) {
        button.addEventListener('click', function () {
          materialButtons.forEach(function (item) { item.classList.remove('is-active'); });
          button.classList.add('is-active');
          if (materialInput) materialInput.value = button.dataset.pMaterial;
          update();
        });
      });

      [descriptionInput, colorInput, printSizeInput, nameInput, emailInput, phoneInput, countryInput, postalInput, houseInput, cityInput, noteInput].forEach(function (input) {
        if (input) input.addEventListener('input', update);
        if (input && input.tagName === 'SELECT') input.addEventListener('change', update);
      });

      if (rushButton) {
        rushButton.addEventListener('click', function () {
          var active = rushButton.classList.toggle('is-active');
          if (rushInput) rushInput.value = active ? 'Ja' : 'Nee';
          var text = rushButton.querySelector('[data-p-rush-text]');
          if (text) text.textContent = active ? '+ €4,50 · 2 dagen verzending' : 'Standaard · 3 dagen verzending';
          update();
        });
      }

      tabs.forEach(function (tab) { tab.addEventListener('click', function () { setStep(Number(tab.dataset.pTab)); }); });
      nextButtons.forEach(function (button) { button.addEventListener('click', function () { setStep(step + 1); }); });
      prevButtons.forEach(function (button) { button.addEventListener('click', function () { setStep(step - 1); }); });
      var change = form.querySelector('[data-p-change]');
      if (change) change.addEventListener('click', function () { setStep(1); });

      form.addEventListener('submit', async function (event) {
        event.preventDefault();
        if (!formOk() || pending) { update(); return; }
        pending = true;
        hideError(form);
        if (submitButton) { submitButton.disabled = true; submitButton.textContent = paymentLink() ? 'Uploaden...' : 'Aanvraag versturen...'; }

        try {
          var payLink = paymentLink();
          var result = await submitQuote(form, {
            fileInput: fileInput,
            requestType: requestType(),
            description: descriptionInput ? descriptionInput.value : '',
            color: colorInput ? colorInput.value : '',
            material: materialInput ? materialInput.value : '',
            printSize: printSizeInput ? printSizeInput.value : '',
            printSizePrice: printPriceInput ? printPriceInput.value : '',
            paymentLink: payLink,
            name: nameInput.value,
            email: emailInput.value,
            phone: phoneInput.value,
            shippingCountry: countryInput ? countryInput.value : '',
            shippingPostal: postalInput ? postalInput.value : '',
            shippingHouse: houseInput ? houseInput.value : '',
            shippingCity: cityInput ? cityInput.value : '',
            note: noteInput ? noteInput.value : '',
            rush: rushInput ? rushInput.value : 'Nee'
          });
          window.location.href = payLink || result.redirect || '/pages/offerte-aanvraag-ontvangen';
        } catch (error) {
          pending = false;
          showError(form, error.message || 'De aanvraag kon niet worden verstuurd. Probeer het opnieuw.');
          update();
        }
      });

      update();
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initMobileMenu(document);
    initQuoteAnchors(document);
    initForms(document);
  });

  document.addEventListener('shopify:section:load', function (event) {
    initMobileMenu(event.target);
    initQuoteAnchors(event.target);
    initForms(event.target);
  });
})();
