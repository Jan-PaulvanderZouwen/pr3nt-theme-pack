(function(){
  function initForms(scope){
    var root=scope||document;
    var forms=root.querySelectorAll('[data-pr3nt-form]:not([data-pr3nt-ready])');
    var allowed=['stl','3mf','obj','step','stp'];

    forms.forEach(function(form){
      form.setAttribute('data-pr3nt-ready','true');
      var step=1;
      var fileInput=form.querySelector('[data-p-file]'), fileLabel=form.querySelector('[data-p-file-label]'), fileError=form.querySelector('[data-p-file-error]');
      var nextButton=form.querySelector('[data-p-next]'), submitButton=form.querySelector('[data-p-submit]');
      var stepOne=form.querySelector('[data-p-step="1"]'), stepTwo=form.querySelector('[data-p-step="2"]');
      var tabs=form.querySelectorAll('[data-p-tab]');
      var materialInput=form.querySelector('[data-p-material-input]'), materialButtons=form.querySelectorAll('[data-p-material]');
      var rushInput=form.querySelector('[data-p-rush-input]'), rushButton=form.querySelector('[data-p-rush]');
      var colorInput=form.querySelector('[data-p-color]'), nameInput=form.querySelector('[data-p-name]'), emailInput=form.querySelector('[data-p-email]'), phoneInput=form.querySelector('[data-p-phone]');
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

      function update(){
        if(nextButton)nextButton.disabled=!stepOneOk();
        if(submitButton)submitButton.disabled=!allOk();
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
        if(!f){
          fileLabel.textContent='Sleep je 3D-bestand hierheen';
          fileError.classList.remove('is-visible');
          update();
          return;
        }
        if(!validFile(f)){
          fileInput.value='';
          fileLabel.textContent='Sleep je 3D-bestand hierheen';
          fileError.classList.add('is-visible');
          update();
          return;
        }
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

      [colorInput,nameInput,emailInput,phoneInput].forEach(function(i){ if(i)i.addEventListener('input',update); });
      tabs.forEach(function(b){b.addEventListener('click',function(){setStep(Number(b.dataset.pTab))})});
      if(nextButton)nextButton.addEventListener('click',function(){setStep(2)});
      var change=form.querySelector('[data-p-change]'); if(change)change.addEventListener('click',function(){setStep(1)});

      form.addEventListener('submit',function(e){
        if(!allOk()){
          e.preventDefault();
          update();
        }
      });

      update();
    });
  }

  document.addEventListener('DOMContentLoaded',function(){initForms(document)});
  document.addEventListener('shopify:section:load',function(e){initForms(e.target)});
})();
