// === Constantes ===
var DAYS = ['segunda', 'terca', 'quarta', 'quinta', 'sexta'];

var DAY_LABELS = {
  'segunda': 'Segunda',
  'terca':   'Terça',
  'quarta':  'Quarta',
  'quinta':  'Quinta',
  'sexta':   'Sexta'
};

var MORNING_TIMES   = ['09:00', '09:30', '10:00', '10:30'];
var AFTERNOON_TIMES = ['15:00', '15:30', '16:00', '16:30'];
var ALL_TIMES       = MORNING_TIMES.concat(AFTERNOON_TIMES);

// === Estado ===
var selectedSlots = new Set();
var isDragging    = false;
var dragMode      = 'select';

// === Referências ao DOM ===
var nameInput       = document.getElementById('name-input');
var saveBtn         = document.getElementById('save-btn');
var clearBtn        = document.getElementById('clear-btn');
var messageEl       = document.getElementById('message');
var selectedCountEl = document.getElementById('selected-count');
var gridTable       = document.getElementById('grid-table');
var gridHead        = document.getElementById('grid-head');
var gridBody        = document.getElementById('grid-body');

// === Construção da grade ===
function buildGrid() {
  // Cabeçalho
  var headerRow = document.createElement('tr');
  var emptyTh = document.createElement('th');
  headerRow.appendChild(emptyTh);

  DAYS.forEach(function(day) {
    var th = document.createElement('th');
    th.textContent = DAY_LABELS[day];
    headerRow.appendChild(th);
  });
  gridHead.appendChild(headerRow);

  // Seção Manhã
  appendSectionRow('Manhã');
  MORNING_TIMES.forEach(function(t) { gridBody.appendChild(buildTimeRow(t)); });

  // Seção Tarde
  appendSectionRow('Tarde');
  AFTERNOON_TIMES.forEach(function(t) { gridBody.appendChild(buildTimeRow(t)); });
}

function appendSectionRow(label) {
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
  timeTd.className = 'time-label';
  timeTd.textContent = time;
  tr.appendChild(timeTd);

  DAYS.forEach(function(day) {
    var td = document.createElement('td');
    td.className = 'slot-cell';

    var inner = document.createElement('div');
    inner.className = 'slot-cell-inner';
    inner.dataset.slot = day + '_' + time;

    td.appendChild(inner);
    tr.appendChild(td);
  });

  return tr;
}

// === Interação: clique e arrastar ===
gridTable.addEventListener('mousedown', function(e) {
  var cell = e.target.closest('[data-slot]');
  if (!cell) return;
  isDragging = true;
  dragMode   = selectedSlots.has(cell.dataset.slot) ? 'deselect' : 'select';
  applyToggle(cell.dataset.slot);
  e.preventDefault(); // evita seleção de texto ao arrastar
});

gridTable.addEventListener('mousemove', function(e) {
  if (!isDragging) return;
  var cell = e.target.closest('[data-slot]');
  if (!cell) return;
  var has = selectedSlots.has(cell.dataset.slot);
  if (dragMode === 'select'   && !has) applyToggle(cell.dataset.slot);
  if (dragMode === 'deselect' &&  has) applyToggle(cell.dataset.slot);
});

document.addEventListener('mouseup', function() { isDragging = false; });

// Suporte a toque (mobile)
gridTable.addEventListener('touchstart', function(e) {
  var touch = e.touches[0];
  var el    = document.elementFromPoint(touch.clientX, touch.clientY);
  var cell  = el && el.closest('[data-slot]');
  if (!cell) return;
  isDragging = true;
  dragMode   = selectedSlots.has(cell.dataset.slot) ? 'deselect' : 'select';
  applyToggle(cell.dataset.slot);
  e.preventDefault();
}, { passive: false });

gridTable.addEventListener('touchmove', function(e) {
  if (!isDragging) return;
  var touch = e.touches[0];
  var el    = document.elementFromPoint(touch.clientX, touch.clientY);
  var cell  = el && el.closest('[data-slot]');
  if (!cell) return;
  var has = selectedSlots.has(cell.dataset.slot);
  if (dragMode === 'select'   && !has) applyToggle(cell.dataset.slot);
  if (dragMode === 'deselect' &&  has) applyToggle(cell.dataset.slot);
  e.preventDefault();
}, { passive: false });

document.addEventListener('touchend', function() { isDragging = false; });

function applyToggle(slotId) {
  if (selectedSlots.has(slotId)) {
    selectedSlots.delete(slotId);
  } else {
    selectedSlots.add(slotId);
  }
  var el = document.querySelector('[data-slot="' + CSS.escape(slotId) + '"]');
  if (el) el.classList.toggle('selected', selectedSlots.has(slotId));
  updateSelectedCount();
}

function updateSelectedCount() {
  var n = selectedSlots.size;
  if (n === 0) {
    selectedCountEl.textContent = 'Nenhum horário selecionado.';
  } else {
    selectedCountEl.textContent = n + ' horário' + (n !== 1 ? 's' : '') + ' selecionado' + (n !== 1 ? 's' : '') + '.';
  }
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

// === Salvar no Firestore ===
saveBtn.addEventListener('click', saveAvailability);

async function saveAvailability() {
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
    var nameLower = name.toLowerCase();
    var slots     = Array.from(selectedSlots);

    // Verifica se já existe resposta com esse nome
    var snapshot = await db.collection('availability')
      .where('nameLower', '==', nameLower)
      .get();

    if (!snapshot.empty) {
      // Atualiza registro existente
      await snapshot.docs[0].ref.update({
        name:        name,
        slots:       slots,
        submittedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    } else {
      // Cria novo registro
      await db.collection('availability').add({
        name:        name,
        nameLower:   nameLower,
        slots:       slots,
        submittedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }

    // Lembra o nome para a próxima visita
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

// === Inicialização ===
buildGrid();
updateSelectedCount();

// Pré-preenche o nome se o usuário já usou antes
try {
  var savedName = localStorage.getItem('avail_name');
  if (savedName) nameInput.value = savedName;
} catch(e) {}
