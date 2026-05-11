(() => {
  const SUITS = [
    { key: "hearts", symbol: "♥", color: "red" },
    { key: "diamonds", symbol: "♦", color: "red" },
    { key: "spades", symbol: "♠", color: "black" },
    { key: "clubs", symbol: "♣", color: "black" },
  ];
  const RANKS = [
    { value: 14, label: "A" },
    { value: 2, label: "2" },
    { value: 3, label: "3" },
    { value: 4, label: "4" },
    { value: 5, label: "5" },
    { value: 6, label: "6" },
    { value: 7, label: "7" },
    { value: 8, label: "8" },
    { value: 9, label: "9" },
    { value: 10, label: "10" },
    { value: 11, label: "J" },
    { value: 12, label: "Q" },
    { value: 13, label: "K" },
  ];

  const STAGES = [
    { name: "Red or Black", controls: "rb" },
    { name: "Higher or Lower", controls: "hl" },
    { name: "Inside or Outside", controls: "io" },
    { name: "Guess the Suit", controls: "suit" },
  ];

  // Base points per stage; multiplied by current combo.
  const POINTS = { rb: 10, hl: 15, io: 25, suit: 50 };
  const COMBO_STEP = 0.1;

  const STORE = {
    stats: "rtd.stats",
    streak: "rtd.streak",
    daily: (d) => "rtd.daily." + d,
  };

  // --- DOM refs ---
  const $ = (id) => document.getElementById(id);
  const lane = $("lane");
  const deckEl = $("deck");
  const message = $("message");
  const controls = $("controls");
  const overlay = $("overlay");
  const overlayTitle = $("overlay-title");
  const overlayBody = $("overlay-body");
  const overlayBtn = $("overlay-btn");
  const overlayFoot = $("overlay-foot");
  const shareBtn = $("share-btn");
  const roundEl = $("round");
  const stageNameEl = $("stage-name");
  const remainingEl = $("remaining");
  const scoreEl = $("score");
  const comboEl = $("combo");
  const comboCell = $("combo-cell");
  const modeToggle = $("mode-toggle");
  const dailyDateEl = $("daily-date");
  const statsBtn = $("stats-btn");
  const statsOverlay = $("stats-overlay");
  const statsGrid = $("stats-grid");
  const statsClose = $("stats-close");
  const app = $("app");

  // --- State ---
  const state = {
    mode: "daily",
    seed: 0,
    deck: [],
    drawn: [],
    round: [],
    stageIdx: 0,
    round_no: 1,
    busy: false,
    over: true,
    score: 0,
    combo: 1.0,
    runGrid: [],
    currentRoundResults: [],
  };

  // --- Card layout (pip positions per rank) ---
  const PIP_LAYOUTS = {
    2: [[50, 18], [50, 82]],
    3: [[50, 18], [50, 50], [50, 82]],
    4: [[26, 18], [74, 18], [26, 82], [74, 82]],
    5: [[26, 18], [74, 18], [50, 50], [26, 82], [74, 82]],
    6: [[26, 18], [74, 18], [26, 50], [74, 50], [26, 82], [74, 82]],
    7: [[26, 18], [74, 18], [50, 34], [26, 50], [74, 50], [26, 82], [74, 82]],
    8: [[26, 18], [74, 18], [50, 34], [26, 50], [74, 50], [50, 66], [26, 82], [74, 82]],
    9: [[26, 18], [74, 18], [26, 38], [74, 38], [50, 50], [26, 62], [74, 62], [26, 82], [74, 82]],
    10: [[26, 18], [74, 18], [50, 28], [26, 42], [74, 42], [26, 58], [74, 58], [50, 72], [26, 82], [74, 82]],
  };

  // --- Seeded RNG (mulberry32) ---
  function makeRng(seed) {
    let h = seed >>> 0;
    return () => {
      h = (h + 0x6d2b79f5) >>> 0;
      let t = h;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function seedFromString(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return h >>> 0;
  }

  function buildDeck() {
    const d = [];
    for (const s of SUITS) for (const r of RANKS) d.push({ ...r, ...s });
    return d;
  }

  function shuffleWith(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function todayKey() {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  }

  function todayDisplay() {
    return new Date().toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  }

  // --- Persistence ---
  function load(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch {
      return fallback;
    }
  }

  function save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }

  function defaultStats() {
    return {
      gamesPlayed: 0,
      gamesWon: 0,
      bestCards: 0,
      bestScore: 0,
      totalCards: 0,
    };
  }

  function loadStats() {
    return load(STORE.stats, defaultStats());
  }

  function loadStreak() {
    return load(STORE.streak, { current: 0, longest: 0, lastDate: null });
  }

  function loadDaily(date) {
    return load(STORE.daily(date), null);
  }

  function bumpStreak() {
    const today = todayKey();
    const s = loadStreak();
    if (s.lastDate === today) return;
    const yesterday = (() => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return d.toISOString().slice(0, 10);
    })();
    s.current = s.lastDate === yesterday ? s.current + 1 : 1;
    s.longest = Math.max(s.longest, s.current);
    s.lastDate = today;
    save(STORE.streak, s);
  }

  // --- Haptics ---
  function vibrate(pattern) {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      try {
        navigator.vibrate(pattern);
      } catch {}
    }
  }
  const haptic = {
    tap: () => vibrate(8),
    win: () => vibrate([18, 24, 18]),
    miss: () => vibrate([60, 40, 90]),
    big: () => vibrate([16, 18, 16, 18, 32]),
  };

  // --- Card rendering ---
  function buildBody(card) {
    const body = document.createElement("div");
    body.className = "card-body";

    if (card.label === "A") {
      body.classList.add("ace");
      const pip = document.createElement("span");
      pip.className = "pip ace-pip";
      pip.textContent = card.symbol;
      body.append(pip);
      return body;
    }

    if (card.value >= 11 && card.value <= 13) {
      body.classList.add("face");
      body.innerHTML = `
        <span class="face-letter">${card.label}</span>
        <span class="face-suit">${card.symbol}</span>`;
      return body;
    }

    const layout = PIP_LAYOUTS[card.value];
    for (const [left, top] of layout) {
      const pip = document.createElement("span");
      pip.className = "pip" + (top > 50 ? " inverted" : "");
      pip.style.left = left + "%";
      pip.style.top = top + "%";
      pip.textContent = card.symbol;
      body.append(pip);
    }
    return body;
  }

  function makeCardEl(card) {
    const el = document.createElement("div");
    el.className = "card";
    const inner = document.createElement("div");
    inner.className = "card-inner";

    const back = document.createElement("div");
    back.className = "card-back";

    const face = document.createElement("div");
    face.className = "card-face " + card.color;

    const tl = document.createElement("div");
    tl.className = "corner tl";
    tl.innerHTML = `<span class="rank">${card.label}</span><span class="suit">${card.symbol}</span>`;

    const br = document.createElement("div");
    br.className = "corner br";
    br.innerHTML = `<span class="rank">${card.label}</span><span class="suit">${card.symbol}</span>`;

    face.append(tl, buildBody(card), br);
    inner.append(back, face);
    el.append(inner);
    return el;
  }

  // --- Game flow ---
  function startGame() {
    if (state.mode === "daily") {
      state.seed = seedFromString("rtd-" + todayKey());
    } else {
      state.seed = (Math.random() * 0xffffffff) >>> 0;
    }
    const rng = makeRng(state.seed);
    state.deck = shuffleWith(buildDeck(), rng);
    state.drawn = [];
    state.round = [];
    state.runGrid = [];
    state.currentRoundResults = [];
    state.stageIdx = 0;
    state.round_no = 1;
    state.busy = false;
    state.over = false;
    state.score = 0;
    state.combo = 1.0;

    lane.innerHTML = "";
    deckEl.classList.remove("empty");
    setMessage("");
    updateScore();
    updateHud();
    renderControls();
    hideOverlay();
  }

  function updateHud() {
    roundEl.innerHTML = `${state.round_no}<span class="hud-suffix">/13</span>`;
    stageNameEl.textContent = STAGES[state.stageIdx].name;
    remainingEl.textContent = state.deck.length;
  }

  function updateScore() {
    scoreEl.textContent = state.score.toLocaleString();
    if (state.combo > 1.0) {
      comboEl.textContent = "×" + state.combo.toFixed(1);
      comboCell.hidden = false;
      comboEl.style.animation = "none";
      // restart animation
      void comboEl.offsetWidth;
      comboEl.style.animation = "";
    } else {
      comboCell.hidden = true;
    }
  }

  function setMessage(text, kind = "") {
    message.textContent = text;
    message.className = "message" + (kind ? " " + kind : "");
  }

  function trimLane(maxBefore) {
    while (lane.children.length > maxBefore) {
      lane.removeChild(lane.firstChild);
    }
  }

  function decorateLane() {
    const cards = Array.from(lane.children);
    cards.forEach((c, i) => {
      if (i < cards.length - 1) c.classList.add("muted");
      else c.classList.remove("muted");
    });
  }

  function wait(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function dealCard() {
    const card = state.deck.pop();
    state.drawn.push(card);
    state.round.push(card);

    const el = makeCardEl(card);
    el.classList.add("dealing");
    lane.append(el);
    decorateLane();
    updateHud();

    if (state.deck.length === 0) deckEl.classList.add("empty");

    haptic.tap();
    await wait(300);
    el.classList.add("flipped");
    await wait(560);
    return { card, el };
  }

  function renderControls() {
    if (state.over) {
      controls.innerHTML = "";
      return;
    }
    const stage = STAGES[state.stageIdx];
    controls.className = "controls";

    if (stage.controls === "rb") {
      controls.innerHTML = `
        <button class="btn red-btn" data-choice="red">Red</button>
        <button class="btn black-btn" data-choice="black">Black</button>`;
    } else if (stage.controls === "hl") {
      controls.innerHTML = `
        <button class="btn" data-choice="higher">Higher</button>
        <button class="btn" data-choice="lower">Lower</button>`;
    } else if (stage.controls === "io") {
      controls.innerHTML = `
        <button class="btn" data-choice="inside">Inside</button>
        <button class="btn" data-choice="outside">Outside</button>`;
    } else if (stage.controls === "suit") {
      controls.className = "controls suits";
      controls.innerHTML = `
        <button class="btn suit-btn red-suit" data-choice="hearts">♥</button>
        <button class="btn suit-btn red-suit" data-choice="diamonds">♦</button>
        <button class="btn suit-btn" data-choice="spades">♠</button>
        <button class="btn suit-btn" data-choice="clubs">♣</button>`;
    }

    controls.querySelectorAll("button").forEach((b) => {
      b.addEventListener("click", () => onChoice(b.dataset.choice));
    });
  }

  function setControlsEnabled(enabled) {
    controls.querySelectorAll("button").forEach((b) => (b.disabled = !enabled));
  }

  function evaluate(stageKey, choice, prev, next) {
    if (stageKey === "rb") return next.color === choice;
    if (stageKey === "hl") {
      if (next.value === prev.value) return false;
      return choice === "higher" ? next.value > prev.value : next.value < prev.value;
    }
    if (stageKey === "io") {
      const a = Math.min(prev[0].value, prev[1].value);
      const b = Math.max(prev[0].value, prev[1].value);
      if (next.value === a || next.value === b) return false;
      const inside = next.value > a && next.value < b;
      return choice === "inside" ? inside : !inside;
    }
    if (stageKey === "suit") return next.key === choice;
    return false;
  }

  async function onChoice(choice) {
    if (state.busy || state.over) return;
    state.busy = true;
    setControlsEnabled(false);

    const stage = STAGES[state.stageIdx];
    const prevCards = state.round.slice();
    const { card: drawn, el } = await dealCard();

    let won;
    if (stage.controls === "rb") won = evaluate("rb", choice, null, drawn);
    else if (stage.controls === "hl") won = evaluate("hl", choice, prevCards[0], drawn);
    else if (stage.controls === "io") won = evaluate("io", choice, [prevCards[0], prevCards[1]], drawn);
    else won = evaluate("suit", choice, null, drawn);

    if (won) {
      el.classList.add("win");
      const earned = Math.round(POINTS[stage.controls] * state.combo);
      state.score += earned;
      state.combo = +(state.combo + COMBO_STEP).toFixed(2);
      state.currentRoundResults.push(true);
      updateScore();
      haptic.win();
      setMessage(`${winMessage(stage, choice, drawn)} +${earned}`, "win");
      await wait(650);

      state.stageIdx++;
      if (state.stageIdx >= STAGES.length) {
        // round complete
        state.runGrid.push(state.currentRoundResults);
        state.currentRoundResults = [];
        state.stageIdx = 0;
        state.round_no++;
        state.round = [];

        if (state.deck.length === 0) {
          await celebrateWin();
          return;
        }

        await wait(250);
        lane.innerHTML = "";
        setMessage(`Round ${state.round_no} — keep it going.`);
      } else {
        const next = STAGES[state.stageIdx];
        if (next.controls === "io") trimLane(2);
        else if (next.controls === "suit" || next.controls === "hl") trimLane(1);
        decorateLane();
      }

      updateHud();
      renderControls();
      state.busy = false;
    } else {
      el.classList.add("lose");
      state.currentRoundResults.push(false);
      state.combo = 1.0;
      updateScore();
      haptic.miss();
      setMessage(loseMessage(stage, choice, drawn), "lose");
      await wait(1100);
      gameOver();
    }
  }

  function winMessage(stage, choice, card) {
    const name = `${card.label}${card.symbol}`;
    if (stage.controls === "rb") return `${name} — ${card.color}.`;
    if (stage.controls === "hl") return `${name}. ${cap(choice)}.`;
    if (stage.controls === "io") return `${name}. ${cap(choice)}.`;
    if (stage.controls === "suit") return `${name}. On the nose!`;
    return "Correct";
  }

  function loseMessage(stage, choice, card) {
    const name = `${card.label}${card.symbol}`;
    if (stage.controls === "rb") return `${name} — wrong color.`;
    if (stage.controls === "hl") {
      if (state.round[state.round.length - 2]?.value === card.value) return `${name} — tie loses.`;
      return `${name} — wrong way.`;
    }
    if (stage.controls === "io") return `${name} — missed it.`;
    if (stage.controls === "suit") return `${name} — wrong suit.`;
    return "Wrong";
  }

  function cap(s) {
    return s[0].toUpperCase() + s.slice(1);
  }

  function gameOver() {
    state.over = true;
    state.busy = false;
    controls.innerHTML = "";

    // record the failed (partial) round in the grid
    if (state.currentRoundResults.length) {
      state.runGrid.push(state.currentRoundResults);
      state.currentRoundResults = [];
    }

    persistEndOfGame(false);
    showResultOverlay(false);
  }

  async function celebrateWin() {
    state.over = true;
    state.busy = false;
    controls.innerHTML = "";

    haptic.big();
    fireConfetti(true);

    persistEndOfGame(true);
    await wait(400);
    showResultOverlay(true);
  }

  function persistEndOfGame(cleared) {
    const cards = state.drawn.length - (cleared ? 0 : 1);
    const stats = loadStats();
    stats.gamesPlayed += 1;
    if (cleared) stats.gamesWon += 1;
    stats.totalCards += cards;
    stats.bestCards = Math.max(stats.bestCards, cards);
    stats.bestScore = Math.max(stats.bestScore, state.score);
    save(STORE.stats, stats);

    if (state.mode === "daily") {
      save(STORE.daily(todayKey()), {
        date: todayKey(),
        cleared,
        score: state.score,
        cards,
        grid: state.runGrid,
      });
      bumpStreak();
    }
  }

  // --- Overlays ---
  function showOverlay() {
    overlay.hidden = false;
  }
  function hideOverlay() {
    overlay.hidden = true;
  }

  function setMode(mode) {
    state.mode = mode;
    modeToggle.querySelectorAll(".mode-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.mode === mode);
    });
    refreshStartOverlay();
  }

  function refreshStartOverlay() {
    // shown before a game starts (or when launched fresh)
    dailyDateEl.textContent = todayDisplay();
    modeToggle.hidden = false;
    overlayFoot.textContent = "";

    if (state.mode === "daily") {
      const today = loadDaily(todayKey());
      if (today) {
        const lead = today.cleared
          ? `Cleared the deck`
          : `${today.cards} card${today.cards === 1 ? "" : "s"} deep`;
        overlayTitle.textContent = "Today's run";
        overlayBody.innerHTML = `${lead} · <strong>${today.score.toLocaleString()}</strong> pts<div class="share-preview">${renderGrid(
          today.grid
        )}</div>`;
        overlayBtn.textContent = "Free Play instead";
        shareBtn.hidden = false;
        shareBtn.onclick = () => doShare(today);
        return;
      }
      overlayTitle.textContent = "Daily Challenge";
      overlayBody.innerHTML = `Same shuffled deck for everyone today. <br/>One run, share your result.`;
    } else {
      overlayTitle.textContent = "Free Play";
      overlayBody.innerHTML = `Fresh shuffle, no limits.`;
    }
    overlayBtn.textContent = "Deal";
    shareBtn.hidden = true;
  }

  function showResultOverlay(cleared) {
    modeToggle.hidden = false;
    const cards = state.drawn.length - (cleared ? 0 : 1);
    overlayTitle.textContent = cleared
      ? "You rode the whole deck!"
      : state.mode === "daily"
      ? "Today's run"
      : "Reshuffling";

    const result = {
      date: todayKey(),
      cleared,
      score: state.score,
      cards,
      grid: state.runGrid,
    };

    overlayBody.innerHTML = `${cleared ? "All 52 cards" : `${cards} card${cards === 1 ? "" : "s"}`} · <strong>${state.score.toLocaleString()}</strong> pts<div class="share-preview">${renderGrid(
      result.grid
    )}</div>`;

    if (state.mode === "daily") {
      overlayBtn.textContent = "Free Play";
      shareBtn.hidden = false;
      shareBtn.onclick = () => doShare(result);
    } else {
      overlayBtn.textContent = "New Deck";
      shareBtn.hidden = true;
    }
    showOverlay();
  }

  function renderGrid(grid) {
    if (!grid || !grid.length) return "";
    return grid.map((row) => row.map((b) => (b ? "🟩" : "⬛")).join("")).join("\n");
  }

  function shareText(result) {
    const grid = renderGrid(result.grid);
    const head = `Ride the Deck — ${result.date}`;
    const line = result.cleared
      ? `Cleared 52/52`
      : `${result.cards} card${result.cards === 1 ? "" : "s"} deep`;
    return `${head}\n${line} · ${result.score.toLocaleString()} pts\n\n${grid}\n\ncard-choice.vercel.app`;
  }

  async function doShare(result) {
    const text = shareText(result);
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch {
        // user cancelled or failed — fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      flashFoot("Copied to clipboard");
    } catch {
      // last resort
      flashFoot("Copy your result:\n" + text);
    }
  }

  function flashFoot(text) {
    overlayFoot.textContent = text;
    clearTimeout(flashFoot._t);
    flashFoot._t = setTimeout(() => {
      overlayFoot.textContent = "";
    }, 2500);
  }

  // --- Stats overlay ---
  function showStats() {
    const stats = loadStats();
    const streak = loadStreak();
    statsGrid.innerHTML = "";
    const items = [
      ["Games", stats.gamesPlayed],
      ["Cleared", stats.gamesWon],
      ["Best Run", stats.bestCards + " cards"],
      ["Best Score", stats.bestScore.toLocaleString()],
      ["Daily Streak", streak.current],
      ["Longest", streak.longest],
    ];
    for (const [label, value] of items) {
      const div = document.createElement("div");
      div.className = "stat";
      div.innerHTML = `<span class="stat-label">${label}</span><span class="stat-value">${value}</span>`;
      statsGrid.append(div);
    }
    statsOverlay.hidden = false;
  }

  // --- Confetti ---
  function fireConfetti(big = false) {
    const c = document.createElement("div");
    c.className = "confetti";
    const count = big ? 90 : 30;
    const colors = ["#d23030", "#f0c75e", "#6cd391", "#5a9bd4", "#ffffff"];
    for (let i = 0; i < count; i++) {
      const piece = document.createElement("span");
      piece.style.left = Math.random() * 100 + "%";
      piece.style.background = colors[Math.floor(Math.random() * colors.length)];
      piece.style.animationDelay = Math.random() * 0.4 + "s";
      piece.style.animationDuration = 1.2 + Math.random() * 1.2 + "s";
      c.append(piece);
    }
    app.append(c);
    setTimeout(() => c.remove(), 3000);
  }

  // --- Wire up ---
  modeToggle.querySelectorAll(".mode-btn").forEach((b) => {
    b.addEventListener("click", () => setMode(b.dataset.mode));
  });
  overlayBtn.addEventListener("click", () => {
    // If daily already played today, "Free Play instead" jumps to free play.
    if (state.mode === "daily") {
      const today = loadDaily(todayKey());
      if (today && !state.over) {
        // shouldn't happen, but guard
      } else if (today) {
        state.mode = "free";
      }
    }
    startGame();
  });
  statsBtn.addEventListener("click", showStats);
  statsClose.addEventListener("click", () => {
    statsOverlay.hidden = true;
  });

  // First render
  refreshStartOverlay();
  showOverlay();
})();
