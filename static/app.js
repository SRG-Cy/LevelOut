// LevelOut frontend. Game state lives in localStorage; model output is inserted as text only.

const SKILLS = ["Football", "Cricket bowling", "Basketball", "Badminton footwork", "Running a 5K",
  "Skipping rope", "Calisthenics", "Frisbee", "Skateboarding", "Shadow boxing"];
const EQUIPMENT = ["Open ground", "A wall", "Stairs or a slope", "A bench", "A tree or pole", "Water bottles",
  "A ball", "A skipping rope", "A racket", "Nothing at all"];
const RANKS = ["E", "D", "C", "B", "A", "S"];
const RANK_LEVEL = [1, 5, 10, 15, 25, 40]; // level at which each rank's test unlocks
const STATS = ["STR", "AGI", "VIT", "SKL", "FOC"];
const RATINGS = [["easy", "Easy"], ["ok", "Just right"], ["hard", "Hard"], ["pain", "Hurt"], ["skipped", "Skipped"]];
const KEY = "levelout:v1";
const SOUND_KEY = "levelout:sound";
const RING = 339.292; // circumference of the progress ring (r = 54)
const TICK_GAP_MS = 60_000; // a drill can't be ticked less than a minute after the last tick
const MOTION_THRESHOLD = 1.2; // m/s² of acceleration (gravity removed) that counts as moving
const MOTION_VERIFIED = 120; // accumulated movement that earns the "movement verified" bonus

const $ = (s) => document.querySelector(s);
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
let state = load();
let assessQuestions = [];
let timerId = null;
let freshGains = null; // stat gains from the quest just claimed, shown once on the status screen

// ---------- utilities ----------

function el(spec, attrs, ...children) {
  const [tag, ...classes] = spec.split(".");
  const node = document.createElement(tag || "div");
  if (classes.length) node.className = classes.join(" ");
  if (attrs && (typeof attrs !== "object" || attrs instanceof Node)) children.unshift(attrs);
  else if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "on") for (const [ev, fn] of Object.entries(v)) node.addEventListener(ev, fn);
      else if (v !== false && v != null) node.setAttribute(k, v === true ? "" : v);
    }
  }
  for (const c of children.flat()) if (c != null && c !== false) node.append(c instanceof Node ? c : String(c));
  return node;
}
const str = (v) => (v == null ? "" : String(v));
const list = (v) => (Array.isArray(v) ? v.filter(Boolean) : []);
const int = (v, d = 0) => (Number.isFinite(+v) ? Math.round(+v) : d);
const today = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in local time
const daysBetween = (a, b) => Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 86400000);
const xpToNext = (level) => 100 + (level - 1) * 50;

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode: progress lasts this visit */ }
}

function show(id) {
  document.querySelectorAll(".screen").forEach((s) => (s.hidden = s.id !== id));
  $("#error").hidden = true;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function toast(title, text, gold = false, delay = 0) {
  setTimeout(() => {
    const t = el(`div.toast${gold ? ".gold" : ""}`, null, el("span.tt", null, title), text);
    $("#toasts").append(t);
    setTimeout(() => t.remove(), 4200);
  }, delay);
}

// ---------- sound + vibration ----------

let soundOn = (() => { try { return localStorage.getItem(SOUND_KEY) !== "off"; } catch { return true; } })();
let audioCtx = null;

function tone(freq, dur = 0.08, type = "square", vol = 0.04, when = 0) {
  if (!soundOn) return;
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    const t = audioCtx.currentTime + when;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  } catch { /* no audio available */ }
}

const SFX = {
  blip: () => tone(1500, 0.025, "square", 0.012),
  tick: () => tone(1046, 0.06, "sine", 0.05),
  notify: () => { tone(880, 0.09, "sine", 0.06); tone(1320, 0.16, "sine", 0.06, 0.09); },
  levelUp: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.2, "triangle", 0.07, i * 0.09)),
  rankUp: () => {
    [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.24, "triangle", 0.07, i * 0.08));
    tone(1568, 0.7, "sine", 0.05, 0.5);
  },
  penalty: () => { tone(220, 0.28, "sawtooth", 0.05); tone(160, 0.45, "sawtooth", 0.05, 0.24); },
};

