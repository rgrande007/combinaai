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

  var api = {
    timeToMinutes: timeToMinutes,
    minutesToTime: minutesToTime,
    generateTimesInRange: generateTimesInRange,
    getSessionConfig: getSessionConfig,
    getSlotData: getSlotData,
    computeIdealWindows: computeIdealWindows,
    formatConfirmedLabel: formatConfirmedLabel
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.SchedulingCore = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
