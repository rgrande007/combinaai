# Duração e janela de horários por reunião

## Contexto / Problema

O app ("CombinAí") permite que participantes marquem disponibilidade em uma
grade de horários fixa e universal (segunda a sexta, 09:00–12:00 e
14:00–17:00, em incrementos de 30 minutos), definida globalmente em
`DAYS`/`MORNING_TIMES`/`AFTERNOON_TIMES`/`ALL_TIMES` (`app.js`, `home.js`).

O card "Horário Ideal" (`renderRecommendation()` em `home.js`) rankeia esses
slots de 30 minutos **individualmente** pela contagem de participantes
disponíveis. O sistema não tem nenhum conceito de duração de reunião: uma
reunião de 1 hora das 11:00 às 12:00 aparece no ranking como três
recomendações independentes ("11:00", "11:30", "12:00"), cada uma com
4/4, mesmo que nenhum intervalo contínuo de 1 hora tenha 100% de
disponibilidade real.

Além disso, a sessão não tem nenhuma configuração de quais dias/horários
devem ser considerados — todo mundo sempre vê a mesma grade universal.

## Objetivo

1. Permitir que o criador da reunião defina, na criação da sessão:
   - a **duração** da reunião (lista fixa: 30min / 1h / 1h30 / 2h);
   - os **dias da semana considerados** (checkboxes, seg–sex);
   - a **faixa de horário considerada** (dropdowns de início/fim, múltiplos
     de 30min).
2. Fazer o "Horário Ideal" recomendar **janelas contínuas** do tamanho da
   duração configurada, contando um participante como disponível numa
   janela apenas se ele marcou **todos** os sub-slots de 30min daquela
   janela — não apenas o horário de início.

## Fora de escopo

- `admin.js` / `admin.html` **não serão alterados**. `admin.html` apenas
  redireciona para `index.html` (`window.location.replace('index.html')`)
  e não é referenciado por nenhuma outra página — é código morto.
- Migração de dados no Firestore. Sessões antigas continuam funcionando via
  fallback client-side (ver "Compatibilidade retroativa").
- Mudar a UI de seleção do participante para blocos maiores — o participante
  continua clicando em slots individuais de 30min; apenas os dias/horários
  exibidos na grade mudam para refletir a janela configurada da sessão.
- Suporte a datas de calendário reais — dias continuam sendo "dia da
  semana genérico" (segunda, terça, ...), como hoje.

## Modelo de dados

Novos campos no documento `sessions/{id}` no Firestore:

```js
{
  // campos existentes: title, createdBy, createdAt, confirmed
  duration:  60,                                    // minutos: 30 | 60 | 90 | 120
  days:      ['segunda', 'quarta', 'sexta'],        // subconjunto de DAYS
  startTime: '09:00',                               // 'HH:MM', múltiplo de 30min
  endTime:   '17:00'                                // 'HH:MM', múltiplo de 30min
}
```

Campo `confirmed` passa a incluir a duração:

```js
confirmed: { day: 'quarta', startTime: '11:00', durationMinutes: 60, confirmedAt: <timestamp> }
```

(campo `time` do formato antigo deixa de ser escrito; leitura antiga é tratada
via fallback — ver compatibilidade).

### Compatibilidade retroativa

Sessões existentes no Firestore não têm `duration`/`days`/`startTime`/
`endTime`. Ao carregar uma sessão (tanto em `home.js` quanto em `app.js`),
se esses campos estiverem ausentes, aplicar defaults client-side que
reproduzem o comportamento atual exatamente:

```js
duration  = session.duration  || 30;
days      = session.days      || ['segunda','terca','quarta','quinta','sexta'];
timesList = (session.startTime && session.endTime)
  ? generateTimesInRange(session.startTime, session.endTime)  // range contínuo
  : MORNING_TIMES.concat(AFTERNOON_TIMES);                    // grade legada (2 blocos)
```

Não há script de migração; o fallback é permanente no código (assim como o
resto do app já trata campos opcionais).

## UI: criação de sessão

`index.html` — dentro do card "Nova sessão" (`.csh-form`), abaixo do campo de
título, adicionar:

- **Duração**: `<select>` com opções "30 minutos" / "1 hora" (padrão) /
  "1h30" / "2 horas".
- **Dias**: checkboxes Seg/Ter/Qua/Qui/Sex, todos marcados por padrão.
- **Horário**: dois `<select>` (início / fim), populados com múltiplos de
  30min de 07:00 a 20:00, padrão 09:00–17:00.

Validação no submit (`createSession()` em `home.js`):
- pelo menos 1 dia selecionado;
- `(minutos(endTime) - minutos(startTime)) >= duration`, senão mostrar erro
  inline "A janela de horários é menor que a duração da reunião." e não
  criar a sessão.

Esses 4 campos (`duration`, `days`, `startTime`, `endTime`) são salvos no
doc da sessão junto com `title`/`createdBy`/`createdAt`.

## Grade do participante (`app.js`)

- `loadSessionInfo()` passa a ler `duration`/`days`/`startTime`/`endTime`
  da sessão (com fallback acima) e guardar em variáveis de módulo
  (`sessionDays`, `sessionTimes`, `sessionDuration`).