function buzz(pattern) {
  if (!soundOn || !navigator.vibrate) return;
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return; // browsers block it before a tap
  try { navigator.vibrate(pattern); } catch { /* unsupported */ }
}

function renderSoundToggle() {
  $("#sound-toggle").textContent = soundOn ? "🔊" : "🔇";
  $("#sound-toggle").setAttribute("aria-pressed", String(soundOn));
  $("#sound-toggle").title = soundOn ? "Sound and vibration on" : "Sound and vibration off";
}
$("#sound-toggle").addEventListener("click", () => {
  soundOn = !soundOn;
  try { localStorage.setItem(SOUND_KEY, soundOn ? "on" : "off"); } catch { /* ignore */ }
  renderSoundToggle();
  SFX.tick();
});

// ---------- System text + full-screen moments ----------

function typeText(node, text) {
  text = str(text);
  clearInterval(node._typing);
  if (reduceMotion || !text) {
    node.textContent = text;
    node.classList.remove("typing");
    return;
  }
  node.textContent = "";
  node.classList.add("typing");
  let i = 0;
  node._typing = setInterval(() => {
    node.textContent = text.slice(0, ++i);
    if (i % 3 === 0) SFX.blip();
    if (i >= text.length) {
      clearInterval(node._typing);
      node.classList.remove("typing");
    }
  }, 22);
}

let momentQueue = Promise.resolve();

// Queue a full-screen System window. Moments play one after another.
function moment(opts) {
  momentQueue = momentQueue.then(() => playMoment(opts));
  return momentQueue;
}

function playMoment({ title, big = "", rank = null, sub = "", gains = [], theme = "", sfx = null, vibrate = null }) {
  return new Promise((resolve) => {
    const overlay = $("#overlay");
    overlay.className = `overlay ${theme}${theme === "red" ? " shake" : ""}`;
    $("#ov-title").textContent = title;
    const bigEl = $("#ov-big");
    bigEl.className = "ov-big";
    bigEl.replaceChildren();
    if (rank) {
      bigEl.classList.add("rank", `rank-${rank}`);
      bigEl.append(el("span", null, rank));
    } else {
      bigEl.textContent = big;
    }
    $("#ov-gains").replaceChildren(...gains.map((g, i) =>
      el("li", { style: `animation-delay:${0.3 + i * 0.12}s` }, el("span", null, g.label), el("b", null, g.value))));
    overlay.hidden = false;
    typeText($("#ov-sub"), sub);
    if (sfx) SFX[sfx]();
    if (vibrate) buzz(vibrate);
    const button = $("#ov-continue");
    button.disabled = false;
    button.focus();
    const close = () => {
      overlay.hidden = true;
      button.removeEventListener("click", close);
      document.removeEventListener("keydown", onKey);
      resolve();
    };
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); close(); }
    };
    button.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
  });
}

// ---------- background particles ----------

(function particles() {
  const canvas = $("#particles");
  if (!canvas || reduceMotion) return;
  const ctx = canvas.getContext("2d");
  let w = 0, h = 0, dpr = 1;
  const dots = [];
  const resize = () => {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = canvas.width = innerWidth * dpr;
    h = canvas.height = innerHeight * dpr;
  };
  resize();
  addEventListener("resize", resize);
  const count = Math.round(Math.min(60, innerWidth / 18));
  for (let i = 0; i < count; i++) {
    dots.push({ x: Math.random() * w, y: Math.random() * h, r: (Math.random() * 1.6 + 0.4) * dpr,
      speed: (Math.random() * 0.35 + 0.1) * dpr, alpha: Math.random() * 0.6 + 0.2, phase: Math.random() * 6.3 });
  }
  const frame = () => {
    if (!document.hidden) {
      ctx.clearRect(0, 0, w, h);
      const red = document.body.classList.contains("penalty");
      ctx.shadowBlur = 8 * dpr;
      ctx.shadowColor = red ? "#ff5a5f" : "#4fb3ff";
      for (const d of dots) {
        d.y -= d.speed;
        d.phase += 0.01;
        d.x += Math.sin(d.phase) * 0.2 * dpr;
        if (d.y < -5) { d.y = h + 5; d.x = Math.random() * w; }
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fillStyle = red ? `rgba(255,90,95,${d.alpha})` : `rgba(79,179,255,${d.alpha})`;
        ctx.fill();
      }
    }
    requestAnimationFrame(frame);
  };
  frame();
})();

