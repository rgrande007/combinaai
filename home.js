// ============================================================
// ADMINS AUTORIZADOS
// ============================================================
var ADMIN_EMAILS = [
  'rafaelgrande@usp.br'
];

// === Constantes ===
var DAYS = ['segunda', 'terca', 'quarta', 'quinta', 'sexta'];
var DAY_LABELS = { 'segunda':'Segunda','terca':'Terça','quarta':'Quarta','quinta':'Quinta','sexta':'Sexta' };
var DAY_LABELS_FULL = {
  'segunda':'Segunda-feira','terca':'Terça-feira','quarta':'Quarta-feira',
  'quinta':'Quinta-feira','sexta':'Sexta-feira'
};
var DAY_ABBR = { segunda:'Seg', terca:'Ter', quarta:'Qua', quinta:'Qui', sexta:'Sex' };
var MORNING_TIMES   = ['09:00','09:30','10:00','10:30','11:00','11:30','12:00'];
var AFTERNOON_TIMES = ['14:00','14:30','15:00','15:30','16:00','16:30','17:00'];
var ALL_TIMES       = MORNING_TIMES.concat(AFTERNOON_TIMES);

// === Estado global ===
var currentResponses       = [];
var currentSessionId       = null;
var firestoreUnsubscribe   = null;
var sessionDocUnsubscribe  = null;
var sessionListUnsubscribe = null;
var adminInitialized       = false;

// ============================================================
// ESTADOS DA UI
// ============================================================
var authLoading   = document.getElementById('auth-loading');
var landingEl     = document.getElementById('landing');
var adminPanelEl  = document.getElementById('admin-panel');
var notAuthEl     = document.getElementById('not-authorized');

function showState(state) {
  [landingEl, notAuthEl].forEach(function(el) { el.classList.remove('active'); });
  adminPanelEl.classList.remove('visible');

  authLoading.classList.add('hide');
  setTimeout(function() { authLoading.style.display = 'none'; }, 300);

  if (state === 'landing') {
    landingEl.classList.add('active');
  } else if (state === 'admin') {
    adminPanelEl.classList.add('visible');
    setTimeout(function() { animateCards(document.getElementById('session-manager')); }, 220);
  } else if (state === 'denied') {
    notAuthEl.classList.add('active');
  }
}

// ============================================================
// AUTENTICAÇÃO
// ============================================================
firebase.auth().onAuthStateChanged(function(user) {
  if (!user) {
    showState('landing');
    return;
  }

  if (isAuthorized(user.email)) {
    showState('admin');
    populateAdminHeader(user);
    initAdmin(user);
  } else {
    document.getElementById('denied-email-msg').textContent =
      'A conta ' + user.email + ' não tem permissão de administrador. ' +
      'Solicite ao responsável que adicione seu e-mail.';
    showState('denied');
  }
});

function isAuthorized(email) {
  return ADMIN_EMAILS
    .map(function(e) { return e.toLowerCase(); })
    .indexOf((email || '').toLowerCase()) !== -1;
}

function triggerGoogleLogin(btn) {
  if (btn) {
    btn.classList.add('loading');
    var orig = btn.innerHTML;
    btn.innerHTML = '<span class="spinner" style="width:16px;height:16px;border-width:2px;"></span> Aguarde...';
    btn._orig = orig;
  }
  var errEl = document.getElementById('hero-login-error');
  if (errEl) errEl.classList.remove('show');

  var provider = new firebase.auth.GoogleAuthProvider();
  firebase.auth().signInWithPopup(provider)
    .catch(function(err) {
      if (err.code !== 'auth/popup-closed-by-user' &&
          err.code !== 'auth/cancelled-popup-request') {
        if (errEl) {
          errEl.textContent = 'Erro ao fazer login. Tente novamente.';
          errEl.classList.add('show');
        }
      }
      if (btn) {
        btn.classList.remove('loading');
        btn.innerHTML = btn._orig || 'Entrar com o Google';
      }
    });
}

['hero-login-btn', 'header-login-btn', 'roles-login-btn'].forEach(function(id) {
  var el = document.getElementById(id);
  if (el) el.addEventListener('click', function() { triggerGoogleLogin(this); });
});

document.getElementById('signout-btn').addEventListener('click', function() {
  doSignout();
});
document.getElementById('signout-denied-btn').addEventListener('click', function() {
  doSignout();
});

function doSignout() {
  cleanupListeners();
  adminInitialized = false;
  firebase.auth().signOut();
  document.getElementById('session-monitor-view').style.display = 'none';
  document.getElementById('session-manager').style.display = 'block';
  document.getElementById('session-list-card').style.display = 'none';
  document.getElementById('session-list-container').innerHTML = '';
  document.getElementById('legacy-banner').style.display = 'none';
}

function populateAdminHeader(user) {
  var avatarEl = document.getElementById('auth-avatar');
  var nameEl   = document.getElementById('auth-display-name');
  if (user.photoURL) {
    avatarEl.src = user.photoURL;
    avatarEl.alt = user.displayName || user.email;
    avatarEl.style.display = 'block';
  }
  nameEl.textContent = user.displayName || user.email;
}

function cleanupListeners() {
  if (firestoreUnsubscribe)   { firestoreUnsubscribe();   firestoreUnsubscribe  = null; }
  if (sessionDocUnsubscribe)  { sessionDocUnsubscribe();  sessionDocUnsubscribe = null; }
  if (sessionListUnsubscribe) { sessionListUnsubscribe(); sessionListUnsubscribe = null; }
  currentSessionId = null;
  currentResponses = [];
}

