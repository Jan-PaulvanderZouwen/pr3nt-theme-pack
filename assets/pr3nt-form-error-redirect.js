(function () {
  var redirecting = false;
  var contactUrl = '/pages/contact?offerte=fout#contact';

  function hasVisibleBridgeError(form) {
    var error = form && form.querySelector('[data-p-bridge-error]');
    if (!error) return false;
    return error.classList.contains('is-visible') && String(error.textContent || '').trim().length > 0;
  }

  function redirectToContact(form) {
    if (redirecting || !hasVisibleBridgeError(form)) return;
    redirecting = true;
    var error = form.querySelector('[data-p-bridge-error]');
    try {
      sessionStorage.setItem('pr3nt_quote_error', String(error.textContent || '').trim());
    } catch (_) {}
    window.location.href = contactUrl;
  }

  function watchForm(form) {
    if (!form || form.dataset.pErrorRedirectReady) return;
    form.dataset.pErrorRedirectReady = 'true';
    var error = form.querySelector('[data-p-bridge-error]');
    if (!error) return;

    var observer = new MutationObserver(function () {
      if (hasVisibleBridgeError(form)) {
        window.setTimeout(function () { redirectToContact(form); }, 900);
      }
    });

    observer.observe(error, { attributes: true, childList: true, characterData: true, subtree: true, attributeFilter: ['class'] });
  }

  function init(scope) {
    (scope || document).querySelectorAll('[data-pr3nt-form]').forEach(watchForm);
  }

  document.addEventListener('DOMContentLoaded', function () { init(document); });
  document.addEventListener('shopify:section:load', function (event) { init(event.target); });
})();