// ---------- API ----------

async function call(url, body, loadingText) {
  $("#loading-text").textContent = loadingText;
  $("#loading").hidden = false;
  $("#error").hidden = true;
  document.querySelectorAll(".btn").forEach((b) => (b.disabled = true));
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    let data;
    try { data = await res.json(); } catch { throw new Error(`Server error (${res.status}). Try again.`); }
    if (!res.ok) throw new Error(data.error || `Server error (${res.status}).`);
    return data.result;
  } catch (err) {
    $("#error").textContent = `[ERROR] ${err.message}`;
    $("#error").hidden = false;
    throw err;
  } finally {
    $("#loading").hidden = true;
    document.querySelectorAll(".btn").forEach((b) => (b.disabled = false));
  }
}

function chipGroup(container, options, multi) {
  container.replaceChildren(...options.map((o) => el("button.chip", {
    type: "button", "aria-pressed": "false",
    on: { click: (e) => {
      const chip = e.currentTarget;
      if (!multi) container.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", "false"));
      chip.setAttribute("aria-pressed", String(!(multi && chip.getAttribute("aria-pressed") === "true")));
      if (!multi) $("#skill").value = "";
      SFX.blip();
    } },
  }, o)));
}
const pressed = (container) => [...container.querySelectorAll(".chip[aria-pressed=true]")].map((c) => c.textContent);

// ---------- 1-3: onboarding ----------

$("#accept").addEventListener("click", () => {
  SFX.notify();
  chipGroup($("#skill-chips"), SKILLS, false);
  chipGroup($("#equip-chips"), EQUIPMENT, true);
  show("s-setup");
});
$("#skill").addEventListener("input", () =>
  document.querySelectorAll("#skill-chips .chip").forEach((c) => c.setAttribute("aria-pressed", "false")));

$("#begin-trial").addEventListener("click", async () => {
  const skill = $("#skill").value.trim() || pressed($("#skill-chips"))[0];
  if (!skill) return toast("[SYSTEM]", "Choose a skill to master.");
  Object.assign(state, {
    player: $("#player").value.trim() || "Player",
    skill,
    equipment: pressed($("#equip-chips")),
    minutes: +$("#minutes").value,
    days: +$("#days").value,
  });
  const result = await call("/api/assess", { skill }, "The System is preparing your trial…").catch(() => null);
  if (!result) return;
  assessQuestions = list(result.questions).filter((q) => q.q && list(q.options).length);
  $("#assess-form").replaceChildren(...assessQuestions.map((q, i) =>
    el("fieldset.question", { style: "border:0;padding:0" },
      el("p", null, `${i + 1}. ${str(q.q)}`),
      list(q.options).map((o) => el("label.option", null, el("input", { type: "radio", name: `q${i}`, value: str(o) }), str(o))))));
  show("s-assess");
  SFX.notify();
  typeText($("#assess-msg"), result.system_message);
});

