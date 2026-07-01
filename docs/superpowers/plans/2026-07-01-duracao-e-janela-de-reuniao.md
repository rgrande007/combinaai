# Duração e Janela de Horários por Reunião — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the organizer set a meeting duration and a custom day/time window when creating a session, and fix "Horário Ideal" to recommend continuous windows (all sub-slots covered by every counted participant) instead of isolated 30-minute points.

**Architecture:** Extract the pure scheduling math (time arithmetic, session-config resolution, slot counting, window computation) into a new dependency-free module `scheduling.js`, loaded as a plain `<script>` before `home.js` and `app.js` and also runnable under Node for unit tests. `home.js` (organizer panel) and `app.js` (participant grid) call into it instead of each re-implementing slot iteration over global constants.

**Tech Stack:** Vanilla JS (ES5-style, matches existing codebase), Firebase Firestore (compat SDK), no bundler. Tests via Node's built-in `node:test` + `node:assert/strict` (Node 24 available, zero new dependencies).

## Global Constraints

- No new npm dependencies (spec explicitly scopes this as a small vanilla-JS app; `node:test` covers unit-testing needs).
- `admin.js` / `admin.html` are dead code (redirect-only page) — **do not modify them**.
- No Firestore migration script; legacy sessions (missing `duration`/`days`/`startTime`/`endTime`) must render identically to current behavior via client-side fallback.
- `firestore.rules` needs no change — `allow create`/`allow update` on `sessions/{sessionId}` already has no field whitelist (verified: rule only checks `request.auth.token.email`).
- Spec source of truth: `docs/superpowers/specs/2026-07-01-duracao-e-janela-de-reuniao-design.md`.

---

## Design decisions not fully pinned down by the spec (resolved here)

