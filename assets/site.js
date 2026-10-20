/* Webill Green public site. Plain JavaScript, no dependencies.
   Every instrument here follows the product's rules: SAST time, Eskom TOU periods from
   the platform's Eskom TOU table, ledgers that sum to zero, and dashed means not yet metered. */

(function () {
  "use strict";

  /* ---------- Config ---------- */

  // Where walkthrough requests go. Set this before publishing.
  var CONTACT_EMAIL = "hello@webill.net";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Formatting ---------- */

  function groupThousands(intString) {
    return intString.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  function fmtNum(n, dp) {
    var neg = n < 0;
    var s = Math.abs(n).toFixed(dp == null ? 0 : dp);
    var parts = s.split(".");
    var out = groupThousands(parts[0]) + (parts[1] ? "." + parts[1] : "");
    return (neg ? "−" : "") + out;
  }

  function fmtRand(n, signed) {
    var cents = Math.round(n * 100);
    var neg = cents < 0;
    var abs = Math.abs(cents);
    var str = "R " + groupThousands(String(Math.floor(abs / 100))) + "." + String(abs % 100).padStart(2, "0");
    if (signed) return (neg ? "−" : "+") + str;
    return (neg ? "−" : "") + str;
  }

  function fmtKwh(n) {
    return fmtNum(n, 0) + " kWh";
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function fmtDuration(ms) {
    var mins = Math.max(0, Math.round(ms / 60000));
    var h = Math.floor(mins / 60);
    var m = mins % 60;
    if (h === 0) return m + " min";
    return h + " h " + pad2(m) + " min";
  }

  /* ---------- SAST time and Eskom TOU periods, as the platform classifies them ---------- */

  var SAST_OFFSET = 2 * 3600 * 1000;
  var DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function sastNow() {
    var d = new Date(Date.now() + SAST_OFFSET);
    return {
      ms: Date.now(),
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
      day: d.getUTCDate(),
      dow: d.getUTCDay(),
      hour: d.getUTCHours(),
      minute: d.getUTCMinutes(),
      second: d.getUTCSeconds()
    };
  }

  // Epoch ms of a given SAST wall-clock time.
  function sastToEpoch(year, month, day, hour, minute) {
    return Date.UTC(year, month - 1, day, hour, minute || 0) - SAST_OFFSET;
  }

  function sastDateParts(epochMs) {
    var d = new Date(epochMs + SAST_OFFSET);
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), dow: d.getUTCDay() };
  }

  function shortDate(p) {
    return DAYS[p.dow].slice(0, 3) + " " + p.day + " " + MONTHS_SHORT[p.month - 1];
  }

  var TOU = {
    highPeak: [7, 8, 9, 18, 19],
    highStd: [6, 10, 11, 12, 13, 14, 15, 16, 17, 20, 21],
    lowPeak: [6, 7, 8, 17, 18],
    lowStd: [9, 10, 11, 12, 13, 14, 15, 16, 19, 20, 21],
    satStd: [8, 9, 10, 11]
  };

  function season(month) {
    return month >= 6 && month <= 8 ? "high" : "low";
  }

  function dayType(dow) {
    if (dow === 0) return "sunday";
    if (dow === 6) return "saturday";
    return "weekday";
  }

  function touPeriod(month, dow, hour) {
    var dt = dayType(dow);
    if (dt === "sunday") return "offpeak";
    if (dt === "saturday") return TOU.satStd.indexOf(hour) >= 0 ? "standard" : "offpeak";
    var s = season(month);
    var peak = s === "high" ? TOU.highPeak : TOU.lowPeak;
    var std = s === "high" ? TOU.highStd : TOU.lowStd;
    if (peak.indexOf(hour) >= 0) return "peak";
    if (std.indexOf(hour) >= 0) return "standard";
    return "offpeak";
  }

  var TOU_LABEL = { peak: "Peak", standard: "Standard", offpeak: "Off-peak" };

  /* ---------- Deterministic noise, seeded by the SAST date ---------- */

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- Header ---------- */

  function initHeader() {
    var header = document.querySelector("[data-header]");
    if (header) {
      var onScroll = function () {
        header.classList.toggle("is-scrolled", window.scrollY > 8);
      };
      onScroll();
      window.addEventListener("scroll", onScroll, { passive: true });
    }

    var toggle = document.querySelector("[data-menu-toggle]");
    var nav = document.getElementById("site-nav");
    if (toggle && nav) {
      toggle.addEventListener("click", function () {
        var open = toggle.getAttribute("aria-expanded") === "true";
        toggle.setAttribute("aria-expanded", String(!open));
        nav.classList.toggle("is-open", !open);
      });
      nav.addEventListener("click", function (e) {
        if (e.target.closest("a")) {
          toggle.setAttribute("aria-expanded", "false");
          nav.classList.remove("is-open");
        }
      });
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && nav.classList.contains("is-open")) {
          toggle.setAttribute("aria-expanded", "false");
          nav.classList.remove("is-open");
          toggle.focus();
        }
      });
    }

    // Mark the current page in the nav.
    var here = location.pathname.split("/").pop() || "index.html";
    document.querySelectorAll(".site-nav a").forEach(function (a) {
      if (a.getAttribute("href") === here) a.setAttribute("aria-current", "page");
    });

    document.querySelectorAll("[data-year]").forEach(function (el) {
      el.textContent = String(sastNow().year);
    });
  }

  /* ---------- Hero clock ---------- */

  function nextDayAheadGate(now) {
    // The day-ahead gate closes at 10:00 SAST on D−1 for delivery day D.
    var todayGate = sastToEpoch(now.year, now.month, now.day, 10, 0);
    var gate = now.ms < todayGate ? todayGate : todayGate + 86400000;
    return { at: gate, delivery: sastDateParts(gate + 86400000) };
  }

  function nextIntraday(now) {
    // Intraday auctions run at 00:00, 06:00, 12:00 and 18:00 SAST.
    var base = sastToEpoch(now.year, now.month, now.day, 0, 0);
    var times = [0, 6, 12, 18, 24];
    for (var i = 0; i < times.length; i++) {
      var t = base + times[i] * 3600000;
      if (t > now.ms) return t;
    }
    return base + 24 * 3600000;
  }

  function initClock() {
    var root = document.querySelector("[data-clock]");
    if (!root) return;
    var timeEl = root.querySelector("[data-clock-time]");
    var periodEl = root.querySelector("[data-clock-period]");
    var gateEl = root.querySelector("[data-clock-gate]");
    var idmEl = root.querySelector("[data-clock-idm]");

    function tick() {
      var now = sastNow();
      timeEl.textContent = pad2(now.hour) + ":" + pad2(now.minute);
      periodEl.textContent = String(now.hour + 1);
      var gate = nextDayAheadGate(now);
      var gateDay = sastDateParts(gate.at);
      gateEl.innerHTML =
        "Day-ahead gate for <strong>" + shortDate(gate.delivery) + "</strong> closes " +
        (gateDay.day === now.day ? "today" : "tomorrow") + " at 10:00, in <strong>" + fmtDuration(gate.at - now.ms) + "</strong>";
      var idm = nextIntraday(now);
      var idmHour = new Date(idm + SAST_OFFSET).getUTCHours();
      idmEl.innerHTML = "Next intraday auction at <strong>" + pad2(idmHour) + ":00</strong>, in <strong>" + fmtDuration(idm - now.ms) + "</strong>";
    }

    tick();
    var delay = (60 - sastNow().second) * 1000 + 50;
    setTimeout(function () {
      tick();
      setInterval(tick, 60000);
    }, delay);
  }

  /* ---------- The trading day ---------- */

  // Illustrative contract. Rates follow the platform's landed-cost worked example:
  // 85 c/kWh on sent energy, DLF 0.966, 15 c/kWh of network charges on delivered energy.
  var CONTRACT = {
    price: 0.85,
    dlf: 0.966,
    eskom: 0.09,
    muni: 0.06,
    grid: { peak: 2.1, standard: 1.28, offpeak: 0.95 },
    smp: { peak: 1400, standard: 980, offpeak: 700 }
  };

  function buildDay(now) {
    var seed = now.year * 10000 + now.month * 100 + now.day;
    var rand = mulberry32(seed);
    var windPhase = rand() * Math.PI * 2;
    var windLevel = 1.2 + rand() * 1.1;
    var cloudiness = rand() * 0.35;
    var weekend = now.dow === 0 || now.dow === 6;
    var hours = [];

    for (var h = 0; h < 24; h++) {
      var x = (h + 0.5 - 6.1) / 12.4;
      var sun = x > 0 && x < 1 ? Math.pow(Math.sin(Math.PI * x), 1.25) : 0;
      var cloud = 1 - cloudiness * (0.4 + 0.6 * rand());
      var solar = 7.4 * sun * cloud;
      var wind = Math.max(0.25, windLevel + 0.9 * Math.sin((2 * Math.PI * (h - 2)) / 24 + windPhase) + (rand() - 0.5) * 0.5);
      var gen = (solar + wind) * 1000;

      var work = h >= 7 && h <= 17;
      var evening = h >= 18 && h <= 21;
      var demand;
      if (weekend) demand = work ? 3.0 : 2.2;
      else demand = work ? 4.7 : evening ? 3.7 : 2.5;
      demand = (demand + (rand() - 0.5) * 0.3) * 1000;

      hours.push({ hour: h, gen: Math.round(gen), demand: Math.round(demand), tou: touPeriod(now.month, now.dow, h) });
    }
    return hours;
  }

  function hourWorking(h) {
    var matched = Math.min(h.gen, h.demand);
    var delivered = matched * CONTRACT.dlf;
    var surplus = h.gen - matched;
    var residual = h.demand - delivered;
    var energy = Math.round(matched * CONTRACT.price * 100) / 100;
    var eskom = Math.round(delivered * CONTRACT.eskom * 100) / 100;
    var muni = Math.round(delivered * CONTRACT.muni * 100) / 100;
    var sale = Math.round((surplus / 1000) * CONTRACT.smp[h.tou] * 100) / 100;
    var landed = delivered > 0 ? ((energy + eskom + muni) / delivered) * 100 : 0;
    var grid = CONTRACT.grid[h.tou] * 100;
    return {
      matched: matched,
      delivered: delivered,
      surplus: surplus,
      residual: residual,
      energy: energy,
      eskom: eskom,
      muni: muni,
      sale: sale,
      landed: landed,
      grid: grid
    };
  }

  function initDay() {
    var root = document.querySelector("[data-day]");
    if (!root) return;

    var now = sastNow();
    var hours = buildDay(now);
    var cols = root.querySelector("[data-day-cols]");
    var axis = root.querySelector("[data-day-axis]");
    var touStrip = root.querySelector("[data-day-tou]");
    var overlay = root.querySelector("[data-day-overlay]");
    var chart = root.querySelector("[data-day-chart]");

    // Re-entrant: the day redraws itself when the SAST hour rolls over.
    cols.innerHTML = "";
    axis.innerHTML = "";
    touStrip.innerHTML = "";
    chart.querySelectorAll(".day__marker").forEach(function (el) {
      el.remove();
    });

    var dateEl = root.querySelector("[data-day-date]");
    dateEl.textContent = "Today, " + DAYS[now.dow] + " " + now.day + " " + MONTHS[now.month - 1];

    var seasonEl = root.querySelector("[data-day-season]");
    var dt = dayType(now.dow);
    seasonEl.textContent =
      "Eskom TOU for a " + (dt === "weekday" ? "weekday" : dt === "saturday" ? "Saturday" : "Sunday") +
      (dt === "weekday" ? " in the " + (season(now.month) === "high" ? "high-demand" : "low-demand") + " season" : "");

    var max = 0;
    hours.forEach(function (h) {
      max = Math.max(max, h.gen, h.demand);
    });
    max = max * 1.12;

    var minuteFrac = now.minute / 60;

    hours.forEach(function (h, i) {
      var state = h.hour < now.hour ? "past" : h.hour === now.hour ? "now" : "future";
      h.state = state;
      var w = hourWorking(h);
      var matchedPct = (w.matched / max) * 100;
      var surplusPct = (w.surplus / max) * 100;

      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "day__col is-" + state;
      btn.style.setProperty("--i", i);
      btn.setAttribute("aria-pressed", "false");
      btn.dataset.hour = String(h.hour);
      btn.setAttribute(
        "aria-label",
        pad2(h.hour) + ":00 to " + pad2((h.hour + 1) % 24) + ":00, " + TOU_LABEL[h.tou] + ", " +
          (state === "past" ? "metered" : state === "now" ? "in delivery" : "forecast") + ", generation " +
          fmtKwh(h.gen) + ", demand " + fmtKwh(h.demand)
      );

      var bar = document.createElement("span");
      bar.className = "bar";
      bar.style.height = matchedPct + surplusPct + "%";
      bar.style.setProperty("--i", i);
      var m = document.createElement("span");
      m.className = "bar__matched";
      m.style.height = (matchedPct / (matchedPct + surplusPct)) * 100 + "%";
      bar.appendChild(m);
      if (surplusPct > 0.4) {
        var s = document.createElement("span");
        s.className = "bar__surplus";
        s.style.height = (surplusPct / (matchedPct + surplusPct)) * 100 + "%";
        bar.appendChild(s);
      }
      if (state === "now") bar.style.setProperty("--undone", (1 - minuteFrac) * 100 + "%");
      btn.appendChild(bar);

      if (h.demand > h.gen) {
        var short = document.createElement("span");
        short.className = "bar__short";
        short.style.bottom = (h.gen / max) * 100 + "%";
        short.style.height = ((h.demand - h.gen) / max) * 100 + "%";
        short.style.setProperty("--i", i);
        btn.appendChild(short);
      }

      btn.addEventListener("click", function () {
        select(h.hour, true);
      });
      cols.appendChild(btn);

      var label = document.createElement("span");
      label.className = "day__hour";
      label.textContent = pad2(h.hour);
      axis.appendChild(label);

      var t = document.createElement("span");
      t.className = "tou--" + h.tou;
      t.title = pad2(h.hour) + ":00 " + TOU_LABEL[h.tou];
      touStrip.appendChild(t);
    });

    // Demand step line, solid for metered hours and dashed ahead.
    function drawOverlay() {
      var W = 2400;
      var H = 1000;
      overlay.setAttribute("viewBox", "0 0 " + W + " " + H);
      var colW = W / 24;
      var pastPts = [];
      var futurePts = [];
      hours.forEach(function (h) {
        var y = H - (h.demand / max) * H;
        var x0 = h.hour * colW;
        var x1 = x0 + colW;
        var target = h.hour <= now.hour ? pastPts : futurePts;
        if (h.hour === now.hour + 1 && pastPts.length) futurePts.push(pastPts[pastPts.length - 1]);
        target.push([x0, y], [x1, y]);
      });
      function path(pts) {
        return pts.map(function (p, i) {
          return (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1);
        }).join(" ");
      }
      overlay.innerHTML =
        (pastPts.length ? '<path class="day__demand" d="' + path(pastPts) + '"/>' : "") +
        (futurePts.length ? '<path class="day__demand day__demand--future" d="' + path(futurePts) + '"/>' : "");
    }
    drawOverlay();

    // Markers: now, and the 10:00 day-ahead gate for tomorrow.
    function marker(cls, leftPct, text, flip) {
      var el = document.createElement("span");
      el.className = "day__marker " + cls + (flip ? " day__marker--flip" : "");
      el.style.left = leftPct + "%";
      var lab = document.createElement("span");
      lab.className = "day__marker-label";
      lab.textContent = text;
      el.appendChild(lab);
      chart.appendChild(el);
      return el;
    }
    var nowPct = ((now.hour + minuteFrac) / 24) * 100;
    var gatePct = (10 / 24) * 100;
    var nearGate = Math.abs(nowPct - gatePct) < 9;
    marker("day__marker--gate", gatePct, "10:00 gate for tomorrow", nearGate && nowPct > gatePct);
    var nowMarker = marker("day__marker--now", nowPct, "Now, " + pad2(now.hour) + ":" + pad2(now.minute), nowPct > 80 || (nearGate && nowPct < gatePct));

    // Working panel
    var panel = root.querySelector("[data-working]");
    var whenEl = panel.querySelector("[data-w-when]");
    var stateEl = panel.querySelector("[data-w-state]");
    var energyEl = panel.querySelector("[data-w-energy]");
    var ledgerBody = panel.querySelector("[data-w-ledger] tbody");
    var ledgerFoot = panel.querySelector("[data-w-ledger] tfoot");

    function step(what, value, formula) {
      return '<li><span class="steps__what">' + what + '</span><span class="steps__value">' + value + "</span>" +
        (formula ? '<span class="steps__formula">' + formula + "</span>" : "") + "</li>";
    }

    function row(party, line, amount, why) {
      return "<tr><td>" + party + "</td><td>" + line + (why ? '<br><span class="why">' + why + "</span>" : "") +
        '</td><td class="amt' + (amount > 0 ? " amt--pos" : "") + '">' + fmtRand(amount, true) + "</td></tr>";
    }

    function select(hour, focus) {
      root._selected = hour;
      var h = hours[hour];
      var w = hourWorking(h);
      cols.querySelectorAll(".day__col").forEach(function (b) {
        b.setAttribute("aria-pressed", String(Number(b.dataset.hour) === hour));
      });
      axis.querySelectorAll(".day__hour").forEach(function (l, i) {
        l.classList.toggle("is-selected", i === hour);
      });
      var future = h.state === "future";
      var inDelivery = h.state === "now";
      panel.classList.toggle("is-future", future || inDelivery);

      whenEl.innerHTML = '<span class="num">' + pad2(hour) + ":00–" + pad2((hour + 1) % 24) + ":00</span> SAST, trading period " + (hour + 1);

      var chips = '<span class="chip">' + TOU_LABEL[h.tou] + " period</span>";
      if (h.state === "past") chips += '<span class="chip chip--built">Metered. Settles tonight as DRAFT</span>';
      if (inDelivery) chips += '<span class="chip chip--live chip--built">In delivery until ' + pad2((hour + 1) % 24) + ":00</span>";
      if (future) chips += '<span class="chip chip--simulated">Forecast, not yet metered</span>';
      stateEl.innerHTML = chips;

      var verb = h.state === "past" ? "" : "Forecast: ";
      var energyHtml =
        step(verb + "Generated at the farm's meter", fmtKwh(h.gen)) +
        step("Matched to the factory", fmtKwh(w.matched), "The lesser of " + fmtNum(h.gen) + " generated and " + fmtNum(h.demand) + " demanded") +
        step("Delivered after network losses", fmtKwh(w.delivered), fmtNum(w.matched) + " × DLF 0.966") +
        step("Surplus offered day-ahead", fmtKwh(w.surplus), fmtNum(h.gen) + " − " + fmtNum(w.matched)) +
        step("Grid residual, from the factory's own supplier", fmtKwh(w.residual), fmtNum(h.demand) + " − " + fmtNum(w.delivered) + ". A calculated remainder, not another meter reading");

      var saving = w.grid - w.landed;
      if (w.delivered > 0) {
        energyHtml += step(
          "Landed cost against the grid",
          fmtNum(w.landed, 1) + " c vs " + fmtNum(w.grid, 1) + " c",
          "85.0 ÷ 0.966 + 15.0 network = 103.0 c/kWh. " +
            (saving >= 0 ? "Saves " + fmtNum(saving, 1) + " c on every kWh this hour" : "Costs " + fmtNum(-saving, 1) + " c more than off-peak grid power this hour")
        );
      }
      energyEl.innerHTML = energyHtml;

      var rows =
        row("Hybrid farm", "Energy at 85.0 c", w.energy, fmtNum(w.matched) + " kWh sent") +
        row("Factory", "Energy", -w.energy) +
        row("Eskom", "Network charge at 9.0 c", w.eskom, fmtNum(w.delivered) + " kWh delivered") +
        row("Municipal network", "Network charge at 6.0 c", w.muni, fmtNum(w.delivered) + " kWh delivered") +
        row("Factory", "Network charges", -(w.eskom + w.muni));
      if (w.sale > 0) {
        rows +=
          row("Hybrid farm", "Day-ahead sale at R " + fmtNum(CONTRACT.smp[h.tou]) + "/MWh", w.sale, fmtNum(w.surplus) + " kWh surplus") +
          row("SAWEM buyers", "Day-ahead purchase", -w.sale, "Simulated until SAWEM opens");
      }
      ledgerBody.innerHTML = rows;

      var sum = Math.round((w.energy - w.energy + w.eskom + w.muni - (w.eskom + w.muni) + w.sale - w.sale) * 100) / 100;
      ledgerFoot.innerHTML =
        '<tr><td>Σ</td><td>' + (future ? "Will balance when it settles" : "Every line has a partner") +
        '</td><td class="amt"><span class="sigma">' + fmtRand(Math.abs(sum)) + ' <span class="sigma__tick" aria-label="balanced">✓</span></span></td></tr>';

      if (focus) {
        var btn = cols.querySelector('[data-hour="' + hour + '"]');
        if (btn && document.activeElement !== btn) btn.focus({ preventScroll: true });
      }
    }

    root._select = select;

    // Keyboard: arrows move between hours. Bound once; it calls the latest render's select.
    if (!root.dataset.bound) {
      root.dataset.bound = "1";
      cols.addEventListener("keydown", function (e) {
        var current = Number(document.activeElement && document.activeElement.dataset.hour);
        if (isNaN(current)) return;
        var next = null;
        if (e.key === "ArrowRight") next = Math.min(23, current + 1);
        if (e.key === "ArrowLeft") next = Math.max(0, current - 1);
        if (e.key === "Home") next = 0;
        if (e.key === "End") next = 23;
        if (next !== null) {
          e.preventDefault();
          root._select(next, true);
        }
      });
    }

    // Default: keep the visitor's choice across redraws; otherwise the most recent
    // metered hour with generation, else noon's forecast.
    var initial = 12;
    for (var k = now.hour - 1; k >= 0; k--) {
      if (hours[k].gen > 0) {
        initial = k;
        break;
      }
    }
    if (root._selected != null && root._day === now.day) initial = root._selected;
    select(initial, false);

    // Every 30 seconds: move the now marker and the in-delivery fill; redraw on a new hour.
    root._hour = now.hour;
    root._day = now.day;
    root._tick = function () {
      var t = sastNow();
      if (t.hour !== root._hour || t.day !== root._day) {
        initDay();
        return;
      }
      var pct = ((t.hour + t.minute / 60) / 24) * 100;
      nowMarker.style.left = pct + "%";
      nowMarker.querySelector(".day__marker-label").textContent = "Now, " + pad2(t.hour) + ":" + pad2(t.minute);
      var nowBar = cols.querySelector(".is-now .bar");
      if (nowBar) nowBar.style.setProperty("--undone", (1 - t.minute / 60) * 100 + "%");
    };
    if (!root.dataset.ticking) {
      root.dataset.ticking = "1";
      setInterval(function () {
        root._tick();
      }, 30000);
    }

    // One orchestrated moment: the day draws from midnight to now, on first load only.
    if (!reduceMotion && !root.dataset.drawn) root.classList.add("is-animating");
    else root.classList.remove("is-animating");
    root.dataset.drawn = "1";
  }

  /* ---------- Lifecycle artifacts ---------- */

  function initMeterStrip() {
    var strip = document.querySelector("[data-meterstrip]");
    if (!strip) return;
    var now = sastNow();
    var rand = mulberry32(now.year * 400 + now.month * 31 + now.day);
    var done = Math.floor((now.hour * 60 + now.minute) / 20);
    for (var i = 0; i < 72; i++) {
      var t = (i + 0.5) / 72;
      var v = 0.32 + 0.4 * Math.max(0, Math.sin(Math.PI * (t - 0.25) * 2)) * (t > 0.25 && t < 0.75 ? 1 : 0) + 0.18 * rand();
      var s = document.createElement("span");
      s.style.height = Math.min(100, v * 100) + "%";
      if (i >= done) s.className = "is-pending";
      strip.appendChild(s);
    }
    var readEl = document.querySelector("[data-meter-read]");
    if (readEl) readEl.textContent = done + " of 72";
  }

  function initNomRow() {
    var row = document.querySelector("[data-nomrow]");
    if (!row) return;
    var shape = [3, 3, 3, 3, 3, 4, 6, 8, 9, 9, 9, 9, 9, 9, 9, 9, 8, 7, 7, 6, 5, 4, 3, 3];
    shape.forEach(function (v) {
      var s = document.createElement("span");
      var i = document.createElement("i");
      i.style.height = (v / 10) * 100 + "%";
      s.appendChild(i);
      row.appendChild(s);
    });
  }

  /* ---------- Lifecycle spine (scroll-linked) ---------- */

  function initSpine() {
    var spine = document.querySelector("[data-spine]");
    if (!spine) return;
    var stages = Array.prototype.slice.call(spine.querySelectorAll("[data-stage]"));
    var stops = Array.prototype.slice.call(spine.querySelectorAll("[data-stop]"));
    var progress = spine.querySelector("[data-spine-progress]");

    function setCurrent(id) {
      var idx = stages.findIndex(function (s) {
        return s.dataset.stage === id;
      });
      stops.forEach(function (stop, i) {
        stop.classList.toggle("is-current", i === idx);
        stop.classList.toggle("is-past", i < idx);
        var a = stop.querySelector("a");
        if (i === idx) a.setAttribute("aria-current", "step");
        else a.removeAttribute("aria-current");
      });
      if (progress && stops[idx]) {
        var stopEl = stops[idx];
        var track = progress.offsetHeight || 1;
        var reach = Math.max(0, stopEl.offsetTop + stopEl.offsetHeight / 2 - 10);
        progress.style.transform = "scaleY(" + Math.min(1, reach / track) + ")";
      }
    }

    // The current stop is the last stage whose top has crossed the middle of the viewport.
    var ticking = false;
    var last = null;
    function update() {
      ticking = false;
      var mid = window.innerHeight * 0.5;
      var current = stages[0].dataset.stage;
      stages.forEach(function (s) {
        if (s.getBoundingClientRect().top < mid) current = s.dataset.stage;
      });
      if (current !== last) {
        last = current;
        setCurrent(current);
      }
    }
    window.addEventListener("scroll", function () {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    }, { passive: true });
    window.addEventListener("resize", update);
    update();
  }

  /* ---------- Tabs (rooms, roles, any [data-tabs]) ---------- */

  function initTabs() {
    document.querySelectorAll("[data-tabs]").forEach(function (list) {
      var tabs = Array.prototype.slice.call(list.querySelectorAll('[role="tab"]'));
      var vertical = list.getAttribute("aria-orientation") === "vertical";

      function activate(tab, focus) {
        tabs.forEach(function (t) {
          var on = t === tab;
          t.setAttribute("aria-selected", String(on));
          t.tabIndex = on ? 0 : -1;
          var panel = document.getElementById(t.getAttribute("aria-controls"));
          if (panel) panel.hidden = !on;
        });
        if (focus) tab.focus();
      }

      tabs.forEach(function (tab, i) {
        tab.addEventListener("click", function () {
          activate(tab, false);
        });
        tab.addEventListener("keydown", function (e) {
          var nextKey = vertical ? "ArrowDown" : "ArrowRight";
          var prevKey = vertical ? "ArrowUp" : "ArrowLeft";
          var j = null;
          if (e.key === nextKey) j = (i + 1) % tabs.length;
          if (e.key === prevKey) j = (i - 1 + tabs.length) % tabs.length;
          if (e.key === "Home") j = 0;
          if (e.key === "End") j = tabs.length - 1;
          if (j !== null) {
            e.preventDefault();
            activate(tabs[j], true);
          }
        });
      });
    });
  }

  /* ---------- Statement: pairs, networks and a real fingerprint ---------- */

  function initStatement() {
    var doc = document.querySelector("[data-statement]");
    if (!doc) return;
    var rows = Array.prototype.slice.call(doc.querySelectorAll("[data-stmt-ledger] tbody tr"));
    var title = document.querySelector("[data-explain-title]");
    var text = document.querySelector("[data-explain-text]");
    var formula = document.querySelector("[data-explain-formula]");
    var nodes = Array.prototype.slice.call(document.querySelectorAll("[data-route] [data-network]"));
    var defaults = { title: title.textContent, text: text.textContent, formula: formula.textContent };

    function clear() {
      rows.forEach(function (r) {
        r.classList.remove("is-lit", "is-dim");
        r.setAttribute("aria-selected", "false");
      });
      nodes.forEach(function (n) {
        n.setAttribute("aria-pressed", "false");
      });
    }

    function lightPair(row) {
      var pair = row.dataset.pair;
      var already = row.classList.contains("is-lit") && !nodes.some(function (n) {
        return n.getAttribute("aria-pressed") === "true";
      });
      clear();
      if (already) {
        title.textContent = defaults.title;
        text.textContent = defaults.text;
        formula.textContent = defaults.formula;
        return;
      }
      rows.forEach(function (r) {
        var on = r.dataset.pair === pair;
        r.classList.toggle("is-lit", on);
        r.classList.toggle("is-dim", !on);
        if (on) r.setAttribute("aria-selected", "true");
      });
      var cells = row.querySelectorAll("td");
      title.textContent = cells[0].textContent + ": " + cells[1].textContent;
      text.textContent = row.dataset.says;
      formula.textContent = row.dataset.formula;
    }

    rows.forEach(function (r) {
      r.tabIndex = 0;
      r.setAttribute("role", "button");
      r.setAttribute("aria-selected", "false");
      r.addEventListener("click", function () {
        lightPair(r);
      });
      r.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          lightPair(r);
        }
      });
    });

    var networks = {
      eskom: {
        title: "Eskom Transmission charges once",
        text: "Two lines, both paid by the buyer: transmission at 18 c and ancillary services at 2 c on 36,597.333 kWh delivered.",
        formula: "R 6,587.52 + R 731.95 = R 7,319.47"
      },
      muni: {
        title: "The municipal network charges once",
        text: "Two lines, both paid by the buyer: wheeling at 11 c and distribution at 13 c on 36,597.333 kWh delivered.",
        formula: "R 4,025.71 + R 4,757.65 = R 8,783.36"
      }
    };

    nodes.forEach(function (node) {
      node.addEventListener("click", function () {
        var on = node.getAttribute("aria-pressed") === "true";
        clear();
        if (on) {
          title.textContent = defaults.title;
          text.textContent = defaults.text;
          formula.textContent = defaults.formula;
          return;
        }
        node.setAttribute("aria-pressed", "true");
        var key = node.dataset.network;
        rows.forEach(function (r) {
          var hit = r.dataset.net === key;
          r.classList.toggle("is-lit", hit);
          r.classList.toggle("is-dim", !hit);
        });
        title.textContent = networks[key].title;
        text.textContent = networks[key].text;
        formula.textContent = networks[key].formula;
      });
    });

    // A real SHA-256 of the statement's lines, computed here, so the fingerprint is not decoration.
    var hashEl = doc.querySelector("[data-stmt-hash]");
    if (hashEl && window.crypto && crypto.subtle && window.TextEncoder) {
      var content = Array.prototype.map.call(doc.querySelectorAll("tr"), function (tr) {
        return tr.textContent.replace(/\s+/g, " ").trim();
      }).join("\n");
      crypto.subtle.digest("SHA-256", new TextEncoder().encode(content)).then(function (buf) {
        var hex = Array.prototype.map.call(new Uint8Array(buf), function (b) {
          return b.toString(16).padStart(2, "0");
        }).join("");
        hashEl.textContent = "SHA-256 of these lines, computed in your browser: " + hex.slice(0, 16) + "…" + hex.slice(-8);
        hashEl.title = hex;
      });
    } else if (hashEl) {
      hashEl.textContent = "Every statement carries a SHA-256 fingerprint of its content.";
    }
  }

  /* ---------- Carbon-tax rate chart ---------- */

  function initRateChart() {
    var svg = document.querySelector("[data-rate-chart]");
    if (!svg) return;
    var pts = [
      [2019, 120], [2020, 127], [2021, 134], [2022, 144], [2023, 159], [2024, 190], [2025, 236], [2026, 308],
      [2027, 347], [2028, 385], [2029, 424], [2030, 462]
    ];
    var labelled = { 2019: 1, 2024: 1, 2026: 1, 2030: 1 };
    var W = 640, H = 360, L = 52, R = 24, T = 36, B = 40;
    var x = function (yr) { return L + ((yr - 2019) / 11) * (W - L - R); };
    var y = function (v) { return T + (1 - v / 500) * (H - T - B); };
    var html = "";
    [0, 100, 200, 300, 400, 500].forEach(function (v) {
      html += '<line class="grid-line" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '"/>';
      html += '<text x="' + (L - 10) + '" y="' + (y(v) + 5) + '" text-anchor="end">' + v + "</text>";
    });
    html += '<line class="axis" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(0) + '" y2="' + y(0) + '"/>';
    var past = pts.filter(function (p) { return p[0] <= 2026; });
    var ahead = pts.filter(function (p) { return p[0] >= 2026; });
    var line = function (list) {
      return list.map(function (p, i) { return (i ? "L" : "M") + x(p[0]).toFixed(1) + " " + y(p[1]).toFixed(1); }).join(" ");
    };
    html += '<path class="path-past" d="' + line(past) + '"/>';
    html += '<path class="path-ahead" d="' + line(ahead) + '"/>';
    pts.forEach(function (p) {
      var cls = p[0] === 2026 ? "dot dot--now" : p[0] > 2026 ? "dot dot--ahead" : "dot";
      html += '<circle class="' + cls + '" cx="' + x(p[0]) + '" cy="' + y(p[1]) + '" r="' + (p[0] === 2026 ? 6 : 4.5) + '"/>';
      if (labelled[p[0]]) {
        var cls2 = p[0] === 2026 ? "val val--now" : "val";
        html += '<text class="' + cls2 + '" x="' + x(p[0]) + '" y="' + (y(p[1]) - 16) + '" text-anchor="middle">R ' + p[1] + "</text>";
      }
    });
    [2019, 2022, 2026, 2030].forEach(function (yr) {
      html += '<text x="' + x(yr) + '" y="' + (H - 12) + '" text-anchor="middle">' + yr + "</text>";
    });
    svg.innerHTML = html;
  }

  /* ---------- Walkthrough form ---------- */

  function initForm() {
    document.querySelectorAll("[data-walkthrough]").forEach(function (form) {
      var panel = form.querySelector("[data-request]");
      var text = form.querySelector("[data-request-text]");
      var status = form.querySelector("[data-form-status]");
      var mail = form.querySelector("[data-request-mail]");
      form.querySelector("[data-request-addr]").textContent = CONTACT_EMAIL;

      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var ok = true;
        form.querySelectorAll("[required]").forEach(function (input) {
          var field = input.closest(".field");
          var old = field.querySelector(".field__error");
          if (old) old.remove();
          var bad = !input.value.trim() || (input.type === "email" && !/^\S+@\S+\.\S+$/.test(input.value));
          field.classList.toggle("is-invalid", bad);
          input.setAttribute("aria-invalid", String(bad));
          if (bad) {
            ok = false;
            var msg = document.createElement("p");
            msg.className = "field__error";
            msg.id = input.id + "-error";
            msg.textContent = input.type === "email" ? "Enter a work email, like name@company.co.za." : "Enter your name so we know who to reply to.";
            field.appendChild(msg);
            input.setAttribute("aria-describedby", msg.id);
          } else {
            input.removeAttribute("aria-describedby");
          }
        });
        if (!ok) {
          var first = form.querySelector('[aria-invalid="true"]');
          if (first) first.focus();
          return;
        }
        var data = new FormData(form);
        var subject = "Walkthrough request: " + data.get("seat");
        var body =
          "Name: " + data.get("name") + "\n" +
          "Email: " + data.get("email") + "\n" +
          "Organisation: " + (data.get("organisation") || "") + "\n" +
          "Seat: " + data.get("seat") + "\n\n" +
          (data.get("message") || "");
        text.value = subject + "\n\n" + body;
        mail.href = "mailto:" + CONTACT_EMAIL + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
        panel.hidden = false;
        status.textContent = "Request ready. Copy it into an email to " + CONTACT_EMAIL + ", or open it in your email app.";
        text.focus();
        text.select();
      });

      form.querySelector("[data-request-copy]").addEventListener("click", function () {
        var done = function () {
          status.textContent = "Copied. Paste it into an email to " + CONTACT_EMAIL + ".";
        };
        var fallback = function () {
          text.focus();
          text.select();
          status.textContent = "The request is selected. Copy it with your keyboard.";
        };
        try {
          navigator.clipboard.writeText(text.value).then(done, fallback);
        } catch (err) {
          fallback();
        }
      });
    });
  }

  /* ---------- Generic range sliders: keep the filled track in sync ---------- */

  function syncRange(input) {
    var min = Number(input.min || 0);
    var max = Number(input.max || 100);
    var pct = ((Number(input.value) - min) / (max - min)) * 100;
    input.style.setProperty("--fill", pct + "%");
  }

  function initRanges() {
    document.querySelectorAll('input[type="range"]').forEach(function (input) {
      syncRange(input);
      input.addEventListener("input", function () {
        syncRange(input);
      });
    });
  }

  // Shared helpers for page-specific instruments (instruments.js).
  window.WG = {
    fmtNum: fmtNum,
    fmtRand: fmtRand,
    fmtKwh: fmtKwh,
    pad2: pad2,
    sastNow: sastNow,
    touPeriod: touPeriod,
    syncRange: syncRange,
    reduceMotion: reduceMotion
  };

  function init() {
    initHeader();
    initClock();
    initDay();
    initMeterStrip();
    initNomRow();
    initSpine();
    initTabs();
    initStatement();
    initRateChart();
    initForm();
    initRanges();
    document.dispatchEvent(new CustomEvent("wg:ready"));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