$("#submit-assess").addEventListener("click", async () => {
  const answers = assessQuestions.map((q, i) => ({ q: q.q, a: document.querySelector(`input[name=q${i}]:checked`)?.value }));
  if (answers.some((a) => !a.a)) return toast("[SYSTEM]", "Answer every question. The System requires honesty.");
  const profile = await call("/api/awaken", {
    skill: state.skill, answers, equipment: state.equipment, minutes: state.minutes, days: state.days,
  }, "Measuring your power…").catch(() => null);
  if (!profile) return;
  const rankIndex = Math.max(0, RANKS.indexOf(str(profile.rank).trim().toUpperCase()));
  const stats = {};
  for (const s of STATS) stats[s] = Math.max(1, Math.min(99, int(profile.stats?.[s], 5)));
  Object.assign(state, {
    profile, rankIndex, stats, level: RANK_LEVEL[rankIndex], xp: 0,
    streak: 0, questsDone: 0, minutesOutside: 0, planIndex: 0, lastRatings: [], lastNote: "",
  });
  save();
  renderStatus();
  moment({
    title: "[ AWAKENING ]", rank: RANKS[rankIndex], theme: rankIndex >= 4 ? "gold" : "",
    sub: str(profile.system_message) || "You have awakened.",
    gains: [{ label: "Title", value: str(profile.title) }, ...STATS.map((s) => ({ label: s, value: String(stats[s]) }))],
    sfx: "rankUp", vibrate: [80, 60, 160],
  });
});

// ---------- 4: status ----------

function trainingDays() {
  const plan = list(state.profile?.weekly_plan);
  const days = plan.filter((d) => !/rest/i.test(str(d.focus)));
  return days.length ? days : [{ day: "Day 1", focus: `${state.skill} fundamentals` }];
}

function renderStatus() {
  const p = state.profile;
  if (state.lastQuestDate && daysBetween(state.lastQuestDate, today()) > 2 && state.streak > 0) {
    state.streak = 0;
    state.penalty = true;
    save();
    moment({
      title: "[ PENALTY ZONE ]", big: "WARNING", theme: "red",
      sub: "You abandoned your training. Your streak has been reset. Today's quest carries a penalty set.",
      sfx: "penalty", vibrate: [200, 80, 200],
    });
  }
  document.body.classList.toggle("penalty", !!state.penalty);
  $("#penalty-slot").replaceChildren(state.penalty
    ? el("div.penalty-banner", null, "⚠ PENALTY ACTIVE: complete today's quest to restore the System's trust.")
    : "");

  const rank = RANKS[state.rankIndex];
  const badge = $("#rank-badge");
  badge.className = `rank-badge rank-${rank}`;
  badge.replaceChildren(el("span", null, rank));
  $("#st-title").style.color = getComputedStyle(badge).getPropertyValue("--rank").trim() || "";
  $("#st-name").textContent = state.player;
  $("#st-title").textContent = str(p.title);
  $("#st-level").textContent = state.level;
  $("#st-skill").textContent = state.skill;
  $("#st-streak").textContent = state.streak || 0;
  const need = xpToNext(state.level);
  requestAnimationFrame(() => ($("#xp-fill").style.width = `${Math.min(100, (state.xp / need) * 100)}%`));
  $("#xp-text").textContent = `XP ${state.xp} / ${need}`;
  renderStats();

  const next = state.rankIndex + 1;
  $("#rank-test").replaceChildren();
  if (next < RANKS.length && state.level >= RANK_LEVEL[next]) {
    $("#rank-test").append(el("div.rank-test", null,
      el("h3", null, `[ RANK-UP TEST: ${rank} → ${RANKS[next]} ]`),
      el("p", null, str(p.rank_up_test) || "Complete your hardest drill at the 'harder' level."),
      el("button.btn.small", { type: "button", on: { click: passRankTest } }, "I passed the test")));
  } else if (next < RANKS.length) {
    $("#rank-test").append(el("p.dim", { style: "margin:12px 0 0;font-size:.85rem" },
      `Rank-up test unlocks at LV. ${RANK_LEVEL[next]}.`));
  }

  $("#st-summary").textContent = str(p.summary);
  $("#st-goal").textContent = str(p.goal);
  $("#st-strengths").textContent = list(p.strengths).join(", ") || "—";
  $("#st-weak").textContent = list(p.weaknesses).join(", ") || "—";
  $("#st-done").textContent = state.questsDone;
  $("#st-mins").textContent = `${state.minutesOutside} min`;
  const focus = trainingDays()[state.planIndex % trainingDays().length].focus;
  $("#st-plan").replaceChildren(...list(p.weekly_plan).map((d) => el(
    `li${/rest/i.test(str(d.focus)) ? ".rest" : ""}${d.focus === focus ? ".today" : ""}`, null,
    `${str(d.focus)}${d.focus === focus ? "  ← next quest" : ""}`)));
  show("s-status");
}