// ============================================================
// TOOLTIP
// ============================================================
var _adminTooltip = null;
var _touchTooltipTimer = null;

function createAdminTooltip() {
  if (document.getElementById('admin-tooltip')) {
    _adminTooltip = document.getElementById('admin-tooltip'); return;
  }
  var tip = document.createElement('div');
  tip.className = 'admin-tooltip';
  tip.id = 'admin-tooltip';
  tip.setAttribute('aria-hidden', 'true');
  document.body.appendChild(tip);
  _adminTooltip = tip;

  // Esconde ao tocar fora de uma célula da grid
  document.addEventListener('touchstart', function(e) {
    if (!e.target.closest('.admin-slot-inner')) {
      clearTimeout(_touchTooltipTimer);
      hideAdminTooltip();
    }
  }, { passive: true });
}

function showAdminTooltip(cell) {
  if (!_adminTooltip) return;
  var names = [];
  try { names = JSON.parse(cell.dataset.names || '[]'); } catch(e) {}
  var allNames = currentResponses.map(function(r) { return r.name; });
  var absent   = allNames.filter(function(n) { return names.indexOf(n) === -1; });

  var html = '<div class="admin-tooltip-slot">' + escHtml(cell.dataset.slotLabel || '') + '</div>';
  if (names.length > 0) {
    html += '<div class="admin-tooltip-section avail"><div class="admin-tooltip-label">Disponíveis (' + names.length + ')</div>';
    names.forEach(function(n) { html += '<div class="admin-tooltip-name">' + escHtml(n) + '</div>'; });
    html += '</div>';
  }
  if (absent.length > 0) {
    html += '<div class="admin-tooltip-section absent"><div class="admin-tooltip-label">Ausentes (' + absent.length + ')</div>';
    absent.forEach(function(n) { html += '<div class="admin-tooltip-name">' + escHtml(n) + '</div>'; });
    html += '</div>';
  }
  if (allNames.length === 0) {
    html += '<div class="admin-tooltip-none">Sem respostas ainda</div>';
  } else if (names.length === 0) {
    html += '<div class="admin-tooltip-none">Ninguém disponível</div>';
  }

  _adminTooltip.innerHTML = html;
  _adminTooltip.style.left = '-9999px';
  _adminTooltip.style.top  = '-9999px';
  _adminTooltip.classList.add('visible');

  var tipW = _adminTooltip.offsetWidth, tipH = _adminTooltip.offsetHeight;
  var rect = cell.getBoundingClientRect();
  var vw = window.innerWidth, vh = window.innerHeight;
  var left = rect.right + 10, top = rect.top;
  if (left + tipW > vw - 12) left = rect.left - tipW - 10;
  if (left < 8) left = 8;
  if (top + tipH > vh - 12) top = vh - tipH - 12;
  if (top < 8) top = 8;
  _adminTooltip.style.left = left + 'px';
  _adminTooltip.style.top  = top  + 'px';
}

function hideAdminTooltip() {
  if (_adminTooltip) _adminTooltip.classList.remove('visible');
}

function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ============================================================
// INICIALIZAÇÃO DO PAINEL
// ============================================================
function initAdmin(user) {
  createAdminTooltip();

  if (!adminInitialized) {
    adminInitialized = true;

    document.getElementById('create-session-btn').addEventListener('click', createSession);
    document.getElementById('session-title-input').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') createSession();
    });
    document.getElementById('back-to-sessions-btn').addEventListener('click', backToSessions);
    document.getElementById('copy-invite-session-btn').addEventListener('click', copyInviteLink);
    document.getElementById('whatsapp-share-btn').addEventListener('click', shareWhatsApp);
    document.getElementById('copy-btn').addEventListener('click', copyRecommendation);
    document.getElementById('export-btn').addEventListener('click', exportCSV);
    document.getElementById('clear-all-btn').addEventListener('click', clearAll);
    document.getElementById('clear-confirmed-btn').addEventListener('click', clearConfirmedSlot);
    document.getElementById('import-legacy-btn').addEventListener('click', importLegacyData);

    document.getElementById('admin-panel').addEventListener('click', function(e) {
      var btn = e.target.closest('.rec-confirm-btn');
      if (btn) confirmSlot(btn.dataset.day, btn.dataset.time);
    });
  }

  startSessionList(user.email);
  checkLegacyData();

  var urlSessionId = null;
  try { urlSessionId = new URLSearchParams(window.location.search).get('sessao'); } catch(e) {}
  if (urlSessionId) {
    db.collection('sessions').doc(urlSessionId).get()
      .then(function(doc) {
        if (doc.exists && (doc.data().createdBy || '').toLowerCase() === (user.email || '').toLowerCase()) {
          selectSession(urlSessionId, doc.data().title || 'Sessão');
        } else {
          try { history.replaceState(null, '', window.location.pathname); } catch(e) {}
          if (doc.exists) showToast('Esta sessão pertence a outro organizador.', 'info');
        }
      })
      .catch(function() { try { history.replaceState(null, '', window.location.pathname); } catch(e) {} });
  }
}

