(function () {
  function filesOf(input) {
    return Array.prototype.slice.call(input && input.files ? input.files : []);
  }

  function value(input) {
    return String(input && input.value ? input.value : '').trim();
  }

  function validEmail(input) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value(input));
  }

  function validPhone(input) {
    var cleaned = value(input).replace(/[\s().-]/g, '');
    return cleaned === '' || /^\+?[0-9]{8,15}$/.test(cleaned);
  }

  function isVisible(el) {
    return !!el && !el.hidden && getComputedStyle(el).display !== 'none';
  }

  function initProgress(form) {
    if (!form || form.dataset.pProgressReady || form.hasAttribute('data-p-native-steps')) return;
    form.dataset.pProgressReady = 'true';

    var tabs = form.querySelector('.p-step-tabs');
    if (!tabs) return;

    var progress = document.createElement('div');
    progress.className = 'p-form-progress';
    progress.setAttribute('aria-label', 'Voortgang offerteformulier');
    progress.innerHTML = [
      '<button type="button" class="p-form-progress-step is-active is-done" data-p-progress-step="1"><span class="p-progress-dot">1</span><span>Project</span></button>',
      '<button type="button" class="p-form-progress-step" data-p-progress-step="2"><span class="p-progress-dot">2</span><span>Gegevens</span></button>',
      '<button type="button" class="p-form-progress-step" data-p-progress-step="3"><span class="p-progress-dot">3</span><span>Verzending</span></button>'
    ].join('');
    tabs.insertAdjacentElement('beforebegin', progress);

    var stepOne = form.querySelector('[data-p-step="1"]');
    var stepTwo = form.querySelector('[data-p-step="2"]');
    var fileInput = form.querySelector('[data-p-file]');
    var requestTypeInput = form.querySelector('[data-p-request-type-input]');
    var descriptionInput = form.querySelector('[data-p-description]');
    var colorInput = form.querySelector('[data-p-color]');
    var nameInput = form.querySelector('[data-p-name]');
    var emailInput = form.querySelector('[data-p-email]');
    var phoneInput = form.querySelector('[data-p-phone]');
    var countryInput = form.querySelector('[data-p-shipping-country]');
    var postalInput = form.querySelector('[data-p-shipping-postal]');
    var houseInput = form.querySelector('[data-p-shipping-house]');
    var cityInput = form.querySelector('[data-p-shipping-city]');
    var submitButton = form.querySelector('[data-p-submit]');
    var changeButton = form.querySelector('[data-p-change]');

    var shippingGroup = countryInput ? countryInput.closest('.p-contact-group') : null;
    var noteField = form.querySelector('[data-p-note]') ? form.querySelector('[data-p-note]').closest('.p-field') : null;
    var bridgeError = form.querySelector('[data-p-bridge-error]');
    var formNote = form.querySelector('.p-form-note');
    var uploadProgress = form.querySelector('[data-p-upload-progress]');

    var stepThree = form.querySelector('[data-p-step="3"]');
    if (!stepThree) {
      stepThree = document.createElement('div');
      stepThree.className = 'p-form-step';
      stepThree.setAttribute('data-p-step', '3');
      stepThree.hidden = true;
      stepTwo.insertAdjacentElement('afterend', stepThree);
      if (shippingGroup) stepThree.appendChild(shippingGroup);
      if (noteField) stepThree.appendChild(noteField);
      if (submitButton) stepThree.appendChild(submitButton);
      if (uploadProgress) stepThree.appendChild(uploadProgress);
      if (bridgeError) stepThree.appendChild(bridgeError);
      if (formNote) stepThree.appendChild(formNote);
    }

    var contactNext = form.querySelector('[data-p-contact-next]');
    if (!contactNext) {
      contactNext = document.createElement('button');
      contactNext.type = 'button';
      contactNext.className = 'p-btn p-btn-primary';
      contactNext.setAttribute('data-p-contact-next', '');
      contactNext.style.cssText = 'width:100%;margin-top:18px';
      contactNext.textContent = 'Verder naar verzending';
      var contactGroup = nameInput ? nameInput.closest('.p-contact-group') : null;
      if (contactGroup) contactGroup.insertAdjacentElement('afterend', contactNext);
    }

    var backToContact = form.querySelector('[data-p-back-contact]');
    if (!backToContact) {
      backToContact = document.createElement('button');
      backToContact.type = 'button';
      backToContact.className = 'p-btn p-btn-outline';
      backToContact.setAttribute('data-p-back-contact', '');
      backToContact.style.cssText = 'width:100%;margin-top:10px';
      backToContact.textContent = 'Terug naar gegevens';
      stepThree.insertBefore(backToContact, stepThree.firstChild);
    }

    function requestType() {
      return requestTypeInput ? requestTypeInput.value : '3d_file';
    }

    function projectCompletion() {
      var total = 3;
      var done = 0;
      done += 1;
      if (value(colorInput).length >= 2) done += 1;
      if (requestType() === 'no_model') {
        if (value(descriptionInput).length >= 12 || filesOf(fileInput).length > 0) done += 1;
      } else if (filesOf(fileInput).length > 0) {
        done += 1;
      }
      return Math.max(0, Math.min(1, done / total));
    }

    function contactCompletion() {
      var total = 3;
      var done = 0;
      if (value(nameInput).length >= 2) done += 1;
      if (validEmail(emailInput)) done += 1;
      if (validPhone(phoneInput)) done += 1;
      return Math.max(0, Math.min(1, done / total));
    }

    function shippingCompletion() {
      var total = 4;
      var done = 0;
      if (value(countryInput).length >= 2) done += 1;
      if (value(postalInput).length >= 4) done += 1;
      if (value(houseInput).length >= 1) done += 1;
      if (value(cityInput).length >= 2) done += 1;
      return Math.max(0, Math.min(1, done / total));
    }

    function currentStep() {
      if (isVisible(stepThree)) return 3;
      if (isVisible(stepTwo)) return 2;
      return 1;
    }

    function setVisualStep(nextStep) {
      if (nextStep === 2 && projectCompletion() < 1) return;
      if (nextStep === 3 && (projectCompletion() < 1 || contactCompletion() < 1)) return;
      stepOne.hidden = nextStep !== 1;
      stepTwo.hidden = nextStep !== 2;
      stepThree.hidden = nextStep !== 3;
      updateProgress();
    }

    function visualRatio() {
      var p1 = projectCompletion();
      var p2 = contactCompletion();
      var p3 = shippingCompletion();
      var step = currentStep();

      if (step === 1) return Math.min(0.47, 0.08 + (p1 * 0.39));
      if (step === 2) return Math.min(0.72, 0.50 + (p2 * 0.22));
      return Math.min(1, 0.75 + (p3 * 0.25));
    }

    progress.querySelector('[data-p-progress-step="1"]').addEventListener('click', function () { setVisualStep(1); });
    progress.querySelector('[data-p-progress-step="2"]').addEventListener('click', function () { setVisualStep(2); });
    progress.querySelector('[data-p-progress-step="3"]').addEventListener('click', function () { setVisualStep(3); });
    contactNext.addEventListener('click', function () { setVisualStep(3); });
    backToContact.addEventListener('click', function () { setVisualStep(2); });
    if (changeButton) changeButton.addEventListener('click', function () { setTimeout(function () { setVisualStep(1); }, 0); });

    function updateProgress() {
      var p1 = projectCompletion();
      var p2 = contactCompletion();
      var p3 = shippingCompletion();
      var step = currentStep();
      var ratio = visualRatio();

      progress.style.setProperty('--p-progress-ratio', ratio.toFixed(3));
      var steps = progress.querySelectorAll('[data-p-progress-step]');
      steps.forEach(function (button) {
        button.classList.remove('is-active', 'is-done', 'is-clickable');
      });

      steps[0].classList.add('is-done');
      if (step === 1) steps[0].classList.add('is-active');

      if (p1 >= 1) {
        steps[1].classList.add('is-clickable');
        if (step >= 2) steps[1].classList.add('is-done');
        if (step === 2) steps[1].classList.add('is-active');
      }

      if (p1 >= 1 && p2 >= 1) {
        steps[2].classList.add('is-clickable');
        if (step === 3) steps[2].classList.add('is-active');
        if (p3 >= 1) steps[2].classList.add('is-done');
      }

      contactNext.disabled = !(p1 >= 1 && p2 >= 1);
      if (submitButton) submitButton.disabled = !(p1 >= 1 && p2 >= 1 && p3 >= 1);
    }

    form.addEventListener('input', updateProgress, true);
    form.addEventListener('change', updateProgress, true);
    form.addEventListener('click', function () { setTimeout(updateProgress, 0); }, true);
    updateProgress();
    setTimeout(updateProgress, 100);
  }

  function init(scope) {
    (scope || document).querySelectorAll('[data-pr3nt-form]').forEach(initProgress);
  }

  document.addEventListener('DOMContentLoaded', function () { init(document); });
  document.addEventListener('shopify:section:load', function (event) { init(event.target); });
})();