function renderStats() {
  const gains = freshGains || {};
  freshGains = null;
  const max = Math.max(20, ...STATS.map((s) => state.stats[s]));
  const box = $("#stats");
  box.className = "stats bars";
  box.replaceChildren(...STATS.map((s) => {
    const fill = el("div.s-fill");
    const before = state.stats[s] - (gains[s] || 0);
    fill.style.width = `${(before / max) * 100}%`;
    requestAnimationFrame(() => requestAnimationFrame(() => (fill.style.width = `${(state.stats[s] / max) * 100}%`)));
    return el(`div.stat-row${gains[s] ? ".gained" : ""}`, null,
      el("span.s-name", null, s),
      el("div.s-bar", null, fill),
      el("span.s-val", null, String(state.stats[s]), gains[s] ? el("span.s-plus", null, `+${gains[s]}`) : null));
  }));
}

function passRankTest() {
  state.rankIndex += 1;
  const r = RANKS[state.rankIndex];
  state.profile.title = str(state.profile.title).replace(/^[EDCBAS]-Rank/, `${r}-Rank`);
  save();
  renderStatus();
  moment({
    title: "[ RANK UP ]", rank: r, theme: "gold",
    sub: `You are now ${r}-Rank. The System acknowledges your growth.`,
    gains: [{ label: "New title", value: str(state.profile.title) }],
    sfx: "rankUp", vibrate: [100, 60, 100, 60, 250],
  });
}

$("#reset").addEventListener("click", () => {
  if (!confirm("Erase this Player and start over?")) return;
  state = {};
  save();
  document.body.classList.remove("penalty");
  show("s-intro");
});

// ---------- 5-6: quest ----------

async function fetchQuest() {
  const day = trainingDays()[state.planIndex % trainingDays().length];
  const focus = str(day.focus) + (state.penalty ? " (penalty quest: add one extra set to the first drill)" : "");
  const quest = await call("/api/quest", {
    skill: state.skill, profile: state.profile, level: state.level, equipment: state.equipment,
    minutes: state.minutes, quest_number: state.questsDone + 1, focus,
    ratings: state.lastRatings, note: state.lastNote,
  }, "A Daily Quest is arriving…").catch(() => null);
  if (!quest) return;
  quest.drills = list(quest.drills).filter((d) => d.name);
  state.quest = quest;
  state.checked = [];
  save();
  SFX.notify();
  buzz(40);
  renderQuest();
}

function renderQuest() {
  const q = state.quest;
  $("#q-name").textContent = str(q.name);
  $("#q-location").textContent = str(q.location) || "Anywhere outside";
  const simple = (items) => list(items).map((w) => el("div.drill", null,
    el("div.drill-head", null, el("b", null, str(w.name)), el("span.target", null, str(w.target))),
    w.how ? el("p", null, str(w.how)) : null));
  const totalXp = q.drills.reduce((s, d) => s + int(d.xp), 0);
  $("#q-body").replaceChildren(
    el("div.q-section", null, el("h3", null, "Warm-up"), simple(q.warmup)),
    el("div.q-section", null, el("h3", null, `Drills · ${totalXp} XP`), q.drills.map((d) => el("div.drill", null,
      el("div.drill-head", null, el("b", null, str(d.name)), el("span.target", null, str(d.target))),
      el("p", null, str(d.how)),
      el("div.tags", null, el("span.tag.tag-xp", null, `+${int(d.xp)} XP`), STATS.includes(d.stat) ? el("span.tag", null, `${d.stat} +1`) : null),
      d.easier || d.harder ? el("details", null, el("summary", null, "Easier / harder"),
        d.easier ? el("div", null, "⬇ ", str(d.easier)) : null, d.harder ? el("div", null, "⬆ ", str(d.harder)) : null) : null))),
    el("div.q-section", null, el("h3", null, "Cool-down"), simple(q.cooldown)),
    q.bonus?.task ? el("div.q-section", null, el("h3", null, `Bonus · +${int(q.bonus.xp)} XP`), el("p", null, str(q.bonus.task))) : null,
  );
  $("#q-safety").textContent = q.safety ? `⚠ ${str(q.safety)}` : "";
  show("s-quest");
  typeText($("#q-msg"), q.system_message);
}

