/* Fraud Rules Playground — UI layer. All logic lives in engine.js. */
(function () {
  'use strict';
  const E = window.FraudEngine;
  const $ = (sel) => document.querySelector(sel);
  const el = (tag, attrs, html) => {
    const n = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => n.setAttribute(k, v));
    if (html != null) n.innerHTML = html;
    return n;
  };

  // ---------- Formatting ----------
  const inr = (v) => '₹' + Math.round(v).toLocaleString('en-IN');
  const inrShort = (v) => {
    const a = Math.abs(v);
    if (a >= 1e7) return '₹' + (v / 1e7).toFixed(2) + ' Cr';
    if (a >= 1e5) return '₹' + (v / 1e5).toFixed(1) + ' L';
    return inr(v);
  };
  const pct = (v, d = 1) => (v * 100).toFixed(d) + '%';
  const num = (v) => Math.round(v).toLocaleString('en-IN');
  const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- State ----------
  const txns = E.generateDataset();
  const costs = Object.assign({}, E.DEFAULT_COSTS);
  let config = E.cloneConfig(E.PRESETS.tuned.config);
  let activePreset = 'tuned';
  let filter = 'missed';
  let legacy = E.evaluate(txns, E.PRESETS.legacy.config, costs).metrics;

  // ---------- Static bits ----------
  document.querySelectorAll('[data-dataset-size]').forEach((n) => (n.textContent = num(txns.length)));
  document.querySelectorAll('[data-fraud-count]').forEach((n) => (n.textContent = num(legacy.fraud)));

  // ---------- Presets ----------
  function renderPresets() {
    const wrap = $('#presets');
    wrap.innerHTML = '';
    Object.entries(E.PRESETS).forEach(([key, p]) => {
      const b = el('button', { class: 'preset' + (key === activePreset ? ' active' : ''), type: 'button' },
        `<span class="preset-name">${p.label}</span><span class="preset-tag">${p.tagline}</span>`);
      b.addEventListener('click', () => {
        config = E.cloneConfig(p.config);
        activePreset = key;
        renderControls();
        update();
      });
      wrap.appendChild(b);
    });
    if (activePreset === 'custom') {
      wrap.appendChild(el('span', { class: 'preset active custom' }, '<span class="preset-name">Custom</span><span class="preset-tag">Your edits</span>'));
    }
  }

  function markCustom() {
    if (activePreset !== 'custom') { activePreset = 'custom'; renderPresets(); }
  }

  // ---------- Controls ----------
  function renderControls() {
    renderPresets();
    const rs = $('#reviewSlider'), bs = $('#blockSlider');
    rs.value = config.review; bs.value = config.block;
    $('#reviewVal').textContent = config.review;
    $('#blockVal').textContent = config.block;

    const list = $('#rulesList');
    list.innerHTML = '';
    E.RULES.forEach((r) => {
      const rc = config.rules[r.id];
      const card = el('div', { class: 'rule' + (rc.on ? '' : ' off') });
      const paramHtml = r.param
        ? `<div class="rule-row"><label>${r.param.label}</label><b data-v="value">${r.param.money ? inr(rc.value) : rc.value}</b></div>
           <input type="range" data-k="value" min="${r.param.min}" max="${r.param.max}" step="${r.param.step}" value="${rc.value}">`
        : '';
      card.innerHTML = `
        <div class="rule-head">
          <label class="switch"><input type="checkbox" data-k="on" ${rc.on ? 'checked' : ''}><span></span></label>
          <div><div class="rule-name">${r.name}</div><div class="rule-desc">${r.desc}</div></div>
        </div>
        <div class="rule-body">
          ${paramHtml}
          <div class="rule-row"><label>Risk points</label><b data-v="points">${rc.points}</b></div>
          <input type="range" data-k="points" min="0" max="100" step="5" value="${rc.points}">
        </div>`;
      card.addEventListener('input', (ev) => {
        const k = ev.target.dataset.k;
        if (!k) return;
        if (k === 'on') { rc.on = ev.target.checked; card.classList.toggle('off', !rc.on); }
        else {
          rc[k] = Number(ev.target.value);
          card.querySelector(`[data-v="${k}"]`).textContent = k === 'value' && r.param.money ? inr(rc[k]) : rc[k];
        }
        markCustom();
        schedule();
      });
      list.appendChild(card);
    });
  }

  $('#reviewSlider').addEventListener('input', (e) => {
    config.review = Number(e.target.value);
    $('#reviewVal').textContent = config.review;
    markCustom(); schedule();
  });
  $('#blockSlider').addEventListener('input', (e) => {
    config.block = Number(e.target.value);
    $('#blockVal').textContent = config.block;
    markCustom(); schedule();
  });

  function renderCostInputs() {
    const fields = [
      ['chargebackFee', 'Chargeback fee + ops per missed fraud (₹)', 1, 0],
      ['reviewCost', 'Analyst cost per manual review (₹)', 1, 0],
      ['reviewCatchRate', 'Fraud stopped by reviewers (%)', 100, 0],
      ['reviewAbandonRate', 'Good customers abandoning during review (%)', 100, 0],
      ['falseDeclineCost', 'Cost per ₹1 of good payment declined (paise)', 100, 0],
    ];
    const wrap = $('#costInputs');
    fields.forEach(([key, label, mult]) => {
      const row = el('label', { class: 'cost-row' }, `<span>${label}</span><input type="number" min="0" value="${Math.round(costs[key] * mult)}">`);
      row.querySelector('input').addEventListener('input', (e) => {
        costs[key] = Number(e.target.value) / mult;
        legacy = E.evaluate(txns, E.PRESETS.legacy.config, costs).metrics;
        schedule();
        renderResults();
      });
      wrap.appendChild(row);
    });
  }

  // ---------- Outputs ----------
  function delta(cur, base, { better = 'up', fmt = pct, unit = '' } = {}) {
    const d = cur - base;
    if (Math.abs(d) < 1e-9) return '<span class="delta flat">same as legacy</span>';
    const good = better === 'up' ? d > 0 : d < 0;
    const arrow = d > 0 ? '▲' : '▼';
    return `<span class="delta ${good ? 'good' : 'bad'}">${arrow} ${fmt(Math.abs(d))}${unit} vs legacy</span>`;
  }

  function renderKpis(m) {
    const pts = (v) => (v * 100).toFixed(1);
    const k = [
      { label: 'Fraud caught', value: pct(m.recall), sub: `${inrShort(m.fraudCaughtAmt)} of ${inrShort(m.fraudAmt)} stopped`,
        d: delta(m.recall, legacy.recall, { fmt: pts, unit: ' pts' }) },
      { label: 'Fraud losses', value: inrShort(m.fraudLoss), sub: `${num(m.fraudMissed)} fraud payments got through`,
        d: delta(m.fraudLoss, legacy.fraudLoss, { better: 'down', fmt: inrShort }) },
      { label: 'Good customers blocked', value: num(m.blockedGood), sub: `${pct(m.falseDeclineRate, 2)} false-decline rate`,
        d: delta(m.blockedGood, legacy.blockedGood, { better: 'down', fmt: num }) },
      { label: 'Manual review queue', value: num(m.reviewed), sub: `≈ ${num(m.reviewed / 30)} / day · ${inrShort(m.reviewOpsCost)} ops cost`,
        d: delta(m.reviewed, legacy.reviewed, { better: 'down', fmt: num }) },
      { label: 'Approval rate', value: pct(m.approvalRate), sub: 'genuine payments that complete',
        d: delta(m.approvalRate, legacy.approvalRate, { fmt: pts, unit: ' pts' }) },
      { label: 'Total cost of fraud', value: inrShort(m.totalCost), sub: 'losses + false declines + reviews', primary: true,
        d: delta(m.totalCost, legacy.totalCost, { better: 'down', fmt: inrShort }) },
    ];
    $('#kpis').innerHTML = k.map((x) => `
      <div class="kpi${x.primary ? ' kpi-primary' : ''}">
        <div class="kpi-label">${x.label}</div>
        <div class="kpi-value">${x.value}</div>
        <div class="kpi-sub">${x.sub}</div>
        ${activePreset === 'legacy' ? '' : x.d}
      </div>`).join('');
  }

  function renderChart() {
    const curve = E.tradeoffCurve(txns, config);
    const legacyCurve = E.tradeoffCurve(txns, E.PRESETS.legacy.config);
    const legacyPt = legacyCurve.find((p) => p.threshold <= E.PRESETS.legacy.config.review) || legacyCurve[legacyCurve.length - 1];
    const youPt = curve.find((p) => p.threshold <= Math.min(config.review, config.block)) || curve[curve.length - 1];

    const W = 640, H = 300, P = { l: 52, r: 18, t: 16, b: 42 };
    const xMax = Math.min(1, Math.max(0.1, Math.ceil((Math.max(legacyPt.fpr, youPt.fpr) * 1.4) * 20) / 20));
    const x = (v) => P.l + (Math.min(v, xMax) / xMax) * (W - P.l - P.r);
    const y = (v) => H - P.b - v * (H - P.t - P.b);

    const pts = [{ fpr: 0, recall: 0 }, ...curve].filter((p) => p.fpr <= xMax * 1.001);
    const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.fpr).toFixed(1)},${y(p.recall).toFixed(1)}`).join(' ');
    const area = path + ` L${x(pts[pts.length - 1].fpr).toFixed(1)},${y(0)} L${x(0)},${y(0)} Z`;

    let grid = '';
    for (let i = 0; i <= 4; i++) {
      const gv = i / 4;
      grid += `<line x1="${P.l}" x2="${W - P.r}" y1="${y(gv)}" y2="${y(gv)}" class="grid"/><text x="${P.l - 8}" y="${y(gv) + 4}" class="axis" text-anchor="end">${gv * 100}%</text>`;
      const xv = (xMax * i) / 4;
      grid += `<text x="${x(xv)}" y="${H - P.b + 18}" class="axis" text-anchor="middle">${(xv * 100).toFixed(xMax < 0.2 ? 1 : 0)}%</text>`;
    }
    const lx = x(legacyPt.fpr), ly = y(legacyPt.recall), yx = x(youPt.fpr), yy = y(youPt.recall);
    // Flip a label to the left of its point when it would run off the right edge.
    const lab = (px) => (px > W * 0.55 ? `x="${px - 12}" text-anchor="end"` : `x="${px + 12}"`);
    $('#chart').innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Trade-off curve">
        ${grid}
        <text x="${(W + P.l) / 2}" y="${H - 6}" class="axis-title" text-anchor="middle">Good customers blocked or held for review →</text>
        <text transform="translate(14 ${(H - P.b + P.t) / 2}) rotate(-90)" class="axis-title" text-anchor="middle">Fraud flagged →</text>
        <path d="${area}" class="curve-area"/>
        <path d="${path}" class="curve"/>
        <circle cx="${lx}" cy="${ly}" r="7" class="pt-legacy"/>
        <text ${lab(lx)} y="${ly + 22}" class="pt-label">Legacy · ${pct(legacyPt.recall, 0)} fraud flagged · ${pct(legacyPt.fpr)} good customers hit</text>
        <circle cx="${yx}" cy="${yy}" r="7" class="pt-you"/>
        <text ${lab(yx)} y="${yy + 22}" class="pt-label pt-label-you">You · ${pct(youPt.recall, 0)} fraud flagged · ${pct(youPt.fpr, 2)} good customers hit</text>
      </svg>`;
  }

  function verdict(r) {
    if (!r.hits) return '<span class="pill pill-muted">No hits</span>';
    if (r.lift >= 20) return '<span class="pill pill-good">Strong</span>';
    if (r.lift >= 6) return '<span class="pill pill-ok">Useful</span>';
    return '<span class="pill pill-bad">Noisy</span>';
  }

  function renderRuleTable(m) {
    const rows = m.rules.filter((r) => r.on).sort((a, b) => b.lift - a.lift);
    $('#ruleTable').innerHTML = `
      <thead><tr><th>Rule</th><th class="r">Fires</th><th class="r">Fraud</th><th class="r">Good hit</th><th class="r">Precision</th><th class="r" title="Precision ÷ base fraud rate">Lift</th><th>Verdict</th></tr></thead>
      <tbody>${rows.map((r) => `<tr><td>${r.name}</td><td class="r">${num(r.hits)}</td><td class="r">${num(r.fraudHits)}</td>
        <td class="r">${num(r.goodHits)}</td><td class="r">${pct(r.precision)}</td><td class="r">${r.lift.toFixed(1)}×</td><td>${verdict(r)}</td></tr>`).join('')
        || '<tr><td colspan="7" class="muted">No rules switched on.</td></tr>'}</tbody>`;
  }

  function renderTypeBars(m, target, compare) {
    target.innerHTML = Object.entries(E.FRAUD_TYPES).map(([k, f]) => {
      const b = m.byType[k];
      const rate = b.total ? b.caught / b.total : 0;
      const base = compare ? compare.byType[k].caught / compare.byType[k].total : null;
      return `<div class="tb">
        <div class="tb-head"><span>${f.label} <span class="muted">(${b.total})</span></span><b>${pct(rate, 0)}</b></div>
        <div class="tb-track">${base != null ? `<div class="tb-base" style="width:${base * 100}%"></div>` : ''}<div class="tb-fill" style="width:${rate * 100}%"></div></div>
      </div>`;
    }).join('') + (compare ? '<div class="legend"><span><i class="lg lg-fill"></i>Current</span><span><i class="lg lg-base"></i>Legacy</span></div>' : '');
  }

  const FILTERS = {
    missed:  { label: 'Missed fraud',   test: (t, s) => t.isFraud && s.decision === 'allow' },
    falseD:  { label: 'False declines', test: (t, s) => !t.isFraud && s.decision === 'block' },
    caught:  { label: 'Fraud caught',   test: (t, s) => t.isFraud && s.decision !== 'allow' },
    review:  { label: 'In review',      test: (t, s) => s.decision === 'review' },
    flagged: { label: 'All flagged',    test: (t, s) => s.decision !== 'allow' },
  };

  function renderFilters(results) {
    $('#filters').innerHTML = '';
    Object.entries(FILTERS).forEach(([k, f]) => {
      const count = txns.reduce((n, t, i) => n + (f.test(t, results[i]) ? 1 : 0), 0);
      const b = el('button', { class: 'filter' + (k === filter ? ' active' : ''), type: 'button' }, `${f.label} <span>${num(count)}</span>`);
      b.addEventListener('click', () => { filter = k; update(); });
      $('#filters').appendChild(b);
    });
  }

  function renderTxTable(results) {
    const f = FILTERS[filter];
    const rows = [];
    for (let i = 0; i < txns.length && rows.length < 25; i++) if (f.test(txns[i], results[i])) rows.push(i);
    const ruleById = Object.fromEntries(E.RULES.map((r) => [r.id, r]));
    const dt = (ts) => new Date(ts).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' });
    $('#txTable').innerHTML = `
      <thead><tr><th>Payment</th><th>Merchant</th><th class="r">Amount</th><th class="r">Score</th><th>Decision</th><th>Truth</th><th>Why</th></tr></thead>
      <tbody>${rows.map((i) => {
        const t = txns[i], s = results[i];
        const truth = t.isFraud ? `<span class="pill pill-bad">Fraud</span><div class="muted">${E.FRAUD_TYPES[t.fraudType].label}</div>` : '<span class="pill pill-muted">Genuine</span>';
        const reasons = s.hits.map((id) => `<span class="reason">${escapeHtml(ruleById[id].reason(t))} <b>+${config.rules[id].points}</b></span>`).join('') || '<span class="muted">No rules fired</span>';
        return `<tr><td class="mono">${t.id}<div class="muted">${dt(t.timestamp)} · ${t.channel}</div></td>
          <td>${t.merchant}<div class="muted">${E.CATEGORIES[t.category].label}</div></td><td class="r mono">${inr(t.amount)}</td>
          <td class="r mono">${s.score}</td><td><span class="dec dec-${s.decision}">${s.decision}</span></td><td class="truth">${truth}</td><td class="reasons">${reasons}</td></tr>`;
      }).join('') || '<tr><td colspan="7" class="muted">Nothing here with the current rules. 🎉</td></tr>'}</tbody>`;
  }

  // ---------- Results section (fixed comparison: legacy vs tuned) ----------
  function renderResults() {
    const a = legacy;
    const b = E.evaluate(txns, E.PRESETS.tuned.config, costs).metrics;
    const change = (x, y, better) => {
      if (!x) return '';
      const rel = (y - x) / x;
      const good = better === 'up' ? y >= x : y <= x;
      return `<span class="delta ${good ? 'good' : 'bad'}">${rel > 0 ? '+' : ''}${(rel * 100).toFixed(0)}%</span>`;
    };
    const rows = [
      ['Fraud caught (by count)', pct(a.recall), pct(b.recall), `<span class="delta good">+${((b.recall - a.recall) * 100).toFixed(1)} pts</span>`],
      ['Fraud caught (by ₹ value)', pct(a.recallAmt), pct(b.recallAmt), `<span class="delta good">+${((b.recallAmt - a.recallAmt) * 100).toFixed(1)} pts</span>`],
      ['Fraud losses', inr(a.fraudLoss), inr(b.fraudLoss), change(a.fraudLoss, b.fraudLoss, 'down')],
      ['Good customers blocked', num(a.blockedGood), num(b.blockedGood), change(a.blockedGood, b.blockedGood, 'down')],
      ['False-decline rate', pct(a.falseDeclineRate, 2), pct(b.falseDeclineRate, 2), ''],
      ['Good customers blocked per fraud stopped', a.goodPerFraudBlocked.toFixed(1), b.goodPerFraudBlocked.toFixed(1), change(a.goodPerFraudBlocked, b.goodPerFraudBlocked, 'down')],
      ['Manual reviews (per month)', num(a.reviewed), num(b.reviewed) + ` <span class="muted">(≈${num(b.reviewed / 30)}/day)</span>`, '<span class="muted">new capacity</span>'],
      ['Approval rate', pct(a.approvalRate), pct(b.approvalRate), `<span class="delta good">+${((b.approvalRate - a.approvalRate) * 100).toFixed(1)} pts</span>`],
      ['<strong>Total cost of fraud</strong>', `<strong>${inr(a.totalCost)}</strong>`, `<strong>${inr(b.totalCost)}</strong>`, change(a.totalCost, b.totalCost, 'down')],
    ];
    $('#resultTable').innerHTML = `<thead><tr><th>Metric (30 days, ${num(txns.length)} payments)</th><th class="r">Legacy rules</th><th class="r">Tuned risk score</th><th class="r">Change</th></tr></thead>
      <tbody>${rows.map((r) => `<tr><td>${r[0]}</td><td class="r">${r[1]}</td><td class="r">${r[2]}</td><td class="r">${r[3]}</td></tr>`).join('')}</tbody>`;

    const costCut = 1 - b.totalCost / a.totalCost;
    const fdCut = 1 - b.blockedGood / a.blockedGood;
    $('#resultBig').innerHTML = `
      <div class="rb"><div class="rb-val">${pct(a.recall, 0)} → ${pct(b.recall, 0)}</div><div class="rb-label">fraud caught</div></div>
      <div class="rb"><div class="rb-val">−${pct(fdCut, 0)}</div><div class="rb-label">good customers wrongly blocked</div></div>
      <div class="rb"><div class="rb-val">−${pct(costCut, 0)}</div><div class="rb-label">total cost of fraud</div></div>
      <div class="rb"><div class="rb-val">${inrShort((a.totalCost - b.totalCost) * 12)}</div><div class="rb-label">annualised saving on this simulated book</div></div>`;

    const hs = (k, v) => { const n = document.querySelector(`[data-hero="${k}"]`); if (n) n.innerHTML = v; };
    hs('recall', `${pct(a.recall, 0)} → <b>${pct(b.recall, 0)}</b>`);
    hs('blocked', `${num(a.blockedGood)} → <b>${num(b.blockedGood)}</b>`);
    hs('cost', `<b>−${pct(costCut, 0)}</b>`);
  }

  // ---------- Update loop ----------
  let pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; update(); });
  }

  function update() {
    const { metrics, results } = E.evaluate(txns, config, costs);
    renderKpis(metrics);
    renderChart();
    renderRuleTable(metrics);
    renderTypeBars(metrics, $('#typeBars'), activePreset === 'legacy' ? null : legacy);
    renderFilters(results);
    renderTxTable(results);
  }

  $('#copyConfig').addEventListener('click', () => {
    const out = { review: config.review, block: config.block, rules: {} };
    Object.entries(config.rules).forEach(([id, r]) => { if (r.on) out.rules[id] = { threshold: r.value, points: r.points }; });
    const text = JSON.stringify(out, null, 2);
    const done = () => toast('Rule config copied as JSON, ready for a change request.');
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, () => toast('Copy failed: clipboard not available.'));
  });

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2200);
  }

  renderControls();
  renderCostInputs();
  renderResults();
  update();
})();
