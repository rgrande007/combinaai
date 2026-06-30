// === Constantes ===
var DAYS = ['segunda', 'terca', 'quarta', 'quinta', 'sexta'];

var DAY_LABELS = {
  'segunda': 'Segunda',
  'terca':   'Terça',
  'quarta':  'Quarta',
  'quinta':  'Quinta',
  'sexta':   'Sexta'
};

var DAY_LABELS_FULL_P = {
  segunda: 'Segunda-feira', terca: 'Terça-feira', quarta: 'Quarta-feira',
  quinta:  'Quinta-feira',  sexta: 'Sexta-feira'
};

var MORNING_TIMES   = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00'];
var AFTERNOON_TIMES = ['14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00'];
var ALL_TIMES       = MORNING_TIMES.concat(AFTERNOON_TIMES);

// === Sessão ===
var SESSION_ID = null;
try {
  SESSION_ID = new URLSearchParams(window.location.search).get('sessao') || null;
} catch(e) {}

// === Estado ===
var selectedSlots = new Set();
var isDragging    = false;
var dragMode      = 'select';
var currentUser   = null;

// === Autenticação Google ===

firebase.auth().onAuthStateChanged(function(user) {
  if (user) {
    currentUser = user;
    showAppContent(user);
  } else {
    showAuthOverlay();
  }
});

document.getElementById('google-signin-btn').addEventListener('click', function() {
  var btn = document.getElementById('google-signin-btn');
  btn.classList.add('loading');
  btn.textContent = 'Aguarde...';
  document.getElementById('auth-error').classList.remove('show');

  var provider = new firebase.auth.GoogleAuthProvider();
  firebase.auth().signInWithPopup(provider)
    .catch(function(err) {
      if (err.code !== 'auth/popup-closed-by-user' &&
          err.code !== 'auth/cancelled-popup-request') {
        var authError = document.getElementById('auth-error');
        authError.textContent = 'Erro ao fazer login. Tente novamente.';
        authError.classList.add('show');
      }
      resetGoogleBtn();
    });
});

document.getElementById('signout-btn').addEventListener('click', function() {
  firebase.auth().signOut();
});

function animateCards(container) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var cards = (container || document).querySelectorAll('.card');
  cards.forEach(function(card, i) {
    card.style.animation = 'none';
    void card.offsetWidth;
    card.style.animation = 'cardEnter 0.38s cubic-bezier(0.22, 0.68, 0, 1.15) ' + (280 + i * 65) + 'ms both';
  });
}

function showAppContent(user) {
  document.getElementById('auth-overlay').style.display = 'none';
  document.getElementById('app-content').classList.add('visible');
  animateCards(document.getElementById('form-section'));

  // Avatar e nome no cabeçalho
  var avatarEl = document.getElementById('auth-avatar');
  var nameEl   = document.getElementById('auth-display-name');
  if (user.photoURL) {
    avatarEl.src = user.photoURL;
    avatarEl.alt = user.displayName || '';
    avatarEl.style.display = 'block';
  }
  nameEl.textContent = user.displayName || user.email;

  // Sem sessão: mostra aviso e oculta o formulário
  if (!SESSION_ID) {
    document.getElementById('no-session-card').style.display = 'block';
    document.getElementById('form-section').style.display = 'none';
    return;
  }

  // Pré-preenche nome
  var nameInput = document.getElementById('name-input');
  var savedName = '';
  try { savedName = localStorage.getItem('avail_name') || ''; } catch(e) {}
  nameInput.value = savedName || user.displayName || '';

  var emailDisplay = document.getElementById('email-display');
  if (emailDisplay) emailDisplay.value = user.email;

  loadSessionInfo();
  buildGrid();
  updateSelectedCount();
  loadPreviousSelection(user);
  listenForConfirmedSlot();
  loadRespondents();
}

function showAuthOverlay() {
  document.getElementById('auth-overlay').style.display = 'flex';
  document.getElementById('app-content').classList.remove('visible');
  currentUser = null;
}

function resetGoogleBtn() {
  var btn = document.getElementById('google-signin-btn');
  btn.classList.remove('loading');
  btn.innerHTML =
    '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">' +
      '<path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>' +
      '<path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>' +
      '<path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>' +
      '<path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>' +
    '</svg>' +
    'Entrar com o Google';
}

// === Carrega título da sessão ===
function loadSessionInfo() {
  db.collection('sessions').doc(SESSION_ID).get().then(function(doc) {
    if (!doc.exists) return;
    var title = doc.data().title || '';
    if (!title) return;
    document.getElementById('page-title').textContent = title;
    document.getElementById('page-subtitle').textContent = 'Marque os horários em que você está disponível';
    document.title = title + ' — Disponibilidade';
  }).catch(function() {});
}

