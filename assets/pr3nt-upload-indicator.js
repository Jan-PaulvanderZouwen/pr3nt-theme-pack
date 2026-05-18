(function(){
  function initUploadIndicators(root){
    (root || document).querySelectorAll('[data-pr3nt-form]:not([data-p-upload-indicator-ready])').forEach(function(form){
      form.setAttribute('data-p-upload-indicator-ready','true');
      form.addEventListener('submit',function(){
        var submit=form.querySelector('[data-p-submit]');
        var progress=form.querySelector('[data-p-upload-progress]');
        var bar=form.querySelector('[data-p-upload-bar]');
        var percent=form.querySelector('[data-p-upload-percent]');
        var status=form.querySelector('[data-p-upload-status]');
        if(!submit || submit.disabled || !progress) return;
        progress.hidden=false;
        if(status) status.textContent='Bestanden uploaden en aanvraag verwerken...';
        if(percent) percent.textContent='Even geduld';
        if(bar) bar.style.width='96%';
      },true);
    });
  }
  document.addEventListener('DOMContentLoaded',function(){initUploadIndicators(document);});
  document.addEventListener('shopify:section:load',function(event){initUploadIndicators(event.target);});
})();
