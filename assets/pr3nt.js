(function () {
  var menuKeydownReady = false;

  function filesOf(input) {
    return Array.prototype.slice.call(input && input.files ? input.files : []);
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
        var hasLocalQuoteForm = !!quoteTarget();

        if (hasLocalQuoteForm) {
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

      toggle.addEventListener('click', function () {
        menu.hidden ? open() : close();
      });

      menu.querySelectorAll('a').forEach(function (link) {
        link.addEventListener('click', close);
      });
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
    var data = new FormData();
    chosenFiles.forEach(function (file) {
      data.append('file', file);
      data.append('files[]', file);
    });
    data.append('file_name', chosenFiles.map(function (file) { return file.name; }).join(', '));
    data.append('color', fields.color);
    data.append('material', fields.material);
    data.append('name', fields.name);
    data.append('email', fields.email);
    data.append('phone', fields.phone || '');
    data.append('note', fields.note || '');
    data.append('rush', fields.rush || 'Nee');

    var response = await fetch(endpoint, { method: 'POST', body: data });
    if (!response.ok) throw new Error('De aanvraag kon niet worden verstuurd. Probeer het opnieuw.');

    var type = response.headers.get('content-type') || '';
    if (type.indexOf('application/json') !== -1) {
      var json = await response.json().catch(function () { return {}; });
      if (json && json.ok === false) throw new Error(json.error || 'De aanvraag kon niet worden verstuurd.');
      return json || {};
    }
    return { ok: true, redirect: '/pages/offerte-aanvraag-ontvangen' };
  }

  function initForms(scope) {
    var root = scope || document;
    var allowed = ['stl', '3mf', 'obj', 'step', 'stp'];

    root.querySelectorAll('[data-pr3nt-form]:not([data-pr3nt-ready])').forEach(function (form) {
      form.dataset.pr3ntReady = 'true';
      var step = 1;
      var pending = false;
      var fileInput = form.querySelector('[data-p-file]');
      var fileLabel = form.querySelector('[data-p-file-label]');
      var fileError = form.querySelector('[data-p-file-error]');
      var nextButton = form.querySelector('[data-p-next]');
      var submitButton = form.querySelector('[data-p-submit]');
      var stepOne = form.querySelector('[data-p-step="1"]');
      var stepTwo = form.querySelector('[data-p-step="2"]');
      var tabs = form.querySelectorAll('[data-p-tab]');
      var materialInput = form.querySelector('[data-p-material-input]');
      var materialButtons = form.querySelectorAll('[data-p-material]');
      var rushInput = form.querySelector('[data-p-rush-input]');
      var rushButton = form.querySelector('[data-p-rush]');
      var colorInput = form.querySelector('[data-p-color]');
      var nameInput = form.querySelector('[data-p-name]');
      var emailInput = form.querySelector('[data-p-email]');
      var phoneInput = form.querySelector('[data-p-phone]');
      var noteInput = form.querySelector('[data-p-note]');
      var summary = form.querySelector('[data-p-summary]');
      var fileNameInput = form.querySelector('[data-p-file-name]');
      var formTitle = form.querySelector('[data-p-form-title]');
      var stepIcon = form.querySelector('[data-p-step-icon]');

      function validFile(file) {
        if (!file || !file.name) return false;
        return allowed.indexOf(file.name.split('.').pop().toLowerCase()) !== -1;
      }

      function validFiles() {
        var chosenFiles = filesOf(fileInput);
        return chosenFiles.length > 0 && chosenFiles.every(validFile);
      }

      function validEmail(value) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
      }

      function validPhone(value) {
        var cleaned = String(value || '').replace(/[\s().-]/g, '');
        return cleaned === '' || /^\+?[0-9]{8,15}$/.test(cleaned);
      }

      function fileText() {
        var chosenFiles = filesOf(fileInput);
        if (!chosenFiles.length) return 'Geen bestand gekozen';
        return chosenFiles.length === 1 ? chosenFiles[0].name : chosenFiles.length + ' bestanden gekozen';
      }

      function stepOneOk() {
        return validFiles() && colorInput && colorInput.value.trim().length >= 2;
      }

      function formOk() {
        return stepOneOk() && nameInput.value.trim().length >= 2 && validEmail(emailInput.value) && validPhone(phoneInput.value);
      }

      function updateSummary() {
        if (!summary) return;
        var rushText = rushInput.value === 'Ja' ? 'spoed · 2 dagen verzending' : 'standaard · 3 dagen verzending';
        summary.innerHTML = '<strong>' + fileText() + '</strong> <span>· ' + materialInput.value + ' · ' + (colorInput.value || 'kleur niet ingevuld') + ' · ' + rushText + '</span>';
        if (fileNameInput) fileNameInput.value = filesOf(fileInput).map(function (file) { return file.name; }).join(', ');
      }

      function updateHeader() {
        if (formTitle) formTitle.textContent = step === 1 ? 'Materiaal & bestand' : 'Gegevens';
        if (stepIcon) stepIcon.textContent = String(step);
      }

      function update() {
        if (nextButton) nextButton.disabled = !stepOneOk();
        if (submitButton && !pending) submitButton.disabled = !formOk();
        updateHeader();
        updateSummary();
      }

      function setStep(nextStep) {
        if (nextStep === 2 && !stepOneOk()) return;
        step = nextStep;
        if (stepOne) stepOne.hidden = step !== 1;
        if (stepTwo) stepTwo.hidden = step !== 2;
        tabs.forEach(function (tab) { tab.classList.toggle('is-active', Number(tab.dataset.pTab) === step); });
        update();
      }

      if (fileInput) {
        fileInput.addEventListener('change', function () {
          var chosenFiles = filesOf(fileInput);
          if (!chosenFiles.length) {
            fileLabel.textContent = 'Sleep je 3D-bestand hierheen';
            fileError.classList.remove('is-visible');
            update();
            return;
          }
          if (!chosenFiles.every(validFile)) {
            fileInput.value = '';
            fileLabel.textContent = 'Sleep je 3D-bestand hierheen';
            fileError.classList.add('is-visible');
            update();
            return;
          }
          fileLabel.textContent = fileText();
          fileError.classList.remove('is-visible');
          update();
        });
      }

      materialButtons.forEach(function (button) {
        button.addEventListener('click', function () {
          materialButtons.forEach(function (item) { item.classList.remove('is-active'); });
          button.classList.add('is-active');
          materialInput.value = button.dataset.pMaterial;
          update();
        });
      });

      if (rushButton) {
        rushButton.addEventListener('click', function () {
          var active = rushButton.classList.toggle('is-active');
          rushInput.value = active ? 'Ja' : 'Nee';
          var text = rushButton.querySelector('[data-p-rush-text]');
          if (text) text.textContent = active ? '+ €4,50 · 2 dagen verzending' : 'Standaard · 3 dagen verzending';
          update();
        });
      }

      [colorInput, nameInput, emailInput, phoneInput, noteInput].forEach(function (input) {
        if (input) input.addEventListener('input', update);
      });
      tabs.forEach(function (tab) { tab.addEventListener('click', function () { setStep(Number(tab.dataset.pTab)); }); });
      if (nextButton) nextButton.addEventListener('click', function () { setStep(2); });
      var change = form.querySelector('[data-p-change]');
      if (change) change.addEventListener('click', function () { setStep(1); });

      form.addEventListener('submit', async function (event) {
        event.preventDefault();
        if (!formOk() || pending) {
          update();
          return;
        }
        pending = true;
        hideError(form);
        if (submitButton) {
          submitButton.disabled = true;
          submitButton.textContent = 'Aanvraag versturen...';
        }

        try {
          var result = await submitQuote(form, {
            fileInput: fileInput,
            color: colorInput.value,
            material: materialInput.value,
            name: nameInput.value,
            email: emailInput.value,
            phone: phoneInput.value,
            note: noteInput ? noteInput.value : '',
            rush: rushInput.value
          });
          window.location.href = result.redirect || '/pages/offerte-aanvraag-ontvangen';
        } catch (error) {
          pending = false;
          if (submitButton) submitButton.textContent = 'Offerte aanvragen';
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