// === Listener: horário confirmado (no doc da sessão) ===
function listenForConfirmedSlot() {
  if (!SESSION_ID) return function(){};
  return db.collection('sessions').doc(SESSION_ID).onSnapshot(function(doc) {
    var banner = document.getElementById('confirmed-banner');
    var text   = document.getElementById('confirmed-slot-text');
    if (doc.exists && doc.data().confirmed) {
      var c = doc.data().confirmed;
      text.textContent = (DAY_LABELS_FULL_P[c.day] || c.day) + ', ' + c.time;
      banner.style.display = 'block';
    } else {
      banner.style.display = 'none';
    }
  }, function() {});
}

// === Listener: quem já respondeu (subcoleção da sessão) ===
function loadRespondents() {
  if (!SESSION_ID) return function(){};
  return db.collection('sessions').doc(SESSION_ID)
    .collection('responses').onSnapshot(function(snapshot) {
      var respondents = snapshot.docs
        .map(function(doc) { return doc.data(); })
        .filter(function(d) { return d.name; })
        .sort(function(a, b) { return a.name.localeCompare(b.name, 'pt-BR'); });

      var section = document.getElementById('respondents-section');
      var listEl  = document.getElementById('respondents-list');
      if (respondents.length === 0) { section.style.display = 'none'; return; }

      section.style.display = 'block';
      listEl.innerHTML = '';
      respondents.forEach(function(r) {
        var chip = document.createElement('div');
        chip.className   = 'participant-chip';
        chip.textContent = r.name;
        listEl.appendChild(chip);
      });
    }, function() {});
}

// === Carrega seleção anterior (pelo e-mail como doc ID) ===
async function loadPreviousSelection(user) {
  if (!SESSION_ID) return;
  try {
    var doc = await db.collection('sessions').doc(SESSION_ID)
      .collection('responses').doc(user.email).get();
    if (doc.exists) {
      var data = doc.data();
      if (data.slots && data.slots.length > 0) {
        data.slots.forEach(function(slotId) {
          selectedSlots.add(slotId);
          var el = document.querySelector('[data-slot="' + CSS.escape(slotId) + '"]');
          if (el) { el.classList.add('selected'); el.setAttribute('aria-checked', 'true'); }
        });
        updateSelectedCount();
        if (data.name) {
          var nameInput = document.getElementById('name-input');
          try {
            var savedName = localStorage.getItem('avail_name') || '';
            if (!savedName) nameInput.value = data.name;
          } catch(e) {}
        }
      }
    }
  } catch(err) {
    console.error('Erro ao carregar seleção:', err);
  }
}

// === Referências ao DOM ===
var saveBtn         = document.getElementById('save-btn');
var clearBtn        = document.getElementById('clear-btn');
var messageEl       = document.getElementById('message');
var selectedCountEl = document.getElementById('selected-count');

// === Construção da grade ===
function buildGrid() {
  var gridHead  = document.getElementById('grid-head');
  var gridBody  = document.getElementById('grid-body');
  var gridTable = document.getElementById('grid-table');

  gridHead.innerHTML = '';
  gridBody.innerHTML = '';

  var headerRow = document.createElement('tr');
  var emptyTh   = document.createElement('th');
  headerRow.appendChild(emptyTh);
  DAYS.forEach(function(day) {
    var th = document.createElement('th');
    th.textContent = DAY_LABELS[day];
    headerRow.appendChild(th);
  });
  gridHead.appendChild(headerRow);

  appendSectionRow('Manhã', gridBody);
  MORNING_TIMES.forEach(function(t) { gridBody.appendChild(buildTimeRow(t)); });
  appendSectionRow('Tarde', gridBody);
  AFTERNOON_TIMES.forEach(function(t) { gridBody.appendChild(buildTimeRow(t)); });

  gridTable.addEventListener('mousedown', onMouseDown);
  gridTable.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', function() { isDragging = false; });
  gridTable.addEventListener('touchstart', onTouchStart, { passive: false });
  gridTable.addEventListener('touchmove', onTouchMove, { passive: false });
  document.addEventListener('touchend', function() { isDragging = false; });
}

function appendSectionRow(label, gridBody) {
  var tr = document.createElement('tr');
  tr.className = 'section-row';
  var td = document.createElement('td');
  td.colSpan = DAYS.length + 1;
  td.textContent = label;
  tr.appendChild(td);
  gridBody.appendChild(tr);
}

function buildTimeRow(time) {
  var tr = document.createElement('tr');
  var timeTd = document.createElement('td');
  timeTd.className   = 'time-label';
  timeTd.textContent = time;
  tr.appendChild(timeTd);
  DAYS.forEach(function(day) {
    var td    = document.createElement('td');
    td.className = 'slot-cell';
    var inner = document.createElement('div');
    inner.className    = 'slot-cell-inner';
    inner.dataset.slot = day + '_' + time;
    inner.setAttribute('tabindex', '0');
    inner.setAttribute('role', 'checkbox');
    inner.setAttribute('aria-checked', 'false');
    inner.setAttribute('aria-label', DAY_LABELS[day] + ' às ' + time);
    inner.addEventListener('keydown', function(e) {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        applyToggle(inner.dataset.slot);
      }
    });
    td.appendChild(inner);
    tr.appendChild(td);
  });
  return tr;
}