// ============================================================
// DADOS LEGADOS
// ============================================================
async function checkLegacyData() {
  try {
    var snap = await db.collection('availability').limit(3).get();
    if (snap.empty) return;
    var count = snap.size;
    document.getElementById('legacy-desc').textContent =
      'Há ' + count + (count === 3 ? '+' : '') + ' resposta(s) de uma votação anterior sem sessão. ' +
      'Importe-as para continuar de onde parou.';
    document.getElementById('legacy-banner').style.display = 'flex';
  } catch(e) {}
}

async function importLegacyData() {
  var btn = document.getElementById('import-legacy-btn');
  btn.disabled = true;
  btn.textContent = 'Importando...';

  try {
    var snap = await db.collection('availability').get();
    if (snap.empty) {
      showToast('Nenhum dado legado encontrado.', 'info');
      document.getElementById('legacy-banner').style.display = 'none';
      btn.disabled = false;
      btn.textContent = 'Importar como nova sessão';
      return;
    }

    var sessionId  = generateSessionId();
    var adminEmail = firebase.auth().currentUser.email;
    var title      = 'Votação importada — ' + new Date().toLocaleDateString('pt-BR');

    await db.collection('sessions').doc(sessionId).set({
      title:     title,
      createdBy: adminEmail,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    var batch = db.batch();
    snap.docs.forEach(function(doc) {
      var data  = doc.data();
      var email = data.email || doc.id;
      var ref = db.collection('sessions').doc(sessionId)
                  .collection('responses').doc(email);
      batch.set(ref, {
        name:        data.name || 'Participante',
        nameLower:   (data.name || '').toLowerCase(),
        email:       email,
        slots:       data.slots || [],
        submittedAt: data.submittedAt || firebase.firestore.FieldValue.serverTimestamp()
      });
    });
    await batch.commit();

    document.getElementById('legacy-banner').style.display = 'none';
    selectSession(sessionId, title);

  } catch(err) {
    console.error('Erro ao importar:', err);
    showToast('Erro ao importar. Tente novamente.', 'error');
    btn.disabled = false;
    btn.textContent = 'Importar como nova sessão';
  }
}

// ============================================================
// GERENCIAMENTO DE SESSÕES
// ============================================================
function generateSessionId() {
  var chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  var id = '';
  for (var i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

async function createSession() {
  var titleInput = document.getElementById('session-title-input');
  var title = titleInput.value.trim();
  if (!title) { titleInput.focus(); return; }

  var btn = document.getElementById('create-session-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Criando...';

  try {
    var sessionId  = generateSessionId();
    var adminEmail = firebase.auth().currentUser.email;
    await db.collection('sessions').doc(sessionId).set({
      title:     title,
      createdBy: adminEmail,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    titleInput.value = '';
    selectSession(sessionId, title);
  } catch(err) {
    console.error('Erro ao criar sessão:', err);
    showToast('Erro ao criar sessão. Tente novamente.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Criar sessão e gerar link';
  }
}

async function renameSession(id, oldTitle) {
  var newTitle = await showPrompt({
    title: 'Renomear sessão',
    message: 'Informe o novo nome para esta sessão.',
    value: oldTitle,
    placeholder: 'Ex: Reunião de alinhamento Q3',
    confirmText: 'Salvar',
    cancelText: 'Cancelar'
  });
  if (!newTitle || newTitle === oldTitle) return;

  try {
    await db.collection('sessions').doc(id).update({ title: newTitle });
    showToast('Sessão renomeada com sucesso.', 'success');
  } catch(err) {
    console.error('Erro ao renomear:', err);
    showToast('Erro ao renomear a sessão.', 'error');
  }
}

async function deleteSession(id, title) {
  var ok = await showConfirm({
    title: 'Excluir sessão?',
    message: 'A sessão "<strong>' + escHtml(title) + '</strong>" e todas as suas respostas serão excluídas permanentemente.',
    confirmText: 'Excluir',
    cancelText: 'Cancelar',
    danger: true
  });
  if (!ok) return;

  try {
    var snap = await db.collection('sessions').doc(id).collection('responses').get();
    var batch = db.batch();
    snap.docs.forEach(function(d) { batch.delete(d.ref); });
    batch.delete(db.collection('sessions').doc(id));
    await batch.commit();
    showToast('Sessão excluída.', 'success');
  } catch(err) {
    console.error('Erro ao excluir sessão:', err);
    showToast('Erro ao excluir a sessão.', 'error');
  }
}

async function deleteResponse(sessionId, responseId, name) {
  var ok = await showConfirm({
    title: 'Remover participante?',
    message: 'A resposta de "<strong>' + escHtml(name) + '</strong>" será removida desta sessão.',
    confirmText: 'Remover',
    cancelText: 'Cancelar',
    danger: true
  });
  if (!ok) return;

  try {
    await db.collection('sessions').doc(sessionId)
      .collection('responses').doc(responseId).delete();
    showToast('Resposta de ' + name + ' removida.', 'success');
  } catch(err) {
    console.error('Erro ao remover resposta:', err);
    showToast('Erro ao remover a resposta.', 'error');
  }
}

function copySessionLink(sessionId) {
  var base = window.location.origin + '/';
  var url  = base + 'app.html?sessao=' + sessionId;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url)
      .then(function() { showToast('Link copiado!', 'copy'); })
      .catch(function() { _fallbackCopyText(url); });
  } else {
    _fallbackCopyText(url);
  }
}

function selectSession(sessionId, title) {
  currentSessionId = sessionId;
  try { history.replaceState(null, '', '?sessao=' + sessionId); } catch(e) {}

  document.getElementById('session-manager').style.display = 'none';
  document.getElementById('session-monitor-view').style.display = 'block';
  setTimeout(function() { animateCards(document.getElementById('session-monitor-view')); }, 40);

  document.getElementById('session-title-display').textContent = title;
  var baseUrl = window.location.origin + '/';
  var link    = baseUrl + 'app.html?sessao=' + sessionId;
  document.getElementById('session-link-display').textContent = link;

  document.getElementById('confirmed-slot-admin').style.display = 'none';
  currentResponses = [];
  renderAll([]);

  if (firestoreUnsubscribe) firestoreUnsubscribe();
  firestoreUnsubscribe = db.collection('sessions').doc(sessionId)
    .collection('responses').onSnapshot(function(snapshot) {
      currentResponses = snapshot.docs
        .map(function(d) { return Object.assign({ id: d.id }, d.data()); })
        .filter(function(r) { return r.name; })
        .sort(function(a, b) { return a.name.localeCompare(b.name, 'pt-BR'); });
      renderAll(currentResponses);
    }, function(err) { console.error('Erro respostas:', err); });

  if (sessionDocUnsubscribe) sessionDocUnsubscribe();
  sessionDocUnsubscribe = db.collection('sessions').doc(sessionId).onSnapshot(function(doc) {
    var banner = document.getElementById('confirmed-slot-admin');
    var text   = document.getElementById('confirmed-slot-admin-text');
    if (doc.exists && doc.data().confirmed) {
      var c = doc.data().confirmed;
      text.textContent = (DAY_LABELS_FULL[c.day] || c.day) + ', ' + c.time;
      if (banner.style.display !== 'block') {
        banner.style.display = 'block';
        celebrateConfirmedSlot(banner);
      }
    } else {
      banner.style.display = 'none';
    }
  }, function(err) { console.error('Erro doc sessão:', err); });

  setTimeout(function() {
    var el = document.getElementById('session-title-display');
    if (el) { el.setAttribute('tabindex', '-1'); el.focus(); }
  }, 350);
}

function backToSessions() {
  if (firestoreUnsubscribe)  { firestoreUnsubscribe();  firestoreUnsubscribe  = null; }
  if (sessionDocUnsubscribe) { sessionDocUnsubscribe(); sessionDocUnsubscribe = null; }
  currentSessionId = null;
  currentResponses = [];
  try { history.replaceState(null, '', window.location.pathname); } catch(e) {}
  document.getElementById('session-monitor-view').style.display = 'none';
  document.getElementById('session-manager').style.display = 'block';
  setTimeout(function() { animateCards(document.getElementById('session-manager')); }, 40);
  setTimeout(function() {
    var el = document.getElementById('session-title-input');
    if (el) el.focus();
  }, 350);
}

function startSessionList(adminEmail) {
  // Mostra skeleton enquanto carrega
  var card      = document.getElementById('session-list-card');
  var container = document.getElementById('session-list-container');
  card.style.display = 'block';
  container.innerHTML =
    '<div class="session-skeleton"></div>' +
    '<div class="session-skeleton"></div>' +
    '<div class="session-skeleton"></div>';

  if (sessionListUnsubscribe) sessionListUnsubscribe();
  sessionListUnsubscribe = db.collection('sessions')
    .where('createdBy', '==', adminEmail)
    .onSnapshot(function(snapshot) {
      var sessions = snapshot.docs.map(function(d) {
        return Object.assign({ id: d.id }, d.data());
      }).sort(function(a, b) {
        var ta = a.createdAt && a.createdAt.seconds ? a.createdAt.seconds : 0;
        var tb = b.createdAt && b.createdAt.seconds ? b.createdAt.seconds : 0;
        return tb - ta;
      });
      renderSessionList(sessions);
    }, function(err) { console.error('Erro lista sessões:', err); });
}

function renderSessionList(sessions) {
  var card      = document.getElementById('session-list-card');
  var container = document.getElementById('session-list-container');
  if (sessions.length === 0) { card.style.display = 'none'; return; }

  card.style.display = 'block';
  container.innerHTML = '';
  sessions.forEach(function(s) {
    var item = document.createElement('div');
    item.className = 'session-list-item';

    var isConfirmed = s.confirmed && s.confirmed.day;
    var confirmedBadge = isConfirmed
      ? '<span class="session-status-badge session-badge-confirmed">✓ Confirmada</span>'
      : '';

    item.innerHTML =
      '<div class="session-list-dot" aria-hidden="true"></div>' +
      '<button class="session-list-info-btn" aria-label="Abrir sessão: ' + escHtml(s.title) + '">' +
        '<div class="session-list-info">' +
          '<div class="session-list-title">' + escHtml(s.title) + '</div>' +
          '<div class="session-list-meta">' + formatDate(s.createdAt) + confirmedBadge + '</div>' +
        '</div>' +
        '<svg class="session-list-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>' +
      '</button>' +
      '<div class="session-list-actions">' +
        '<button class="session-action-btn session-copy-btn" aria-label="Copiar link de convite" title="Copiar link">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>' +
        '</button>' +
        '<button class="session-action-btn session-edit-btn" aria-label="Renomear sessão" title="Renomear">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' +
        '</button>' +
        '<button class="session-action-btn session-delete-btn" aria-label="Excluir sessão" title="Excluir">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>' +
        '</button>' +
      '</div>';

    item.querySelector('.session-list-info-btn').addEventListener('click', function() {
      selectSession(s.id, s.title);
    });
    item.querySelector('.session-copy-btn').addEventListener('click', function(e) {
      e.stopPropagation();
      copySessionLink(s.id);
    });
    item.querySelector('.session-edit-btn').addEventListener('click', function(e) {
      e.stopPropagation();
      renameSession(s.id, s.title);
    });
    item.querySelector('.session-delete-btn').addEventListener('click', function(e) {
      e.stopPropagation();
      deleteSession(s.id, s.title);
    });

    container.appendChild(item);
  });
}

function formatDate(ts) {
  if (!ts || !ts.seconds) return 'agora';
  return new Date(ts.seconds * 1000).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

// ============================================================
// ANIMAÇÕES E FX VISUAIS
// ============================================================

function celebrateConfirmedSlot(bannerEl) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var rect = bannerEl.getBoundingClientRect();
  var colors = ['#1BA890', '#6B4CF6', '#AEE1D4', '#A78BFA', '#148F79', '#7C3AED'];
  for (var i = 0; i < 22; i++) {
    (function(idx) {
      setTimeout(function() {
        var p = document.createElement('div');
        p.className = 'celebrate-particle';
        var tx = (Math.random() * 180 - 90);
        var ty = -(Math.random() * 130 + 50);
        p.style.cssText =
          'position:fixed;' +
          'left:' + (rect.left + Math.random() * rect.width) + 'px;' +
          'top:' + (rect.top + Math.random() * rect.height * 0.6) + 'px;' +
          'width:' + (4 + Math.random() * 7) + 'px;' +
          'height:' + (4 + Math.random() * 7) + 'px;' +
          'border-radius:50%;' +
          'background:' + colors[Math.floor(Math.random() * colors.length)] + ';' +
          'pointer-events:none;' +
          'z-index:9999;' +
          '--tx:' + tx + 'px;' +
          '--ty:' + ty + 'px;';
        document.body.appendChild(p);
        p.addEventListener('animationend', function() { p.remove(); });
      }, idx * 28);
    })(i);
  }
}

function animateCounter(el, toValue) {
  if (typeof toValue !== 'number') { el.textContent = toValue; return; }
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = toValue; return; }
  var startTime = null;
  var duration = 500;
  function step(timestamp) {
    if (!startTime) startTime = timestamp;
    var progress = Math.min((timestamp - startTime) / duration, 1);
    var eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(eased * toValue);
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function animateCards(container) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var cards = (container || document).querySelectorAll('.card');
  cards.forEach(function(card, i) {
    card.style.animation = 'none';
    void card.offsetWidth;
    card.style.animation = 'cardEnter 0.38s cubic-bezier(0.22, 0.68, 0, 1.15) ' + (i * 65) + 'ms both';
  });
}

// ============================================================
// RENDERIZAÇÃO
// ============================================================
function renderAll(responses) {
  renderRecommendation(responses);
  renderStats(responses);
  renderParticipants(responses);
  renderAdminGrid(responses);
}

function renderRecommendation(responses) {
  var cardEl     = document.getElementById('rec-card');
  var titleEl    = document.getElementById('rec-title');
  var subtitleEl = document.getElementById('rec-subtitle');
  var contentEl  = document.getElementById('rec-content');
  var total      = responses.length;

  cardEl.className = 'card rec-partial';

  if (total === 0) {
    titleEl.textContent    = 'Recomendação de Horário';
    subtitleEl.textContent = 'Aguardando respostas dos participantes.';
    contentEl.innerHTML    =
      '<div class="rec-empty hint">Assim que os participantes enviarem suas disponibilidades, a melhor opção de horário aparecerá aqui.</div>';
    return;
  }

  var data = getSlotData(responses);
  var maxCount = data.maxCount;
  var isAll    = (maxCount === total);

  if (maxCount === 0) {
    subtitleEl.textContent = total + ' participante(s) registrado(s), mas nenhum horário em comum.';
    contentEl.innerHTML    = '<p class="hint">Nenhuma disponibilidade registrada ainda.</p>';
    return;
  }

  var ranked = [];
  DAYS.forEach(function(day) {
    ALL_TIMES.forEach(function(time) {
      var key = day + '_' + time, count = data.counts[key] || 0;
      if (count > 0) ranked.push({ day: day, time: time, count: count });
    });
  });
  ranked.sort(function(a, b) {
    if (b.count !== a.count) return b.count - a.count;
    var dd = DAYS.indexOf(a.day) - DAYS.indexOf(b.day);
    return dd !== 0 ? dd : ALL_TIMES.indexOf(a.time) - ALL_TIMES.indexOf(b.time);
  });

  var topCount  = ranked.filter(function(s) { return s.count === maxCount; }).length;
  var showCount = Math.min(topCount, 3);
  var topSlots  = ranked.slice(0, showCount);

  if (isAll) {
    cardEl.className    = 'card rec-unanimous';
    titleEl.textContent = 'Horário Ideal';
    subtitleEl.innerHTML = '<strong>Todos os ' + total + ' participantes</strong> disponíveis nos horários abaixo.';
  } else {
    titleEl.textContent = 'Recomendação de Horário';
    subtitleEl.innerHTML = 'Melhor opção: <strong>' + maxCount + ' de ' + total + '</strong> participantes disponíveis.';
  }

  contentEl.innerHTML = '';
  var list = document.createElement('div');
  list.className = 'rec-list';
  var allNames = responses.map(function(r) { return r.name; });

  topSlots.forEach(function(slot, i) {
    var isAllSlot   = (slot.count === total);
    var slotKey     = slot.day + '_' + slot.time;
    var availNames  = data.namesBySlot[slotKey] || [];
    var absentNames = allNames.filter(function(n) { return availNames.indexOf(n) === -1; });
    var el = document.createElement('div');
    el.className = 'rec-slot' + (isAllSlot ? ' rec-slot-top-all' : ' rec-slot-top');
    el.innerHTML =
      '<div class="rec-rank">' + (i + 1) + '</div>' +
      '<div class="rec-body">' +
        '<div class="rec-time">' + DAY_LABELS_FULL[slot.day] + ', ' + slot.time +
          (isAllSlot ? ' <span class="badge-all" title="Todos os ' + total + ' participantes estão disponíveis">Todos</span>' : '') +
        '</div>' +
        (availNames.length > 0 ? '<div class="rec-avail">✓ ' + availNames.map(escHtml).join(', ') + '</div>' : '') +
        (absentNames.length > 0 ? '<div class="rec-absent"><strong>Ausentes:</strong> ' + absentNames.map(escHtml).join(', ') + '</div>' : '') +
      '</div>' +
      '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:.3rem;flex-shrink:0;">' +
        '<div class="rec-score"><div class="rec-score-num">' + slot.count + '<span class="rec-score-den">/' + total + '</span></div></div>' +
        '<button class="btn btn-violet rec-confirm-btn" data-day="' + slot.day + '" data-time="' + escHtml(slot.time) + '" ' +
          'style="font-size:.68rem;padding:.2rem .6rem;white-space:nowrap;" ' +
          'aria-label="Confirmar ' + escHtml(DAY_LABELS_FULL[slot.day]) + ' às ' + escHtml(slot.time) + '">Confirmar</button>' +
      '</div>';
    list.appendChild(el);
  });
  contentEl.appendChild(list);

  var remaining = ranked.length - showCount;
  if (remaining > 0) {
    var p = document.createElement('p');
    p.className = 'hint'; p.style.marginTop = '.5rem';
    p.textContent = remaining + ' outro' + (remaining > 1 ? 's' : '') + ' horário' + (remaining > 1 ? 's' : '') + ' disponíveis na tabela completa abaixo.';
    contentEl.appendChild(p);
  }
}

function renderStats(responses) {
  var total = responses.length;
  animateCounter(document.getElementById('stat-total'), total);
  if (total === 0) {
    document.getElementById('stat-slots').textContent = '—';
    document.getElementById('stat-best').textContent  = '—';
    return;
  }
  var data = getSlotData(responses);
  var unanimous = Object.keys(data.counts).filter(function(k) { return data.counts[k] === total; }).length;
  animateCounter(document.getElementById('stat-slots'), unanimous);
  var bestKey = null;
  DAYS.forEach(function(day) {
    ALL_TIMES.forEach(function(time) {
      var k = day + '_' + time;
      if (!bestKey || data.counts[k] > data.counts[bestKey]) bestKey = k;
    });
  });
  if (bestKey && data.counts[bestKey] > 0) {
    var parts = bestKey.split('_');
    document.getElementById('stat-best').textContent = DAY_ABBR[parts[0]] + ' ' + parts[1];
  } else {
    document.getElementById('stat-best').textContent = '—';
  }
}

function renderParticipants(responses) {
  var list = document.getElementById('participant-list');
  list.innerHTML = '';
  if (responses.length === 0) {
    list.innerHTML = '<p class="hint">Nenhuma resposta ainda.</p>';
    return;
  }
  responses.forEach(function(r) {
    var chip = document.createElement('div');
    chip.className = 'participant-chip';

    var nameSpan = document.createElement('span');
    nameSpan.textContent = r.name;

    var removeBtn = document.createElement('button');
    removeBtn.className = 'participant-remove-btn';
    removeBtn.setAttribute('aria-label', 'Remover ' + r.name);
    removeBtn.title = 'Remover resposta de ' + r.name;
    removeBtn.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    removeBtn.addEventListener('click', function() {
      deleteResponse(currentSessionId, r.id, r.name);
    });

    chip.appendChild(nameSpan);
    chip.appendChild(removeBtn);
    list.appendChild(chip);
  });
}

function getSlotData(responses) {
  var counts = {}, namesBySlot = {};
  DAYS.forEach(function(day) {
    ALL_TIMES.forEach(function(time) {
      var key = day + '_' + time;
      counts[key] = 0; namesBySlot[key] = [];
    });
  });
  responses.forEach(function(r) {
    if (!r.slots) return;
    r.slots.forEach(function(slot) {
      if (counts[slot] !== undefined) { counts[slot]++; namesBySlot[slot].push(r.name); }
    });
  });
  var values = Object.values(counts);
  return { counts: counts, namesBySlot: namesBySlot, maxCount: values.length ? Math.max.apply(null, values) : 0 };
}

function renderAdminGrid(responses) {
  var head = document.getElementById('admin-grid-head');
  var body = document.getElementById('admin-grid-body');
  var total = responses.length;
  var data  = getSlotData(responses);

  head.innerHTML = '';
  var headerRow = document.createElement('tr');
  var emptyTh = document.createElement('th');
  emptyTh.setAttribute('scope', 'col');
  headerRow.appendChild(emptyTh);
  DAYS.forEach(function(day) {
    var th = document.createElement('th');
    th.textContent = DAY_LABELS[day];
    th.setAttribute('scope', 'col');
    headerRow.appendChild(th);
  });
  head.appendChild(headerRow);
  body.innerHTML = '';

  function appendSection(label, times) {
    var sRow = document.createElement('tr'); sRow.className = 'section-row';
    var td = document.createElement('td'); td.colSpan = DAYS.length + 1; td.textContent = label;
    sRow.appendChild(td); body.appendChild(sRow);
    times.forEach(function(time) {
      var tr = document.createElement('tr');
      var timeTd = document.createElement('td'); timeTd.className = 'time-label'; timeTd.textContent = time;
      tr.appendChild(timeTd);
      DAYS.forEach(function(day) {
        var key = day + '_' + time, count = data.counts[key] || 0, names = data.namesBySlot[key] || [];
        var td = document.createElement('td'); td.className = 'admin-slot-cell';
        var inner = document.createElement('div');
        inner.className = 'admin-slot-inner ' + getAvailClass(count, total);
        inner.innerHTML = total === 0 ? '<span class="count">—</span>'
          : '<span class="count">' + count + '</span><span class="fraction">/' + total + '</span>';
        inner.dataset.slotLabel = DAY_LABELS[day] + ' · ' + time;
        inner.dataset.names = JSON.stringify(names);

        // Mouse (desktop)
        inner.addEventListener('mouseenter', function() { showAdminTooltip(this); });
        inner.addEventListener('mouseleave', hideAdminTooltip);

        // Touch (mobile) — tap para revelar, auto-esconde em 3s
        inner.addEventListener('touchstart', function(e) {
          clearTimeout(_touchTooltipTimer);
          showAdminTooltip(this);
          _touchTooltipTimer = setTimeout(hideAdminTooltip, 3000);
          e.stopPropagation();
        }, { passive: true });

        td.appendChild(inner); tr.appendChild(td);
      });
      body.appendChild(tr);
    });
  }

  appendSection('Manhã', MORNING_TIMES);
  appendSection('Tarde', AFTERNOON_TIMES);

  var allCells = body.querySelectorAll('.admin-slot-inner');

  if (total === 0) {
    allCells.forEach(function(cell) { cell.classList.add('skeleton'); });
  }

  if (total > 0 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    allCells.forEach(function(cell, i) {
      cell.style.animationDelay = (i * 6) + 'ms';
      cell.classList.add('grid-reveal');
    });
  }

  renderLegend();
}

function getAvailClass(count, total) {
  if (total === 0 || count === 0) return 'avail-none';
  var p = count / total;
  if (p >= 1.0) return 'avail-all'; if (p >= .75) return 'avail-high';
  if (p >= .5)  return 'avail-med'; if (p >= .25) return 'avail-low';
  return 'avail-few';
}

function renderLegend() {
  var legend = document.getElementById('legend'); legend.innerHTML = '';
  [
    { cls: 'ld-all',  label: 'Todos'  },
    { cls: 'ld-high', label: '≥ 75%'  },
    { cls: 'ld-med',  label: '≥ 50%'  },
    { cls: 'ld-low',  label: '≥ 25%'  },
    { cls: 'ld-few',  label: '< 25%'  },
    { cls: 'ld-none', label: 'Nenhum' }
  ].forEach(function(item) {
    var div = document.createElement('div'); div.className = 'legend-item';
    var dot = document.createElement('span'); dot.className = 'legend-dot ' + item.cls;
    var lbl = document.createElement('span'); lbl.textContent = item.label;
    div.appendChild(dot); div.appendChild(lbl); legend.appendChild(div);
  });
}

// ============================================================
// AÇÕES DE SESSÃO
// ============================================================
async function confirmSlot(day, time) {
  if (!currentSessionId) return;
  var ok = await showConfirm({
    title: 'Confirmar este horário?',
    message: '<strong>' + escHtml(DAY_LABELS_FULL[day]) + ', ' + escHtml(time) + '</strong>' +
      '<br><span style="font-size:.85em;color:var(--text-muted)">Os participantes verão o horário confirmado na próxima vez que acessarem o link de convite.</span>',
    confirmText: 'Confirmar horário',
    cancelText: 'Cancelar',
    danger: false
  });
  if (!ok) return;
  db.collection('sessions').doc(currentSessionId).update({
    confirmed: { day: day, time: time, confirmedAt: firebase.firestore.FieldValue.serverTimestamp() }
  }).then(function() {
    showToast('Horário confirmado! Participantes verão na próxima visita.', 'success', 5000);
  }).catch(function(err) {
    console.error('Erro ao confirmar:', err);
    showToast('Erro ao confirmar o horário. Tente novamente.', 'error');
  });
}

async function clearConfirmedSlot() {
  if (!currentSessionId) return;
  var ok = await showConfirm({
    title: 'Remover confirmação?',
    message: 'O horário confirmado será removido desta sessão.',
    confirmText: 'Remover',
    cancelText: 'Cancelar',
    danger: false
  });
  if (!ok) return;
  db.collection('sessions').doc(currentSessionId).update({
    confirmed: firebase.firestore.FieldValue.delete()
  }).catch(function(err) { console.error('Erro ao limpar:', err); });
}

function copyInviteLink() {
  if (!currentSessionId) return;
  var url = buildInviteUrl();
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url)
      .then(function() { showToast('Link copiado!', 'copy'); })
      .catch(function() { _fallbackCopyText(url); });
  } else { _fallbackCopyText(url); }
}

function shareWhatsApp() {
  if (!currentSessionId) return;
  var url   = buildInviteUrl();
  var title = document.getElementById('session-title-display').textContent || 'disponibilidade';
  var msg   = 'Oi! Preciso saber sua disponibilidade para *' + title + '*.\n\nAcesse o link e marque os horários em que você pode:\n' + url;
  window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
}

function buildInviteUrl() {
  var base = window.location.origin + '/';
  return base + 'app.html?sessao=' + currentSessionId;
}

function copyRecommendation() {
  if (currentResponses.length === 0) { showToast('Nenhuma resposta para copiar.', 'info'); return; }
  var data = getSlotData(currentResponses), total = currentResponses.length;
  var allNames = currentResponses.map(function(r) { return r.name; });
  var maxCount = data.maxCount, isAll = (maxCount === total);

  var text = isAll
    ? '=== Horário Ideal — todos os ' + total + ' participantes disponíveis ===\n\n'
    : '=== Recomendação de Horário (' + maxCount + '/' + total + ' disponíveis) ===\n\n';

  var ranked = [];
  DAYS.forEach(function(day) {
    ALL_TIMES.forEach(function(time) {
      var key = day + '_' + time, count = data.counts[key] || 0;
      if (count > 0) ranked.push({ day: day, time: time, count: count });
    });
  });
  ranked.sort(function(a, b) {
    if (b.count !== a.count) return b.count - a.count;
    var dd = DAYS.indexOf(a.day) - DAYS.indexOf(b.day);
    return dd !== 0 ? dd : ALL_TIMES.indexOf(a.time) - ALL_TIMES.indexOf(b.time);
  });

  ranked.slice(0, Math.min(5, ranked.length)).forEach(function(slot, i) {
    var avail   = data.namesBySlot[slot.day + '_' + slot.time] || [];
    var unavail = allNames.filter(function(n) { return avail.indexOf(n) === -1; });
    var pct     = Math.round((slot.count / total) * 100);
    text += (i + 1) + '. ' + DAY_LABELS_FULL[slot.day] + ', ' + slot.time + ' (' + slot.count + '/' + total + ' — ' + pct + '%)\n';
    text += '   Disponíveis: ' + avail.join(', ') + '\n';
    if (unavail.length > 0) text += '   Ausentes: ' + unavail.join(', ') + '\n';
    text += '\n';
  });

  var finalText = text.trim();
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(finalText)
      .then(function() { showToast('Recomendação copiada!', 'copy'); })
      .catch(function() { _fallbackCopyText(finalText); });
  } else { _fallbackCopyText(finalText); }
}

function _fallbackCopyText(text) {
  var ta = document.createElement('textarea');
  ta.value = text; ta.style.cssText = 'position:fixed;opacity:0;';
  document.body.appendChild(ta); ta.select();
  document.execCommand('copy'); document.body.removeChild(ta);
  showToast('Copiado!', 'copy');
}

function exportCSV() {
  if (currentResponses.length === 0) { showToast('Nenhuma resposta para exportar.', 'info'); return; }
  var allSlots = [];
  DAYS.forEach(function(day) { ALL_TIMES.forEach(function(time) { allSlots.push(day + '_' + time); }); });
  var headers = ['Nome','Email','Data de envio'].concat(allSlots);
  var rows = currentResponses.map(function(r) {
    var date = '';
    if (r.submittedAt && r.submittedAt.seconds) date = new Date(r.submittedAt.seconds * 1000).toLocaleString('pt-BR');
    return [r.name, r.email || r.id || '', date].concat(
      allSlots.map(function(slot) { return (r.slots || []).indexOf(slot) !== -1 ? '1' : '0'; })
    );
  });
  var csv = '﻿' + [headers].concat(rows)
    .map(function(row) { return row.map(function(c) { return '"' + String(c).replace(/"/g,'""') + '"'; }).join(','); })
    .join('\n');
  var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement('a');
  a.href = url; a.download = 'disponibilidade_' + new Date().toISOString().split('T')[0] + '.csv';
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
  showToast('CSV exportado!', 'success');
}

async function clearAll() {
  if (!currentSessionId) return;
  var ok = await showConfirm({
    title: 'Apagar todas as respostas?',
    message: 'Todas as respostas desta sessão serão excluídas permanentemente. Esta ação não pode ser desfeita.',
    confirmText: 'Apagar tudo',
    cancelText: 'Cancelar',
    danger: true
  });
  if (!ok) return;
  try {
    var snap = await db.collection('sessions').doc(currentSessionId).collection('responses').get();
    if (snap.empty) { showToast('Não há respostas para apagar.', 'info'); return; }
    var batch = db.batch();
    snap.docs.forEach(function(d) { batch.delete(d.ref); });
    await batch.commit();
    showToast('Todas as respostas foram apagadas.', 'success');
  } catch(err) {
    console.error('Erro:', err);
    showToast('Erro ao limpar. Tente novamente.', 'error');
  }
}