$("#get-quest").addEventListener("click", () => (state.quest ? renderQuest() : fetchQuest()));
$("#q-new").addEventListener("click", fetchQuest);
$("#q-back").addEventListener("click", renderStatus);
$("#q-start").addEventListener("click", () => {
  state.questStart = Date.now();
  state.checked = [];
  delete state.lastTickAt;
  state.motion = 0;
  save();
  startMotion();
  SFX.notify();
  buzz([40, 40, 40]);
  toast("[QUEST ACCEPTED]", "The timer has started. Go outside.");
  renderActive();
});

// ---------- anti-cheat: time lock, tick spacing, movement ----------

const minReportMs = () => Math.max(5, Math.round((state.minutes || 30) * 0.5)) * 60_000;
const clock = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

let motionListening = false;
let sensorSeen = false;
let lastMotionSave = 0;

function onMotion(e) {
  let mag;
  const a = e.acceleration;
  if (a && a.x != null) {
    mag = Math.hypot(a.x, a.y, a.z);
  } else {
    const g = e.accelerationIncludingGravity;
    if (!g || g.x == null) return;
    mag = Math.abs(Math.hypot(g.x, g.y, g.z) - 9.81);
  }
  sensorSeen = true;
  if (!state.questStart) return;
  if (mag > MOTION_THRESHOLD) state.motion = (state.motion || 0) + mag * ((e.interval || 16) / 1000);
  if (Date.now() - lastMotionSave > 5000) {
    lastMotionSave = Date.now();
    save();
  }
}

async function startMotion() {
  if (motionListening || !("DeviceMotionEvent" in window)) return;
  try {
    // iOS asks for permission, and only from a tap
    if (typeof DeviceMotionEvent.requestPermission === "function") {
      if ((await DeviceMotionEvent.requestPermission()) !== "granted") return;
    }
  } catch { return; }
  addEventListener("devicemotion", onMotion);
  motionListening = true;
}

function renderMotion() {
  const node = $("#motion");
  if (!sensorSeen) {
    node.textContent = "Movement sensor: not available on this device";
    node.className = "motion off";
    return;
  }
  const score = state.motion || 0;
  const bars = Math.min(5, Math.floor(score / (MOTION_VERIFIED / 5)));
  node.className = `motion${score >= MOTION_VERIFIED ? " verified" : ""}`;
  node.textContent = `Movement ${"▮".repeat(bars)}${"▯".repeat(5 - bars)}  ${score >= MOTION_VERIFIED ? "VERIFIED: +10% XP" : "keep moving"}`;
}

function questItems(q, withBonus = false) {
  return [
    { key: "warmup", label: "Warm-up" },
    ...q.drills.map((d, i) => ({ key: `d${i}`, label: `${str(d.name)}: ${str(d.target)}` })),
    { key: "cooldown", label: "Cool-down" },
    ...(withBonus && q.bonus?.task ? [{ key: "bonus", label: `Bonus (+${int(q.bonus.xp)} XP): ${str(q.bonus.task)}` }] : []),
  ];
}

function updateRing() {
  const required = questItems(state.quest).map((i) => i.key);
  const total = required.length;
  const done = (state.checked || []).filter((k) => required.includes(k)).length;
  $("#ring").style.strokeDashoffset = String(RING * (1 - done / total));
  $("#ring-count").textContent = `${done} / ${total} done`;
}

