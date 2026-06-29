// ============================================================
// Autenticação via Google Sign-In (Firebase Auth)
//
// ⚠️ Adicione abaixo os e-mails das contas Google que podem
//    acessar o painel. Apenas esses e-mails serão autorizados.
//    Suficiente para uso interno — a lista fica no código fonte.
// ============================================================
var ADMIN_EMAILS = [
  'rafaelgrande@usp.br'
];

// === Constantes ===
var DAYS = ['segunda', 'terca', 'quarta', 'quinta', 'sexta'];

var DAY_LABELS = {
  'segunda': 'Segunda',
  'terca':   'Terça',
  'quarta':  'Quarta',
  'quinta':  'Quinta',
  'sexta':   'Sexta'
};

// Forma longa para a seção de recomendação
var DAY_LABELS_FULL = {
  'segunda': 'Segunda-feira',
  'terca':   'Terça-feira',
  'quarta':  'Quarta-feira',
  'quinta':  'Quinta-feira',
  'sexta':   'Sexta-feira'
};

var MORNING_TIMES   = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00'];
var AFTERNOON_TIMES = ['14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00'];
var ALL_TIMES       = MORNING_TIMES.concat(AFTERNOON_TIMES);

// === DOM ===
var authOverlay  = document.getElementById('auth-overlay');
var adminContent = document.getElementById('admin-content');
var googleBtn    = document.getElementById('google-signin-btn');
var authError    = document.getElementById('auth-error');
var signoutBtn   = document.getElementById('signout-btn');

// === Autenticação Google =====================================

// Monitora o estado de autenticação ao carregar a página.
// Se o usuário já estiver logado e autorizado, abre direto.
firebase.auth().onAuthStateChanged(function(user) {
  if (user && isAuthorized(user.email)) {
    showAdminPanel(user);
  } else if (user) {
    // Logado mas e-mail não autorizado
    firebase.auth().signOut();
    showAuthError('Conta não autorizada: ' + user.email);
  }
  // Se user === null: mantém a tela de login
});

// Botão "Continuar com o Google"
googleBtn.addEventListener('click', function() {
  googleBtn.classList.add('loading');
  googleBtn.textContent = 'Aguarde...';
  authError.classList.remove('show');

  var provider = new firebase.auth.GoogleAuthProvider();
  firebase.auth().signInWithPopup(provider)
    .then(function(result) {
      var email = result.user.email;
      if (isAuthorized(email)) {
        showAdminPanel(result.user);
      } else {
        firebase.auth().signOut();
        showAuthError(
          'A conta ' + email + ' não tem permissão de administrador.'
        );
        resetGoogleBtn();
      }
    })
    .catch(function(err) {
      // Popup fechado pelo usuário = não é erro real
      if (err.code !== 'auth/popup-closed-by-user' &&
          err.code !== 'auth/cancelled-popup-request') {
        showAuthError('Erro ao fazer login. Tente novamente.');
        console.error(err);
      }
      resetGoogleBtn();
    });
});

// Botão "Sair"
signoutBtn.addEventListener('click', function() {
  firebase.auth().signOut().then(function() {
    adminContent.classList.remove('visible');
    authOverlay.style.display = 'flex';
    resetGoogleBtn();
    authError.classList.remove('show');
    if (firestoreUnsubscribe) { firestoreUnsubscribe(); firestoreUnsubscribe = null; }
  });
});

function isAuthorized(email) {
  return ADMIN_EMAILS.map(function(e) { return e.toLowerCase(); })
    .indexOf((email || '').toLowerCase()) !== -1;
}

function showAdminPanel(user) {
  authOverlay.style.display = 'none';
  adminContent.classList.add('visible');

  // Exibe avatar e nome no cabeçalho
  var avatarEl = document.getElementById('auth-avatar');
  var nameEl   = document.getElementById('auth-display-name');
  if (user.photoURL) {
    avatarEl.src   = user.photoURL;
    avatarEl.alt   = user.displayName || user.email;
    avatarEl.style.display = 'block';
  }
  nameEl.textContent = user.displayName || user.email;

  initAdmin();
}

function showAuthError(msg) {
  authError.textContent = msg;
  authError.classList.add('show');
}

function resetGoogleBtn() {
  googleBtn.classList.remove('loading');
  googleBtn.innerHTML =
    '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">' +
      '<path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>' +
      '<path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>' +
      '<path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>' +
      '<path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>' +
    '</svg>' +
    'Continuar com o Google';
}

// === Estado global ===
var currentResponses    = [];
var firestoreUnsubscribe = null;

