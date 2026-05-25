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

  function isVisible(el) {
    return !!el && !el.hidden && getComputedStyle(el).display !== 'none';
  }

  function initProgress(form) {
    if (!form || form.dataset.pProgressReady) return;
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
    var countryInput = form.querySelector('[data-p-shipping-country]');
    var postalInput = form.querySelector('[data-p-shipping-postal]');
    var houseInput = form.querySelector('[data-p-shipping-house]');
    var cityInput = form.querySelector('[data-p-shipping-city]');
    var tabButtons = form.querySelectorAll('[data-p-tab]');

    function requestType() {
      return requestTypeInput ? requestTypeInput.value : '3d_file';
    }

    function projectCompletion() {
      var total = 3;
      var done = 0;
      done += 1; // type keuze staat altijd op een geldige optie
      if (value(colorInput).length >= 2) done += 1;
      if (requestType() === 'no_model') {
        if (value(descriptionInput).length >= 12 || filesOf(fileInput).length > 0) done += 1;
      } else if (filesOf(fileInput).length > 0) {
        done += 1;
      }
      return Math.max(0, Math.min(1, done / total));
    }

    function contactCompletion() {
      var total = 2;
      var done = 0;
      if (value(nameInput).length >= 2) done += 1;
      if (validEmail(emailInput)) done += 1;
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

    function gotoStep(step) {
      var tab = Array.prototype.find.call(tabButtons, function (button) {
        return Number(button.dataset.pTab) === step;
      });
      if (tab) tab.click();
    }

    progress.querySelector('[data-p-progress-step="1"]').addEventListener('click', function () { gotoStep(1); });
    progress.querySelector('[data-p-progress-step="2"]').addEventListener('click', function () {
      if (projectCompletion() >= 1) gotoStep(2);
    });
    progress.querySelector('[data-p-progress-step="3"]').addEventListener('click', function () {
      if (projectCompletion() >= 1) gotoStep(2);
      var firstShipping = countryInput || postalInput || houseInput || cityInput;
      if (firstShipping) setTimeout(function () { firstShipping.focus(); }, 50);
    });

    function updateProgress() {
      var p1 = projectCompletion();
      var p2 = contactCompletion();
      var p3 = shippingCompletion();
      var inSecondScreen = isVisible(stepTwo);
      var ratio = Math.max(0.08, Math.min(1, (p1 * 0.5) + (p2 * 0.25) + (p3 * 0.25)));

      progress.style.setProperty('--p-progress-ratio', ratio.toFixed(3));
      var steps = progress.querySelectorAll('[data-p-progress-step]');
      steps.forEach(function (button) {
        button.classList.remove('is-active', 'is-done', 'is-clickable');
      });

      steps[0].classList.add('is-done');
      if (!inSecondScreen) steps[0].classList.add('is-active');
      if (p1 >= 1) {
        steps[1].classList.add('is-clickable');
        if (inSecondScreen) steps[1].classList.add('is-active');
        if (p2 >= 1) steps[1].classList.add('is-done');
      }
      if (p1 >= 1 && p2 >= 1) {
        steps[2].classList.add('is-clickable');
        if (p3 > 0 && inSecondScreen) steps[2].classList.add('is-active');
        if (p3 >= 1) steps[2].classList.add('is-done');
      }
      if (p1 >= 1 && p2 < 1 && inSecondScreen) steps[1].classList.add('is-active');
      if (p1 >= 1 && p2 >= 1 && p3 < 1 && inSecondScreen) steps[2].classList.add('is-active');
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
