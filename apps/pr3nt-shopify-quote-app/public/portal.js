// Klantportaal: kleine interacties. De pagina werkt ook zonder dit script.
(function () {
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.documentElement.classList.add('js');

  // Dialogen openen en sluiten
  document.addEventListener('click', function (event) {
    var opener = event.target.closest('[data-open]');
    if (opener) {
      var dialog = document.getElementById(opener.getAttribute('data-open'));
      if (dialog && dialog.showModal) dialog.showModal();
    }
    var closer = event.target.closest('[data-close]');
    if (closer) {
      var parent = closer.closest('dialog');
      if (parent) parent.close();
    }
  });

  // Klik op de achtergrond van een dialoog sluit hem
  document.querySelectorAll('dialog').forEach(function (dialog) {
    dialog.addEventListener('click', function (event) {
      if (event.target === dialog) dialog.close();
    });
  });

  // Melding na opslaan verdwijnt vanzelf
  var notice = document.querySelector('[data-notice]');
  if (notice) {
    var hide = function () {
      notice.classList.add('is-leaving');
      setTimeout(function () { notice.remove(); }, reduceMotion ? 0 : 300);
    };
    notice.querySelector('[data-dismiss]').addEventListener('click', hide);
    setTimeout(hide, 6000);
    if (window.history && window.history.replaceState) {
      var url = new URL(window.location.href);
      url.searchParams.delete('saved');
      window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
  }

  // Hover over een printlaag licht dezelfde stap in de lijst op
  var stepItems = document.querySelectorAll('.steps li');
  document.querySelectorAll('.layers span').forEach(function (layer, index) {
    layer.addEventListener('mouseenter', function () { if (stepItems[index]) stepItems[index].classList.add('is-hover'); });
    layer.addEventListener('mouseleave', function () { if (stepItems[index]) stepItems[index].classList.remove('is-hover'); });
  });

  // Bedrag telt op naar het totaal
  document.querySelectorAll('[data-count]').forEach(function (el) {
    var target = Number(el.getAttribute('data-count'));
    if (!target || reduceMotion) return;
    var format = function (value) {
      return '€ ' + value.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };
    var start = null;
    var duration = 900;
    var step = function (time) {
      if (!start) start = time;
      var progress = Math.min((time - start) / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = format(target * eased);
      if (progress < 1) requestAnimationFrame(step);
      else el.textContent = format(target);
    };
    requestAnimationFrame(step);
  });

  // Track & trace kopiëren
  document.addEventListener('click', function (event) {
    var button = event.target.closest('[data-copy]');
    if (!button) return;
    var text = button.getAttribute('data-copy');
    var done = function () {
      var original = button.textContent;
      button.textContent = 'Gekopieerd';
      setTimeout(function () { button.textContent = original; }, 1800);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () {});
  });

  // Tekstvak groeit mee, Ctrl/Cmd + Enter verstuurt
  document.querySelectorAll('textarea[data-autosize]').forEach(function (area) {
    var resize = function () {
      area.style.height = 'auto';
      area.style.height = Math.min(area.scrollHeight + 2, 320) + 'px';
    };
    area.addEventListener('input', resize);
    area.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && area.value.trim()) {
        event.preventDefault();
        if (area.form.requestSubmit) area.form.requestSubmit();
        else area.form.submit();
      }
    });
  });

  // Gesprek opent onderaan, bij het nieuwste bericht
  document.querySelectorAll('[data-thread]').forEach(function (thread) { thread.scrollTop = thread.scrollHeight; });

  // Knoppen tonen dat er iets gebeurt en voorkomen dubbel versturen
  document.querySelectorAll('form').forEach(function (form) {
    form.addEventListener('submit', function () {
      var button = form.querySelector('button[type="submit"]');
      if (!button) return;
      setTimeout(function () {
        button.disabled = true;
        button.classList.add('is-busy');
        button.setAttribute('aria-busy', 'true');
      }, 0);
    });
  });

  // Na 'terug' in de browser zijn de knoppen weer bruikbaar
  window.addEventListener('pageshow', function () {
    document.querySelectorAll('button.is-busy').forEach(function (button) {
      button.disabled = false;
      button.classList.remove('is-busy');
      button.removeAttribute('aria-busy');
    });
  });

  // Uploadvlak: slepen en gekozen bestanden tonen
  document.querySelectorAll('.drop').forEach(function (zone) {
    var input = zone.querySelector('input[type="file"]');
    var list = zone.querySelector('.drop-files');
    var show = function () {
      var names = Array.prototype.map.call(input.files || [], function (file) { return file.name; });
      list.textContent = names.join(', ');
      zone.classList.toggle('has-files', names.length > 0);
    };
    input.addEventListener('change', show);
    ['dragenter', 'dragover'].forEach(function (type) {
      zone.addEventListener(type, function (event) { event.preventDefault(); zone.classList.add('is-over'); });
    });
    ['dragleave', 'drop'].forEach(function (type) {
      zone.addEventListener(type, function () { zone.classList.remove('is-over'); });
    });
    zone.addEventListener('drop', function (event) {
      event.preventDefault();
      if (event.dataTransfer && event.dataTransfer.files.length) {
        input.files = event.dataTransfer.files;
        show();
      }
    });
  });

  // Panelen schuiven rustig in beeld bij het scrollen
  if (!reduceMotion && 'IntersectionObserver' in window) {
    var panels = document.querySelectorAll('.portal-layout .panel');
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -40px 0px' });
    panels.forEach(function (panel) {
      var rect = panel.getBoundingClientRect();
      if (rect.top < window.innerHeight) return;
      panel.classList.add('will-reveal');
      observer.observe(panel);
    });
  }
})();