// === Inicialização do painel ===
function initAdmin() {
  // Evita múltiplas inscrições (ex: re-login sem reload)
  if (firestoreUnsubscribe) firestoreUnsubscribe();

  firestoreUnsubscribe = db.collection('availability').onSnapshot(function(snapshot) {
    currentResponses = snapshot.docs
      .map(function(doc) { return Object.assign({ id: doc.id }, doc.data()); })
      .sort(function(a, b) { return a.name.localeCompare(b.name, 'pt-BR'); });
    renderAll(currentResponses);
  }, function(err) { console.error('Erro:', err); });

  document.getElementById('copy-btn').addEventListener('click', copyRecommendation);
  document.getElementById('export-btn').addEventListener('click', exportCSV);
  document.getElementById('clear-all-btn').addEventListener('click', clearAll);
}

// === Renderização principal — ORDER matters: resposta primeiro ===
function renderAll(responses) {
  renderRecommendation(responses); // ① A resposta principal para o admin
  renderStats(responses);          // ② Quem respondeu
  renderParticipants(responses);
  renderAdminGrid(responses);      // ③ Detalhes completos
}

// ============================================================
// ① RECOMENDAÇÃO DE HORÁRIO
//    Responde: "Quando devemos marcar a reunião?"
//    Princípio: information first, progressive disclosure.
// ============================================================
function renderRecommendation(responses) {
  var cardEl     = document.getElementById('rec-card');
  var titleEl    = document.getElementById('rec-title');
  var subtitleEl = document.getElementById('rec-subtitle');
  var contentEl  = document.getElementById('rec-content');
  var total      = responses.length;

  // Reset card border
  cardEl.className = 'card rec-partial';

  // ─── Estado vazio ───────────────────────────────────────────
  if (total === 0) {
    titleEl.textContent    = 'Recomendação de Horário';
    subtitleEl.textContent = 'Aguardando respostas dos participantes.';
    contentEl.innerHTML    =
      '<div class="rec-empty hint">' +
        'Assim que os participantes enviarem suas disponibilidades, ' +
        'a melhor opção de horário aparecerá aqui.' +
      '</div>';
    return;
  }

  // ─── Dados ──────────────────────────────────────────────────
  var data     = getSlotData(responses);
  var maxCount = data.maxCount;
  var isAll    = (maxCount === total);

  if (maxCount === 0) {
    subtitleEl.textContent = total + ' participante(s) registrado(s), mas nenhum horário em comum.';
    contentEl.innerHTML    = '<p class="hint">Nenhuma disponibilidade registrada ainda.</p>';
    return;
  }

  // ─── Classificar slots com disponibilidade ──────────────────
  var ranked = [];
  DAYS.forEach(function(day) {
    ALL_TIMES.forEach(function(time) {
      var key   = day + '_' + time;
      var count = data.counts[key] || 0;
      if (count > 0) ranked.push({ day: day, time: time, count: count });
    });
  });
  ranked.sort(function(a, b) {
    if (b.count !== a.count) return b.count - a.count;
    var dd = DAYS.indexOf(a.day) - DAYS.indexOf(b.day);
    return dd !== 0 ? dd : ALL_TIMES.indexOf(a.time) - ALL_TIMES.indexOf(b.time);
  });

  // Mostrar apenas os slots empatados no 1º lugar, máximo 3
  var topCount  = ranked.filter(function(s) { return s.count === maxCount; }).length;
  var showCount = Math.min(topCount, 3);
  var topSlots  = ranked.slice(0, showCount);

  // ─── Título e subtítulo ─────────────────────────────────────
  if (isAll) {
    cardEl.className    = 'card rec-unanimous';
    titleEl.textContent = 'Horário Ideal';
    subtitleEl.innerHTML =
      '<strong>Todos os ' + total + ' participantes</strong> disponíveis nos horários abaixo.';
  } else {
    titleEl.textContent = 'Recomendação de Horário';
    subtitleEl.innerHTML =
      'Melhor opção: <strong>' + maxCount + ' de ' + total + '</strong> participantes disponíveis.';
  }

  // ─── Lista simplificada (dia, hora, contagem) ────────────────
  contentEl.innerHTML = '';
  var list = document.createElement('div');
  list.className = 'rec-list';

  topSlots.forEach(function(slot, i) {
    var isAllSlot = (slot.count === total);
    var el = document.createElement('div');
    el.className = 'rec-slot' + (isAllSlot ? ' rec-slot-top-all' : ' rec-slot-top');
    el.innerHTML =
      '<div class="rec-rank">' + (i + 1) + '</div>' +
      '<div class="rec-body">' +
        '<div class="rec-time">' + DAY_LABELS_FULL[slot.day] + ', ' + slot.time +
          (isAllSlot ? ' <span class="badge-all">Todos</span>' : '') +
        '</div>' +
      '</div>' +
      '<div class="rec-score">' +
        '<div class="rec-score-num">' + slot.count +
          '<span class="rec-score-den">/' + total + '</span>' +
        '</div>' +
      '</div>';
    list.appendChild(el);
  });
  contentEl.appendChild(list);

  var remaining = ranked.length - showCount;
  if (remaining > 0) {
    var moreP = document.createElement('p');
    moreP.className = 'hint';
    moreP.style.marginTop = '.5rem';
    moreP.textContent = '+ ' + remaining + ' opção(ões) na tabela abaixo.';
    contentEl.appendChild(moreP);
  }
}

