(() => {
  const SUITS = [
    { key: "hearts", symbol: "♥", color: "red" },
    { key: "diamonds", symbol: "♦", color: "red" },
    { key: "spades", symbol: "♠", color: "black" },
    { key: "clubs", symbol: "♣", color: "black" },
  ];
  const RANKS = [
    { value: 1, label: "A" },
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

  const $ = (id) => document.getElementById(id);
  const lane = $("lane");
  const deckEl = $("deck");
  const message = $("message");
  const controls = $("controls");
  const overlay = $("overlay");
  const overlayTitle = $("overlay-title");
  const overlayBody = $("overlay-body");
  const overlayBtn = $("overlay-btn");
  const roundEl = $("round");
  const stageNameEl = $("stage-name");
  const remainingEl = $("remaining");

  const state = {
    deck: [],
    drawn: [],   // every card revealed this game
    round: [],   // cards revealed in current round (max 4)
    stageIdx: 0,
    round_no: 1,
    busy: false,
    over: true,
  };

  function buildDeck() {
    const d = [];
    for (const s of SUITS) for (const r of RANKS) d.push({ ...r, ...s });
    return d;
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function startGame() {
    state.deck = shuffle(buildDeck());
    state.drawn = [];
    state.round = [];
    state.stageIdx = 0;
    state.round_no = 1;
    state.busy = false;
    state.over = false;
    lane.innerHTML = "";
    deckEl.classList.remove("empty");
    setMessage("");
    updateHud();
    renderControls();
    hideOverlay();
  }

  function updateHud() {
    roundEl.innerHTML = `${state.round_no}<span class="hud-suffix">/13</span>`;
    stageNameEl.textContent = STAGES[state.stageIdx].name;
    remainingEl.textContent = state.deck.length;
  }

  function setMessage(text, kind = "") {
    message.textContent = text;
    message.className = "message" + (kind ? " " + kind : "");
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

    const top = document.createElement("div");
    top.className = "corner top";
    top.innerHTML = `<span class="rank">${card.label}</span><span class="suit">${card.symbol}</span>`;

    const pip = document.createElement("div");
    pip.className = "pip";
    pip.textContent = card.symbol;

    const bot = document.createElement("div");
    bot.className = "corner bottom";
    bot.innerHTML = `<span class="rank">${card.label}</span><span class="suit">${card.symbol}</span>`;

    face.append(top, pip, bot);
    inner.append(back, face);
    el.append(inner);
    return el;
  }

  function trimLane(maxBefore) {
    // keep only the most recent `maxBefore` reference cards in lane (visually)
    while (lane.children.length > maxBefore) {
      lane.removeChild(lane.firstChild);
    }
  }

  // Visually shrink older lane cards so newest is biggest
  function decorateLane() {
    const cards = Array.from(lane.children);
    cards.forEach((c, i) => {
      if (i < cards.length - 1) c.classList.add("muted");
      else c.classList.remove("muted");
    });
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

    // wait for deal-in to settle
    await wait(300);
    el.classList.add("flipped");
    await wait(560);
    return { card, el };
  }

  function wait(ms) {
    return new Promise((r) => setTimeout(r, ms));
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
    controls.querySelectorAll("button").forEach((b) => {
      b.disabled = !enabled;
    });
  }

  function evaluate(stageKey, choice, prev, next) {
    if (stageKey === "rb") {
      return next.color === choice;
    }
    if (stageKey === "hl") {
      if (next.value === prev.value) return false; // tie loses
      return choice === "higher" ? next.value > prev.value : next.value < prev.value;
    }
    if (stageKey === "io") {
      const a = Math.min(prev[0].value, prev[1].value);
      const b = Math.max(prev[0].value, prev[1].value);
      // matching either bound = loss
      if (next.value === a || next.value === b) return false;
      const inside = next.value > a && next.value < b;
      return choice === "inside" ? inside : !inside;
    }
    if (stageKey === "suit") {
      return next.key === choice;
    }
    return false;
  }

  async function onChoice(choice) {
    if (state.busy || state.over) return;
    state.busy = true;
    setControlsEnabled(false);

    const stage = STAGES[state.stageIdx];
    const prevCards = state.round.slice(); // cards already in this round before draw

    const { card: drawn, el } = await dealCard();

    let won;
    if (stage.controls === "rb") {
      won = evaluate("rb", choice, null, drawn);
    } else if (stage.controls === "hl") {
      won = evaluate("hl", choice, prevCards[0], drawn);
    } else if (stage.controls === "io") {
      won = evaluate("io", choice, [prevCards[0], prevCards[1]], drawn);
    } else {
      won = evaluate("suit", choice, null, drawn);
    }

    if (won) {
      el.classList.add("win");
      setMessage(winMessage(stage, choice, drawn), "win");
      await wait(650);

      state.stageIdx++;
      if (state.stageIdx >= STAGES.length) {
        // round complete
        state.stageIdx = 0;
        state.round_no++;
        state.round = [];

        if (state.deck.length === 0) {
          await celebrateWin();
          return;
        }

        // clear lane between rounds for clarity
        await wait(250);
        lane.innerHTML = "";
        setMessage(`Round ${state.round_no} — keep the streak going.`);
      } else {
        // For inside/outside we need 2 reference cards in lane.
        // For hl we only need the latest. Trim accordingly.
        const next = STAGES[state.stageIdx];
        if (next.controls === "io") {
          trimLane(2);
        } else if (next.controls === "suit") {
          trimLane(1);
        } else if (next.controls === "hl") {
          trimLane(1);
        }
        decorateLane();
      }

      updateHud();
      renderControls();
      state.busy = false;
    } else {
      el.classList.add("lose");
      setMessage(loseMessage(stage, choice, drawn), "lose");
      await wait(1100);
      gameOver();
    }
  }

  function winMessage(stage, choice, card) {
    const name = `${card.label}${card.symbol}`;
    if (stage.controls === "rb") return `${name} — ${card.color}. Nice.`;
    if (stage.controls === "hl") return `${name}. ${cap(choice)} — got it.`;
    if (stage.controls === "io") return `${name}. ${cap(choice)} — nailed it.`;
    if (stage.controls === "suit") return `${name}. Suit on the nose!`;
    return "Correct";
  }

  function loseMessage(stage, choice, card) {
    const name = `${card.label}${card.symbol}`;
    if (stage.controls === "rb") return `${name} — wrong color.`;
    if (stage.controls === "hl") {
      if (state.round[state.round.length - 2]?.value === card.value)
        return `${name} — tie loses.`;
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
    overlayTitle.textContent = "Reshuffling...";
    overlayBody.innerHTML = `You made it through <strong>${state.drawn.length - 1}</strong> card${
      state.drawn.length - 1 === 1 ? "" : "s"
    } before busting on round ${state.round_no}.`;
    overlayBtn.textContent = "New Deck";
    showOverlay();
  }

  async function celebrateWin() {
    state.over = true;
    state.busy = false;
    controls.innerHTML = "";
    overlayTitle.textContent = "You rode the whole deck!";
    overlayBody.innerHTML = "All 52 cards. That's the run.";
    overlayBtn.textContent = "Play Again";
    showOverlay();
  }

  function showOverlay() {
    overlay.hidden = false;
  }
  function hideOverlay() {
    overlay.hidden = true;
  }

  overlayBtn.addEventListener("click", startGame);

  // initial overlay text already in DOM; just show it
  showOverlay();
})();
