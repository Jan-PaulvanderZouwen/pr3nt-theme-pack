(function(){
  function filesOf(input){ return Array.prototype.slice.call(input && input.files ? input.files : []); }
  function value(input){ return String(input && input.value ? input.value : '').trim(); }
  function validEmail(input){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value(input)); }
  function validPhone(input){ var cleaned = value(input).replace(/[\s().-]/g, ''); return cleaned === '' || /^\+?[0-9]{8,15}$/.test(cleaned); }
  var modelExtensions = ['stl','3mf','obj','step','stp'];
  var referenceExtensions = modelExtensions.concat(['jpg','jpeg','png','webp','pdf','heic']);

  function requestType(form){ var input = form.querySelector('[data-p-request-type-input]'); return input ? input.value : '3d_file'; }
  function ext(file){ var parts = String(file && file.name ? file.name : '').split('.'); return parts.length > 1 ? parts.pop().toLowerCase() : ''; }
  function filesAllowed(form){
    var files = filesOf(form.querySelector('[data-p-file]'));
    if (!files.length) return false;
    var allowed = requestType(form) === 'no_model' ? referenceExtensions : modelExtensions;
    return files.every(function(file){ var e = ext(file); return e ? allowed.indexOf(e) !== -1 : requestType(form) === 'no_model'; });
  }
  function stepOneOk(form){
    var files = filesOf(form.querySelector('[data-p-file]'));
    var desc = value(form.querySelector('[data-p-description]'));
    if (requestType(form) === 'no_model') return (files.length > 0 && filesAllowed(form)) || desc.length >= 6;
    return files.length > 0 && filesAllowed(form);
  }
  function contactProgress(form){
    var done = 0;
    if (value(form.querySelector('[data-p-name]')).length >= 2) done += 1;
    if (validEmail(form.querySelector('[data-p-email]'))) done += 1;
    if (validPhone(form.querySelector('[data-p-phone]'))) done += 1;
    return done / 3;
  }
  function shippingProgress(form){
    var done = 0;
    if (value(form.querySelector('[data-p-shipping-country]')).length >= 2) done += 1;
    if (value(form.querySelector('[data-p-shipping-postal]')).length >= 4) done += 1;
    if (value(form.querySelector('[data-p-shipping-house]')).length >= 1) done += 1;
    if (value(form.querySelector('[data-p-shipping-city]')).length >= 2) done += 1;
    return done / 4;
  }
  function currentStep(form){
    var visible = Array.prototype.slice.call(form.querySelectorAll('[data-p-step]')).find(function(step){ return !step.hidden; });
    return visible ? Number(visible.getAttribute('data-p-step')) || 1 : 1;
  }
  function setRatio(form, ratio){
    var progress = form.querySelector('.p-form-progress[data-pr3nt-feedback-progress]');
    if (progress) progress.style.setProperty('--p-progress-ratio', String(Math.max(0, Math.min(1, ratio))));
  }
  function polishForm(form){
    if (!form || !form.hasAttribute('data-p-native-steps')) return;

    var sizeSelect = form.querySelector('[data-p-print-size-input]');
    if (sizeSelect) {
      if (sizeSelect.options && sizeSelect.options.length && !sizeSelect.value) sizeSelect.selectedIndex = 0;
      var sizeField = sizeSelect.closest('.p-field');
      if (sizeField) sizeField.hidden = true;
    }

    var note = form.querySelector('[data-p-note]');
    if (note) {
      note.value = '';
      var noteField = note.closest('.p-field');
      if (noteField) noteField.hidden = true;
    }

    form.querySelectorAll('.p-soft-note').forEach(function(noteEl){
      if (/richtprijs|oppervlak/i.test(noteEl.textContent || '')) noteEl.hidden = true;
    });

    var progress = form.querySelector('.p-form-progress[data-pr3nt-feedback-progress]');
    if (progress) {
      progress.querySelectorAll('[data-feedback-step]').forEach(function(button){
        var step = Number(button.getAttribute('data-feedback-step'));
        var label = button.querySelector('span:last-child');
        if (label && step === 3) label.textContent = 'Contact';
        if (label && step === 4) label.textContent = 'Verzending';
      });
    }

    var ratio = 0;
    if (stepOneOk(form)) {
      ratio = .25;
      if (currentStep(form) > 2 || form.dataset.pStep2Passed === 'true') ratio = .5;
      if (contactProgress(form) >= 1) ratio = .75;
      if (contactProgress(form) >= 1) ratio = .75 + (shippingProgress(form) * .25);
    }
    setRatio(form, ratio);

    if (progress) {
      progress.querySelectorAll('[data-feedback-step]').forEach(function(button){
        var step = Number(button.getAttribute('data-feedback-step'));
        button.classList.toggle('is-done', step === 1 ? stepOneOk(form) : step === 2 ? (currentStep(form) > 2 || form.dataset.pStep2Passed === 'true') : step === 3 ? contactProgress(form) >= 1 : shippingProgress(form) >= 1);
      });
    }
  }
  function bind(form){
    if (form.dataset.pPolishBound) return;
    form.dataset.pPolishBound = 'true';
    form.addEventListener('click', function(event){
      if (event.target.closest('[data-p-next]') && currentStep(form) === 2) form.dataset.pStep2Passed = 'true';
      setTimeout(function(){ polishForm(form); }, 25);
    }, true);
    form.addEventListener('input', function(){ setTimeout(function(){ polishForm(form); }, 25); }, true);
    form.addEventListener('change', function(){ setTimeout(function(){ polishForm(form); }, 25); }, true);
    setTimeout(function(){ polishForm(form); }, 0);
    setTimeout(function(){ polishForm(form); }, 150);
  }
  function init(scope){
    (scope || document).querySelectorAll('[data-pr3nt-form][data-p-native-steps]').forEach(bind);
  }
  document.addEventListener('DOMContentLoaded', function(){ init(document); });
  document.addEventListener('shopify:section:load', function(event){ init(event.target); });
})();