// ============================================================
// ② ESTATÍSTICAS
// ============================================================
function renderStats(responses) {
  var total = responses.length;
  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-slots').textContent = DAYS.length * ALL_TIMES.length;

  if (total > 0) {
    var data = getSlotData(responses);
    var pct  = Math.round((data.maxCount / total) * 100);
    document.getElementById('stat-best').textContent = pct + '%';
  } else {
    document.getElementById('stat-best').textContent = '—';
  }
}

// ============================================================
// PARTICIPANTES
// ============================================================
function renderParticipants(responses) {
  var list = document.getElementById('participant-list');
  list.innerHTML = '';
  if (responses.length === 0) {
    list.innerHTML = '<p class="hint">Nenhuma resposta ainda.</p>';
    return;
  }
  responses.forEach(function(r) {
    var chip = document.createElement('div');
    chip.className   = 'participant-chip';
    chip.textContent = r.name;
    list.appendChild(chip);
  });
}

// ============================================================
// DADOS POR SLOT (helper compartilhado)
// ============================================================
function getSlotData(responses) {
  var counts      = {};
  var namesBySlot = {};

  DAYS.forEach(function(day) {
    ALL_TIMES.forEach(function(time) {
      var key = day + '_' + time;
      counts[key]      = 0;
      namesBySlot[key] = [];
    });
  });

  responses.forEach(function(r) {
    if (!r.slots) return;
    r.slots.forEach(function(slot) {
      if (counts[slot] !== undefined) {
        counts[slot]++;
        namesBySlot[slot].push(r.name);
      }
    });
  });

  var values   = Object.values(counts);
  var maxCount = values.length > 0 ? Math.max.apply(null, values) : 0;
  return { counts: counts, namesBySlot: namesBySlot, maxCount: maxCount };
}

