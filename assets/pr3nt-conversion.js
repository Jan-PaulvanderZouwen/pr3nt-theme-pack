(function(){
  var sentOnce = {};
  var scrollMarks = {};

  function safeText(node){
    return String(node && node.textContent ? node.textContent : '').replace(/\s+/g,' ').trim().slice(0,120);
  }

  function track(eventName, params){
    params = params || {};
    params.event_category = params.event_category || 'pr3nt_conversion';
    params.page_path = window.location.pathname;

    if (typeof window.gtag === 'function') {
      window.gtag('event', eventName, params);
    }

    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(Object.assign({ event: eventName }, params));

    try {
      window.dispatchEvent(new CustomEvent('pr3nt:conversion-event', { detail: { name: eventName, params: params } }));
    } catch(error) {}
  }

  function trackOnce(key, eventName, params){
    if (sentOnce[key]) return;
    sentOnce[key] = true;
    track(eventName, params);
  }

  function closest(element, selector){
    if (!element || element === document) return null;
    if (element.closest) return element.closest(selector);
    while (element && element !== document) {
      if (element.matches && element.matches(selector)) return element;
      element = element.parentNode;
    }
    return null;
  }

  function quoteTarget(){
    return document.querySelector('[data-pr3nt-quote-target]') || document.getElementById('offerte-formulier');
  }

  function headerOffset(){
    var header = document.querySelector('[data-p-header]');
    return Math.ceil((header ? header.getBoundingClientRect().height : 0) + 18);
  }

  function scrollToQuote(){
    var target = quoteTarget();
    if (!target) return false;
    var top = target.getBoundingClientRect().top + window.pageYOffset - headerOffset();
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    return true;
  }

  function initStickyQuote(){
    if (!quoteTarget() || document.querySelector('[data-pr3nt-sticky-quote]')) return;

    var link = document.createElement('a');
    link.href = '#offerte-formulier';
    link.className = 'p-sticky-quote';
    link.setAttribute('data-pr3nt-sticky-quote','');
    link.innerHTML = '<span><strong>Offerte aanvragen</strong><span>Upload bestand of idee</span></span>';
    document.body.appendChild(link);

    link.addEventListener('click', function(event){
      track('pr3nt_sticky_quote_click', { link_text: 'Offerte aanvragen' });
      if (scrollToQuote()) event.preventDefault();
    });

    if ('IntersectionObserver' in window) {
      var observer = new IntersectionObserver(function(entries){
        entries.forEach(function(entry){
          document.body.classList.toggle('p-quote-in-view', entry.isIntersecting);
        });
      }, { threshold: .12 });
      observer.observe(quoteTarget());
    }
  }

  function initPriceViewTracking(){
    var price = document.getElementById('prijzen') || document.getElementById('prijsuitleg');
    if (!price || !('IntersectionObserver' in window)) return;
    var observer = new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if (entry.isIntersecting) trackOnce('price_view', 'pr3nt_price_section_view', { section_id: price.id });
      });
    }, { threshold: .35 });
    observer.observe(price);
  }

  function initFormErrorTracking(){
    if (!('MutationObserver' in window)) return;
    document.querySelectorAll('[data-pr3nt-form] [data-p-bridge-error]').forEach(function(box){
      if (box.dataset.pr3ntErrorTrackingReady) return;
      box.dataset.pr3ntErrorTrackingReady = 'true';
      var observer = new MutationObserver(function(){
        if (box.classList.contains('is-visible')) {
          track('pr3nt_quote_error', { message: safeText(box) });
        }
      });
      observer.observe(box, { attributes:true, childList:true, characterData:true, subtree:true, attributeFilter:['class'] });
    });
  }

  function initDelegatedTracking(){
    if (document.documentElement.dataset.pr3ntConversionDelegated) return;
    document.documentElement.dataset.pr3ntConversionDelegated = 'true';

    document.addEventListener('click', function(event){
      var action = closest(event.target, 'a,button');
      if (!action) return;

      var href = action.getAttribute('href') || '';
      var text = safeText(action);

      if (href.indexOf('#offerte-formulier') !== -1 || href.indexOf('#upload') !== -1 || action.hasAttribute('data-p-next') || action.hasAttribute('data-p-submit')) {
        track('pr3nt_cta_click', {
          link_text: text,
          target: href || (action.hasAttribute('data-p-next') ? 'next_step' : 'submit_quote')
        });
      }

      if (href.indexOf('tel:') === 0) {
        track('pr3nt_contact_click', { contact_type: 'phone', link_text: text });
      }

      if (href.indexOf('mailto:') === 0) {
        track('pr3nt_contact_click', { contact_type: 'email', link_text: text });
      }

      if (action.hasAttribute('data-p-request-type')) {
        track('pr3nt_request_type_select', { request_type: action.getAttribute('data-p-request-type') });
      }

      if (action.hasAttribute('data-p-material')) {
        track('pr3nt_material_select', { material: action.getAttribute('data-p-material') });
      }

      if (action.hasAttribute('data-p-rush')) {
        track('pr3nt_rush_toggle', { link_text: text });
      }
    }, true);

    document.addEventListener('focusin', function(event){
      var form = closest(event.target, '[data-pr3nt-form]');
      if (!form) return;
      trackOnce('form_start_' + (form.id || 'quote'), 'pr3nt_quote_form_start', { form_id: form.id || 'quote_form' });
    }, true);

    document.addEventListener('change', function(event){
      var input = event.target;
      var form = closest(input, '[data-pr3nt-form]');
      if (!form) return;

      if (input.hasAttribute('data-p-file')) {
        var files = input.files ? Array.prototype.slice.call(input.files) : [];
        track('pr3nt_file_selected', {
          file_count: files.length,
          file_extensions: files.map(function(file){ return String(file.name || '').split('.').pop().toLowerCase(); }).join(',')
        });
      }

      if (input.hasAttribute('data-p-color')) {
        track('pr3nt_color_select', { color: input.value });
      }

      if (input.hasAttribute('data-p-print-size-input')) {
        track('pr3nt_print_size_select', { print_size: input.value });
      }
    }, true);

    document.addEventListener('submit', function(event){
      var form = closest(event.target, '[data-pr3nt-form]');
      if (!form) return;
      track('pr3nt_quote_submit_attempt', { form_id: form.id || 'quote_form' });
    }, true);
  }

  function initScrollDepth(){
    if (window.__pr3ntScrollDepthReady) return;
    window.__pr3ntScrollDepthReady = true;

    function check(){
      var doc = document.documentElement;
      var height = Math.max(1, doc.scrollHeight - window.innerHeight);
      var percent = Math.round((window.scrollY / height) * 100);
      [50,75,90].forEach(function(mark){
        if (percent >= mark && !scrollMarks[mark]) {
          scrollMarks[mark] = true;
          track('pr3nt_scroll_depth', { percent_scrolled: mark });
        }
      });
    }

    window.addEventListener('scroll', check, { passive:true });
    check();
  }

  function init(){
    initStickyQuote();
    initPriceViewTracking();
    initFormErrorTracking();
    initDelegatedTracking();
    initScrollDepth();
  }

  document.addEventListener('DOMContentLoaded', init);
  document.addEventListener('shopify:section:load', init);
})();
