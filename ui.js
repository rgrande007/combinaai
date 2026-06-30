// ============================================================
// UI UTILITIES — Toast + Modais (compartilhado entre páginas)
// ============================================================
(function () {
  var _toastContainer = null;

  function getToastContainer() {
    if (!_toastContainer) {
      _toastContainer = document.createElement('div');
      _toastContainer.className = 'toast-container';
      _toastContainer.setAttribute('role', 'region');
      _toastContainer.setAttribute('aria-label', 'Notificações');
      _toastContainer.setAttribute('aria-live', 'polite');
      document.body.appendChild(_toastContainer);
    }
    return _toastContainer;
  }

  var TOAST_ICONS = {
    success: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    error:   '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    info:    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    copy:    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>'
  };

  window.showToast = function (message, type, duration) {
    type     = type     || 'info';
    duration = duration || 4000;
    var container = getToastContainer();

    var toast = document.createElement('div');
    toast.className = 'toast toast-' + type;

    toast.innerHTML =
      '<span class="toast-icon">' + (TOAST_ICONS[type] || TOAST_ICONS.info) + '</span>' +
      '<span class="toast-text">' + message + '</span>' +
      '<button class="toast-close" aria-label="Fechar">' +
        '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
      '</button>';

    var timer;

    function dismiss() {
      if (!toast.parentNode) return;
      toast.classList.add('toast-leaving');
      toast.addEventListener('animationend', function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      });
    }

    toast.querySelector('.toast-close').addEventListener('click', function () {
      clearTimeout(timer);
      dismiss();
    });

    container.appendChild(toast);
    timer = setTimeout(dismiss, duration);
    toast.addEventListener('mouseenter', function () { clearTimeout(timer); });
    toast.addEventListener('mouseleave', function () { timer = setTimeout(dismiss, 2000); });
  };

  // ── Modal de Confirmação ───────────────────────────────────
  window.showConfirm = function (opts) {
    return new Promise(function (resolve) {
      var overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-labelledby', 'ui-modal-title');

      var isDanger   = !!opts.danger;
      var iconSvg    = isDanger
        ? '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>'
        : '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
      var iconClass  = isDanger ? 'modal-icon-danger' : 'modal-icon-info';
      var confirmCls = isDanger ? 'btn btn-danger' : 'btn btn-primary';

      overlay.innerHTML =
        '<div class="modal-card">' +
          '<div class="modal-icon ' + iconClass + '">' + iconSvg + '</div>' +
          '<div class="modal-title" id="ui-modal-title">' + (opts.title   || 'Confirmar') + '</div>' +
          '<div class="modal-desc">'                     + (opts.message || '')           + '</div>' +
          '<div class="modal-actions">' +
            '<button class="btn btn-secondary modal-cancel-btn">'  + (opts.cancelText  || 'Cancelar')  + '</button>' +
            '<button class="' + confirmCls + ' modal-confirm-btn">' + (opts.confirmText || 'Confirmar') + '</button>' +
          '</div>' +
        '</div>';

      document.body.appendChild(overlay);
      requestAnimationFrame(function () { overlay.classList.add('visible'); });

      var confirmBtn = overlay.querySelector('.modal-confirm-btn');
      var cancelBtn  = overlay.querySelector('.modal-cancel-btn');

      function close(result) {
        overlay.classList.remove('visible');
        setTimeout(function () { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 220);
        document.removeEventListener('keydown', onKey);
        resolve(result);
      }

      function onKey(e) { if (e.key === 'Escape') close(false); }

      confirmBtn.addEventListener('click', function () { close(true); });
      cancelBtn.addEventListener('click',  function () { close(false); });
      overlay.addEventListener('click', function (e) { if (e.target === overlay) close(false); });
      document.addEventListener('keydown', onKey);

      setTimeout(function () { (isDanger ? cancelBtn : confirmBtn).focus(); }, 60);
    });
  };

  // ── Modal de Prompt (renomear) ─────────────────────────────
  window.showPrompt = function (opts) {
    return new Promise(function (resolve) {
      var overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-labelledby', 'ui-modal-title');

      overlay.innerHTML =
        '<div class="modal-card">' +
          '<div class="modal-icon modal-icon-edit">' +
            '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' +
          '</div>' +
          '<div class="modal-title" id="ui-modal-title">' + (opts.title || 'Editar') + '</div>' +
          (opts.message ? '<div class="modal-desc">' + opts.message + '</div>' : '') +
          '<input class="modal-input" type="text" value="' +
            String(opts.value || '').replace(/"/g, '&quot;') + '"' +
            ' placeholder="' + String(opts.placeholder || '').replace(/"/g, '&quot;') + '"' +
            ' maxlength="100" />' +
          '<div class="modal-actions">' +
            '<button class="btn btn-secondary modal-cancel-btn">'  + (opts.cancelText  || 'Cancelar') + '</button>' +
            '<button class="btn btn-primary   modal-confirm-btn">' + (opts.confirmText || 'Salvar')   + '</button>' +
          '</div>' +
        '</div>';

      document.body.appendChild(overlay);
      requestAnimationFrame(function () { overlay.classList.add('visible'); });

      var input      = overlay.querySelector('.modal-input');
      var confirmBtn = overlay.querySelector('.modal-confirm-btn');
      var cancelBtn  = overlay.querySelector('.modal-cancel-btn');

      function close(value) {
        overlay.classList.remove('visible');
        setTimeout(function () { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 220);
        document.removeEventListener('keydown', onKey);
        resolve(value);
      }

      function onKey(e) { if (e.key === 'Escape') close(null); }

      confirmBtn.addEventListener('click', function () {
        var v = input.value.trim();
        if (!v) { input.focus(); input.style.borderColor = 'var(--destructive)'; return; }
        close(v);
      });
      cancelBtn.addEventListener('click', function () { close(null); });
      overlay.addEventListener('click', function (e) { if (e.target === overlay) close(null); });
      input.addEventListener('keydown', function (e) {
        input.style.borderColor = '';
        if (e.key === 'Enter') { var v = input.value.trim(); if (v) close(v); }
      });
      document.addEventListener('keydown', onKey);

      setTimeout(function () { input.focus(); input.select(); }, 60);
    });
  };
})();