// ============================================================
// ③ TABELA COMPLETA
// ============================================================
function renderAdminGrid(responses) {
  var head  = document.getElementById('admin-grid-head');
  var body  = document.getElementById('admin-grid-body');
  var total = responses.length;
  var data  = getSlotData(responses);

  // Cabeçalho
  head.innerHTML = '';
  var headerRow  = document.createElement('tr');
  var emptyTh    = document.createElement('th');
  headerRow.appendChild(emptyTh);
  DAYS.forEach(function(day) {
    var th = document.createElement('th');
    th.textContent = DAY_LABELS[day];
    headerRow.appendChild(th);
  });
  head.appendChild(headerRow);

  // Linhas
  body.innerHTML = '';

  function appendSection(label, times) {
    var sRow = document.createElement('tr');
    sRow.className = 'section-row';
    var td = document.createElement('td');
    td.colSpan     = DAYS.length + 1;
    td.textContent = label;
    sRow.appendChild(td);
    body.appendChild(sRow);

    times.forEach(function(time) {
      var tr     = document.createElement('tr');
      var timeTd = document.createElement('td');
      timeTd.className   = 'time-label';
      timeTd.textContent = time;
      tr.appendChild(timeTd);

      DAYS.forEach(function(day) {
        var key   = day + '_' + time;
        var count = data.counts[key] || 0;
        var names = data.namesBySlot[key] || [];

        var td    = document.createElement('td');
        td.className = 'admin-slot-cell';

        var inner    = document.createElement('div');
        inner.className = 'admin-slot-inner ' + getAvailClass(count, total);
        inner.innerHTML = total === 0
          ? '<span class="count">—</span>'
          : '<span class="count">' + count + '</span><span class="fraction">/' + total + '</span>';
        inner.title = names.length > 0
          ? 'Disponíveis: ' + names.join(', ')
          : 'Ninguém disponível';

        td.appendChild(inner);
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
  }

  appendSection('Manhã', MORNING_TIMES);
  appendSection('Tarde', AFTERNOON_TIMES);
  renderLegend();
}

function getAvailClass(count, total) {
  if (total === 0 || count === 0) return 'avail-none';
  var p = count / total;
  if (p >= 1.0)  return 'avail-all';
  if (p >= 0.75) return 'avail-high';
  if (p >= 0.5)  return 'avail-med';
  if (p >= 0.25) return 'avail-low';
  return 'avail-few';
}

function renderLegend() {
  var legend = document.getElementById('legend');
  legend.innerHTML = '';
  var items = [
    { bg: '#064E3B', label: 'Todos' },
    { bg: '#059669', label: '≥ 75%' },
    { bg: '#84CC16', label: '≥ 50%' },
    { bg: '#FDE68A', label: '≥ 25%' },
    { bg: '#FEF9C3', label: '< 25%' },
    { bg: '#F1F5F9', label: 'Nenhum' }
  ];
  items.forEach(function(item) {
    var div  = document.createElement('div');
    div.className = 'legend-item';
    var dot  = document.createElement('span');
    dot.className         = 'legend-dot';
    dot.style.background  = item.bg;
    var lbl  = document.createElement('span');
    lbl.textContent = item.label;
    div.appendChild(dot);
    div.appendChild(lbl);
    legend.appendChild(div);
  });
}

// ============================================================
// COPIAR RECOMENDAÇÃO
// ============================================================
function copyRecommendation() {
  if (currentResponses.length === 0) {
    alert('Nenhuma resposta para copiar.');
    return;
  }

  var data     = getSlotData(currentResponses);
  var total    = currentResponses.length;
  var allNames = currentResponses.map(function(r) { return r.name; });
  var maxCount = data.maxCount;
  var isAll    = (maxCount === total);

  var text = isAll
    ? '=== Horário Ideal — todos os ' + total + ' participantes disponíveis ===\n\n'
    : '=== Recomendação de Horário (' + maxCount + '/' + total + ' disponíveis) ===\n\n';

  // Top slots em ordem
  var ranked = [];
  DAYS.forEach(function(day) {
    ALL_TIMES.forEach(function(time) {
      var key   = day + '_' + time;
      var count = data.counts[key] || 0;
      if (count > 0) ranked.push({ day: day, time: time, count: count });
    });
  });
  ranked.sort(function(a, b) {
    if (b.count !== a.count) return b.count - a.count;
    var dd = DAYS.indexOf(a.day) - DAYS.indexOf(b.day);
    return dd !== 0 ? dd : ALL_TIMES.indexOf(a.time) - ALL_TIMES.indexOf(b.time);
  });

  var showCount = Math.min(Math.max(ranked.filter(function(s) { return s.count === maxCount; }).length, 3), 5);

  ranked.slice(0, showCount).forEach(function(slot, i) {
    var avail   = data.namesBySlot[slot.day + '_' + slot.time] || [];
    var unavail = allNames.filter(function(n) { return avail.indexOf(n) === -1; });
    var pct     = Math.round((slot.count / total) * 100);
    text += (i + 1) + '. ' + DAY_LABELS_FULL[slot.day] + ', ' + slot.time;
    text += ' (' + slot.count + '/' + total + ' — ' + pct + '%)\n';
    text += '   Disponíveis: ' + avail.join(', ') + '\n';
    if (unavail.length > 0) text += '   Ausentes: ' + unavail.join(', ') + '\n';
    text += '\n';
  });

  var finalText = text.trim();

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(finalText)
      .then(function() { alert('Recomendação copiada para a área de transferência!'); })
      .catch(function() { fallbackCopy(finalText); });
  } else {
    fallbackCopy(finalText);
  }
}

function fallbackCopy(text) {
  var ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;opacity:0;';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
  alert('Recomendação copiada!');
}

// ============================================================
// EXPORTAR CSV
// ============================================================
function exportCSV() {
  if (currentResponses.length === 0) {
    alert('Nenhuma resposta para exportar.');
    return;
  }

  var allSlots = [];
  DAYS.forEach(function(day) {
    ALL_TIMES.forEach(function(time) { allSlots.push(day + '_' + time); });
  });

  var headers = ['Nome', 'Data de envio'].concat(allSlots);
  var rows = currentResponses.map(function(r) {
    var date = '';
    if (r.submittedAt && r.submittedAt.seconds) {
      date = new Date(r.submittedAt.seconds * 1000).toLocaleString('pt-BR');
    }
    return [r.name, date].concat(
      allSlots.map(function(slot) { return (r.slots || []).indexOf(slot) !== -1 ? '1' : '0'; })
    );
  });

  var csv  = '﻿' + [headers].concat(rows)
    .map(function(row) {
      return row.map(function(c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(',');
    }).join('\n');

  var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement('a');
  a.href   = url;
  a.download = 'disponibilidade_' + new Date().toISOString().split('T')[0] + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============================================================
// LIMPAR TUDO
// ============================================================
async function clearAll() {
  if (!confirm('⚠️  Apagar TODAS as respostas?\n\nEsta ação não pode ser desfeita.')) return;
  try {
    var snapshot = await db.collection('availability').get();
    if (snapshot.empty) { alert('Não há respostas para apagar.'); return; }
    var batch = db.batch();
    snapshot.docs.forEach(function(doc) { batch.delete(doc.ref); });
    await batch.commit();
  } catch (err) {
    console.error('Erro:', err);
    alert('Erro ao limpar. Tente novamente.');
  }
}