- `generateTimesInRange(startTime, endTime)` produces every 30-min point `P` where `P + 30 <= endTime` (i.e., the last generated point is `endTime - 30`). This makes "does a duration-D window fit" fall out automatically from "are there `D/30` consecutive existing points" — no separate ceiling check needed. Verified against the validation rule `endTime - startTime >= duration` from the spec: a window exactly as long as the configured range always yields exactly one valid start point.
- `getSessionConfig()` returns an `isLegacyGrid` boolean (true when `startTime`/`endTime` are absent). Used to decide whether `renderAdminGrid`/`buildGrid` keep the existing "Manhã"/"Tarde" section split (legacy) or render a single unified section (custom range sessions have no natural lunch-gap split).
- Default duration on the create form: 60 minutes (1h). Default range: 09:00–17:00 (mirrors today's full window). Default days: all 5 weekdays checked.
- `confirmed` doc gains `startTime`/`durationMinutes`, dropping `time`. A shared `formatConfirmedLabel()` helper in `scheduling.js` reads either the new shape or a pre-existing legacy `{day, time}` doc so already-confirmed sessions don't break.

---

### Task 1: `scheduling.js` — time helpers

**Files:**
- Create: `scheduling.js`
- Create: `scheduling.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `SchedulingCore.timeToMinutes(hhmm) -> number`, `SchedulingCore.minutesToTime(mins) -> 'HH:MM'`, `SchedulingCore.generateTimesInRange(startTime, endTime) -> string[]`. Exposed as `module.exports` under Node, `window.SchedulingCore` in the browser.

- [ ] **Step 1: Add the test script to `package.json`**

```json
{
  "scripts": {
    "test": "node --test"
  },
  "dependencies": {
    "gsap": "^3.15.0"
  }
}
```

- [ ] **Step 2: Write the failing tests**

Create `scheduling.test.js`:

```js
var test = require('node:test');
var assert = require('node:assert/strict');
var SchedulingCore = require('./scheduling.js');

test('timeToMinutes converts HH:MM to minutes since midnight', function() {
  assert.equal(SchedulingCore.timeToMinutes('00:00'), 0);
  assert.equal(SchedulingCore.timeToMinutes('09:30'), 570);
  assert.equal(SchedulingCore.timeToMinutes('23:30'), 1410);
});

test('minutesToTime converts minutes since midnight to zero-padded HH:MM', function() {
  assert.equal(SchedulingCore.minutesToTime(0), '00:00');
  assert.equal(SchedulingCore.minutesToTime(570), '09:30');
  assert.equal(SchedulingCore.minutesToTime(1410), '23:30');
});

test('generateTimesInRange returns 30-min points that fully fit before endTime', function() {
  assert.deepEqual(
    SchedulingCore.generateTimesInRange('09:00', '12:00'),
    ['09:00','09:30','10:00','10:30','11:00','11:30']
  );
});

test('generateTimesInRange returns a single point when range equals one slot', function() {
  assert.deepEqual(SchedulingCore.generateTimesInRange('09:00', '09:30'), ['09:00']);
});

test('generateTimesInRange returns empty array when range is smaller than one slot', function() {
  assert.deepEqual(SchedulingCore.generateTimesInRange('09:00', '09:15'), []);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `node --test scheduling.test.js`
Expected: FAIL — `Cannot find module './scheduling.js'`

- [ ] **Step 4: Implement `scheduling.js`**

Create `scheduling.js`:

```js
// Núcleo de lógica pura de agendamento (sem DOM/Firebase).
// Compartilhado entre home.js e app.js, e testável em Node (node --test).
(function (root) {
  'use strict';

  function timeToMinutes(hhmm) {
    var parts = hhmm.split(':');
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  }

  function minutesToTime(mins) {
    var h = Math.floor(mins / 60);
    var m = mins % 60;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }

  // Pontos de início de bloco de 30min que cabem inteiramente dentro de
  // [startTime, endTime) — todo ponto P onde P + 30 <= endTime.
  function generateTimesInRange(startTime, endTime) {
    var times = [];
    var start = timeToMinutes(startTime);
    var end   = timeToMinutes(endTime);
    for (var m = start; m + 30 <= end; m += 30) {
      times.push(minutesToTime(m));
    }
    return times;
  }

  var api = {
    timeToMinutes: timeToMinutes,
    minutesToTime: minutesToTime,
    generateTimesInRange: generateTimesInRange
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.SchedulingCore = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test scheduling.test.js`
Expected: PASS (5/5)

- [ ] **Step 6: Commit**

```bash
git add scheduling.js scheduling.test.js package.json
git commit -m "feat: add scheduling.js time-math core with tests"
```

---

### Task 2: `scheduling.js` — `getSessionConfig`

**Files:**
- Modify: `scheduling.js`
- Modify: `scheduling.test.js`

**Interfaces:**
- Consumes: `timeToMinutes`, `minutesToTime`, `generateTimesInRange` from Task 1.
- Produces: `SchedulingCore.getSessionConfig(sessionData, defaultDays, legacyTimes) -> { duration, days, times, startTime, endTime, isLegacyGrid }`.

- [ ] **Step 1: Write the failing tests**

Append to `scheduling.test.js`:

```js
var DEFAULT_DAYS = ['segunda','terca','quarta','quinta','sexta'];
var LEGACY_TIMES = ['09:00','09:30','10:00','10:30','11:00','11:30','12:00','14:00','14:30','15:00','15:30','16:00','16:30','17:00'];

test('getSessionConfig falls back to legacy grid when fields are absent', function() {
  var cfg = SchedulingCore.getSessionConfig({}, DEFAULT_DAYS, LEGACY_TIMES);
  assert.equal(cfg.duration, 30);
  assert.deepEqual(cfg.days, DEFAULT_DAYS);
  assert.deepEqual(cfg.times, LEGACY_TIMES);
  assert.equal(cfg.isLegacyGrid, true);
});

test('getSessionConfig uses configured fields when present', function() {
  var cfg = SchedulingCore.getSessionConfig({
    duration: 60, days: ['terca','quinta'], startTime: '09:00', endTime: '11:00'
  }, DEFAULT_DAYS, LEGACY_TIMES);
  assert.equal(cfg.duration, 60);
  assert.deepEqual(cfg.days, ['terca','quinta']);
  assert.deepEqual(cfg.times, ['09:00','09:30','10:00','10:30']);
  assert.equal(cfg.isLegacyGrid, false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test scheduling.test.js`
Expected: FAIL — `SchedulingCore.getSessionConfig is not a function`

- [ ] **Step 3: Implement `getSessionConfig`**

In `scheduling.js`, add above the `var api = {` line:

```js
  // Resolve a configuração efetiva de uma sessão a partir dos dados crus do
  // Firestore, com fallback para sessões criadas antes desses campos existirem.
  function getSessionConfig(sessionData, defaultDays, legacyTimes) {
    sessionData = sessionData || {};
    var hasCustomRange = !!(sessionData.startTime && sessionData.endTime);
    return {
      duration:     sessionData.duration || 30,
      days:         (sessionData.days && sessionData.days.length) ? sessionData.days : defaultDays,
      times:        hasCustomRange ? generateTimesInRange(sessionData.startTime, sessionData.endTime) : legacyTimes,
      startTime:    sessionData.startTime || null,
      endTime:      sessionData.endTime || null,
      isLegacyGrid: !hasCustomRange
    };
  }
```

Update the `api` object to include `getSessionConfig: getSessionConfig,`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test scheduling.test.js`
Expected: PASS (7/7)

- [ ] **Step 5: Commit**

```bash
git add scheduling.js scheduling.test.js
git commit -m "feat: add getSessionConfig with legacy fallback"
```

---

### Task 3: `scheduling.js` — `getSlotData`, `computeIdealWindows`, `formatConfirmedLabel`

**Files:**
- Modify: `scheduling.js`
- Modify: `scheduling.test.js`

**Interfaces:**
- Consumes: `timeToMinutes`, `minutesToTime`, `getSessionConfig` output shape `{ days, times, duration }`.
- Produces:
  - `SchedulingCore.getSlotData(responses, config) -> { counts, namesBySlot, maxCount }` (same shape as the current per-file `getSlotData`, scoped to `config.days` × `config.times`).
  - `SchedulingCore.computeIdealWindows(responses, config) -> Array<{ day, startTime, endTime, durationMinutes, count, availNames }>`, sorted by count desc, then day order, then start-time order.
  - `SchedulingCore.formatConfirmedLabel(confirmed, dayLabelsFull) -> string` — reads either `{day, startTime, durationMinutes}` (new) or `{day, time}` (legacy) confirmed docs.

This is the task that fixes the reported bug: a window only counts a participant as available if **every** 30-minute sub-slot inside it is in `r.slots`, and windows whose sub-slots aren't clock-consecutive (e.g. spanning the legacy lunch gap 12:00→14:00) are discarded.

- [ ] **Step 1: Write the failing tests**

Append to `scheduling.test.js`:

```js
function mkResponse(name, slots) { return { name: name, slots: slots }; }

test('getSlotData counts only within config.days x config.times', function() {
  var cfg = { days: ['segunda'], times: ['09:00','09:30'], duration: 30 };
  var responses = [mkResponse('Ana', ['segunda_09:00', 'terca_09:00'])];
  var data = SchedulingCore.getSlotData(responses, cfg);
  assert.equal(data.counts['segunda_09:00'], 1);
  assert.equal(data.counts['terca_09:00'], undefined); // fora da config, não inicializado
  assert.equal(data.maxCount, 1);
});

test('computeIdealWindows only counts a participant when ALL sub-slots of the window are marked', function() {
  var cfg = { days: ['quarta'], times: ['11:00','11:30','12:00'], duration: 60 };
  var responses = [
    mkResponse('Ana',    ['quarta_11:00', 'quarta_11:30']),
    mkResponse('Beto',   ['quarta_11:00', 'quarta_11:30']),
    mkResponse('Carla',  ['quarta_11:00', 'quarta_11:30']),
    mkResponse('Duda',   ['quarta_11:00', 'quarta_11:30'])
  ];
  var windows = SchedulingCore.computeIdealWindows(responses, cfg);
  // Deve existir exatamente 1 janela de 100% (11:00-12:00), não 3 pontos isolados.
  var full = windows.filter(function(w) { return w.count === 4; });
  assert.equal(full.length, 1);
  assert.equal(full[0].day, 'quarta');
  assert.equal(full[0].startTime, '11:00');
  assert.equal(full[0].endTime, '12:00');
  assert.equal(full[0].durationMinutes, 60);
  assert.deepEqual(full[0].availNames.slice().sort(), ['Ana','Beto','Carla','Duda']);
});

test('computeIdealWindows drops a participant who only covers part of the window', function() {
  var cfg = { days: ['quarta'], times: ['11:00','11:30'], duration: 60 };
  var responses = [
    mkResponse('Ana',  ['quarta_11:00', 'quarta_11:30']),
    mkResponse('Beto', ['quarta_11:00']) // não marcou 11:30
  ];
  var windows = SchedulingCore.computeIdealWindows(responses, cfg);
  assert.equal(windows.length, 1);
  assert.equal(windows[0].count, 1);
  assert.deepEqual(windows[0].availNames, ['Ana']);
});

test('computeIdealWindows never spans the legacy lunch gap (12:00 -> 14:00)', function() {
  var LEGACY_TIMES = ['11:30','12:00','14:00','14:30'];
  var cfg = { days: ['quarta'], times: LEGACY_TIMES, duration: 60 };
  var responses = [mkResponse('Ana', ['quarta_12:00', 'quarta_14:00'])];
  var windows = SchedulingCore.computeIdealWindows(responses, cfg);
  var spansGap = windows.some(function(w) { return w.startTime === '12:00'; });
  assert.equal(spansGap, false);
});

test('computeIdealWindows ranks by count desc, then day order, then start time', function() {
  var cfg = { days: ['segunda','terca'], times: ['09:00','09:30'], duration: 30 };
  var responses = [
    mkResponse('Ana',  ['segunda_09:30', 'terca_09:00']),
    mkResponse('Beto', ['segunda_09:30'])
  ];
  var windows = SchedulingCore.computeIdealWindows(responses, cfg);
  assert.equal(windows[0].day, 'segunda');
  assert.equal(windows[0].startTime, '09:30');
  assert.equal(windows[0].count, 2);
});

test('formatConfirmedLabel renders a range for new-format confirmed docs', function() {
  var label = SchedulingCore.formatConfirmedLabel(
    { day: 'quarta', startTime: '11:00', durationMinutes: 60 },
    { quarta: 'Quarta-feira' }
  );
  assert.equal(label, 'Quarta-feira, 11:00 – 12:00');
});

test('formatConfirmedLabel renders a point for legacy confirmed docs', function() {
  var label = SchedulingCore.formatConfirmedLabel(
    { day: 'quarta', time: '11:00' },
    { quarta: 'Quarta-feira' }
  );
  assert.equal(label, 'Quarta-feira, 11:00');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test scheduling.test.js`
Expected: FAIL — `SchedulingCore.getSlotData is not a function`

- [ ] **Step 3: Implement `getSlotData`, `computeIdealWindows`, `formatConfirmedLabel`**

In `scheduling.js`, add above the `var api = {` line:

```js
  function getSlotData(responses, config) {
    var counts = {}, namesBySlot = {};
    config.days.forEach(function(day) {
      config.times.forEach(function(time) {
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
    var values = Object.keys(counts).map(function(k) { return counts[k]; });
    return { counts: counts, namesBySlot: namesBySlot, maxCount: values.length ? Math.max.apply(null, values) : 0 };
  }

  // Janelas candidatas (início + duração completa), contando um participante
  // como disponível só se TODOS os sub-slots de 30min da janela estiverem em
  // r.slots. Descarta janelas cujos sub-slots não sejam consecutivos em
  // relógio (ex.: atravessariam o intervalo de almoço na grade legada).
  function computeIdealWindows(responses, config) {
    var slotCount = config.duration / 30;
    var windows = [];

    config.days.forEach(function(day) {
      for (var i = 0; i + slotCount <= config.times.length; i++) {
        var windowTimes = config.times.slice(i, i + slotCount);

        var consecutive = true;
        for (var j = 1; j < windowTimes.length; j++) {
          if (timeToMinutes(windowTimes[j]) !== timeToMinutes(windowTimes[j - 1]) + 30) {
            consecutive = false;
            break;
          }
        }
        if (!consecutive) continue;

        var availNames = responses.filter(function(r) {
          if (!r.slots) return false;
          return windowTimes.every(function(t) { return r.slots.indexOf(day + '_' + t) !== -1; });
        }).map(function(r) { return r.name; });

        if (availNames.length === 0) continue;

        windows.push({
          day: day,
          startTime: windowTimes[0],
          endTime: minutesToTime(timeToMinutes(windowTimes[0]) + config.duration),
          durationMinutes: config.duration,
          count: availNames.length,
          availNames: availNames
        });
      }
    });

    windows.sort(function(a, b) {
      if (b.count !== a.count) return b.count - a.count;
      var dd = config.days.indexOf(a.day) - config.days.indexOf(b.day);
      if (dd !== 0) return dd;
      return timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
    });

    return windows;
  }

  function formatConfirmedLabel(confirmed, dayLabelsFull) {
    var dayLabel = dayLabelsFull[confirmed.day] || confirmed.day;
    var start = confirmed.startTime || confirmed.time;
    if (confirmed.durationMinutes) {
      var end = minutesToTime(timeToMinutes(start) + confirmed.durationMinutes);
      return dayLabel + ', ' + start + ' – ' + end;
    }
    return dayLabel + ', ' + start;
  }
```

Update the `api` object:

```js
  var api = {
    timeToMinutes: timeToMinutes,
    minutesToTime: minutesToTime,
    generateTimesInRange: generateTimesInRange,
    getSessionConfig: getSessionConfig,
    getSlotData: getSlotData,
    computeIdealWindows: computeIdealWindows,
    formatConfirmedLabel: formatConfirmedLabel
  };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test scheduling.test.js`
Expected: PASS (13/13)

- [ ] **Step 5: Commit**

```bash
git add scheduling.js scheduling.test.js
git commit -m "feat: add computeIdealWindows — recommend continuous windows, not isolated 30min points"
```

---

### Task 4: Wire `scheduling.js` into both pages

**Files:**
- Modify: `index.html:1757-1763`
- Modify: `app.html:305-311`

**Interfaces:**
- Consumes: `window.SchedulingCore` (global, set by Task 1's browser branch).

- [ ] **Step 1: Add the script tag to `index.html`**

Before `<script defer src="home.js"></script>` (currently line 1763):

```html
  <script defer src="scheduling.js"></script>
  <script defer src="home.js"></script>
```

- [ ] **Step 2: Add the script tag to `app.html`**

Before `<script defer src="app.js"></script>` (currently line 311):

```html
  <script defer src="scheduling.js"></script>
  <script defer src="app.js"></script>
```

- [ ] **Step 3: Verify no console errors on load**

Run a static file server and open both pages (Firebase calls will fail without real config context in a bare static server, but we're only checking `scheduling.js` parses and attaches `window.SchedulingCore` before `home.js`/`app.js` run):

```bash
npx --yes http-server . -p 8080 -c-1
```

Open `http://localhost:8080/index.html` and `http://localhost:8080/app.html` in a browser, open DevTools console. Expected: no "SchedulingCore is not defined" or syntax errors (Firebase auth/network errors are expected and unrelated — stop the server after checking, this step is only validating script load order).

- [ ] **Step 4: Commit**

```bash
git add index.html app.html
git commit -m "chore: load scheduling.js before home.js and app.js"
```

---

### Task 5: Create-session form UI — duration, days, time range

**Files:**
- Modify: `index.html:1109-1163` (CSS block)
- Modify: `index.html:1549-1562` (form markup)

**Interfaces:**
- Produces DOM elements consumed by Task 6: `#session-duration-input` (select), `#session-days-input` (fieldset containing `input[type=checkbox][value=<day>]`), `#session-start-input` / `#session-end-input` (selects, populated by JS in Task 6), `#session-options-error` (error message paragraph).

- [ ] **Step 1: Replace the `.csh-form` CSS block**

Replace lines 1109-1163 (from `.csh-form {` through the closing `@media` block) with:

```css
  .csh-form { display: flex; flex-direction: column; gap: .7rem; position: relative; z-index: 1; }
  .csh-form-row { display: flex; gap: .55rem; align-items: center; }
  .csh-input {
    flex: 1;
    background: rgba(255,255,255,.18);
    border: 1.5px solid rgba(255,255,255,.28);
    border-radius: var(--radius-sm);
    padding: .68rem 1rem;
    font-size: .9rem;
    color: #fff;
    font-family: var(--font-body, 'Inter', sans-serif);
    outline: none;
    transition: background .18s, border-color .18s;
    min-width: 0;
    backdrop-filter: blur(4px);
  }
  .csh-input::placeholder { color: rgba(255,255,255,.52); }
  .csh-input:focus {
    background: rgba(255,255,255,.26);
    border-color: rgba(255,255,255,.6);
  }
  select.csh-input { flex: none; cursor: pointer; padding: .55rem .7rem; }
  .csh-btn {
    display: inline-flex; align-items: center; gap: .4rem;
    padding: .68rem 1.15rem;
    border-radius: var(--radius-sm);
    background: #fff;
    color: #0A6B5C;
    font-family: var(--font-display);
    font-size: .85rem;
    font-weight: 800;
    border: none;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    box-shadow: 0 2px 10px rgba(0,0,0,.18);
    transition: transform .14s, box-shadow .14s;
  }
  .csh-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 18px rgba(0,0,0,.26); }
  .csh-btn:active { transform: scale(.97); box-shadow: 0 1px 6px rgba(0,0,0,.15); }
  .csh-btn:disabled { opacity: .55; pointer-events: none; }
  .csh-btn .spinner,
  .csh-spinner {
    border-color: rgba(10,107,92,.18) !important;
    border-top-color: #0A6B5C !important;
  }
  .csh-options { display: flex; flex-wrap: wrap; gap: .7rem 1rem; align-items: flex-end; }
  .csh-field { display: flex; flex-direction: column; gap: .3rem; }
  .csh-field-label {
    font-size: .68rem; font-weight: 700; text-transform: uppercase;
    letter-spacing: .04em; color: rgba(255,255,255,.72);
  }
  .csh-days { display: flex; gap: .4rem; border: none; margin: 0; padding: 0; }
  .csh-days legend { font-size: .68rem; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: rgba(255,255,255,.72); padding: 0 0 .3rem; }
  .csh-day-chk {
    display: inline-flex; align-items: center; gap: .3rem;
    font-size: .78rem; color: #fff;
    background: rgba(255,255,255,.14);
    border: 1px solid rgba(255,255,255,.24);
    border-radius: var(--radius-sm);
    padding: .4rem .6rem;
    cursor: pointer;
  }
  .csh-options-error {
    font-size: .78rem; color: #FFD9D9;
    background: rgba(220,38,38,.28);
    border: 1px solid rgba(255,255,255,.25);
    border-radius: var(--radius-sm);
    padding: .5rem .75rem;
    margin: 0;
  }
  @media (max-width: 520px) {
    .csh-form-row { flex-direction: column; }
    .csh-btn { width: 100%; justify-content: center; }
  }
```

- [ ] **Step 2: Replace the form markup**

Replace lines 1549-1562 (the `.csh-form` div) with:

```html
          <div class="csh-form" role="form" aria-label="Criar nova sessão">
            <div class="csh-form-row">
              <input type="text" id="session-title-input" class="csh-input"
                     placeholder="Ex: Reunião de alinhamento Q3"
                     maxlength="100" autocomplete="off"
                     aria-label="Nome da nova reunião" />
            </div>

            <div class="csh-options">
              <label class="csh-field">
                <span class="csh-field-label">Duração</span>
                <select id="session-duration-input" class="csh-input" aria-label="Duração da reunião">
                  <option value="30">30 minutos</option>
                  <option value="60" selected>1 hora</option>
                  <option value="90">1h30</option>
                  <option value="120">2 horas</option>
                </select>
              </label>

              <fieldset class="csh-days" id="session-days-input" aria-label="Dias considerados">
                <legend>Dias</legend>
                <label class="csh-day-chk"><input type="checkbox" value="segunda" checked> Seg</label>
                <label class="csh-day-chk"><input type="checkbox" value="terca" checked> Ter</label>
                <label class="csh-day-chk"><input type="checkbox" value="quarta" checked> Qua</label>
                <label class="csh-day-chk"><input type="checkbox" value="quinta" checked> Qui</label>
                <label class="csh-day-chk"><input type="checkbox" value="sexta" checked> Sex</label>
              </fieldset>

              <label class="csh-field">
                <span class="csh-field-label">Início</span>
                <select id="session-start-input" class="csh-input" aria-label="Horário de início"></select>
              </label>
              <label class="csh-field">
                <span class="csh-field-label">Fim</span>
                <select id="session-end-input" class="csh-input" aria-label="Horário de fim"></select>
              </label>
            </div>

            <p class="csh-options-error" id="session-options-error" role="alert" style="display:none;"></p>

            <div class="csh-form-row">
              <button class="csh-btn" id="create-session-btn"
                      aria-label="Criar sessão e gerar link de convite">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Criar sessão
              </button>
            </div>
          </div>
```

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(ui): add duration/days/time-range controls to the create-session form"
```

---

### Task 6: `home.js` — save duration/days/range on session creation

**Files:**
- Modify: `home.js:1-11` (constants)
- Modify: `home.js:325-352` (`createSession`)

**Interfaces:**
- Consumes: `SchedulingCore.minutesToTime`, `#session-duration-input`, `#session-days-input`, `#session-start-input`, `#session-end-input`, `#session-options-error` (Task 5).
- Produces: `populateTimeRangeSelects()` (called once at module load), session docs with `duration`/`days`/`startTime`/`endTime` fields.

- [ ] **Step 1: Populate the start/end `<select>` options**

At the end of the "Constantes" block in `home.js` (after line 11, `var ALL_TIMES = ...`), add:

```js
function populateTimeRangeSelects() {
  var startSel = document.getElementById('session-start-input');
  var endSel   = document.getElementById('session-end-input');
  if (!startSel || !endSel) return;
  var options = '';
  for (var m = 7 * 60; m <= 20 * 60; m += 30) {
    var t = SchedulingCore.minutesToTime(m);
    options += '<option value="' + t + '">' + t + '</option>';
  }
  startSel.innerHTML = options;
  endSel.innerHTML   = options;
  startSel.value = '09:00';
  endSel.value   = '17:00';
}
populateTimeRangeSelects();
```

- [ ] **Step 2: Update `createSession()` to read, validate, and save the new fields**

Replace the body of `createSession()` (`home.js:325-352`):

```js
async function createSession() {
  var titleInput = document.getElementById('session-title-input');
  var title = titleInput.value.trim();
  if (!title) { titleInput.focus(); return; }

  var errorEl = document.getElementById('session-options-error');
  errorEl.style.display = 'none';

  var duration  = parseInt(document.getElementById('session-duration-input').value, 10);
  var startTime = document.getElementById('session-start-input').value;
  var endTime   = document.getElementById('session-end-input').value;
  var days = Array.prototype.slice
    .call(document.querySelectorAll('#session-days-input input[type=checkbox]:checked'))
    .map(function(el) { return el.value; });

  if (days.length === 0) {
    errorEl.textContent = 'Selecione ao menos um dia da semana.';
    errorEl.style.display = 'block';
    return;
  }
  if ((SchedulingCore.timeToMinutes(endTime) - SchedulingCore.timeToMinutes(startTime)) < duration) {
    errorEl.textContent = 'A janela de horários é menor que a duração da reunião.';
    errorEl.style.display = 'block';
    return;
  }

  var btn = document.getElementById('create-session-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner csh-spinner"></span> Criando...';

  try {
    var sessionId  = generateSessionId();
    var adminEmail = firebase.auth().currentUser.email;
    await db.collection('sessions').doc(sessionId).set({
      title:     title,
      createdBy: adminEmail,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      duration:  duration,
      days:      days,
      startTime: startTime,
      endTime:   endTime
    });
    titleInput.value = '';
    selectSession(sessionId, title);
  } catch(err) {
    console.error('Erro ao criar sessão:', err);
    showToast('Erro ao criar sessão. Tente novamente.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg> Criar sessão';
  }
}
```

- [ ] **Step 3: Manual check**

Open `index.html` (served, logged in as the Google admin), fill the title, leave defaults, click "Criar sessão". In the Firebase console (or via `db.collection('sessions').doc(id).get()` in the browser console) confirm the new doc has `duration: 60, days: [...5 items], startTime: '09:00', endTime: '17:00'`. Then try unchecking all days and submitting — expect the inline error, no session created. Then set end time before start time (e.g. start 09:00, end 09:00 with duration 60) — expect the inline error.

- [ ] **Step 4: Commit**

```bash
git add home.js
git commit -m "feat: save duration/days/time-range when creating a session"
```

---

### Task 7: `home.js` — session config plumbing, recommendation, stats, confirm

**Files:**
- Modify: `home.js:429-502` (`selectSession`)
- Modify: `home.js:872-996` (`renderRecommendation`, `renderStats`)
- Modify: `home.js:1148-1167` (`confirmSlot`)
- Modify: `home.js:222-225` (confirm-button click delegation)
- Modify: `home.js:483-496` (admin confirmed banner text)

**Interfaces:**
- Consumes: `SchedulingCore.getSessionConfig/getSlotData/computeIdealWindows/formatConfirmedLabel` (Tasks 2-3).
- Produces: module-level `currentSessionConfig` (read by Task 8's `renderAdminGrid`/`copyRecommendation`/`exportCSV`).

- [ ] **Step 1: Add `currentSessionConfig` state and resolve it in `selectSession`**

In the "Estado global" block (`home.js:13-19`), add:

```js
var currentSessionConfig   = SchedulingCore.getSessionConfig({}, DAYS, ALL_TIMES);
```

Change `function selectSession(sessionId, title) {` to `async function selectSession(sessionId, title) {` and, right after `currentResponses = []; renderAll([]);` (still before the `if (firestoreUnsubscribe) ...` line), add:

```js
  try {
    var seedDoc = await db.collection('sessions').doc(sessionId).get();
    currentSessionConfig = SchedulingCore.getSessionConfig(seedDoc.exists ? seedDoc.data() : {}, DAYS, ALL_TIMES);
  } catch(e) {
    currentSessionConfig = SchedulingCore.getSessionConfig({}, DAYS, ALL_TIMES);
  }
```

- [ ] **Step 2: Keep `currentSessionConfig` in sync via the session doc listener, and fix the summary/best-slot block**

Replace the `firestoreUnsubscribe` responses handler's summary block (`home.js:456-479`, the code between `renderAll(currentResponses);` and the closing `}, function(err) { console.error('Erro respostas:', err); });`) with:

```js
      renderAll(currentResponses);
      // Write compact summary for card preview (dot-notation to preserve other summary fields)
      var sd = SchedulingCore.getSlotData(currentResponses, currentSessionConfig);
      var slotsCompact = {};
      Object.keys(sd.counts).forEach(function(k) { if (sd.counts[k] > 0) slotsCompact[k] = sd.counts[k]; });
      var dotSumUpdate = {
        'summary.totalResponses': currentResponses.length,
        'summary.slots':          slotsCompact,
        'summary.updatedAt':      firebase.firestore.FieldValue.serverTimestamp()
      };
      if (sd.maxCount > 0) {
        var bestKey = null;
        currentSessionConfig.days.forEach(function(d) { currentSessionConfig.times.forEach(function(t) { var k = d+'_'+t; if (!bestKey || sd.counts[k] > sd.counts[bestKey]) bestKey = k; }); });
        if (bestKey) {
          var bp = bestKey.split('_');
          dotSumUpdate['summary.bestDay']   = bp[0];
          dotSumUpdate['summary.bestTime']  = bp[1];
          dotSumUpdate['summary.bestCount'] = sd.counts[bestKey];
        }
      } else {
        dotSumUpdate['summary.bestDay']   = firebase.firestore.FieldValue.delete();
        dotSumUpdate['summary.bestTime']  = firebase.firestore.FieldValue.delete();
        dotSumUpdate['summary.bestCount'] = firebase.firestore.FieldValue.delete();
      }
      db.collection('sessions').doc(sessionId).update(dotSumUpdate).catch(function(){});
    }, function(err) { console.error('Erro respostas:', err); });
```

- [ ] **Step 3: Update the session doc listener to refresh `currentSessionConfig` and render the confirmed banner with the range**

Replace the `sessionDocUnsubscribe` block (`home.js:482-496`):

```js
  if (sessionDocUnsubscribe) sessionDocUnsubscribe();
  sessionDocUnsubscribe = db.collection('sessions').doc(sessionId).onSnapshot(function(doc) {
    if (doc.exists) {
      currentSessionConfig = SchedulingCore.getSessionConfig(doc.data(), DAYS, ALL_TIMES);
      renderAll(currentResponses);
    }
    var banner = document.getElementById('confirmed-slot-admin');
    var text   = document.getElementById('confirmed-slot-admin-text');
    if (doc.exists && doc.data().confirmed) {
      var c = doc.data().confirmed;
      text.textContent = SchedulingCore.formatConfirmedLabel(c, DAY_LABELS_FULL);
      if (banner.style.display !== 'block') {
        banner.style.display = 'block';
        celebrateConfirmedSlot(banner);
      }
    } else {
      banner.style.display = 'none';
    }
  }, function(err) { console.error('Erro doc sessão:', err); });
```

- [ ] **Step 4: Rewrite `renderRecommendation` to use `computeIdealWindows`**

Replace `home.js:872-970` (the full `renderRecommendation` function):

```js
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
      '<div class="rec-empty hint">Assim que os participantes enviarem suas disponibilidades, a melhor opção de horário aparecerá aqui.</div>' +
      '<div class="rec-share-cta">' +
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>' +
        '<span>Ninguém respondeu ainda —</span>' +
        '<button class="rec-share-btn" id="rec-copy-link-btn">copiar link de convite</button>' +
      '</div>';
    var shareBtn = document.getElementById('rec-copy-link-btn');
    if (shareBtn) shareBtn.addEventListener('click', copyInviteLink);
    return;
  }

  var windows = SchedulingCore.computeIdealWindows(responses, currentSessionConfig);
  var maxCount = windows.length ? windows[0].count : 0;
  var isAll    = (maxCount === total);

  if (maxCount === 0) {
    subtitleEl.textContent = total + ' participante(s) registrado(s), mas nenhum horário em comum.';
    contentEl.innerHTML    = '<p class="hint">Nenhuma disponibilidade registrada ainda.</p>';
    return;
  }

  var topCount  = windows.filter(function(w) { return w.count === maxCount; }).length;
  var showCount = Math.min(topCount, 3);
  var topSlots  = windows.slice(0, showCount);

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
    var availNames  = slot.availNames;
    var absentNames = allNames.filter(function(n) { return availNames.indexOf(n) === -1; });
    var timeLabel   = slot.startTime + ' – ' + slot.endTime;
    var el = document.createElement('div');
    el.className = 'rec-slot' + (isAllSlot ? ' rec-slot-top-all' : ' rec-slot-top');
    el.innerHTML =
      '<div class="rec-rank">' + (i + 1) + '</div>' +
      '<div class="rec-body">' +
        '<div class="rec-time">' + DAY_LABELS_FULL[slot.day] + ', ' + timeLabel +
          (isAllSlot ? ' <span class="badge-all" title="Todos os ' + total + ' participantes estão disponíveis">Todos</span>' : '') +
        '</div>' +
        (availNames.length > 0 ? '<div class="rec-avail">✓ ' + availNames.map(escHtml).join(', ') + '</div>' : '') +
        (absentNames.length > 0 ? '<div class="rec-absent"><strong>Ausentes:</strong> ' + absentNames.map(escHtml).join(', ') + '</div>' : '') +
      '</div>' +
      '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:.3rem;flex-shrink:0;">' +
        '<div class="rec-score"><div class="rec-score-num">' + slot.count + '<span class="rec-score-den">/' + total + '</span></div></div>' +
        '<button class="btn btn-violet rec-confirm-btn" data-day="' + slot.day + '" data-start="' + escHtml(slot.startTime) + '" ' +
          'style="font-size:.8rem;padding:.45rem 1rem;white-space:nowrap;min-height:36px;" ' +
          'aria-label="Confirmar ' + escHtml(DAY_LABELS_FULL[slot.day]) + ' às ' + escHtml(timeLabel) + '">Confirmar</button>' +
      '</div>';
    list.appendChild(el);
  });
  contentEl.appendChild(list);

  var remaining = windows.length - showCount;
  if (remaining > 0) {
    var p = document.createElement('p');
    p.className = 'hint'; p.style.marginTop = '.5rem';
    p.textContent = remaining + ' outro' + (remaining > 1 ? 's' : '') + ' horário' + (remaining > 1 ? 's' : '') + ' disponíveis na tabela completa abaixo.';
    contentEl.appendChild(p);
  }
}
```

- [ ] **Step 5: Update `renderStats` to use windows**

Replace `home.js:972-996` (`renderStats`):

```js
function renderStats(responses) {
  var total = responses.length;
  animateCounter(document.getElementById('stat-total'), total);
  if (total === 0) {
    document.getElementById('stat-slots').textContent = '—';
    document.getElementById('stat-best').textContent  = '—';
    return;
  }
  var windows = SchedulingCore.computeIdealWindows(responses, currentSessionConfig);
  var unanimous = windows.filter(function(w) { return w.count === total; }).length;
  animateCounter(document.getElementById('stat-slots'), unanimous);
  if (windows.length > 0) {
    var best = windows[0];
    document.getElementById('stat-best').textContent = DAY_ABBR[best.day] + ' ' + best.startTime;
  } else {
    document.getElementById('stat-best').textContent = '—';
  }
}
```

- [ ] **Step 6: Update `confirmSlot` to the new signature and payload**

Replace `home.js:1148-1167` (`confirmSlot`):

```js
async function confirmSlot(day, startTime) {
  if (!currentSessionId) return;
  var endTime = SchedulingCore.minutesToTime(
    SchedulingCore.timeToMinutes(startTime) + currentSessionConfig.duration
  );
  var ok = await showConfirm({
    title: 'Confirmar este horário?',
    message: '<strong>' + escHtml(DAY_LABELS_FULL[day]) + ', ' + escHtml(startTime) + ' – ' + escHtml(endTime) + '</strong>' +
      '<br><span style="font-size:.85em;color:var(--text-muted)">Os participantes verão o horário confirmado na próxima vez que acessarem o link de convite.</span>',
    confirmText: 'Confirmar horário',
    cancelText: 'Cancelar',
    danger: false
  });
  if (!ok) return;
  db.collection('sessions').doc(currentSessionId).update({
    confirmed: {
      day: day,
      startTime: startTime,
      durationMinutes: currentSessionConfig.duration,
      confirmedAt: firebase.firestore.FieldValue.serverTimestamp()
    }
  }).then(function() {
    showToast('Horário confirmado! Participantes verão na próxima visita.', 'success', 5000);
  }).catch(function(err) {
    console.error('Erro ao confirmar:', err);
    showToast('Erro ao confirmar o horário. Tente novamente.', 'error');
  });
}
```

- [ ] **Step 7: Update the confirm-button click delegation**

In the click delegation block (`home.js:222-225`), change:

```js
    document.getElementById('admin-panel').addEventListener('click', function(e) {
      var btn = e.target.closest('.rec-confirm-btn');
      if (btn) confirmSlot(btn.dataset.day, btn.dataset.start);
    });
```

- [ ] **Step 8: Manual check**

With a session that has ≥1 response, open the admin panel and confirm: the "Horário Ideal" card shows a range (`"Quarta-feira, 11:00 – 12:00"`), the "Unânimes" stat only counts full-duration windows, "Melhor horário" shows a start time from `currentSessionConfig.days`, and clicking "Confirmar" writes a `confirmed` doc with `startTime`/`durationMinutes` (check via browser console `db.collection('sessions').doc(id).get().then(d=>console.log(d.data().confirmed))`).

- [ ] **Step 9: Commit**

```bash
git add home.js
git commit -m "fix: recommend continuous duration-aware windows instead of isolated 30min slots"
```

---

### Task 8: `home.js` — scope `renderAdminGrid`, `copyRecommendation`, `exportCSV`; remove old `getSlotData`

**Files:**
- Modify: `home.js:1027-1126` (`getSlotData` removal, `renderAdminGrid`)
- Modify: `home.js:1207-1246` (`copyRecommendation`)
- Modify: `home.js:1256-1278` (`exportCSV`)

**Interfaces:**
- Consumes: `currentSessionConfig` (Task 7), `SchedulingCore.getSlotData/computeIdealWindows`.

- [ ] **Step 1: Delete the local `getSlotData` function**

Delete `home.js:1027-1043` (the local `function getSlotData(responses) { ... }` block) entirely — all callers now use `SchedulingCore.getSlotData`.

- [ ] **Step 2: Scope `renderAdminGrid` to `currentSessionConfig`, with legacy Manhã/Tarde split preserved only for legacy sessions**

Replace `renderAdminGrid` (originally `home.js:1045-1118`, now shifted up 17 lines after Step 1's deletion — locate by function signature):

```js
function renderAdminGrid(responses) {
  var head = document.getElementById('admin-grid-head');
  var body = document.getElementById('admin-grid-body');
  var total = responses.length;
  var config = currentSessionConfig;
  var data  = SchedulingCore.getSlotData(responses, config);

  head.innerHTML = '';
  var headerRow = document.createElement('tr');
  var emptyTh = document.createElement('th');
  emptyTh.setAttribute('scope', 'col');
  headerRow.appendChild(emptyTh);
  config.days.forEach(function(day) {
    var th = document.createElement('th');
    th.textContent = DAY_LABELS[day];
    th.setAttribute('scope', 'col');
    headerRow.appendChild(th);
  });
  head.appendChild(headerRow);
  body.innerHTML = '';

  function appendSection(label, times) {
    if (label) {
      var sRow = document.createElement('tr'); sRow.className = 'section-row';
      var sTd = document.createElement('td'); sTd.colSpan = config.days.length + 1; sTd.textContent = label;
      sRow.appendChild(sTd); body.appendChild(sRow);
    }
    times.forEach(function(time) {
      var tr = document.createElement('tr');
      var timeTd = document.createElement('td'); timeTd.className = 'time-label'; timeTd.textContent = time;
      tr.appendChild(timeTd);
      config.days.forEach(function(day) {
        var key = day + '_' + time, count = data.counts[key] || 0, names = data.namesBySlot[key] || [];
        var td = document.createElement('td'); td.className = 'admin-slot-cell';
        var inner = document.createElement('div');
        inner.className = 'admin-slot-inner ' + getAvailClass(count, total);
        inner.innerHTML = total === 0 ? '<span class="count">—</span>'
          : '<span class="count">' + count + '</span><span class="fraction">/' + total + '</span>';
        inner.dataset.slotLabel = DAY_LABELS[day] + ' · ' + time;
        inner.dataset.names = JSON.stringify(names);

        inner.addEventListener('mouseenter', function() { showAdminTooltip(this); });
        inner.addEventListener('mouseleave', hideAdminTooltip);

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

  if (config.isLegacyGrid) {
    appendSection('Manhã', MORNING_TIMES);
    appendSection('Tarde', AFTERNOON_TIMES);
  } else {
    appendSection(null, config.times);
  }

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
```

(`getAvailClass` stays unchanged below it.)

- [ ] **Step 3: Rewrite `copyRecommendation` to use windows**

Replace `home.js:1207-1246` (`copyRecommendation`, through the closing of its `navigator.clipboard` branch):

```js
function copyRecommendation() {
  if (currentResponses.length === 0) { showToast('Nenhuma resposta para copiar.', 'info'); return; }
  var windows = SchedulingCore.computeIdealWindows(currentResponses, currentSessionConfig);
  var total = currentResponses.length;
  var allNames = currentResponses.map(function(r) { return r.name; });
  var maxCount = windows.length ? windows[0].count : 0, isAll = (maxCount === total);

  var text = isAll
    ? '=== Horário Ideal — todos os ' + total + ' participantes disponíveis ===\n\n'
    : '=== Recomendação de Horário (' + maxCount + '/' + total + ' disponíveis) ===\n\n';

  windows.slice(0, Math.min(5, windows.length)).forEach(function(slot, i) {
    var avail   = slot.availNames;
    var unavail = allNames.filter(function(n) { return avail.indexOf(n) === -1; });
    var pct     = Math.round((slot.count / total) * 100);
    text += (i + 1) + '. ' + DAY_LABELS_FULL[slot.day] + ', ' + slot.startTime + ' – ' + slot.endTime + ' (' + slot.count + '/' + total + ' — ' + pct + '%)\n';
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
```

- [ ] **Step 4: Scope `exportCSV` to `currentSessionConfig`**

In `exportCSV` (`home.js:1256-1278`), replace the `allSlots` line:

```js
  var allSlots = [];
  currentSessionConfig.days.forEach(function(day) { currentSessionConfig.times.forEach(function(time) { allSlots.push(day + '_' + time); }); });
```

- [ ] **Step 5: Manual check**

Run `node --test scheduling.test.js` again (sanity check nothing in `scheduling.js` broke). Then in the browser: open a session with responses, click "Copiar recomendação" and paste somewhere to confirm ranges appear (`"Quarta-feira, 11:00 – 12:00"`), click "Exportar CSV" and confirm the header row only contains the session's configured days/times, and confirm the full grid table below "Horário Ideal" still renders correctly for both a legacy-shaped session (Manhã/Tarde split) and a new custom-range session (single section).

- [ ] **Step 6: Commit**

```bash
git add home.js
git commit -m "refactor: scope admin grid, copy, and CSV export to the session's configured days/times"
```

---

### Task 9: `app.js` — participant grid respects session config

**Files:**
- Modify: `app.js:209-231` (`loadSessionInfo`)
- Modify: `app.js:233-259` (`listenForConfirmedSlot`)
- Modify: `app.js:350-418` (`buildGrid`, `buildTimeRow`)
- Modify: `app.js:135-180` (`showAppContent`, to await config before building the grid)

**Interfaces:**
- Consumes: `SchedulingCore.getSessionConfig/formatConfirmedLabel` (Tasks 2-3).
- Produces: module-level `currentSessionConfig`, read by `buildGrid`/`buildTimeRow`.

- [ ] **Step 1: Add `currentSessionConfig` state**

In the "Estado" block (`app.js:27-32`), add:

```js
var currentSessionConfig = SchedulingCore.getSessionConfig({}, DAYS, ALL_TIMES);
```

- [ ] **Step 2: Make `loadSessionInfo` resolve the config and return a promise; update the subtitle with duration**

Replace `loadSessionInfo` (`app.js:209-231`):

```js
function loadSessionInfo() {
  return db.collection('sessions').doc(SESSION_ID).get().then(function(doc) {
    if (!doc.exists) {
      document.getElementById('no-session-card').innerHTML =
        '<div style="text-align:center;padding:1.5rem 1rem;">' +
        '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color:var(--text-muted);margin-bottom:1rem;" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>' +
        '<div style="font-family:var(--font-display);font-weight:700;font-size:1.05rem;margin-bottom:.5rem;">Sessão não encontrada</div>' +
        '<p class="hint">Este link pode ter expirado ou a sessão foi encerrada.<br>Peça um novo link ao organizador.</p>' +
        '</div>';
      document.getElementById('no-session-card').style.display = 'block';
      document.getElementById('form-section').style.display = 'none';
      return;
    }
    var data = doc.data();
    currentSessionConfig = SchedulingCore.getSessionConfig(data, DAYS, ALL_TIMES);
    var title = data.title || '';
    if (!title) return;
    document.getElementById('page-title').textContent = title;
    var durationLabel = currentSessionConfig.duration >= 60
      ? (currentSessionConfig.duration / 60) + 'h' + (currentSessionConfig.duration % 60 ? (currentSessionConfig.duration % 60) : '')
      : currentSessionConfig.duration + 'min';
    document.getElementById('page-subtitle').textContent =
      'Marque os horários em que você está disponível (reunião de ' + durationLabel + ')';
    document.title = title + ' — Disponibilidade';
  }).catch(function() {
    showMessage('Erro ao carregar a sessão. Verifique sua conexão e recarregue a página.', 'error');
  });
}
```

- [ ] **Step 3: Await the config before building the grid in `showAppContent`**

In `showAppContent` (`app.js:135-180`), replace:

```js
  loadSessionInfo();
  buildGrid();
  updateSelectedCount();
  loadPreviousSelection(user);
  listenForConfirmedSlot();
  loadRespondents();
```

with:

```js
  loadSessionInfo().then(function() {
    buildGrid();
    updateSelectedCount();
    loadPreviousSelection(user);
  });
  listenForConfirmedSlot();
  loadRespondents();
```

- [ ] **Step 4: Scope `buildGrid`/`buildTimeRow` to `currentSessionConfig`, preserving the legacy Manhã/Tarde split**

Replace `buildGrid` and `buildTimeRow` (`app.js:350-418`):

```js
function buildGrid() {
  var gridHead  = document.getElementById('grid-head');
  var gridBody  = document.getElementById('grid-body');
  var gridTable = document.getElementById('grid-table');
  var config    = currentSessionConfig;

  gridHead.innerHTML = '';
  gridBody.innerHTML = '';

  var headerRow = document.createElement('tr');
  var emptyTh   = document.createElement('th');
  headerRow.appendChild(emptyTh);
  config.days.forEach(function(day) {
    var th = document.createElement('th');
    th.textContent = DAY_LABELS[day];
    headerRow.appendChild(th);
  });
  gridHead.appendChild(headerRow);

  if (config.isLegacyGrid) {
    appendSectionRow('Manhã', gridBody);
    MORNING_TIMES.forEach(function(t) { gridBody.appendChild(buildTimeRow(t)); });
    appendSectionRow('Tarde', gridBody);
    AFTERNOON_TIMES.forEach(function(t) { gridBody.appendChild(buildTimeRow(t)); });
  } else {
    config.times.forEach(function(t) { gridBody.appendChild(buildTimeRow(t)); });
  }

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
  td.colSpan = currentSessionConfig.days.length + 1;
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
  currentSessionConfig.days.forEach(function(day) {
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
```

- [ ] **Step 5: Show the confirmed range in `listenForConfirmedSlot`**

In `listenForConfirmedSlot` (`app.js:233-259`), replace:

```js
    if (doc.exists && doc.data().confirmed) {
      var c = doc.data().confirmed;
      text.textContent = (DAY_LABELS_FULL_P[c.day] || c.day) + ', ' + c.time;
      banner.style.display = 'block';
    } else {
      banner.style.display = 'none';
    }
```

with:

```js
    if (doc.exists && doc.data().confirmed) {
      var c = doc.data().confirmed;
      text.textContent = SchedulingCore.formatConfirmedLabel(c, DAY_LABELS_FULL_P);
      banner.style.display = 'block';
    } else {
      banner.style.display = 'none';
    }
```

- [ ] **Step 6: Manual check**

Open `app.html?sessao=<id>` for a session created with a custom range (e.g. days seg/qua, 09:00–12:00, duration 60). Confirm the grid shows only those 2 day columns and only times 09:00–11:30 (no "Manhã"/"Tarde" section header, single block). Open `app.html?sessao=<legacyId>` for a session created before this change (no `duration`/`days`/`startTime`/`endTime` fields) and confirm the grid is unchanged: 5 days, "Manhã" (09:00–12:00) and "Tarde" (14:00–17:00) sections.

- [ ] **Step 7: Commit**

```bash
git add app.js
git commit -m "feat: scope participant grid to the session's configured days/time-range"
```

---

### Task 10: Final verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full unit test suite**

Run: `node --test`
Expected: All `scheduling.test.js` tests pass (13/13 from Tasks 1-3).

- [ ] **Step 2: Static load check**

```bash
npx --yes http-server . -p 8080 -c-1
```

Open `index.html` and `app.html` in a browser; confirm no console errors related to `SchedulingCore` being undefined or JS syntax errors. Stop the server.

- [ ] **Step 3: Hand off the spec's manual acceptance checklist**

The following require a real Firebase project/account and can't be run from this environment — ask the user (or do it yourself against your own Firebase project) to walk through the 6 scenarios listed in `docs/superpowers/specs/2026-07-01-duracao-e-janela-de-reuniao-design.md` under "Testes manuais", in particular scenario 3-4 (the core bug fix: a 1h window only shows 4/4 when all 4 participants marked *both* 30-min sub-slots) and scenario 6 (a pre-existing legacy session renders unchanged).

No commit for this task — it's a checklist, not a code change.
