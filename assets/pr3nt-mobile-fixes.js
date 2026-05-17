(function(){
  function findQuoteTarget(){
    return document.getElementById('offerte-formulier') || document.querySelector('[data-pr3nt-form]');
  }

  function scrollToQuoteForm(event){
    var href = event.currentTarget.getAttribute('href') || '';
    if(href !== '#upload' && href !== '/#upload' && href !== '#offerte-formulier' && href !== '/#offerte-formulier') return;

    var target = findQuoteTarget();
    if(!target) return;

    event.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });

    var firstInput = target.querySelector('input[type="file"], input, button, textarea, select');
    if(firstInput){
      window.setTimeout(function(){ firstInput.focus({ preventScroll: true }); }, 450);
    }
  }

  function initQuoteAnchors(scope){
    var root = scope || document;
    root.querySelectorAll('a[href="#upload"], a[href="/#upload"], a[href="#offerte-formulier"], a[href="/#offerte-formulier"]').forEach(function(link){
      if(link.hasAttribute('data-p-quote-anchor-ready')) return;
      link.setAttribute('data-p-quote-anchor-ready', 'true');
      link.addEventListener('click', scrollToQuoteForm);
    });
  }

  document.addEventListener('DOMContentLoaded', function(){ initQuoteAnchors(document); });
  document.addEventListener('shopify:section:load', function(event){ initQuoteAnchors(event.target); });
})();
