(function(){
  var SUCCESS_URL = '/pages/offerte-aanvraag-ontvangen';

  function setNativeValue(input, value){
    if(!input) return;
    var proto = input.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    var setter = Object.getOwnPropertyDescriptor(proto, 'value') && Object.getOwnPropertyDescriptor(proto, 'value').set;
    if(setter) setter.call(input, value);
    else input.value = value;
    input.dispatchEvent(new Event('input', { bubbles:true }));
    input.dispatchEvent(new Event('change', { bubbles:true }));
  }

  function setFileInput(targetInput, sourceInput){
    if(!targetInput || !sourceInput || !sourceInput.files || !sourceInput.files[0]) return false;
    try{
      var dt = new DataTransfer();
      dt.items.add(sourceInput.files[0]);
      targetInput.files = dt.files;
      targetInput.dispatchEvent(new Event('input', { bubbles:true }));
      targetInput.dispatchEvent(new Event('change', { bubbles:true }));
      return true;
    }catch(err){
      console.warn('pr3nt: kon bestand niet doorzetten naar Shopify Forms', err);
      return false;
    }
  }

  function getShopifyFormsRoot(){
    return document.querySelector('[data-pr3nt-shopify-forms-bridge]') || document;
  }

  function showBridgeError(form, message){
    var error = form.querySelector('[data-p-bridge-error]');
    if(error){
      error.textContent = message;
      error.classList.add('is-visible');
    } else {
      alert(message);
    }
  }

  function hideBridgeError(form){
    var error = form.querySelector('[data-p-bridge-error]');
    if(error) error.classList.remove('is-visible');
  }

  function waitForShopifyForms(callback, tries){
    tries = tries || 0;
    var root = getShopifyFormsRoot();
    var sfForm = root.querySelector('form[data-testid="form"]');
    var submit = sfForm && (sfForm.querySelector('[data-testid="btn-form-submit"]') || sfForm.querySelector('button[type="submit"]'));
    if(sfForm && submit){ callback(sfForm, submit); return; }
    if(tries >= 40){ callback(null, null); return; }
    window.setTimeout(function(){ waitForShopifyForms(callback, tries + 1); }, 150);
  }

  function submitToShopifyForms(form, fields, onDone){
    waitForShopifyForms(function(sfForm, submit){
      if(!sfForm || !submit){
        console.warn('pr3nt: Shopify Forms formulier niet gevonden. Voeg het Shopify Forms app block toe op dezelfde pagina.');
        onDone(false, 'De Shopify Forms-koppeling is nog niet geladen. Ververs de pagina of probeer het opnieuw.');
        return;
      }

      setFileInput(sfForm.querySelector('#custom\\#upload_3d_bestand-field'), fields.fileInput);
      setNativeValue(sfForm.querySelector('#custom\\#kleur'), fields.color);
      setNativeValue(sfForm.querySelector('#first_name'), fields.name);
      setNativeValue(sfForm.querySelector('#email'), fields.email);
      setNativeValue(sfForm.querySelector('#phone_number'), fields.phone);
      setNativeValue(sfForm.querySelector('textarea[name="custom#opmerkingen"]'), fields.note);

      var material = sfForm.querySelector('input[name="custom#materiaal"][value="'+fields.material+'"]');
      if(material){
        material.checked = true;
        material.dispatchEvent(new Event('input', { bubbles:true }));
        material.dispatchEvent(new Event('change', { bubbles:true }));
      }

      var rush = sfForm.querySelector('input[name="custom#spoed"][value="Spoed"]');
      if(rush){
        rush.checked = fields.rush === 'Ja';
        rush.dispatchEvent(new Event('input', { bubbles:true }));
        rush.dispatchEvent(new Event('change', { bubbles:true }));
      }

      window.setTimeout(function(){ submit.click(); }, 250);
      onDone(true);
    });
  }

  function initForms(scope){
    var root=scope||document;
    var forms=root.querySelectorAll('[data-pr3nt-form]:not([data-pr3nt-ready])');
    var allowed=['stl','3mf','obj','step','stp'];

    forms.forEach(function(form){
      form.setAttribute('data-pr3nt-ready','true');
      var step=1;
      var pending=false;
      var fileInput=form.querySelector('[data-p-file]'), fileLabel=form.querySelector('[data-p-file-label]'), fileError=form.querySelector('[data-p-file-error]');
      var nextButton=form.querySelector('[data-p-next]'), submitButton=form.querySelector('[data-p-submit]');
      var stepOne=form.querySelector('[data-p-step="1"]'), stepTwo=form.querySelector('[data-p-step="2"]');
      var tabs=form.querySelectorAll('[data-p-tab]');
      var materialInput=form.querySelector('[data-p-material-input]'), materialButtons=form.querySelectorAll('[data-p-material]');
      var rushInput=form.querySelector('[data-p-rush-input]'), rushButton=form.querySelector('[data-p-rush]');
      var colorInput=form.querySelector('[data-p-color]'), nameInput=form.querySelector('[data-p-name]'), emailInput=form.querySelector('[data-p-email]'), phoneInput=form.querySelector('[data-p-phone]'), noteInput=form.querySelector('[data-p-note]');
      var summary=form.querySelector('[data-p-summary]'), fileNameInput=form.querySelector('[data-p-file-name]');
      var formTitle=form.querySelector('[data-p-form-title]'), stepIcon=form.querySelector('[data-p-step-icon]');

      function validFile(file){ if(!file||!file.name)return false; return allowed.indexOf(file.name.split('.').pop().toLowerCase())!==-1; }
      function validEmail(v){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v||'').trim()); }
      function validPhone(v){ return /^\+?[0-9]{8,15}$/.test(String(v||'').replace(/[\s().-]/g,'')); }
      function stepOneOk(){ return fileInput && validFile(fileInput.files[0]) && colorInput && colorInput.value.trim().length>=2; }
      function allOk(){ return stepOneOk() && nameInput.value.trim().length>=2 && validEmail(emailInput.value) && validPhone(phoneInput.value); }

      function updateSummary(){
        if(!summary)return;
        var f=fileInput.files[0], fileName=f?f.name:'Geen bestand gekozen';
        var rushText=rushInput.value==='Ja'?'spoed · 2 dagen verzending':'standaard · 3 dagen verzending';
        summary.innerHTML='<strong>'+fileName+'</strong> <span>· '+materialInput.value+' · '+(colorInput.value||'kleur niet ingevuld')+' · '+rushText+'</span>';
        if(fileNameInput) fileNameInput.value=f?f.name:'';
      }

      function updateHeader(){
        if(formTitle) formTitle.textContent = step===1 ? 'Materiaal & bestand' : 'Gegevens';
        if(stepIcon) stepIcon.textContent = String(step);
      }

      function setPending(isPending){
        pending = isPending;
        if(submitButton){
          submitButton.disabled = isPending || !allOk();
          submitButton.textContent = isPending ? 'Bestand uploaden en aanvraag versturen...' : 'Offerte aanvragen';
        }
      }

      function update(){
        if(nextButton)nextButton.disabled=!stepOneOk();
        if(submitButton && !pending)submitButton.disabled=!allOk();
        updateHeader();
        updateSummary();
      }

      function setStep(n){
        if(n===2&&!stepOneOk())return;
        step=n;
        if(stepOne)stepOne.hidden=step!==1;
        if(stepTwo)stepTwo.hidden=step!==2;
        tabs.forEach(function(b){b.classList.toggle('is-active',Number(b.dataset.pTab)===step)});
        update();
      }

      if(fileInput) fileInput.addEventListener('change',function(){
        var f=fileInput.files[0];
        if(!f){ fileLabel.textContent='Sleep je 3D-bestand hierheen'; fileError.classList.remove('is-visible'); update(); return; }
        if(!validFile(f)){ fileInput.value=''; fileLabel.textContent='Sleep je 3D-bestand hierheen'; fileError.classList.add('is-visible'); update(); return; }
        fileLabel.textContent=f.name;
        fileError.classList.remove('is-visible');
        update();
      });

      materialButtons.forEach(function(btn){
        btn.addEventListener('click',function(){
          materialButtons.forEach(function(i){i.classList.remove('is-active')});
          btn.classList.add('is-active');
          materialInput.value=btn.dataset.pMaterial;
          update();
        })
      });

      if(rushButton) rushButton.addEventListener('click',function(){
        var active=rushButton.classList.toggle('is-active');
        rushInput.value=active?'Ja':'Nee';
        var t=rushButton.querySelector('[data-p-rush-text]');
        if(t)t.textContent=active?'+ €4,50 · 2 dagen verzending':'Standaard · 3 dagen verzending';
        update();
      });

      [colorInput,nameInput,emailInput,phoneInput,noteInput].forEach(function(i){ if(i)i.addEventListener('input',update); });
      tabs.forEach(function(b){b.addEventListener('click',function(){setStep(Number(b.dataset.pTab))})});
      if(nextButton)nextButton.addEventListener('click',function(){setStep(2)});
      var change=form.querySelector('[data-p-change]'); if(change)change.addEventListener('click',function(){setStep(1)});

      form.addEventListener('submit',function(e){
        e.preventDefault();
        if(!allOk()){
          update();
          return;
        }
        if(pending) return;
        hideBridgeError(form);
        setPending(true);

        submitToShopifyForms(form, {
          fileInput: fileInput,
          color: colorInput.value,
          material: materialInput.value,
          name: nameInput.value,
          email: emailInput.value,
          phone: phoneInput.value,
          note: noteInput ? noteInput.value : '',
          rush: rushInput.value
        }, function(sent, message){
          if(!sent){
            setPending(false);
            showBridgeError(form, message || 'De aanvraag kon niet worden verstuurd. Probeer het opnieuw.');
            return;
          }
          window.setTimeout(function(){
            if(document.visibilityState !== 'hidden'){
              showBridgeError(form, 'Shopify verwerkt de upload nog. Wacht nog even; bij grote bestanden kan dit langer duren.');
            }
          }, 12000);
        });
      });

      update();
    });
  }

  document.addEventListener('DOMContentLoaded',function(){initForms(document)});
  document.addEventListener('shopify:section:load',function(e){initForms(e.target)});
})();