// === Interação: clique e arrastar ===
function onMouseDown(e) {
  var cell = e.target.closest('[data-slot]');
  if (!cell) return;
  isDragging = true;
  dragMode   = selectedSlots.has(cell.dataset.slot) ? 'deselect' : 'select';
  applyToggle(cell.dataset.slot);
  e.preventDefault();
}

function onMouseMove(e) {
  if (!isDragging) return;
  var cell = e.target.closest('[data-slot]');
  if (!cell) return;
  var has = selectedSlots.has(cell.dataset.slot);
  if (dragMode === 'select'   && !has) applyToggle(cell.dataset.slot);
  if (dragMode === 'deselect' &&  has) applyToggle(cell.dataset.slot);
}

function onTouchStart(e) {
  var touch = e.touches[0];
  var el    = document.elementFromPoint(touch.clientX, touch.clientY);
  var cell  = el && el.closest('[data-slot]');
  if (!cell) return;
  isDragging = true;
  dragMode   = selectedSlots.has(cell.dataset.slot) ? 'deselect' : 'select';
  applyToggle(cell.dataset.slot);
  e.preventDefault();
}

function onTouchMove(e) {
  if (!isDragging) return;
  var touch = e.touches[0];
  var el    = document.elementFromPoint(touch.clientX, touch.clientY);
  var cell  = el && el.closest('[data-slot]');
  if (!cell) return;
  var has = selectedSlots.has(cell.dataset.slot);
  if (dragMode === 'select'   && !has) applyToggle(cell.dataset.slot);
  if (dragMode === 'deselect' &&  has) applyToggle(cell.dataset.slot);
  e.preventDefault();
}

function applyToggle(slotId) {
  if (selectedSlots.has(slotId)) {
    selectedSlots.delete(slotId);
  } else {
    selectedSlots.add(slotId);
  }
  var isSelected = selectedSlots.has(slotId);
  var el = document.querySelector('[data-slot="' + CSS.escape(slotId) + '"]');
  if (el) {
    el.classList.toggle('selected', isSelected);
    el.setAttribute('aria-checked', isSelected ? 'true' : 'false');
  }
  updateSelectedCount();
}

function updateSelectedCount() {
  var n = selectedSlots.size;
  selectedCountEl.textContent = n === 0
    ? 'Nenhum horário selecionado.'
    : n + ' horário' + (n !== 1 ? 's' : '') + ' selecionado' + (n !== 1 ? 's' : '') + '.';
}

// === Limpar seleção ===
clearBtn.addEventListener('click', function() {
  selectedSlots.forEach(function(slotId) {
    var el = document.querySelector('[data-slot="' + CSS.escape(slotId) + '"]');
    if (el) el.classList.remove('selected');
  });
  selectedSlots.clear();
  updateSelectedCount();
});

// === Salvar no Firestore (subcoleção da sessão) ===
saveBtn.addEventListener('click', saveAvailability);

async function saveAvailability() {
  if (!currentUser) {
    showMessage('Faça login antes de salvar.', 'error');
    return;
  }

  if (!SESSION_ID) {
    showMessage('Nenhuma sessão ativa. Acesse pelo link fornecido pelo organizador.', 'error');
    return;
  }

  var nameInput = document.getElementById('name-input');
  var name = nameInput.value.trim();

  if (!name) {
    showMessage('Por favor, informe seu nome antes de salvar.', 'error');
    nameInput.focus();
    return;
  }

  if (selectedSlots.size === 0) {
    showMessage('Selecione ao menos um horário antes de salvar.', 'error');
    return;
  }

  saveBtn.disabled = true;
  saveBtn.innerHTML = '<span class="spinner"></span> Salvando...';
  hideMessage();

  try {
    var email     = currentUser.email;
    var nameLower = name.toLowerCase();
    var slots     = Array.from(selectedSlots);
    var data      = {
      name:        name,
      nameLower:   nameLower,
      email:       email,
      slots:       slots,
      submittedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    // Usa e-mail como chave de deduplicação (doc ID)
    await db.collection('sessions').doc(SESSION_ID)
      .collection('responses').doc(email).set(data);

    try { localStorage.setItem('avail_name', name); } catch(e) {}
    showMessage('Disponibilidade registrada com sucesso!', 'success');

  } catch (err) {
    console.error('Erro ao salvar:', err);
    showMessage('Erro ao salvar. Verifique a conexão e tente novamente.', 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Salvar disponibilidade';
  }
}

function showMessage(text, type) {
  messageEl.textContent = text;
  messageEl.className   = 'message show message-' + type;
  if (type === 'success') {
    setTimeout(function() { messageEl.classList.remove('show'); }, 6000);
  }
}
function hideMessage() { messageEl.classList.remove('show'); }
