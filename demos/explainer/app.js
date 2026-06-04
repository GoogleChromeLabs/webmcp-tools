/* ============================================================
   WebMCP demo — interactive logic
   ============================================================ */

(() => {
  // ----- DATE HELPERS ----------------------------------------
  const MONTHS = ["January","February","March","April","May","June",
                  "July","August","September","October","November","December"];
  const DOW_SHORT = ["S","M","T","W","T","F","S"];

  const pad2 = (n) => String(n).padStart(2, "0");
  const fmtISO = (d) => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
  const fmtLongDate = (d) => `${["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  function nextWeekday(targetDow, from = new Date()) {
    const d = new Date(from);
    d.setHours(0,0,0,0);
    const diff = (targetDow - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + diff);
    return d;
  }

  const TODAY = (() => { const d = new Date(); d.setHours(0,0,0,0); return d; })();

  // ----- AVAILABILITY (deterministic, shared) ----------------
  const ALL_SLOTS = ["09:00","10:00","11:00","14:00","15:00","16:00"];

  function buildAvailability() {
    const days = {};
    // build 8 weeks of availability starting today
    for (let i = 0; i < 56; i++) {
      const d = new Date(TODAY);
      d.setDate(d.getDate() + i);
      if (d.getDay() === 0 || d.getDay() === 6) continue;     // skip weekends
      // pseudo-random availability by date-of-year
      const seed = d.getDate() * 7 + d.getMonth() * 13;
      const slots = ALL_SLOTS.filter((_, idx) => ((seed + idx * 5) % 7) > 1);
      // guarantee 14:00 on Tuesdays so the demo simulation always succeeds
      if (d.getDay() === 2 && !slots.includes("14:00")) slots.push("14:00");
      if (slots.length === 0) continue;
      days[fmtISO(d)] = slots.sort();
    }
    return days;
  }

  const AVAILABILITY = buildAvailability();

  function fmtTime(t) {
    const [h, m] = t.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = ((h + 11) % 12) + 1;
    return `${h12}:${pad2(m)} ${ampm}`;
  }

  // ----- BOOKING WIDGET --------------------------------------
  // Builds a calendar + slot picker + form. Shared between both panels.
  function createBookingWidget(root, opts = {}) {
    const state = {
      viewMonth: new Date(TODAY.getFullYear(), TODAY.getMonth(), 1),
      selectedDate: null,    // ISO string
      selectedSlot: null,    // "HH:MM"
      name: "",
      email: "",
      confirmed: null,       // { id, date, time }
    };

    root.innerHTML = "";
    root.classList.add("widget");

    // Header
    const head = document.createElement("div");
    head.className = "w-head";
    head.innerHTML = `
      <div>
        <p style="margin: 0 0 5px;"><span class="w-title">Book a 30-min consultation</span>  <span class="w-sub">Pick a day, choose a time, share your info.</span></p>
      </div>
    `;
    root.appendChild(head);

    // Month switcher
    const monthBar = document.createElement("div");
    monthBar.className = "w-month";
    monthBar.innerHTML = `
      <button type="button" aria-label="Previous month" data-nav="prev">‹</button>
      <span class="w-month-label"></span>
      <button type="button" aria-label="Next month" data-nav="next">›</button>
    `;
    root.appendChild(monthBar);

    // Calendar grid
    const cal = document.createElement("div");
    cal.className = "w-cal";
    cal.setAttribute("role", "grid");
    cal.setAttribute("aria-label", "Available booking dates");
    root.appendChild(cal);

    // Slots container
    const slotsLabel = document.createElement("p");
    slotsLabel.className = "w-sub";
    slotsLabel.style.marginBottom = "-8px";
    slotsLabel.textContent = "Available times — pick a date first";
    root.appendChild(slotsLabel);

    const slots = document.createElement("div");
    slots.className = "w-slots";
    root.appendChild(slots);

    // Form
    const form = document.createElement("form");
    form.className = "w-form";
    form.setAttribute("novalidate", "");
    form.innerHTML = `
      <label>Name<input type="text" name="name" autocomplete="name" /></label>
      <label>Email<input type="email" name="email" autocomplete="email" /></label>
      <button type="submit" class="w-confirm" disabled>Confirm booking</button>
      <div class="w-success" role="status"></div>
    `;
    root.appendChild(form);

    const nameInput = form.querySelector('input[name="name"]');
    const emailInput = form.querySelector('input[name="email"]');
    const submitBtn = form.querySelector(".w-confirm");
    const successEl = form.querySelector(".w-success");

    // ----- render functions ----------------------------------
    function renderMonth() {
      const m = state.viewMonth.getMonth();
      const y = state.viewMonth.getFullYear();
      monthBar.querySelector(".w-month-label").textContent = `${MONTHS[m]} ${y}`;

      cal.innerHTML = "";
      // DoW headers
      DOW_SHORT.forEach((d, i) => {
        const el = document.createElement("div");
        el.className = "w-dow";
        el.textContent = d;
        el.setAttribute("aria-hidden", "true");
        cal.appendChild(el);
      });

      const firstDow = new Date(y, m, 1).getDay();
      const daysInMonth = new Date(y, m + 1, 0).getDate();
      const prevDays = new Date(y, m, 0).getDate();

      // Leading days from previous month
      for (let i = 0; i < firstDow; i++) {
        const dn = prevDays - firstDow + 1 + i;
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "w-day is-other";
        cell.textContent = dn;
        cell.disabled = true;
        cell.tabIndex = -1;
        cell.setAttribute("aria-hidden", "true");
        cal.appendChild(cell);
      }

      // Days in this month
      for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(y, m, d);
        const iso = fmtISO(date);
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "w-day";
        cell.textContent = d;
        cell.dataset.date = iso;
        cell.setAttribute("aria-label", fmtLongDate(date));

        const has = !!AVAILABILITY[iso];
        const inPast = date < TODAY;
        if (has && !inPast) cell.classList.add("has-slots");
        else cell.disabled = true;

        if (state.selectedDate === iso) cell.classList.add("is-selected");

        cell.addEventListener("click", () => selectDate(iso));
        cal.appendChild(cell);
      }
    }

    function renderSlots() {
      slots.innerHTML = "";
      if (!state.selectedDate) {
        slotsLabel.textContent = "Available times — pick a date first";
        return;
      }
      const date = new Date(state.selectedDate + "T00:00");
      slotsLabel.textContent = `Available times — ${fmtLongDate(date)}`;
      const list = AVAILABILITY[state.selectedDate] || [];
      // render all 6 slots; disable unavailable
      ALL_SLOTS.forEach((t) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "w-slot";
        btn.dataset.time = t;
        btn.textContent = fmtTime(t);
        const available = list.includes(t);
        if (!available) btn.disabled = true;
        if (state.selectedSlot === t) btn.classList.add("is-selected");
        btn.addEventListener("click", () => selectSlot(t));
        slots.appendChild(btn);
      });
    }

    function selectDate(iso) {
      state.selectedDate = iso;
      state.selectedSlot = null;
      state.confirmed = null;
      successEl.classList.remove("is-visible");
      renderMonth();
      renderSlots();
      updateSubmit();
      opts.onChange?.(state);
    }

    function selectSlot(t) {
      state.selectedSlot = t;
      state.confirmed = null;
      successEl.classList.remove("is-visible");
      renderSlots();
      updateSubmit();
      opts.onChange?.(state);
    }

    function updateSubmit() {
      const ok = state.selectedDate && state.selectedSlot && state.name.trim() && state.email.trim();
      submitBtn.disabled = !ok;
    }

    nameInput.addEventListener("input", (e) => {
      state.name = e.target.value;
      updateSubmit();
      opts.onChange?.(state);
    });
    emailInput.addEventListener("input", (e) => {
      state.email = e.target.value;
      updateSubmit();
      opts.onChange?.(state);
    });

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      doConfirm();
    });

    function doConfirm() {
      if (submitBtn.disabled) return;
      const id = "BK-" + Math.random().toString(36).slice(2, 8).toUpperCase();
      state.confirmed = { id, date: state.selectedDate, time: state.selectedSlot };
      successEl.classList.add("is-visible");
      const date = new Date(state.selectedDate + "T00:00");
      successEl.innerHTML = `Booked! ${fmtLongDate(date)} at ${fmtTime(state.selectedSlot)} · <code>${id}</code>`;
      opts.onConfirm?.(state);
    }

    // imperative API used by simulation
    const api = {
      el: root,
      state,
      selectDate,
      selectSlot,
      setName(v) { nameInput.value = v; state.name = v; updateSubmit(); },
      setEmail(v) { emailInput.value = v; state.email = v; updateSubmit(); },
      focusEl(sel) { return root.querySelector(sel); },
      confirm: doConfirm,
      jumpToMonth(date) {
        state.viewMonth = new Date(date.getFullYear(), date.getMonth(), 1);
        renderMonth();
      },
      reset() {
        state.selectedDate = null;
        state.selectedSlot = null;
        state.confirmed = null;
        nameInput.value = "";
        emailInput.value = "";
        state.name = "";
        state.email = "";
        successEl.classList.remove("is-visible");
        state.viewMonth = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1);
        renderMonth();
        renderSlots();
        updateSubmit();
      },
    };

    monthBar.querySelectorAll("button").forEach((b) => {
      b.addEventListener("click", () => {
        const dir = b.dataset.nav === "next" ? 1 : -1;
        const v = state.viewMonth;
        state.viewMonth = new Date(v.getFullYear(), v.getMonth() + dir, 1);
        renderMonth();
      });
    });

    renderMonth();
    renderSlots();
    return api;
  }

  // ----- BUILD WIDGETS ---------------------------------------
  const widgetWithout = createBookingWidget(document.getElementById("widget-without"));
  const widgetWith = createBookingWidget(document.getElementById("widget-with"));

  // Pre-select the next Tuesday on both widgets so the booking flow is fully
  // visible at rest — important for the without-panel annotations to have
  // their slot target.
  const _nextTueISO = fmtISO(nextWeekday(2));
  widgetWithout.selectDate(_nextTueISO);
  widgetWith.selectDate(_nextTueISO);

  // ----- TOOLS PANEL UI --------------------------------------
  const toolsListEl = document.getElementById("tools-list");
  const toolsCountEl = document.getElementById("tools-count");
  const toolCallEl = document.getElementById("tool-call");
  const toolCallCodeEl = document.getElementById("tool-call-code");
  const statusEl = document.getElementById("insert-status");

  // ----- WEBMCP REGISTRATION ---------------------------------
  // Detect the real WebMCP API. If present, tools are registered with the
  // browser via document.modelContext.registerTool — a connected agent (or
  // the WebMCP / Model Context Tool Inspector extension) can then call them.
  // If absent, we fall back to an in-page registry so the visual demo still
  // works.
  const HAS_WEBMCP = !!(globalThis.navigator && document.modelContext &&
                       typeof document.modelContext.registerTool === "function");

  if (statusEl) {
    if (HAS_WEBMCP) {
      statusEl.classList.add("is-live");
      statusEl.innerHTML = `<span class="webmcp-dot"></span> Congrats! <code>document.modelContext</code> is detected — these tools are live to your agent. Install the install the <a href="https://chromewebstore.google.com/detail/webmcp-model-context-tool/gbpdfapgefenggkahomfgkhfehlcenpd" target="_blank" rel="noopener">WebMCP extension</a> to experiment with the right panel. For instance, you can write in natural language that would like to <strong>book an appointment on the 21st at 11 AM</strong>, and see the agent call the tools to make it happen!
`;
    } else {
      statusEl.classList.add("is-shim");
      statusEl.innerHTML = `<span class="webmcp-dot"></span> This is a simulation — install the <a href="https://chromewebstore.google.com/detail/webmcp-model-context-tool/gbpdfapgefenggkahomfgkhfehlcenpd" target="_blank" rel="noopener">WebMCP extension</a> and run Chrome with this flag enabled: <code>chrome://flags/#enable-webmcp-testing</code>. Then refresh this page and you should see "live" status — your agent can call the tools on this page!`;
    }
  }

  // Internal mirror, used by the on-page tools panel UI.
  const localRegistry = [];

  function registerTool(spec) {
    // Wrap execute so EVERY invocation — whether from the in-page sim or a
    // real WebMCP agent — flashes the matching tool card and shows the call
    // in the "Last call" panel. Tools no longer need to call flashTool() themselves.
    const userExecute = spec.execute;
    const wrappedExecute = async (input, client) => {
      flashTool(spec.name, input);
      return await userExecute(input, client);
    };
    const wrappedSpec = { ...spec, execute: wrappedExecute };
    localRegistry.push(wrappedSpec);

    if (HAS_WEBMCP) {
      try {
        document.modelContext.registerTool({
          name: spec.name,
          title: spec.title,
          description: spec.description,
          inputSchema: spec.inputSchema,
          annotations: spec.annotations || {},
          execute: wrappedExecute,
        });
      } catch (err) {
        // duplicate name on hot reload, invalid schema, etc. — non-fatal here
        console.warn(`[webmcp-demo] registerTool("${spec.name}") failed:`, err);
      }
    }
    renderToolsPanel();
  }
  // expose for inspection
  window.__webmcpDemoTools = localRegistry;

  // ----- TOOL DEFINITIONS ------------------------------------
  // Each tool is registered with the browser AND mirrored locally so the
  // on-page panel can display schema and animate calls.

  registerTool({
    name: "getAvailability",
    title: "Get booking availability",
    description: "List bookable consultation times within a date range. Returns an object keyed by ISO date with arrays of 24h HH:MM times.",
    inputSchema: {
      type: "object",
      properties: {
        startDate: { type: "string", format: "date", description: "Inclusive ISO date (YYYY-MM-DD)." },
        endDate:   { type: "string", format: "date", description: "Inclusive ISO date (YYYY-MM-DD)." },
      },
      required: ["startDate", "endDate"],
    },
    annotations: { readOnlyHint: true },
    async execute({ startDate, endDate }) {
      const out = {};
      Object.keys(AVAILABILITY).forEach((iso) => {
        if (iso >= startDate && iso <= endDate) out[iso] = AVAILABILITY[iso];
      });
      return out;
    },
  });

  registerTool({
    name: "bookSlot",
    title: "Book a consultation slot",
    description: "Reserve a 30-minute consultation at a specific date and time. Drives the on-page booking widget so the user sees what was booked.",
    inputSchema: {
      type: "object",
      properties: {
        date:  { type: "string", format: "date", description: "ISO date (YYYY-MM-DD)." },
        time:  { type: "string", format: "^([01][0-9]|2[0-3]):[0-5][0-9]$", description: "24h start time in HH:MM (e.g. '14:00')." },
        name:  { type: "string", description: "Full name for the booking." },
        email: { type: "string", format: "email", description: "Confirmation email address." },
      },
      required: ["date", "time", "name", "email"],
    },
    annotations: { readOnlyHint: false },
    async execute({ date, time, name, email }) {
      widgetWith.jumpToMonth(new Date(date + "T00:00"));
      widgetWith.selectDate(date);
      widgetWith.selectSlot(time);
      widgetWith.setName(name);
      widgetWith.setEmail(email);
      widgetWith.confirm();
      const c = widgetWith.state.confirmed;
      if (!c) return { ok: false, error: "Slot unavailable or input invalid." };
      return { ok: true, confirmationId: c.id, date: c.date, time: c.time };
    },
  });

  registerTool({
    name: "cancelBooking",
    title: "Cancel a booking",
    description: "Cancel a previously confirmed booking by its confirmation id.",
    inputSchema: {
      type: "object",
      properties: {
        confirmationId: { type: "string", description: "Confirmation id returned by bookSlot, e.g. 'BK-AB12CD'." },
      },
      required: ["confirmationId"],
    },
    annotations: { readOnlyHint: false },
    execute({ confirmationId }) {
      if (confirmationId !== widgetWith.state.confirmed?.id) {
        return { ok: false, error: "Confirmation id invalid." };
      }
      widgetWith.reset();
      return { ok: true, cancelled: confirmationId };
    },
  });

  function renderToolsPanel() {
    toolsListEl.innerHTML = "";
    toolsCountEl.textContent = localRegistry.length;
    localRegistry.forEach((t) => {
      const li = document.createElement("li");
      li.className = "tool-item";
      li.dataset.tool = t.name;
      const reqs = new Set(t.inputSchema?.required || []);
      const props = Object.keys(t.inputSchema?.properties || {});
      const ro = t.annotations?.readOnlyHint;
      li.innerHTML = `
        <div class="tool-name">${t.name}(${props.join(", ")})${ro ? ' <span class="tool-ro" title="readOnlyHint: agent may call without confirmation">read-only</span>' : ""}</div>
        <div class="tool-desc">${t.description}</div>
        <div class="tool-args">
          ${props.map(p => `<span class="tool-arg ${reqs.has(p) ? "is-required" : ""}">${p}</span>`).join("")}
        </div>
      `;
      toolsListEl.appendChild(li);
    });
  }

  function flashTool(name, args) {
    const el = toolsListEl.querySelector(`[data-tool="${name}"]`);
    if (el) {
      el.classList.remove("is-called");
      void el.offsetWidth; // restart animation
      el.classList.add("is-called");
    }
    toolCallEl.hidden = false;
    toolCallCodeEl.textContent = JSON.stringify({ tool: name, arguments: args }, null, 2);
  }

  // ----- ANNOTATIONS OVERLAY (without panel) -----------------
  const annotationsEl = document.getElementById("annotations");
  const stageWithout = document.querySelector(".panel--without .stage");

  // Definitions: which elements get annotated, and the label
  const ANNOTATION_DEFS = [
    { selector: '[data-date]:not([disabled]).has-slots', pickIndex: "tuesday", label: '<button aria-label="Tue, May 19">', side: "above" },
    { selector: '[data-time="14:00"]:not([disabled])', label: '<button> text="2:00 PM"', side: "above" },
    { selector: 'input[name="name"]', label: '<input type="text">', side: "below" },
    { selector: 'input[name="email"]', label: '<input type="email">', side: "below" },
    { selector: '.w-confirm', label: '<button> "Confirm" — which?', side: "above" },
  ];

  function pickAnnotationTarget(def, container) {
    const els = Array.from(container.querySelectorAll(def.selector));
    if (els.length === 0) return null;
    if (def.pickIndex === "tuesday") {
      // pick the first Tuesday in the future that has slots
      const next = nextWeekday(2); // 2 = Tuesday
      const target = els.find(el => el.dataset.date === fmtISO(next));
      return target || els[0];
    }
    return els[0];
  }

  // Boxes are created once and cached, then re-positioned on later layouts.
  // No entrance animation — these are static inspector-style annotations.
  const annoCache = [];

  function layoutAnnotations() {
    const stageRect = stageWithout.getBoundingClientRect();
    ANNOTATION_DEFS.forEach((def, i) => {
      let box = annoCache[i];

      // Lazy-create the box on first layout.
      if (!box) {
        box = document.createElement("div");
        box.className = "anno";
        const label = document.createElement("div");
        const cls = { above: "t-above", below: "t-below", left: "t-left", right: "t-right" }[def.side] || "t-above";
        label.className = `anno-label ${cls}`;
        label.textContent = def.label;
        box.appendChild(label);
        annotationsEl.appendChild(box);
        annoCache[i] = box;
      }

      const target = pickAnnotationTarget(def, stageWithout);
      if (!target) {
        // Target not in DOM right now (e.g. slot row before a date is picked).
        box.classList.add("is-hidden");
        return;
      }
      box.classList.remove("is-hidden");

      const r = target.getBoundingClientRect();
      const x = r.left - stageRect.left - 4;
      const y = r.top - stageRect.top - 4;
      const w = r.width + 8;
      const h = r.height + 8;
      box.style.setProperty("--x", x + "px");
      box.style.setProperty("--y", y + "px");
      box.style.width = w + "px";
      box.style.height = h + "px";
    });
  }

  // initial layout (after fonts settle) + on resize
  function relayoutSoon() {
    requestAnimationFrame(() => requestAnimationFrame(layoutAnnotations));
  }
  relayoutSoon();
  // re-layout when fonts load (label widths change)
  if (document.fonts?.ready) document.fonts.ready.then(relayoutSoon);
  let resizeT;
  window.addEventListener("resize", () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(layoutAnnotations, 80);
  });
  // re-layout if the widget DOM changes (month nav, date select)
  // Important: observe the widget only, NOT the stage — annotationsEl is in the
  // stage, so observing it would re-trigger on every annotation rebuild.
  const widgetWithoutEl = document.getElementById("widget-without");
  const mo = new MutationObserver(() => relayoutSoon());
  mo.observe(widgetWithoutEl, { childList: true, subtree: true });

  // ----- SIMULATION ------------------------------------------
  const runBtn = document.getElementById("run-sim");
  const resetBtn = document.getElementById("reset-sim");
  const scanCursor = document.getElementById("scan-cursor");
  const logListEl = document.querySelector("#log-without .log-list");

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function typeInto(el, text, perChar = 38) {
    el.focus();
    el.value = "";
    for (const c of text) {
      el.value += c;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      await sleep(perChar);
    }
  }

  function clearLog() {
    logListEl.innerHTML = "";
  }
  function log(msg, kind) {
    const li = document.createElement("li");
    if (kind) li.classList.add("is-" + kind);
    li.textContent = msg;
    logListEl.appendChild(li);
    // auto-scroll
    const wrap = logListEl.closest(".agent-log");
    if (wrap) wrap.scrollTop = wrap.scrollHeight;
  }

  function moveCursorTo(el) {
    if (!el) return;
    const stageRect = stageWithout.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const x = r.left - stageRect.left - 6;
    const y = r.top - stageRect.top - 6;
    const w = r.width + 12;
    const h = r.height + 12;
    scanCursor.style.width = w + "px";
    scanCursor.style.height = h + "px";
    scanCursor.style.transform = `translate(${x}px, ${y}px)`;
  }
  function showCursor() { scanCursor.classList.add("is-on"); }
  function hideCursor() { scanCursor.classList.remove("is-on"); }

  async function runWithoutSim(targetDateISO, targetTime, person) {
    clearLog();
    widgetWithout.reset();
    showCursor();

    log("Loading page DOM (4,217 nodes)…");
    // scan: month label
    moveCursorTo(stageWithout.querySelector(".w-month-label"));
    await sleep(650);
    log(`Reading month header → "${stageWithout.querySelector(".w-month-label").textContent}"`);

    // scan: a few day cells reading aria-labels
    const dayCells = Array.from(stageWithout.querySelectorAll(".w-day:not(.is-other)"));
    for (let i = 0; i < 4 && i < dayCells.length; i++) {
      moveCursorTo(dayCells[i]);
      await sleep(360);
      const lab = dayCells[i].getAttribute("aria-label") || dayCells[i].textContent;
      log(`Parsing aria-label "${lab}" — has-slots? ${dayCells[i].classList.contains("has-slots") ? "maybe" : "no"}`);
    }
    log("Inferring which dot means availability…");
    await sleep(500);

    // find target date
    const targetCell = stageWithout.querySelector(`[data-date="${targetDateISO}"]`);
    if (targetCell) {
      moveCursorTo(targetCell);
      await sleep(450);
      log(`Found probable Tuesday cell — clicking`, "ok");
      targetCell.click();
      await sleep(500);
    } else {
      log("Could not locate the target date", "fail");
      hideCursor();
      return false;
    }

    // scan slots
    const slotBtns = Array.from(stageWithout.querySelectorAll(".w-slot:not([disabled])"));
    for (let i = 0; i < Math.min(3, slotBtns.length); i++) {
      moveCursorTo(slotBtns[i]);
      await sleep(320);
      log(`Reading slot button "${slotBtns[i].textContent}"`);
    }
    const slotEl = stageWithout.querySelector(`.w-slot[data-time="${targetTime}"]:not([disabled])`);
    if (slotEl) {
      moveCursorTo(slotEl);
      await sleep(400);
      log(`Matched "2:00 PM" — clicking`, "ok");
      slotEl.click();
      await sleep(450);
    } else {
      log("Target slot not bookable", "fail");
      hideCursor();
      return false;
    }

    // form fields
    const nameInput = stageWithout.querySelector('input[name="name"]');
    moveCursorTo(nameInput);
    await sleep(380);
    log(`Field <input name="name"> — typing user name`);
    await typeInto(nameInput, person.name);
    await sleep(200);

    const emailInput = stageWithout.querySelector('input[name="email"]');
    moveCursorTo(emailInput);
    await sleep(280);
    log(`Field <input type="email"> — typing user email`);
    await typeInto(emailInput, person.email);
    await sleep(200);

    // submit
    const confirmBtn = stageWithout.querySelector(".w-confirm");
    moveCursorTo(confirmBtn);
    await sleep(380);
    log(`Pressing <button> "Confirm booking"`, "ok");
    confirmBtn.click();
    await sleep(400);

    log(`Booked after ~11 DOM interactions`, "ok");
    hideCursor();
    return true;
  }

  async function runWithSim(targetDateISO, targetTime, person) {
    // Drive the WebMCP-registered tool exactly as a remote agent would.
    const args = { date: targetDateISO, time: targetTime, name: person.name, email: person.email };
    const tool = localRegistry.find(t => t.name === "bookSlot");
    if (!tool) return false;
    await sleep(220);  // tiny delay so it doesn't feel instant-jarring
    // execute() itself flashes the tool card and writes the call JSON
    const result = await tool.execute(args);
    return !!result?.ok;
  }

  // ----- RUN BUTTON ------------------------------------------
  async function runSimulation() {
    runBtn.classList.add("is-running");
    const labelEl = runBtn.querySelector(".run-label");
    const origLabel = labelEl.textContent;
    labelEl.textContent = "Running…";

    const tue = nextWeekday(2);
    const targetDateISO = fmtISO(tue);
    const targetTime = "14:00";
    const person = { name: "Sarah Drasner", email: "sarah@example.com" };

    // start both in parallel; the without takes much longer
    const pWithout = runWithoutSim(targetDateISO, targetTime, person);
    const pWith = runWithSim(targetDateISO, targetTime, person);
    await Promise.all([pWithout, pWith]);

    labelEl.textContent = origLabel;
    runBtn.classList.remove("is-running");
  }

  runBtn.addEventListener("click", runSimulation);
  resetBtn.addEventListener("click", () => {
    widgetWithout.reset();
    widgetWith.reset();
    clearLog();
    hideCursor();
    toolCallEl.hidden = true;
    toolsListEl.querySelectorAll(".is-called").forEach(el => el.classList.remove("is-called"));
    relayoutSoon();
  });

  // ----- SCROLL REVEAL ---------------------------------------
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("is-in-view");
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12 });
    document.querySelectorAll(".step, .start-card, .panel").forEach((el) => io.observe(el));
  }
})();
