(function(){
  function init(){
    var header = document.querySelector('[data-p-header]');
    var hero = document.querySelector('.p-hero');
    if (!header || !hero) return;

    document.body.classList.add('p-header-scroll-ready');

    var ticking = false;
    function shouldShow(){
      return window.pageYOffset > 44 || document.documentElement.classList.contains('p-menu-open') || header.matches(':focus-within');
    }
    function apply(){
      ticking = false;
      header.classList.toggle('is-visible', shouldShow());
    }
    function request(){
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(apply);
    }

    window.addEventListener('scroll', request, { passive: true });
    window.addEventListener('resize', request);
    header.addEventListener('focusin', request);
    header.addEventListener('focusout', function(){ setTimeout(request, 0); });
    document.addEventListener('click', function(){ setTimeout(request, 0); }, true);
    apply();
  }

  document.addEventListener('DOMContentLoaded', init);
  document.addEventListener('shopify:section:load', init);
})();