function renderActive() {
  const q = state.quest;
  state.checked ||= [];
  $("#active-list").replaceChildren(...questItems(q, true).map((item) => {
    const box = el("input", { type: "checkbox" });
    box.checked = state.checked.includes(item.key);
    box.addEventListener("change", () => {
      if (box.checked) {
        const since = Date.now() - (state.lastTickAt || state.questStart);
        if (since < TICK_GAP_MS) {
          box.checked = false;
          SFX.penalty();
          buzz([80, 40, 80]);
          toast("[SYSTEM]", `Too fast. The System saw that. Finish the drill first (${clock(TICK_GAP_MS - since)}).`);
          return;
        }
        state.lastTickAt = Date.now();
      }
      state.checked = box.checked ? [...new Set([...state.checked, item.key])] : state.checked.filter((k) => k !== item.key);
      save();
      updateRing();
      if (box.checked) { SFX.tick(); buzz(15); }
      if (questItems(q).every((i) => state.checked.includes(i.key))) {
        SFX.notify();
        toast("[ALL OBJECTIVES COMPLETE]", "Report back to claim your rewards.", true);
      }
    });
    return el("li", null, el("label", null, box, el("span", null, item.label)));
  }));
  updateRing();
  if (typeof DeviceMotionEvent === "undefined" || typeof DeviceMotionEvent.requestPermission !== "function") startMotion();
  const tick = () => {
    const elapsed = Date.now() - state.questStart;
    $("#timer").textContent = clock(elapsed);
    const left = minReportMs() - elapsed;
    const button = $("#q-done");
    button.disabled = left > 0;
    button.textContent = left > 0 ? `Report unlocks in ${clock(left)}` : "I'm back: report";
    renderMotion();
  };
  tick();
  clearInterval(timerId);
  timerId = setInterval(tick, 1000);
  show("s-active");
}

// ---------- 7: debrief and rewards ----------

$("#q-done").addEventListener("click", () => {
  clearInterval(timerId);
  const q = state.quest;
  const checked = state.checked || [];
  $("#debrief-list").replaceChildren(...q.drills.map((d, i) => {
    const ticked = checked.includes(`d${i}`);
    const opts = el("div.rate-opts");
    chipGroupRatings(opts, i, ticked ? "ok" : "skipped", !ticked);
    return el(`div.rate${ticked ? "" : ".locked"}`, null,
      el("b", null, str(d.name), ticked ? null : el("small", null, "  · not ticked during the quest, so no XP")), opts);
  }));
  $("#bonus-text").textContent = str(q.bonus?.task) || "none";
  $("#bonus-done").checked = checked.includes("bonus");
  $("#bonus-done").disabled = true; // the bonus counts only if it was ticked during the quest
  $("#note").value = "";
  show("s-debrief");
});

function chipGroupRatings(container, index, initial, locked = false) {
  container.dataset.index = index;
  container.replaceChildren(...RATINGS.map(([value, label]) => el("button.chip", {
    type: "button", "data-r": value, "aria-pressed": value === initial ? "true" : "false", disabled: locked,
    on: { click: (e) => {
      container.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", "false"));
      e.currentTarget.setAttribute("aria-pressed", "true");
      SFX.blip();
    } },
  }, label)));
}

