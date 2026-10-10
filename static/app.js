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

const $ = (s) => document.querySelector(s);
let state = load();
let assessQuestions = [];
let timerId = null;

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
    } },
  }, o)));
}
const pressed = (container) => [...container.querySelectorAll(".chip[aria-pressed=true]")].map((c) => c.textContent);

// ---------- 1-3: onboarding ----------

$("#accept").addEventListener("click", () => {
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
  $("#assess-msg").textContent = str(result.system_message);
  $("#assess-form").replaceChildren(...assessQuestions.map((q, i) =>
    el("fieldset.question", { style: "border:0;padding:0" },
      el("p", null, `${i + 1}. ${str(q.q)}`),
      list(q.options).map((o) => el("label.option", null, el("input", { type: "radio", name: `q${i}`, value: str(o) }), str(o))))));
  show("s-assess");
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
  toast("[AWAKENING]", str(profile.system_message) || "You have awakened.", true);
  toast("[RANK ASSIGNED]", str(profile.title) || `${RANKS[rankIndex]}-Rank`, false, 900);
  renderStatus();
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
    toast("[PENALTY]", "You abandoned training. Your streak is reset. Today's quest carries a penalty set.", false, 300);
  }
  $("#rank-badge").replaceChildren(el("span", null, RANKS[state.rankIndex]));
  $("#st-name").textContent = state.player;
  $("#st-title").textContent = str(p.title);
  $("#st-level").textContent = state.level;
  $("#st-skill").textContent = state.skill;
  $("#st-streak").textContent = state.streak || 0;
  const need = xpToNext(state.level);
  $("#xp-fill").style.width = `${Math.min(100, (state.xp / need) * 100)}%`;
  $("#xp-text").textContent = `XP ${state.xp} / ${need}`;
  $("#stats").replaceChildren(...STATS.map((s) => el("div.stat", null, el("b", null, state.stats[s]), el("small", null, s))));

  const next = state.rankIndex + 1;
  $("#rank-test").replaceChildren();
  if (next < RANKS.length && state.level >= RANK_LEVEL[next]) {
    $("#rank-test").append(el("div.rank-test", null,
      el("h3", null, `[ RANK-UP TEST: ${RANKS[state.rankIndex]} → ${RANKS[next]} ]`),
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

function passRankTest() {
  state.rankIndex += 1;
  const r = RANKS[state.rankIndex];
  state.profile.title = str(state.profile.title).replace(/^[EDCBAS]-Rank/, `${r}-Rank`);
  save();
  toast("[RANK UP]", `You are now ${r}-Rank. The System acknowledges your growth.`, true);
  renderStatus();
}

$("#reset").addEventListener("click", () => {
  if (!confirm("Erase this Player and start over?")) return;
  state = {};
  save();
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
  save();
  renderQuest();
}

function renderQuest() {
  const q = state.quest;
  $("#q-name").textContent = str(q.name);
  $("#q-msg").textContent = str(q.system_message);
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
}

$("#get-quest").addEventListener("click", () => (state.quest ? renderQuest() : fetchQuest()));
$("#q-new").addEventListener("click", fetchQuest);
$("#q-back").addEventListener("click", renderStatus);
$("#q-start").addEventListener("click", () => {
  state.questStart = Date.now();
  save();
  toast("[QUEST ACCEPTED]", "The timer has started. Go outside.");
  renderActive();
});

function renderActive() {
  const q = state.quest;
  $("#active-list").replaceChildren(
    el("li", null, "Warm-up"),
    ...q.drills.map((d) => el("li", null, `${str(d.name)}: ${str(d.target)}`)),
    el("li", null, "Cool-down"));
  const tick = () => {
    const s = Math.floor((Date.now() - state.questStart) / 1000);
    $("#timer").textContent = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
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
  $("#debrief-list").replaceChildren(...q.drills.map((d, i) => {
    const opts = el("div.rate-opts");
    chipGroupRatings(opts, i);
    return el("div.rate", null, el("b", null, str(d.name)), opts);
  }));
  $("#bonus-text").textContent = str(q.bonus?.task) || "none";
  $("#bonus-done").checked = false;
  $("#bonus-done").disabled = !q.bonus?.task;
  $("#note").value = "";
  show("s-debrief");
});

function chipGroupRatings(container, index) {
  container.dataset.index = index;
  container.replaceChildren(...RATINGS.map(([value, label]) => el("button.chip", {
    type: "button", "data-r": value, "aria-pressed": value === "ok" ? "true" : "false",
    on: { click: (e) => {
      container.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", "false"));
      e.currentTarget.setAttribute("aria-pressed", "true");
    } },
  }, label)));
}

$("#claim").addEventListener("click", () => {
  const q = state.quest;
  const ratings = q.drills.map((d, i) => ({
    name: d.name,
    rating: document.querySelector(`.rate-opts[data-index="${i}"] .chip[aria-pressed=true]`)?.dataset.r || "ok",
  }));
  let gained = 0;
  const statGains = {};
  q.drills.forEach((d, i) => {
    if (ratings[i].rating === "skipped") return;
    gained += Math.max(0, Math.min(100, int(d.xp)));
    if (STATS.includes(d.stat)) statGains[d.stat] = (statGains[d.stat] || 0) + 1;
  });
  if ($("#bonus-done").checked) gained += Math.max(0, Math.min(100, int(q.bonus?.xp)));
  if (ratings.every((r) => r.rating !== "skipped")) statGains.FOC = (statGains.FOC || 0) + 1;

  const d = today();
  if (state.lastQuestDate !== d) {
    state.streak = state.lastQuestDate && daysBetween(state.lastQuestDate, d) <= 2 ? (state.streak || 0) + 1 : 1;
  }
  state.lastQuestDate = d;
  state.penalty = false;
  state.questsDone += 1;
  state.minutesOutside += Math.min(240, Math.max(1, Math.round((Date.now() - state.questStart) / 60000)));
  state.planIndex += 1;
  state.lastRatings = ratings;
  state.lastNote = $("#note").value.trim();
  for (const [s, n] of Object.entries(statGains)) state.stats[s] += n;

  toast("[QUEST COMPLETE]", `+${gained} XP`, true);
  let delay = 700;
  state.xp += gained;
  while (state.xp >= xpToNext(state.level)) {
    state.xp -= xpToNext(state.level);
    state.level += 1;
    toast("[LEVEL UP]", `You are now LV. ${state.level}.`, true, delay);
    delay += 700;
  }
  const gains = Object.entries(statGains).map(([s, n]) => `${s} +${n}`).join("  ·  ");
  if (gains) toast("[STATS INCREASED]", gains, false, delay);
  if (ratings.some((r) => r.rating === "pain")) {
    toast("[SYSTEM]", "Pain noted. Tomorrow's quest will protect that area. Rest if it continues.", false, delay + 700);
  }
  delete state.quest;
  delete state.questStart;
  save();
  renderStatus();
});

// ---------- boot ----------

if (state.profile && state.quest && state.questStart) renderActive();
else if (state.profile) renderStatus();
else show("s-intro");
