/* Page instruments for the seat pages. Each one reproduces a worked example, so the
   numbers a visitor sees on load are the platform's own worked figures. */

(function () {
  "use strict";

  function ready(fn) {
    if (window.WG) fn(window.WG);
    else document.addEventListener("wg:ready", function () { fn(window.WG); });
  }

  function $(root, sel) {
    return root.querySelector(sel);
  }

  function bindRange(root, name, onInput) {
    var input = root.querySelector('[name="' + name + '"]');
    var out = root.querySelector('[data-out="' + name + '"]');
    function read() {
      return Number(input.value);
    }
    input.addEventListener("input", function () {
      onInput();
    });
    return { read: read, input: input, out: out };
  }

  ready(function (WG) {
    var n = WG.fmtNum;
    var rand = WG.fmtRand;

    /* ---------- IPP: the revenue gap, achieved vs realised price ---------- */
    document.querySelectorAll("[data-gap]").forEach(function (root) {
      var share = bindRange(root, "share", update);
      var price = bindRange(root, "price", update);
      var grid = $(root, "[data-gap-grid]");
      var cells = [];
      for (var i = 0; i < 100; i++) {
        var c = document.createElement("span");
        grid.appendChild(c);
        cells.push(c);
      }
      var OUTPUT_MWH = 43800;

      function update() {
        var s = share.read();
        var p = price.read();
        share.out.textContent = s + "%";
        price.out.textContent = n(p, 1) + " c/kWh";
        cells.forEach(function (c, i) {
          c.className = i < s ? "is-sold" : "";
        });
        var realised = (s / 100) * p;
        var unsoldMwh = OUTPUT_MWH * (1 - s / 100);
        $(root, "[data-gap-achieved]").textContent = n(p, 1) + " c";
        $(root, "[data-gap-realised]").textContent = n(realised, 1) + " c";
        $(root, "[data-gap-realised-f]").textContent = "Income ÷ all output: " + s + " sold × " + n(p, 1) + " c ÷ 100";
        $(root, "[data-gap-unsold]").textContent = n(unsoldMwh) + " MWh";
        $(root, "[data-gap-value]").textContent = rand(unsoldMwh * 1000 * (p / 100));
        $(root, "[data-gap-value-f]").textContent = n(unsoldMwh) + " MWh × " + n(p, 1) + " c/kWh. Energy still to sell, not a loss already taken";
        WG.syncRange(share.input);
        WG.syncRange(price.input);
      }
      update();
    });

    /* ---------- IPP: allocation cascade (V4, V8 hierarchy) ---------- */
    document.querySelectorAll("[data-cascade]").forEach(function (root) {
      var avail = bindRange(root, "available", update);
      var buyers = [
        { key: "dc", tier: "priority", need: 40 },
        { key: "mall", tier: "prorata", need: 30 },
        { key: "cold", tier: "prorata", need: 30 },
        { key: "pool", tier: "fixed", need: 20 }
      ];
      var maxScale = 60;

      function update() {
        var a = avail.read();
        avail.out.textContent = n(a) + " MWh";
        var rem = a;
        var got = {};
        var pri = Math.min(rem, 40);
        got.dc = pri;
        rem -= pri;
        var proNeed = 60;
        if (rem >= proNeed) {
          got.mall = 30;
          got.cold = 30;
          rem -= proNeed;
        } else {
          got.mall = (rem * 30) / proNeed;
          got.cold = (rem * 30) / proNeed;
          rem = 0;
        }
        got.pool = Math.min(rem, 20);
        rem -= got.pool;
        var surplus = rem;

        buyers.forEach(function (b) {
          var row = $(root, '[data-buyer="' + b.key + '"]');
          $(row, ".cascade__need").style.width = (b.need / maxScale) * 100 + "%";
          $(row, ".cascade__got").style.width = (got[b.key] / maxScale) * 100 + "%";
          $(row, ".cascade__v").textContent = n(got[b.key], 1) + " of " + b.need;
        });
        var srow = $(root, '[data-buyer="surplus"]');
        $(srow, ".cascade__got").style.width = (surplus / maxScale) * 100 + "%";
        $(srow, ".cascade__v").textContent = n(surplus, 1) + " MWh";

        var parts = [got.dc, got.mall, got.cold, got.pool, surplus].map(function (v) { return n(v, 1); });
        $(root, "[data-cascade-sum]").textContent = "Σ = " + parts.join(" + ") + " = " + n(a, 1) + " MWh";
        var note = "";
        if (a < 40) note = "Not enough for the priority buyer. Everyone below gets nothing this interval.";
        else if (a < 100) note = "Pro rata buyers share what is left: with " + Math.round(((a - 40) / 60) * 100) + "% of enough, each gets " + Math.round(((a - 40) / 60) * 100) + "% of its demand.";
        else if (a < 120) note = "The fixed entitlement is a cap, not a delivery guarantee: the pool gets the " + n(got.pool, 1) + " MWh left, of its 20.";
        else note = "Every promise is met. The rest is surplus to sell on the Sales Desk.";
        $(root, "[data-cascade-note]").textContent = note;
        WG.syncRange(avail.input);
      }
      update();
    });

    /* ---------- Off-taker: landed cost ---------- */
    document.querySelectorAll("[data-landed]").forEach(function (root) {
      var price = bindRange(root, "price", update);
      var dlf = bindRange(root, "dlf", update);
      var wheel = bindRange(root, "wheel", update);
      var spill = bindRange(root, "spill", update);
      var tariffs = { peak: 210, standard: 128, offpeak: 95 };
      var touName = { peak: "Peak", standard: "Standard", offpeak: "Off-peak" };
      var tou = "standard";
      root.querySelectorAll("[data-tou]").forEach(function (b) {
        b.addEventListener("click", function () {
          tou = b.dataset.tou;
          root.querySelectorAll("[data-tou]").forEach(function (o) {
            o.setAttribute("aria-pressed", String(o === b));
          });
          update();
        });
      });

      function update() {
        var p = price.read();
        var d = dlf.read() / 1000;
        var w = wheel.read();
        var s = spill.read();
        var g = tariffs[tou];
        price.out.textContent = n(p, 1) + " c";
        dlf.out.textContent = d.toFixed(3);
        wheel.out.textContent = n(w, 1) + " c";
        spill.out.textContent = n(s, 1) + " c";

        var afterLoss = p / d;
        var landed = afterLoss + w;
        var saving = g - landed;
        var overLoss = landed - s;

        $(root, "[data-landed-value]").textContent = n(landed, 1);
        $(root, "[data-l-price]").textContent = n(p, 1) + " c";
        $(root, "[data-l-loss]").textContent = n(afterLoss, 1) + " c";
        $(root, "[data-l-loss-f]").textContent = n(p, 1) + " ÷ " + d.toFixed(3) + ". You pay for energy sent; you receive energy delivered";
        $(root, "[data-l-wheel]").textContent = "+ " + n(w, 1) + " c";
        $(root, "[data-l-total]").textContent = n(landed, 1) + " c";
        $(root, "[data-l-grid-name]").textContent = touName[tou] + " grid tariff";
        $(root, "[data-l-grid]").textContent = n(g, 1) + " c";
        var savingEl = $(root, "[data-l-saving]");
        savingEl.textContent = (saving >= 0 ? "Saves " : "Costs ") + n(Math.abs(saving), 1) + " c";
        $(root, "[data-l-saving-f]").textContent =
          n(g, 1) + " − " + n(landed, 1) + (saving >= 0 ? ", on every kWh you use." : ". In this period the grid is cheaper.");
        $(root, "[data-l-sticker]").textContent =
          "Comparing the sticker price with the grid would claim " + n(g - p, 1) + " c. The real figure is " + n(saving, 1) + " c.";
        $(root, "[data-l-over]").textContent = n(overLoss, 1) + " c";
        $(root, "[data-l-over-f]").textContent =
          n(landed, 1) + " landed − " + n(s, 1) + " spill credit. A contracted kWh you do not use costs this much";

        var max = Math.max(g, landed, 1) * 1.08;
        $(root, "[data-bar-grid]").style.width = (g / max) * 100 + "%";
        $(root, "[data-bar-landed]").style.width = (landed / max) * 100 + "%";
        $(root, "[data-bar-grid-v]").textContent = n(g, 1) + " c";
        $(root, "[data-bar-landed-v]").textContent = n(landed, 1) + " c";
        [price, dlf, wheel, spill].forEach(function (r) { WG.syncRange(r.input); });
      }
      update();
    });

    /* ---------- Off-taker: Virtual Wheeling refund, greedy fill vs equal split ---------- */
    document.querySelectorAll("[data-tank]").forEach(function (root) {
      var a = bindRange(root, "meterA", update);
      var b = bindRange(root, "meterB", update);
      var G = 100;
      var RATE = 0.5;
      var mode = "greedy";
      root.querySelectorAll("[data-mode]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          mode = btn.dataset.mode;
          root.querySelectorAll("[data-mode]").forEach(function (o) {
            o.setAttribute("aria-pressed", String(o === btn));
          });
          update();
        });
      });

      function fill(ca, cb, how) {
        if (how === "equal") return [Math.min(G / 2, ca), Math.min(G / 2, cb)];
        // Greedy: the glass with the most room first.
        var order = ca >= cb ? ["a", "b"] : ["b", "a"];
        var left = G;
        var out = { a: 0, b: 0 };
        var need = { a: ca, b: cb };
        order.forEach(function (k) {
          out[k] = Math.min(need[k], left);
          left -= out[k];
        });
        return [out.a, out.b];
      }

      function update() {
        var ca = a.read();
        var cb = b.read();
        a.out.textContent = n(ca) + " kWh";
        b.out.textContent = n(cb) + " kWh";
        var greedy = fill(ca, cb, "greedy");
        var equal = fill(ca, cb, "equal");
        var shown = mode === "greedy" ? greedy : equal;
        var scale = 130;
        [["A", ca, shown[0]], ["B", cb, shown[1]]].forEach(function (m) {
          var glass = $(root, '[data-glass="' + m[0] + '"]');
          $(glass, ".tank__need").style.height = Math.min(100, (m[1] / scale) * 100) + "%";
          $(glass, ".tank__fill").style.height = Math.min(100, (m[2] / scale) * 100) + "%";
          $(root, '[data-glass-v="' + m[0] + '"]').textContent = n(m[2]) + " of " + n(m[1]) + " kWh";
        });
        var gm = greedy[0] + greedy[1];
        var em = equal[0] + equal[1];
        var sm = shown[0] + shown[1];
        $(root, "[data-tank-matched]").textContent = n(sm) + " kWh";
        $(root, "[data-tank-excess]").textContent = n(G - sm) + " kWh";
        $(root, "[data-tank-refund]").textContent = rand(sm * RATE);
        $(root, "[data-tank-refund-f]").textContent = n(sm) + " kWh × R 0.50";
        $(root, "[data-tank-compare]").textContent =
          "Most room first earns " + rand(gm * RATE) + " and leaves " + n(G - gm) + " kWh uncredited. An equal split earns " +
          rand(em * RATE) + " and leaves " + n(G - em) + " kWh uncredited." + (gm === em ? " Here the two match the same energy." : "");
        WG.syncRange(a.input);
        WG.syncRange(b.input);
      }
      update();
    });

    /* ---------- Trader: the hours decide the fit ---------- */
    document.querySelectorAll("[data-fit]").forEach(function (root) {
      var chart = $(root, ".fit");
      var axis = $(root, ".fit-axis");
      var demand = [];
      var h;
      for (h = 0; h < 24; h++) demand.push(h >= 6 && h <= 21 ? 11 : 8.5);
      var total = demand.reduce(function (s, v) { return s + v; }, 0);

      function normalise(shape) {
        var s = shape.reduce(function (a, v) { return a + v; }, 0);
        return shape.map(function (v) { return (v / s) * total; });
      }

      var shapes = {
        solar: normalise(demand.map(function (_, i) {
          var x = (i + 0.5 - 6) / 13;
          return x > 0 && x < 1 ? Math.pow(Math.sin(Math.PI * x), 1.4) : 0;
        })),
        wind: normalise(demand.map(function (_, i) {
          return 1 + 0.55 * Math.cos((2 * Math.PI * (i - 1)) / 24);
        })),
        battery: normalise(demand.map(function (_, i) {
          var x = (i + 0.5 - 6) / 13;
          var sun = x > 0 && x < 1 ? Math.pow(Math.sin(Math.PI * x), 1.4) : 0;
          var shifted = i >= 17 && i <= 22 ? 0.42 : 0;
          return sun * 0.62 + shifted;
        })),
        firm: demand.slice()
      };

      var cols = [];
      for (h = 0; h < 24; h++) {
        var col = document.createElement("div");
        col.className = "fit__col";
        col.innerHTML = '<span class="fit__supply"></span><span class="fit__matched"></span><span class="fit__short"></span><span class="fit__need"></span>';
        chart.appendChild(col);
        cols.push(col);
        var lab = document.createElement("span");
        lab.textContent = WG.pad2(h);
        axis.appendChild(lab);
      }

      var current = "solar";
      root.querySelectorAll("[data-shape]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          current = btn.dataset.shape;
          root.querySelectorAll("[data-shape]").forEach(function (o) {
            o.setAttribute("aria-pressed", String(o === btn));
          });
          update();
        });
      });

      function update() {
        var supply = shapes[current];
        var max = 30;
        var matched = 0, long = 0, short = 0;
        supply.forEach(function (s, i) {
          var d = demand[i];
          var m = Math.min(s, d);
          matched += m;
          long += Math.max(0, s - d);
          short += Math.max(0, d - s);
          var c = cols[i];
          c.querySelector(".fit__supply").style.height = (s / max) * 100 + "%";
          c.querySelector(".fit__matched").style.height = (m / max) * 100 + "%";
          var sh = c.querySelector(".fit__short");
          sh.style.bottom = (s / max) * 100 + "%";
          sh.style.height = (Math.max(0, d - s) / max) * 100 + "%";
          c.querySelector(".fit__need").style.bottom = (d / max) * 100 + "%";
        });
        $(root, "[data-fit-total]").textContent = n(total) + " MWh";
        $(root, "[data-fit-matched]").textContent = n(matched) + " MWh";
        $(root, "[data-fit-long]").textContent = n(long) + " MWh";
        $(root, "[data-fit-short]").textContent = n(short) + " MWh";
        $(root, "[data-fit-pct]").textContent = Math.round((matched / total) * 100) + "% of demand met in the right hour";
      }
      update();
    });

    /* ---------- Carbon: section 6 liability ---------- */
    document.querySelectorAll("[data-ctax]").forEach(function (root) {
      var comb = bindRange(root, "combustion", update);
      var proc = bindRange(root, "process", update);
      var fug = bindRange(root, "fugitive", update);
      var offsets = root.querySelector('[name="offsets"]');
      offsets.addEventListener("change", update);
      var RATE = 308;
      var BASIC = 0.6;

      root.querySelectorAll("[data-preset]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var p = btn.dataset.preset;
          if (p === "cement") {
            comb.input.value = 100000; proc.input.value = 50000; fug.input.value = 10000; offsets.checked = true;
          } else if (p === "peaker") {
            comb.input.value = 844.74; proc.input.value = 0; fug.input.value = 0; offsets.checked = false;
          }
          root.querySelectorAll("[data-preset]").forEach(function (o) {
            o.setAttribute("aria-pressed", String(o === btn));
          });
          update();
        });
      });

      function line(label, t, cap) {
        var off = offsets.checked ? cap : 0;
        var factor = 1 - BASIC - off;
        var taxable = t * factor;
        return { label: label, t: t, off: off, factor: factor, taxable: taxable, tax: taxable * RATE };
      }

      function update() {
        var c = comb.read(), p = proc.read(), f = fug.read();
        comb.out.textContent = n(c, c % 1 ? 2 : 0) + " t";
        proc.out.textContent = n(p) + " t";
        fug.out.textContent = n(f) + " t";
        var rows = [line("Fuel combustion", c, 0.15), line("Process", p, 0.1), line("Fugitive", f, 0.1)];
        var total = rows.reduce(function (s, r) { return s + r.tax; }, 0);
        var taxable = rows.reduce(function (s, r) { return s + r.taxable; }, 0);
        var emitted = c + p + f;
        $(root, "[data-ctax-total]").textContent = rand(total);
        $(root, "[data-ctax-taxable]").textContent =
          "Tax on " + n(taxable, taxable % 1 ? 2 : 0) + " of " + n(emitted, emitted % 1 ? 2 : 0) + " tonnes emitted";
        var list = $(root, "[data-ctax-lines]");
        list.innerHTML = rows.filter(function (r) { return r.t > 0; }).map(function (r) {
          var allowance = Math.round((BASIC + r.off) * 100);
          return '<li><span>' + r.label + '</span><span class="v">' + rand(r.tax) + '</span><span class="f">' +
            n(r.t, r.t % 1 ? 2 : 0) + " t × (1 − " + (BASIC + r.off).toFixed(2) + ") × R 308. " +
            (r.off ? "Allowances " + allowance + "%: 60% basic + " + Math.round(r.off * 100) + "% offsets" : "The 60% basic allowance only") + "</span></li>";
        }).join("") + '<li class="is-total"><span>Liability for the year</span><span class="v">' + rand(total) + "</span></li>";
        [comb, proc, fug].forEach(function (r) { WG.syncRange(r.input); });
      }
      update();
    });

    /* ---------- Carbon: certificates accrue in whole units ---------- */
    document.querySelectorAll("[data-certs]").forEach(function (root) {
      var mwh = bindRange(root, "mwh", update);
      var carry = bindRange(root, "carry", update);

      function update() {
        var m = mwh.read();
        var c = carry.read();
        mwh.out.textContent = m.toFixed(1) + " MWh";
        carry.out.textContent = c.toFixed(1) + " MWh";
        var total = Math.round((m + c) * 10) / 10;
        var whole = Math.floor(total + 1e-9);
        var left = Math.round((total - whole) * 10) / 10;
        var html = "";
        for (var i = 0; i < Math.min(whole, 24); i++) html += '<span class="cert">1 MWh</span>';
        if (left > 0) html += '<span class="cert cert--carry"><i style="height:' + left * 100 + '%"></i><em>' + left.toFixed(1) + "</em></span>";
        $(root, "[data-certs-tiles]").innerHTML = html;
        $(root, "[data-certs-sum]").textContent =
          m.toFixed(1) + " FINAL + " + c.toFixed(1) + " carried = " + total.toFixed(1) + " MWh, so " + whole + " certificate" + (whole === 1 ? "" : "s") + " and " + left.toFixed(1) + " MWh carried to next month";

        // Largest-remainder split between two campuses that took energy in a 2:1 ratio.
        var aShare = (whole * 2) / 3;
        var bShare = whole / 3;
        var aWhole = Math.floor(aShare), bWhole = Math.floor(bShare);
        var spare = whole - aWhole - bWhole;
        if (spare > 0) {
          if (aShare - aWhole >= bShare - bWhole) aWhole += spare;
          else bWhole += spare;
        }
        $(root, "[data-certs-split]").textContent =
          "Campus A took two thirds and Campus B one third: shares of " + aShare.toFixed(2) + " and " + bShare.toFixed(2) +
          ". Largest remainder gives A " + aWhole + " and B " + bWhole + ". Σ = " + (aWhole + bWhole) + " ✓";
        WG.syncRange(mwh.input);
        WG.syncRange(carry.input);
      }
      update();
    });
  });
})();
