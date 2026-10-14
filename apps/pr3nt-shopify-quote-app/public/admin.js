// Beheer: zoeken, tabbladen, offerte-editor, opslaan-balk en kleine gemakken. De pagina's werken ook zonder dit script.
(function () {
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function money(value) {
    var number = Number(String(value || '').replace(/\s/g, '').replace('€', '').replace(',', '.'));
    return isFinite(number) ? number : 0;
  }
  function euro(value) {
    return '€ ' + value.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // Versturen afbreken en de knop (die portal.js al op 'bezig' zette) weer vrijgeven
  function cancel(event, form) {
    event.preventDefault();
    event.stopImmediatePropagation();
    setTimeout(function () {
      form.querySelectorAll('button.is-busy').forEach(function (button) {
        button.disabled = false;
        button.classList.remove('is-busy');
        button.removeAttribute('aria-busy');
      });
    }, 20);
  }

  // Meldingen die via de URL binnenkomen niet opnieuw tonen bij verversen
  if (window.history && window.history.replaceState && /[?&](deleted|moved|media|published|name)=/.test(window.location.search)) {
    var cleanUrl = new URL(window.location.href);
    ['deleted', 'moved', 'media', 'published', 'name', 'saved'].forEach(function (key) { cleanUrl.searchParams.delete(key); });
    window.history.replaceState(null, '', cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
  }

  // ---------- Orderoverzicht: tabbladen en zoeken ----------
  var list = document.querySelector('[data-order-list]');
  if (list) {
    var rows = Array.prototype.slice.call(list.querySelectorAll('.order-row[data-groups]'));
    var tabs = Array.prototype.slice.call(document.querySelectorAll('[data-tab]'));
    var search = document.querySelector('[data-search-input]');
    var empty = list.querySelector('[data-order-empty]');
    var current = (tabs.filter(function (tab) { return tab.getAttribute('aria-selected') === 'true'; })[0] || {}).dataset;
    var tab = current ? current.tab : 'actief';

    var apply = function () {
      var query = search ? search.value.trim().toLowerCase() : '';
      var shown = 0;
      rows.forEach(function (row) {
        var groups = ' ' + row.getAttribute('data-groups') + ' ';
        // Tijdens zoeken door alle orders, ook afgeronde
        var match = query ? row.getAttribute('data-search').indexOf(query) !== -1 : groups.indexOf(' ' + tab + ' ') !== -1;
        row.hidden = !match;
        if (match) shown += 1;
      });
      if (empty) empty.hidden = shown > 0;
    };

    var select = function (key, push) {
      tab = key;
      tabs.forEach(function (item) { item.setAttribute('aria-selected', String(item.dataset.tab === key)); });
      if (search) search.value = '';
      apply();
      if (push && window.history && window.history.replaceState) window.history.replaceState(null, '', '/admin' + (key === 'actief' ? '' : '?tab=' + key));
    };

    tabs.forEach(function (item) {
      item.addEventListener('click', function (event) { event.preventDefault(); select(item.dataset.tab, true); });
    });
    document.querySelectorAll('[data-tab-link]').forEach(function (link) {
      link.addEventListener('click', function (event) {
        var key = link.getAttribute('data-tab-link');
        if (!tabs.some(function (item) { return item.dataset.tab === key; })) return;
        event.preventDefault();
        select(key, true);
        var panel = document.querySelector('.orders');
        if (panel) panel.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
      });
    });
    if (search) search.addEventListener('input', apply);
  }

  // Sneltoetsen: / zoekt, Esc wist, Ctrl/Cmd + S slaat op
  document.addEventListener('keydown', function (event) {
    var target = event.target;
    var typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
    var searchInput = document.querySelector('[data-search-input]');
    if (event.key === '/' && !typing && searchInput) {
      event.preventDefault();
      searchInput.focus();
    }
    if (event.key === 'Escape' && target === searchInput) {
      searchInput.value = '';
      searchInput.dispatchEvent(new Event('input'));
      searchInput.blur();
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      var form = document.querySelector('[data-dirty-form]');
      if (!form) return;
      event.preventDefault();
      if (form.requestSubmit) form.requestSubmit(); else form.submit();
    }
  });

  // Telwerk in de takenkaarten
  if (!reduceMotion) {
    document.querySelectorAll('[data-count-int]').forEach(function (el) {
      var target = Number(el.getAttribute('data-count-int'));
      if (!target || target < 2) return;
      var start = null;
      var step = function (time) {
        if (!start) start = time;
        var progress = Math.min((time - start) / 600, 1);
        el.textContent = String(Math.round(target * (1 - Math.pow(1 - progress, 3))));
        if (progress < 1) requestAnimationFrame(step);
      };
      el.textContent = '0';
      requestAnimationFrame(step);
    });
  }

  // ---------- Offerte-editor ----------
  var lines = document.querySelector('[data-lines]');
  var totals = document.querySelector('.totals');
  var saveForm = document.getElementById('quote-form');
  var saveLabel = document.querySelector('[data-save-label]');

  function recalc() {
    if (!lines) return;
    var sub = 0;
    lines.querySelectorAll('[data-line]').forEach(function (row) {
      var qtyInput = row.querySelector('[name="lineQty"]');
      var unitInput = row.querySelector('[name="lineUnit"]');
      var unit = money(unitInput.value);
      var qty = qtyInput.value.trim() ? money(qtyInput.value) : (unit ? 1 : 0);
      var line = qty * unit;
      sub += line;
      var out = row.querySelector('[data-line-total]');
      if (out) out.textContent = line ? euro(line) : '';
    });
    if (totals) {
      var rate = money(totals.getAttribute('data-vat')) / 100;
      var vat = Math.round(sub * rate * 100) / 100;
      var set = function (key, value) {
        var el = totals.querySelector('[data-sum="' + key + '"]');
        if (!el) return;
        var text = euro(value);
        if (el.textContent !== text) {
          el.textContent = text;
          if (!reduceMotion) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
        }
      };
      set('sub', Math.round(sub * 100) / 100);
      set('vat', vat);
      set('total', Math.round((sub + vat) * 100) / 100);
    }
    if (saveForm && saveLabel) {
      var willMail = saveForm.getAttribute('data-sent') !== '1' && saveForm.getAttribute('data-paid') !== '1' && sub > 0;
      saveLabel.textContent = willMail ? 'Opslaan en offerte mailen' : 'Opslaan';
    }
  }

  function addLine(values) {
    var template = document.getElementById('qline-template');
    if (!lines || !template) return null;
    var row = template.content.firstElementChild.cloneNode(true);
    if (values) {
      row.querySelector('[name="lineLabel"]').value = values[0] || '';
      row.querySelector('[name="lineDescription"]').value = values[1] || '';
      row.querySelector('[name="lineQty"]').value = values[2] || '';
      row.querySelector('[name="lineUnit"]').value = values[3] || '';
    }
    lines.appendChild(row);
    return row;
  }

  function isEmptyLine(row) {
    return Array.prototype.every.call(row.querySelectorAll('input'), function (input) { return !input.value.trim(); });
  }

  if (lines) {
    lines.addEventListener('input', function (event) {
      if (event.target.classList.contains('needs') && event.target.value.trim()) event.target.classList.remove('needs');
      recalc();
    });
    document.addEventListener('click', function (event) {
      if (event.target.closest('[data-add-line]')) {
        var row = addLine();
        if (row) row.querySelector('input').focus();
        markDirty();
      }
      var remove = event.target.closest('[data-remove-line]');
      if (remove) {
        var line = remove.closest('[data-line]');
        var finish = function () {
          if (lines.querySelectorAll('[data-line]').length > 1) line.remove();
          else line.querySelectorAll('input').forEach(function (input) { input.value = ''; });
          line.classList.remove('is-leaving');
          recalc();
          markDirty();
        };
        if (reduceMotion) finish(); else { line.classList.add('is-leaving'); setTimeout(finish, 180); }
      }
      var templateButton = event.target.closest('[data-template-lines]');
      if (templateButton) {
        var template = JSON.parse(templateButton.getAttribute('data-template') || '[]');
        var existing = lines.querySelectorAll('[data-line]');
        var hasContent = Array.prototype.some.call(existing, function (row) { return !isEmptyLine(row); });
        if (hasContent && !window.confirm('De huidige regels vervangen door de standaardofferte?')) return;
        existing.forEach(function (row) { row.remove(); });
        var firstEmpty = null;
        template.forEach(function (values) {
          var row = addLine(values);
          var qty = row.querySelector('[name="lineQty"]');
          if (!qty.value) { qty.classList.add('needs'); if (!firstEmpty) firstEmpty = qty; }
        });
        recalc();
        markDirty();
        if (firstEmpty) firstEmpty.focus();
      }
    });
    recalc();
  }

  // ---------- Niet-opgeslagen wijzigingen ----------
  var dirtyForm = document.querySelector('[data-dirty-form]');
  var savebar = document.querySelector('[data-savebar]');
  var saveText = document.querySelector('[data-save-text]');
  var dirty = false;
  var submitting = false;

  function markDirty() {
    if (dirty || !savebar) return;
    dirty = true;
    savebar.classList.add('is-dirty');
    if (saveText) saveText.textContent = 'Je hebt wijzigingen die nog niet zijn opgeslagen';
  }

  if (dirtyForm) {
    var formId = dirtyForm.id;
    var belongs = function (el) {
      if (!el || !el.name) return false;
      return el.form === dirtyForm || (formId && el.getAttribute('form') === formId);
    };
    document.addEventListener('input', function (event) { if (belongs(event.target)) markDirty(); });
    document.addEventListener('change', function (event) { if (belongs(event.target)) markDirty(); });
    dirtyForm.addEventListener('submit', function () { submitting = true; });
    window.addEventListener('beforeunload', function (event) {
      if (dirty && !submitting) { event.preventDefault(); event.returnValue = ''; }
    });
    // Een ander formulier (bijv. label maken) verstuurt bewust zonder de wijzigingen
    document.querySelectorAll('form').forEach(function (form) {
      if (form === dirtyForm) return;
      form.addEventListener('submit', function (event) {
        if (dirty && !form.closest('[data-savebar]') && !window.confirm('Je wijzigingen zijn nog niet opgeslagen. Toch doorgaan?')) { cancel(event, form); return; }
        submitting = true;
      });
    });
  }

  // Track & trace ingevuld terwijl de order klaarstaat: status gaat bij opslaan naar Verzonden
  var tracking = document.querySelector('[data-tracking]');
  var statusSelect = document.querySelector('[data-status-select]');
  if (tracking && statusSelect) {
    var hint = document.querySelector('[data-tracking-hint]');
    var original = statusSelect.value;
    tracking.addEventListener('input', function () {
      var ready = ['paid', 'print_queue', 'ready_to_ship'].indexOf(original) !== -1;
      if (tracking.value.trim() && ready) {
        statusSelect.value = 'shipped';
        if (hint) hint.hidden = false;
      } else {
        statusSelect.value = original;
        if (hint) hint.hidden = true;
      }
    });
  }

  // Bevestigen voor onomkeerbare acties
  document.querySelectorAll('form[data-confirm]').forEach(function (form) {
    form.addEventListener('submit', function (event) {
      if (!window.confirm(form.getAttribute('data-confirm'))) cancel(event, form);
    });
  });
  document.addEventListener('click', function (event) {
    var button = event.target.closest('[data-confirm-click]');
    if (button && !window.confirm(button.getAttribute('data-confirm-click'))) event.preventDefault();
  });

  // ---------- Dialogen vooraf invullen (filament) ----------
  document.addEventListener('click', function (event) {
    var opener = event.target.closest('[data-open][data-fill]');
    if (!opener) return;
    var dialog = document.getElementById(opener.getAttribute('data-open'));
    if (!dialog) return;
    var values = {};
    try { values = JSON.parse(opener.getAttribute('data-fill')); } catch (error) { values = {}; }
    Object.keys(values).forEach(function (name) {
      var field = dialog.querySelector('[name="' + name + '"]');
      if (field && values[name]) field.value = values[name];
    });
    var grams = dialog.querySelector('[name="grams"]');
    if (grams) setTimeout(function () { grams.focus(); }, 30);
  });

  // ---------- Instellingen: aantal printers ----------
  var countInput = document.querySelector('[data-printer-count]');
  var names = document.querySelector('[data-printer-names]');
  if (countInput && names) {
    countInput.addEventListener('input', function () {
      var count = Math.max(1, Math.min(20, Number(countInput.value) || 1));
      var fields = names.querySelectorAll('.printer-name');
      for (var i = fields.length; i < count; i += 1) {
        var label = document.createElement('label');
        label.className = 'field printer-name';
        label.innerHTML = '<span>Printer ' + (i + 1) + '</span><input name="printerName">';
        label.querySelector('input').value = 'Printer ' + (i + 1);
        names.appendChild(label);
      }
      for (var j = fields.length - 1; j >= count; j -= 1) fields[j].remove();
    });
  }

  // ---------- Website: lange groepen (stappen, FAQ) inklappen ----------
  document.querySelectorAll('.cms .field-grid > .group').forEach(function (group) {
    var legend = group.querySelector(':scope > legend');
    if (!legend) return;
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'fold';
    button.textContent = legend.textContent;
    button.setAttribute('aria-expanded', 'false');
    legend.textContent = '';
    legend.appendChild(button);
    group.classList.add('is-folded');
    button.addEventListener('click', function () {
      var open = group.classList.toggle('is-folded') === false;
      button.setAttribute('aria-expanded', String(open));
    });
  });

  // ---------- Planning ----------
  var day = document.querySelector('[data-scroll-hour]');
  if (day) {
    var hourHeight = Number(day.getAttribute('data-hour-height')) || 36;
    day.scrollTop = Number(day.getAttribute('data-scroll-hour')) * hourHeight;
    var nowLine = day.querySelector('[data-now-line]');
    if (nowLine) {
      setInterval(function () {
        var parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Amsterdam', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
        var hh = Number(parts.filter(function (p) { return p.type === 'hour'; })[0].value);
        var mm = Number(parts.filter(function (p) { return p.type === 'minute'; })[0].value);
        nowLine.style.top = ((hh * 60 + mm) / 60) * hourHeight + 'px';
        var label = nowLine.querySelector('span');
        if (label) label.textContent = String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
      }, 60000);
    }
  }
  document.querySelectorAll('[data-autosubmit]').forEach(function (input) {
    input.addEventListener('change', function () { if (input.value) input.form.submit(); });
  });

  // Productiebord: kaart die net verplaatst is in beeld brengen
  var moved = document.querySelector('.job.is-moved');
  if (moved) moved.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest', inline: 'center' });
  if (window.location.hash && /^#q-/.test(window.location.hash)) {
    var card = document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
    if (card) {
      var plan = card.querySelector('details.card-more');
      if (plan && !moved) plan.open = true;
      card.classList.add('is-moved');
    }
  }
})();