- `buildGrid()` usa `sessionDays`/`sessionTimes` no lugar de
  `DAYS`/`MORNING_TIMES`/`AFTERNOON_TIMES` — a grade mostrada reflete só o
  que a sessão configurou. Isso requer que `loadSessionInfo()` termine
  (await) antes de `buildGrid()` rodar, já que hoje são chamadas em
  sequência síncrona dentro de `showAppContent()`.
- Subtítulo da página passa a indicar a duração, ex: "Marque os horários em
  que você está disponível (reunião de 1h)".
- `listenForConfirmedSlot()` exibe o intervalo completo, ex:
  `"Quarta-feira, 11:00 – 12:00"`, calculando o horário de fim a partir de
  `startTime + durationMinutes`.

## Algoritmo de recomendação (`home.js`)

Esta é a mudança central que resolve o problema relatado.

### `getSlotData(responses, sessionConfig)`

Mesma função de hoje, mas os slots inicializados/contados usam
`sessionConfig.days` × `sessionConfig.times` em vez das constantes globais.
Continua contando disponibilidade **por slot individual de 30min** — é a
base sobre a qual as janelas são construídas.

### Nova função: `computeIdealWindows(responses, sessionConfig)`

Para `slotCount = sessionConfig.duration / 30`:

1. Para cada dia em `sessionConfig.days`, para cada índice `i` em
   `sessionConfig.times` tal que existam `slotCount` sub-slots a partir de
   `i`:
   - Verificar que os `slotCount` horários são **realmente consecutivos em
     relógio** (cada um = anterior + 30min), não apenas adjacentes no
     array. Isso impede que uma janela atravesse o buraco do almoço
     (12:00 → 14:00) na grade legada de dois blocos.
   - Se não forem consecutivos em relógio, descartar essa janela candidata.
2. Para cada janela válida `(day, startTime..startTime+duration)`:
   - `availNames` = participantes cujo `r.slots` contém **todos** os
     `slotCount` sub-slots da janela.
   - `count` = `availNames.length`.
3. Retornar lista de `{ day, startTime, durationMinutes, count, availNames,
   absentNames }`, ordenada por `count` desc, depois ordem de dia, depois
   ordem de horário de início (mesmo critério de desempate de hoje).

### `renderRecommendation()`

Passa a chamar `computeIdealWindows()` em vez de montar `ranked` a partir de
slots individuais. Exibição do rótulo passa de `"Quarta-feira, 11:00"` para
`"Quarta-feira, 11:00 – 12:00"` (fim calculado a partir de
`startTime + durationMinutes`). Resto da lógica (top 3 empatados, badge
"Todos", nomes ausentes, botão "Confirmar") é igual, só que operando sobre
janelas em vez de pontos.

### `confirmSlot(day, startTime)`

Salva `{ day, startTime, durationMinutes: sessionConfig.duration,
confirmedAt }` em vez de `{ day, time }`.

### `renderStats()`

O "melhor horário" (`stat-best`) passa a refletir a melhor **janela**
(reaproveita `computeIdealWindows()` em vez de iterar slots crus).

### Tabela completa / grade administrativa (`renderAdminGrid`)

Sem mudanças de lógica — continua mostrando contagem bruta por slot de
30min (`getSlotData`), útil independente da duração configurada. Só passa a
iterar sobre `sessionConfig.days`/`sessionConfig.times` em vez das
constantes globais, para não mostrar dias/horários fora da janela da
sessão.

## Casos de borda

- Se a janela configurada for menor que a duração em todos os dias
  (não deveria acontecer por causa da validação na criação, mas sessões
  antigas com duration=30 e grade legada sempre têm pelo menos 1 slot
  válido) — `computeIdealWindows()` simplesmente retorna lista vazia para
  dias sem janelas válidas; o card cai no estado "nenhum horário em comum"
  já existente.
- Duração maior que o espaço restante num dia específico (ex: janela
  16:00–17:00 com duração de 2h): esse dia não gera nenhuma janela
  candidata; outros dias continuam sendo avaliados normalmente.

## Testes manuais (critério de aceite)

1. Criar sessão nova com duração 1h, dias seg/qua, horário 09:00–12:00.
2. Confirmar que a grade do participante (`app.html?sessao=...`) mostra
   apenas segunda e quarta, 09:00–12:00 (sem terça/quinta/sexta, sem
   tarde).
3. 4 participantes marcam segunda 11:00 **e** 11:30; nenhum marca 12:00.
   "Horário Ideal" deve mostrar **uma única** recomendação "Segunda, 11:00
   – 12:00" com 4/4 — não deve aparecer "12:00" isolado como 100%.
4. Um participante marca só 11:00 (não 11:30). A janela 11:00–12:00 deve
   cair para 3/4, refletindo que ele não está disponível pro bloco inteiro.
5. Confirmar a janela recomendada; abrir `app.html` como participante e
   verificar que o banner mostra o intervalo completo "Segunda, 11:00 –
   12:00", não só o horário de início.
6. Abrir uma sessão criada **antes** dessa mudança (sem os novos campos) e
   confirmar que a grade e o "Horário Ideal" continuam idênticos ao
   comportamento atual (grade completa seg-sex, 2 blocos, janelas de
   30min).
