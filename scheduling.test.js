var test = require('node:test');
var assert = require('node:assert/strict');
var SchedulingCore = require('./scheduling.js');

var DEFAULT_DAYS = ['segunda','terca','quarta','quinta','sexta'];
var LEGACY_TIMES = ['09:00','09:30','10:00','10:30','11:00','11:30','12:00','14:00','14:30','15:00','15:30','16:00','16:30','17:00'];

function mkResponse(name, slots) { return { name: name, slots: slots }; }

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
  var GAP_TIMES = ['11:30','12:00','14:00','14:30'];
  var cfg = { days: ['quarta'], times: GAP_TIMES, duration: 60 };
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
