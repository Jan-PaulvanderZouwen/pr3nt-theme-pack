(function(){
  function findQuoteTarget(){
    return document.getElementById('offerte-formulier') || document.querySelector('[data-pr3nt-form]');
  }

  function headerOffset(){
    var header = document.querySelector('[data-p-header], .p-header');
    var height = header ? header.getBoundingClientRect().height : 0;
    return Math.ceil(height + 18);
  }

  function scrollToElement(target){
    var top = target.getBoundingClientRect().top + window.pageYOffset - headerOffset();
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }

  function scrollToQuoteForm(event){
    var href = event.currentTarget.getAttribute('href') || '';
    if(href !== '#upload' && href !== '/#upload' && href !== '#offerte-formulier' && href !== '/#offerte-formulier') return;

    var target = findQuoteTarget();
    if(!target) return;

    event.preventDefault();
    scrollToElement(target);

    var firstInput = target.querySelector('input[type="file"], input, button, textarea, select');
    if(firstInput){
      window.setTimeout(function(){ firstInput.focus({ preventScroll: true }); }, 550);
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