$("#claim").addEventListener("click", () => {
  const q = state.quest;
  const checked = state.checked || [];
  const ratings = q.drills.map((d, i) => ({
    name: d.name,
    rating: checked.includes(`d${i}`)
      ? document.querySelector(`.rate-opts[data-index="${i}"] .chip[aria-pressed=true]`)?.dataset.r || "ok"
      : "skipped", // unticked drills never earn XP
  }));
  if (ratings.every((r) => r.rating === "skipped")) {
    delete state.quest;
    delete state.questStart;
    delete state.checked;
    delete state.lastTickAt;
    delete state.motion;
    save();
    renderStatus();
    moment({
      title: "[ QUEST FAILED ]", big: "0 XP", theme: "red",
      sub: "No objectives were completed. The System does not reward intentions.",
      sfx: "penalty", vibrate: [200, 80, 200],
    });
    return;
  }
  let gained = 0;
  const statGains = {};
  q.drills.forEach((d, i) => {
    if (ratings[i].rating === "skipped") return;
    gained += Math.max(0, Math.min(100, int(d.xp)));
    if (STATS.includes(d.stat)) statGains[d.stat] = (statGains[d.stat] || 0) + 1;
  });
  const bonusDone = checked.includes("bonus");
  if (bonusDone) gained += Math.max(0, Math.min(100, int(q.bonus?.xp)));
  const moved = (state.motion || 0) >= MOTION_VERIFIED;
  if (moved) gained = Math.round(gained * 1.1);
  if (ratings.every((r) => r.rating !== "skipped")) statGains.FOC = (statGains.FOC || 0) + 1;

  const d = today();
  if (state.lastQuestDate !== d) {
    state.streak = state.lastQuestDate && daysBetween(state.lastQuestDate, d) <= 2 ? (state.streak || 0) + 1 : 1;
  }
  const wasPenalty = state.penalty;
  state.lastQuestDate = d;
  state.penalty = false;
  state.questsDone += 1;
  state.minutesOutside += Math.min(240, Math.max(1, Math.round((Date.now() - state.questStart) / 60000)));
  state.planIndex += 1;
  state.lastRatings = ratings;
  state.lastNote = $("#note").value.trim();
  const before = { ...state.stats };
  for (const [s, n] of Object.entries(statGains)) state.stats[s] += n;

  const startLevel = state.level;
  state.xp += gained;
  while (state.xp >= xpToNext(state.level)) {
    state.xp -= xpToNext(state.level);
    state.level += 1;
  }
  delete state.quest;
  delete state.questStart;
  delete state.checked;
  delete state.lastTickAt;
  delete state.motion;
  save();

  freshGains = statGains;
  renderStatus();

  moment({
    title: "[ QUEST COMPLETE ]", big: `+${gained} XP`,
    sub: wasPenalty ? "Penalty cleared. The System restores your standing." : "Rewards have been granted.",
    gains: [
      ...Object.keys(statGains).map((s) => ({ label: s, value: `${before[s]} → ${state.stats[s]}` })),
      ...(bonusDone ? [{ label: "Bonus quest", value: "Cleared" }] : []),
      ...(moved ? [{ label: "Movement verified", value: "+10% XP" }] : []),
      { label: "Streak", value: `🔥 ${state.streak}` },
    ],
    sfx: "notify", vibrate: [40],
  });
  if (state.level > startLevel) {
    const n = state.level - startLevel;
    moment({
      title: "[ LEVEL UP ]", big: `LV. ${state.level}`, theme: "gold",
      sub: n > 1 ? `You gained ${n} levels. Your limits are breaking.` : "You have grown stronger.",
      sfx: "levelUp", vibrate: [60, 40, 140],
    });
    const next = state.rankIndex + 1;
    if (next < RANKS.length && startLevel < RANK_LEVEL[next] && state.level >= RANK_LEVEL[next]) {
      moment({
        title: "[ RANK-UP TEST UNLOCKED ]", rank: RANKS[next], theme: "gold",
        sub: str(state.profile.rank_up_test) || "Prove your growth to the System.",
        sfx: "notify",
      });
    }
  }
  if (ratings.some((r) => r.rating === "pain")) {
    momentQueue.then(() => toast("[SYSTEM]", "Pain noted. Tomorrow's quest will protect that area. Rest if it continues."));
  }
});

// ---------- boot ----------

renderSoundToggle();
if (state.profile && state.quest && state.questStart) {
  document.body.classList.toggle("penalty", !!state.penalty);
  renderActive();
} else if (state.profile) renderStatus();
else show("s-intro");
