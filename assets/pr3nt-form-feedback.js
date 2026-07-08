(function(){
  function filesOf(input){ return Array.prototype.slice.call(input && input.files ? input.files : []); }
  function value(input){ return String(input && input.value ? input.value : '').trim(); }
  function validEmail(input){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value(input)); }
  function validPhone(input){ var cleaned = value(input).replace(/[\s().-]/g, ''); return cleaned === '' || /^\+?[0-9]{8,15}$/.test(cleaned); }
  function escapeHtml(input){ return String(input || '').replace(/[&<>\"]/g, function(match){ return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[match]; }); }

  var modelExtensions = ['stl','3mf','obj','step','stp'];
  var referenceExtensions = modelExtensions.concat(['jpg','jpeg','png','webp','pdf','heic']);

  function requestType(form){ var input = form.querySelector('[data-p-request-type-input]'); return input ? input.value : '3d_file'; }
  function fileExtension(file){ var parts = String(file && file.name ? file.name : '').split('.'); return parts.length > 1 ? parts.pop().toLowerCase() : ''; }
  function filesAreAllowed(form){
    var files = filesOf(form.querySelector('[data-p-file]'));
    if (!files.length) return false;
    var allowed = requestType(form) === 'no_model' ? referenceExtensions : modelExtensions;
    return files.every(function(file){ var ext = fileExtension(file); return ext ? allowed.indexOf(ext) !== -1 : requestType(form) === 'no_model'; });
  }

  function stepOneProgress(form){
    var files = filesOf(form.querySelector('[data-p-file]'));
    var desc = value(form.querySelector('[data-p-description]'));
    if (requestType(form) === 'no_model') return Math.min(1, ((files.length && filesAreAllowed(form)) ? .7 : 0) + (desc.length >= 6 ? .3 : 0));
    return files.length && filesAreAllowed(form) ? 1 : 0;
  }
  function printChoiceProgress(form){
    var done = 0;
    if (value(form.querySelector('[data-p-material-input]')).length >= 2) done += 1;
    if (value(form.querySelector('[data-p-color]')).length >= 2) done += 1;
    if (value(form.querySelector('[data-p-print-size-input]')).length >= 2) done += 1;
    return done / 3;
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

  function stepOneOk(form){ return stepOneProgress(form) >= 1; }
  function stepTwoOk(form){ return printChoiceProgress(form) >= 1; }
  function stepThreeOk(form){ return contactProgress(form) >= 1; }
  function stepFourOk(form){ return shippingProgress(form) >= 1; }
  function stepOk(form, step){ if (step === 1) return stepOneOk(form); if (step === 2) return stepTwoOk(form); if (step === 3) return stepThreeOk(form); return stepFourOk(form); }
  function formOk(form){ return stepOneOk(form) && stepTwoOk(form) && stepThreeOk(form) && stepFourOk(form); }
  function currentStep(form){ var visible = Array.prototype.slice.call(form.querySelectorAll('[data-p-step]')).find(function(step){ return !step.hidden; }); return visible ? Number(visible.getAttribute('data-p-step')) || 1 : Number(form.dataset.pr3ntFeedbackStep || 1); }
  function canReach(form, target){ var current = currentStep(form); if (target <= current) return true; for (var i = 1; i < target; i += 1) { if (!stepOk(form, i)) return false; } return true; }

  function normalizeLayout(form){
    if (form.dataset.pr3ntContactShippingLayout) return;
    form.dataset.pr3ntContactShippingLayout = 'true';
    var step2 = form.querySelector('[data-p-step="2"]');
    var step3 = form.querySelector('[data-p-step="3"]');
    var step4 = form.querySelector('[data-p-step="4"]');
    if (!step2 || !step3 || !step4) return;

    var step2Actions = step2.querySelector('.p-step-actions');
    var sizePanel = step3.querySelector('.p-options-panel');
    var sizeNote = step3.querySelector('.p-soft-note');
    if (sizePanel && step2Actions) step2.insertBefore(sizePanel, step2Actions);
    if (sizeNote && step2Actions) step2.insertBefore(sizeNote, step2Actions);
    var step2Next = step2.querySelector('[data-p-next]');
    if (step2Next) step2Next.textContent = 'Verder naar contactgegevens';

    var contactGroup = form.querySelector('[data-p-name]') ? form.querySelector('[data-p-name]').closest('.p-contact-group') : null;
    var step3Actions = step3.querySelector('.p-step-actions');
    if (contactGroup && step3Actions) step3.insertBefore(contactGroup, step3Actions);
    var step3Next = step3.querySelector('[data-p-next]');
    if (step3Next) step3Next.textContent = 'Verder naar verzendgegevens';

    var summary = form.querySelector('[data-p-summary]') ? form.querySelector('[data-p-summary]').closest('.p-summary') : null;
    var shippingGroup = form.querySelector('[data-p-shipping-country]') ? form.querySelector('[data-p-shipping-country]').closest('.p-contact-group') : null;
    if (summary && shippingGroup && summary.parentElement === step4) step4.insertBefore(summary, shippingGroup);

    form.querySelectorAll('[data-p-tab]').forEach(function(tab){
      var tabStep = Number(tab.getAttribute('data-p-tab'));
      var strong = tab.querySelector('strong');
      if (!strong) return;
      if (tabStep === 1) strong.textContent = 'Bestand';
      if (tabStep === 2) strong.textContent = 'Keuze';
      if (tabStep === 3) strong.textContent = 'Contact';
      if (tabStep === 4) strong.textContent = 'Verzending';
    });
  }

  function setStep(form, nextStep){
    nextStep = Math.max(1, Math.min(4, Number(nextStep) || 1));
    if (!canReach(form, nextStep)) return;
    form.dataset.pr3ntFeedbackStep = String(nextStep);
    form.querySelectorAll('[data-p-step]').forEach(function(step){ step.hidden = Number(step.getAttribute('data-p-step')) !== nextStep; });
    updateUi(form);
  }

  function updateHiddenTabs(form){
    form.querySelectorAll('[data-p-tab]').forEach(function(tab){
      var tabStep = Number(tab.getAttribute('data-p-tab'));
      var reachable = canReach(form, tabStep);
      tab.classList.toggle('is-active', tabStep === currentStep(form));
      tab.classList.toggle('is-complete', stepOk(form, tabStep));
      tab.setAttribute('aria-disabled', reachable ? 'false' : 'true');
    });
  }

  function ensureProgress(form){
    if (form.querySelector('.p-form-progress[data-pr3nt-feedback-progress]')) return;
    var progress = document.createElement('div');
    progress.className = 'p-form-progress';
    progress.setAttribute('data-pr3nt-feedback-progress','');
    progress.setAttribute('aria-label','Voortgang offerteformulier');
    progress.innerHTML = [
      '<button type="button" class="p-form-progress-step" data-feedback-step="1"><span class="p-progress-dot">1</span><span>Bestand</span></button>',
      '<button type="button" class="p-form-progress-step" data-feedback-step="2"><span class="p-progress-dot">2</span><span>Keuze</span></button>',
      '<button type="button" class="p-form-progress-step" data-feedback-step="3"><span class="p-progress-dot">3</span><span>Contact</span></button>',
      '<button type="button" class="p-form-progress-step" data-feedback-step="4"><span class="p-progress-dot">4</span><span>Verzending</span></button>'
    ].join('');
    var head = form.querySelector('.p-form-head');
    if (head) head.insertAdjacentElement('afterend', progress);
    progress.querySelectorAll('[data-feedback-step]').forEach(function(button){ button.addEventListener('click', function(event){ event.preventDefault(); setStep(form, Number(button.getAttribute('data-feedback-step'))); }); });
  }

  function progressRatio(form){
    var p1 = stepOneProgress(form);
    if (p1 < 1) return p1 * .25;
    var p2 = printChoiceProgress(form);
    if (p2 < 1) return .25 + (p2 * .25);
    var p3 = contactProgress(form);
    if (p3 < 1) return .50 + (p3 * .25);
    return .75 + (shippingProgress(form) * .25);
  }

  function updateProgress(form){
    var progress = form.querySelector('.p-form-progress[data-pr3nt-feedback-progress]');
    if (!progress) return;
    var step = currentStep(form);
    progress.style.setProperty('--p-progress-ratio', String(Math.max(0, Math.min(1, progressRatio(form)))));
    progress.querySelectorAll('[data-feedback-step]').forEach(function(button){
      var buttonStep = Number(button.getAttribute('data-feedback-step'));
      var reachable = canReach(form, buttonStep);
      button.classList.toggle('is-active', buttonStep === step);
      button.classList.toggle('is-done', stepOk(form, buttonStep));
      button.classList.toggle('is-clickable', reachable);
      button.disabled = !reachable;
    });
  }

  function updateHeader(form){
    var titles = {1:'Bestand of idee',2:'Printkeuze',3:'Contactgegevens',4:'Verzendgegevens'};
    var title = form.querySelector('[data-p-form-title]');
    var icon = form.querySelector('[data-p-step-icon]');
    var step = currentStep(form);
    if (title) title.textContent = titles[step] || 'Offerte aanvragen';
    if (icon) icon.textContent = String(step);
  }

  function updateStepOneText(form){
    var files = filesOf(form.querySelector('[data-p-file]'));
    var label = form.querySelector('[data-p-file-label]');
    var help = form.querySelector('[data-p-upload-help]');
    var descriptionField = form.querySelector('[data-p-description-field]');
    var noModel = requestType(form) === 'no_model';
    if (label) label.textContent = files.length ? (files.length === 1 ? files[0].name : files.length + ' bestanden gekozen') : (noModel ? 'Upload eventueel foto’s of een schets' : 'Sleep je 3D-bestand hierheen');
    if (help) help.textContent = noModel ? 'Optioneel: JPG, PNG, WEBP, PDF, HEIC of 3D-bestand' : 'STL, 3MF, OBJ, STEP of STP';
    if (descriptionField) descriptionField.hidden = !noModel;
  }

  function updateSummary(form){
    var summary = form.querySelector('[data-p-summary]');
    if (!summary) return;
    var files = filesOf(form.querySelector('[data-p-file]'));
    var fileText = files.length ? (files.length === 1 ? files[0].name : files.length + ' bestanden gekozen') : (requestType(form) === 'no_model' ? 'Omschrijving zonder bestand' : 'Geen bestand gekozen');
    var material = value(form.querySelector('[data-p-material-input]')) || '-';
    var color = value(form.querySelector('[data-p-color]')) || 'kleur niet gekozen';
    var size = value(form.querySelector('[data-p-print-size-input]')) || 'oppervlak niet gekozen';
    var price = value(form.querySelector('[data-p-print-price-input]')) || 'prijs volgt';
    var rush = value(form.querySelector('[data-p-rush-input]')) === 'Ja' ? 'spoed' : 'standaard';
    var type = requestType(form) === 'no_model' ? 'Idee/foto' : '3D-bestand';
    summary.innerHTML = '<strong style="display:block;font-weight:900;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.2">' + escapeHtml(fileText) + '</strong><span style="display:block;margin-top:2px;color:rgba(16,24,32,.55);font-size:12.5px;line-height:1.25;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escapeHtml(type + ' · ' + material + ' · ' + color + ' · ' + size + ' · ' + price + ' · ' + rush) + '</span>';
  }

  function paymentLink(form){ return value(form.querySelector('[data-p-payment-link-input]')); }
  function syncPrintMeta(form){
    var select = form.querySelector('[data-p-print-size-input]');
    if (!select || !select.selectedOptions || !select.selectedOptions[0]) return;
    var option = select.selectedOptions[0];
    var price = form.querySelector('[data-p-print-price-input]');
    var payment = form.querySelector('[data-p-payment-link-input]');
    if (price) price.value = option.getAttribute('data-p-print-price') || '';
    if (payment) payment.value = option.getAttribute('data-p-payment-link') || '';
  }

  function updateUi(form){
    syncPrintMeta(form);
    updateStepOneText(form);
    updateHiddenTabs(form);
    updateHeader(form);
    updateSummary(form);
    updateProgress(form);
    var step = currentStep(form);
    form.querySelectorAll('[data-p-next]').forEach(function(button){ button.disabled = !stepOk(form, step); });
    form.querySelectorAll('[data-p-prev]').forEach(function(button){ button.disabled = step <= 1; });
    var submit = form.querySelector('[data-p-submit]');
    if (submit) { submit.disabled = !formOk(form); submit.textContent = paymentLink(form) ? 'Bestand uploaden & afrekenen' : 'Offerte aanvragen'; }
  }

  function showError(form, message){ var error = form.querySelector('[data-p-bridge-error]'); if (!error) return; error.textContent = message; error.classList.add('is-visible'); }
  function hideError(form){ var error = form.querySelector('[data-p-bridge-error]'); if (error) error.classList.remove('is-visible'); }

  async function submitForm(form){
    if (!formOk(form) || form.dataset.pr3ntFeedbackPending === 'true') return;
    form.dataset.pr3ntFeedbackPending = 'true';
    hideError(form);
    var submit = form.querySelector('[data-p-submit]');
    if (submit) { submit.disabled = true; submit.textContent = paymentLink(form) ? 'Uploaden...' : 'Aanvraag versturen...'; }
    try {
      var endpoint = form.getAttribute('data-p-endpoint');
      if (!endpoint) throw new Error('De offerte-app is nog niet gekoppeld.');
      var fileInput = form.querySelector('[data-p-file]');
      var files = filesOf(fileInput);
      var data = new FormData();
      files.forEach(function(file){ data.append('file', file); });
      var note = value(form.querySelector('[data-p-note]'));
      var intakeNote = [
        '--- Aanvraagtype ---', requestType(form) === 'no_model' ? 'Nog geen 3D-bestand' : '3D-bestand aanwezig',
        value(form.querySelector('[data-p-description]')) ? '\n--- Omschrijving / referentie ---\n' + value(form.querySelector('[data-p-description]')) : '',
        '\n--- Printkeuze ---', 'Materiaal: ' + value(form.querySelector('[data-p-material-input]')), 'Kleur: ' + value(form.querySelector('[data-p-color]')), 'Oppervlak: ' + value(form.querySelector('[data-p-print-size-input]')), 'Richtprijs: ' + value(form.querySelector('[data-p-print-price-input]')), paymentLink(form) ? 'Betaallink: ' + paymentLink(form) : '',
        '\n--- Verzendadres ---', 'Land: ' + value(form.querySelector('[data-p-shipping-country]')), 'Postcode: ' + value(form.querySelector('[data-p-shipping-postal]')), 'Huisnummer: ' + value(form.querySelector('[data-p-shipping-house]')), 'Plaats: ' + value(form.querySelector('[data-p-shipping-city]'))
      ].filter(Boolean).join('\n');
      data.append('file_name', files.map(function(file){ return file.name; }).join(', '));
      data.append('request_type', requestType(form));
      data.append('description', value(form.querySelector('[data-p-description]')));
      data.append('color', value(form.querySelector('[data-p-color]')));
      data.append('material', value(form.querySelector('[data-p-material-input]')));
      data.append('print_size', value(form.querySelector('[data-p-print-size-input]')));
      data.append('print_size_price', value(form.querySelector('[data-p-print-price-input]')));
      data.append('payment_link', paymentLink(form));
      data.append('name', value(form.querySelector('[data-p-name]')));
      data.append('email', value(form.querySelector('[data-p-email]')));
      data.append('phone', value(form.querySelector('[data-p-phone]')));
      data.append('note', note ? note + '\n\n' + intakeNote : intakeNote);
      data.append('rush', value(form.querySelector('[data-p-rush-input]')) || 'Nee');
      data.append('shipping_country', value(form.querySelector('[data-p-shipping-country]')));
      data.append('shipping_postal', value(form.querySelector('[data-p-shipping-postal]')));
      data.append('shipping_house', value(form.querySelector('[data-p-shipping-house]')));
      data.append('shipping_city', value(form.querySelector('[data-p-shipping-city]')));
      var response = await fetch(endpoint, { method: 'POST', body: data });
      var type = response.headers.get('content-type') || '';
      var json = type.indexOf('application/json') !== -1 ? await response.json().catch(function(){ return {}; }) : {};
      if (!response.ok || json.ok === false) throw new Error(json.error || 'De aanvraag kon niet worden verstuurd. Probeer het opnieuw.');
      window.location.href = paymentLink(form) || json.redirect || '/pages/offerte-aanvraag-ontvangen';
    } catch(error) {
      form.dataset.pr3ntFeedbackPending = 'false';
      showError(form, error.message || 'De aanvraag kon niet worden verstuurd. Probeer het opnieuw.');
      updateUi(form);
    }
  }

  function initForm(form){
    if (!form || !form.hasAttribute('data-p-native-steps') || form.dataset.pr3ntFeedbackReady) return;
    form.dataset.pr3ntFeedbackReady = 'true';
    normalizeLayout(form);
    ensureProgress(form);
    setStep(form, 1);
    form.addEventListener('click', function(event){
      var next = event.target.closest('[data-p-next]');
      var prev = event.target.closest('[data-p-prev]');
      var tab = event.target.closest('[data-p-tab]');
      var progress = event.target.closest('[data-feedback-step]');
      if (next || prev || tab || progress) {
        event.preventDefault(); event.stopImmediatePropagation();
        if (next) setStep(form, currentStep(form) + 1);
        if (prev) setStep(form, currentStep(form) - 1);
        if (tab) setStep(form, Number(tab.getAttribute('data-p-tab')));
        if (progress) setStep(form, Number(progress.getAttribute('data-feedback-step')));
      }
    }, true);
    form.addEventListener('submit', function(event){ event.preventDefault(); event.stopImmediatePropagation(); submitForm(form); }, true);
    form.addEventListener('change', function(){ setTimeout(function(){ updateUi(form); }, 0); }, true);
    form.addEventListener('input', function(){ setTimeout(function(){ updateUi(form); }, 0); }, true);
    form.addEventListener('click', function(){ setTimeout(function(){ updateUi(form); }, 0); }, true);
    updateUi(form);
  }

  function init(scope){ (scope || document).querySelectorAll('[data-pr3nt-form][data-p-native-steps]').forEach(initForm); }
  document.addEventListener('DOMContentLoaded', function(){ init(document); });
  document.addEventListener('shopify:section:load', function(event){ init(event.target); });
})();
