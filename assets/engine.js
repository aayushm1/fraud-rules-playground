/*
 * Fraud Rules Playground — simulation engine
 * ------------------------------------------
 * 1. Generates a deterministic, synthetic month of digital payments (seeded RNG,
 *    so every visitor sees the same dataset and the results are reproducible).
 * 2. Scores every transaction against a configurable, points-based rule set.
 * 3. Computes risk, customer-experience and cost metrics for that rule set.
 *
 * Works in the browser (window.FraudEngine) and in Node (module.exports),
 * so the numbers in the README can be regenerated with `node scripts/report.js`.
 */
(function (root) {
  'use strict';

  // ---------- Seeded randomness ----------
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeRandom(seed) {
    const r = mulberry32(seed);
    const api = {
      next: r,
      chance: (p) => r() < p,
      int: (min, max) => Math.floor(r() * (max - min + 1)) + min,
      pick: (arr) => arr[Math.floor(r() * arr.length)],
      weighted: (entries) => {
        const total = entries.reduce((s, e) => s + e[1], 0);
        let x = r() * total;
        for (const [value, w] of entries) {
          if ((x -= w) <= 0) return value;
        }
        return entries[entries.length - 1][0];
      },
      gaussian: () => {
        const u = Math.max(r(), 1e-9);
        const v = r();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
      },
    };
    api.lognormal = (median, sigma) => median * Math.exp(sigma * api.gaussian());
    return api;
  }

  // ---------- Reference data ----------
  const CATEGORIES = {
    groceries:   { label: 'Groceries',         median: 700,  sigma: 0.6, weight: 22, merchants: ['FreshBasket', 'DailyMart', 'Kirana Plus'] },
    food:        { label: 'Food delivery',     median: 450,  sigma: 0.5, weight: 20, merchants: ['Zesto', 'QuickBite', 'TiffinBox'] },
    utilities:   { label: 'Bills & utilities', median: 1500, sigma: 0.7, weight: 12, merchants: ['PowerGrid Bill', 'AirFibre', 'GasConnect'] },
    fashion:     { label: 'Fashion',           median: 1800, sigma: 0.7, weight: 12, merchants: ['StyleKart', 'ThreadHouse'] },
    electronics: { label: 'Electronics',       median: 9000, sigma: 0.9, weight: 8,  merchants: ['GadgetHub', 'VoltStore', 'PixelMart'] },
    travel:      { label: 'Travel',            median: 6500, sigma: 0.8, weight: 8,  merchants: ['FlyNow', 'RailYatra', 'StayEasy'] },
    p2p:         { label: 'P2P transfer',      median: 2000, sigma: 1.0, weight: 10, merchants: ['UPI transfer'] },
    giftcards:   { label: 'Gift cards',        median: 1500, sigma: 0.6, weight: 4,  merchants: ['GiftBox', 'VoucherWorld'], highRisk: true },
    gaming:      { label: 'Gaming & wallets',  median: 600,  sigma: 0.8, weight: 4,  merchants: ['PlayZone', 'CoinWallet'],   highRisk: true },
  };

  const FRAUD_TYPES = {
    ato:       { label: 'Account takeover',        share: 0.35 },
    cardTest:  { label: 'Card testing (bot)',      share: 0.20 },
    synthetic: { label: 'New / synthetic account', share: 0.25 },
    scam:      { label: 'Social-engineering scam', share: 0.20 },
  };

  // ---------- Dataset generation ----------
  const DEFAULT_DATA_OPTIONS = { seed: 20260901, size: 10000, fraudRate: 0.015 };

  function daytimeHour(rnd) {
    return rnd.weighted([[7, 3], [8, 5], [9, 6], [10, 7], [11, 7], [12, 8], [13, 8], [14, 7], [15, 6], [16, 6],
      [17, 6], [18, 7], [19, 8], [20, 9], [21, 8], [22, 6], [23, 4], [6, 2], [5, 1]]);
  }

  function clampAmount(x) {
    return Math.max(10, Math.min(200000, Math.round(x)));
  }

  function legitTransaction(rnd) {
    const cat = rnd.weighted(Object.entries(CATEGORIES).map(([k, c]) => [k, c.weight]));
    const c = CATEGORIES[cat];
    return {
      category: cat,
      amount: clampAmount(rnd.lognormal(c.median, c.sigma)),
      channel: cat === 'p2p' ? 'UPI' : rnd.weighted([['UPI', 60], ['Card', 30], ['Netbanking', 10]]),
      hour: rnd.chance(0.05) ? rnd.int(0, 4) : daytimeHour(rnd),
      deviceAgeDays: rnd.chance(0.08) ? rnd.int(0, 2) : rnd.int(3, 900),
      accountAgeDays: rnd.chance(0.06) ? rnd.int(0, 7) : rnd.int(8, 2000),
      velocity1h: rnd.weighted([[1, 70], [2, 22], [3, 6], [rnd.int(4, 6), 2]]),
      geoMismatch: rnd.chance(cat === 'travel' ? 0.2 : 0.04),
      international: rnd.chance(cat === 'travel' ? 0.25 : 0.02),
      failedAuth24h: rnd.weighted([[0, 88], [1, 9], [rnd.int(2, 3), 3]]),
      newPayee: rnd.chance(cat === 'p2p' ? 0.25 : 0.12),
      isFraud: false,
      fraudType: null,
    };
  }

  function fraudTransaction(rnd) {
    const type = rnd.weighted(Object.entries(FRAUD_TYPES).map(([k, f]) => [k, f.share]));
    let t;
    switch (type) {
      case 'ato': // stolen credentials: new device, failed logins, big-ticket resale goods
        t = {
          category: rnd.pick(['electronics', 'electronics', 'giftcards', 'p2p']),
          amount: clampAmount(rnd.lognormal(18000, 0.7)),
          channel: rnd.weighted([['UPI', 50], ['Card', 50]]),
          hour: rnd.chance(0.25) ? rnd.int(0, 4) : daytimeHour(rnd),
          deviceAgeDays: rnd.chance(0.85) ? rnd.int(0, 1) : rnd.int(3, 600),
          accountAgeDays: rnd.int(60, 2000),
          velocity1h: rnd.int(1, 3),
          geoMismatch: rnd.chance(0.55),
          international: rnd.chance(0.1),
          failedAuth24h: rnd.chance(0.7) ? rnd.int(2, 5) : rnd.int(0, 1),
          newPayee: rnd.chance(0.7),
        };
        break;
      case 'cardTest': // bots probing stolen cards with tiny payments
        t = {
          category: rnd.pick(['gaming', 'giftcards']),
          amount: rnd.int(10, 300),
          channel: 'Card',
          hour: rnd.chance(0.5) ? rnd.int(0, 4) : daytimeHour(rnd),
          deviceAgeDays: rnd.chance(0.4) ? 0 : rnd.int(3, 300),
          accountAgeDays: rnd.int(0, 900),
          velocity1h: rnd.int(5, 14),
          geoMismatch: rnd.chance(0.4),
          international: rnd.chance(0.35),
          failedAuth24h: rnd.int(0, 2),
          newPayee: rnd.chance(0.9),
        };
        break;
      case 'synthetic': // freshly created accounts that "bust out" quickly
        t = {
          category: rnd.pick(['electronics', 'giftcards', 'fashion']),
          amount: clampAmount(rnd.lognormal(7000, 0.7)),
          channel: rnd.weighted([['UPI', 40], ['Card', 60]]),
          hour: rnd.chance(0.1) ? rnd.int(0, 4) : daytimeHour(rnd),
          deviceAgeDays: rnd.chance(0.8) ? rnd.int(0, 3) : rnd.int(4, 60),
          accountAgeDays: rnd.chance(0.85) ? rnd.int(0, 10) : rnd.int(11, 60),
          velocity1h: rnd.int(1, 4),
          geoMismatch: rnd.chance(0.25),
          international: rnd.chance(0.05),
          failedAuth24h: rnd.int(0, 1),
          newPayee: true,
        };
        break;
      default: // 'scam' — genuine user tricked into paying a fraudster (APP fraud)
        t = {
          category: 'p2p',
          amount: clampAmount(rnd.lognormal(25000, 0.8)),
          channel: 'UPI',
          hour: daytimeHour(rnd),
          deviceAgeDays: rnd.int(30, 900),
          accountAgeDays: rnd.int(90, 2000),
          velocity1h: rnd.chance(0.4) ? rnd.int(2, 3) : 1,
          geoMismatch: rnd.chance(0.05),
          international: false,
          failedAuth24h: 0,
          newPayee: rnd.chance(0.92),
        };
    }
    t.isFraud = true;
    t.fraudType = type;
    return t;
  }

  function generateDataset(options) {
    const opts = Object.assign({}, DEFAULT_DATA_OPTIONS, options || {});
    const rnd = makeRandom(opts.seed);
    const start = Date.UTC(2026, 8, 1); // 1 Sep 2026
    const txns = [];
    for (let i = 0; i < opts.size; i++) {
      const t = rnd.chance(opts.fraudRate) ? fraudTransaction(rnd) : legitTransaction(rnd);
      const day = rnd.int(0, 29);
      t.timestamp = start + day * 86400000 + t.hour * 3600000 + rnd.int(0, 3599) * 1000;
      t.userId = 'U' + String(rnd.int(100000, 999999));
      t.merchant = rnd.pick(CATEGORIES[t.category].merchants);
      t.highRiskCategory = !!CATEGORIES[t.category].highRisk;
      txns.push(t);
    }
    txns.sort((a, b) => a.timestamp - b.timestamp);
    txns.forEach((t, i) => { t.id = 'TXN-' + String(100001 + i); });
    return txns;
  }

  // ---------- Rule library ----------
  const RULES = [
    { id: 'velocity', name: 'Velocity spike', desc: 'Many payments from one user within an hour — classic bot / card-testing signal.',
      param: { label: 'Payments in 1h ≥', min: 2, max: 15, step: 1 }, test: (t, v) => t.velocity1h >= v,
      reason: (t) => `${t.velocity1h} payments in 1h` },
    { id: 'failedAuth', name: 'Failed authentication', desc: 'Repeated wrong PIN / OTP attempts before this payment.',
      param: { label: 'Failed attempts in 24h ≥', min: 1, max: 5, step: 1 }, test: (t, v) => t.failedAuth24h >= v,
      reason: (t) => `${t.failedAuth24h} failed PIN/OTP` },
    { id: 'newDevice', name: 'New device', desc: 'Payment made from a device first seen very recently.',
      param: { label: 'Device age ≤ (days)', min: 0, max: 30, step: 1 }, test: (t, v) => t.deviceAgeDays <= v,
      reason: (t) => `Device ${t.deviceAgeDays}d old` },
    { id: 'newPayee', name: 'Large payment to new payee', desc: 'First-ever payment to this payee/merchant above an amount.',
      param: { label: 'Amount ≥ (₹)', min: 1000, max: 100000, step: 1000, money: true }, test: (t, v) => t.newPayee && t.amount >= v,
      reason: () => 'New payee + large amount' },
    { id: 'newAccount', name: 'New account', desc: 'Customer account opened very recently.',
      param: { label: 'Account age ≤ (days)', min: 1, max: 90, step: 1 }, test: (t, v) => t.accountAgeDays <= v,
      reason: (t) => `Account ${t.accountAgeDays}d old` },
    { id: 'geo', name: 'Location mismatch', desc: 'IP / device location differs from the customer’s usual location.',
      param: null, test: (t) => t.geoMismatch, reason: () => 'Location mismatch' },
    { id: 'amount', name: 'High amount', desc: 'Transaction value at or above a fixed limit.',
      param: { label: 'Amount ≥ (₹)', min: 1000, max: 100000, step: 1000, money: true }, test: (t, v) => t.amount >= v,
      reason: () => 'High amount' },
    { id: 'riskyCategory', name: 'High-risk category', desc: 'Gift cards, gaming & wallet top-ups — easy to resell.',
      param: null, test: (t) => t.highRiskCategory, reason: () => 'High-risk category' },
    { id: 'international', name: 'International', desc: 'Payment routed from outside India.',
      param: null, test: (t) => t.international, reason: () => 'International' },
    { id: 'night', name: 'Odd hours', desc: 'Payment between midnight and 5 AM.',
      param: null, test: (t) => t.hour < 5, reason: (t) => `At ${String(t.hour).padStart(2, '0')}:00` },
  ];

  // ---------- Presets ----------
  function cfg(rules, review, block) {
    const full = {};
    RULES.forEach((r) => {
      const o = rules[r.id] || {};
      full[r.id] = { on: !!o.on, value: o.value != null ? o.value : (r.param ? r.param.min : null), points: o.points != null ? o.points : 20 };
    });
    return { rules: full, review, block };
  }

  const PRESETS = {
    legacy: {
      label: 'Legacy rules',
      tagline: 'Today: blunt hard-blocks written years ago',
      config: cfg({
        amount:        { on: true, value: 25000, points: 100 },
        international: { on: true, points: 100 },
        geo:           { on: true, points: 50 },
        night:         { on: true, points: 50 },
        newAccount:    { on: true, value: 7, points: 50 },
        velocity:      { on: false, value: 10, points: 50 },
        failedAuth:    { on: false, value: 3, points: 50 },
        newDevice:     { on: false, value: 1, points: 50 },
        newPayee:      { on: false, value: 50000, points: 50 },
        riskyCategory: { on: false, points: 50 },
      }, 100, 100),
    },
    tuned: {
      label: 'Tuned risk score',
      tagline: 'Weighted signals + a manual-review band',
      config: cfg({
        velocity:      { on: true, value: 5, points: 45 },
        failedAuth:    { on: true, value: 2, points: 35 },
        newDevice:     { on: true, value: 2, points: 25 },
        newPayee:      { on: true, value: 10000, points: 30 },
        newAccount:    { on: true, value: 10, points: 25 },
        geo:           { on: true, points: 20 },
        amount:        { on: true, value: 15000, points: 15 },
        riskyCategory: { on: true, points: 15 },
        international: { on: true, points: 10 },
        night:         { on: true, points: 10 },
      }, 45, 70),
    },
    strict: {
      label: 'Lock-down',
      tagline: 'Fraud spike? Block aggressively',
      config: cfg({
        velocity:      { on: true, value: 4, points: 45 },
        failedAuth:    { on: true, value: 1, points: 35 },
        newDevice:     { on: true, value: 7, points: 30 },
        newPayee:      { on: true, value: 5000, points: 30 },
        newAccount:    { on: true, value: 30, points: 30 },
        geo:           { on: true, points: 30 },
        amount:        { on: true, value: 10000, points: 25 },
        riskyCategory: { on: true, points: 25 },
        international: { on: true, points: 25 },
        night:         { on: true, points: 20 },
      }, 30, 45),
    },
    lenient: {
      label: 'Growth mode',
      tagline: 'Festive sale: maximise approvals',
      config: cfg({
        velocity:      { on: true, value: 8, points: 45 },
        failedAuth:    { on: true, value: 3, points: 35 },
        newDevice:     { on: true, value: 1, points: 20 },
        newPayee:      { on: true, value: 25000, points: 25 },
        newAccount:    { on: true, value: 3, points: 20 },
        geo:           { on: true, points: 15 },
        amount:        { on: false, value: 50000, points: 10 },
        riskyCategory: { on: false, points: 10 },
        international: { on: true, points: 10 },
        night:         { on: false, points: 5 },
      }, 60, 90),
    },
  };

  // ---------- Cost model ----------
  const DEFAULT_COSTS = {
    chargebackFee: 350,       // ₹ fee + ops cost per fraud chargeback
    reviewCost: 40,           // ₹ analyst cost per manual review
    reviewCatchRate: 0.95,    // share of reviewed fraud that analysts stop
    reviewAbandonRate: 0.08,  // share of good customers who abandon while held for review
    falseDeclineCost: 0.3,    // ₹ lost per ₹ of good payment declined (margin + churn)
  };

  // ---------- Scoring ----------
  function scoreTransaction(t, config) {
    let score = 0;
    const hits = [];
    for (const r of RULES) {
      const rc = config.rules[r.id];
      if (rc && rc.on && r.test(t, rc.value)) {
        score += rc.points;
        hits.push(r.id);
      }
    }
    const decision = score >= config.block ? 'block' : score >= config.review ? 'review' : 'allow';
    return { score, hits, decision };
  }

  function evaluate(txns, config, costs) {
    const c = Object.assign({}, DEFAULT_COSTS, costs || {});
    const m = {
      total: txns.length, fraud: 0, good: 0, fraudAmt: 0, goodAmt: 0,
      blocked: 0, reviewed: 0, allowed: 0,
      blockedFraud: 0, blockedFraudAmt: 0, reviewedFraud: 0, reviewedFraudAmt: 0, allowedFraud: 0, allowedFraudAmt: 0,
      blockedGood: 0, blockedGoodAmt: 0, reviewedGood: 0, reviewedGoodAmt: 0,
    };
    const ruleStats = {};
    RULES.forEach((r) => { ruleStats[r.id] = { hits: 0, fraudHits: 0 }; });
    const results = new Array(txns.length);

    for (let i = 0; i < txns.length; i++) {
      const t = txns[i];
      const s = scoreTransaction(t, config);
      results[i] = s;
      s.hits.forEach((id) => { ruleStats[id].hits++; if (t.isFraud) ruleStats[id].fraudHits++; });
      if (t.isFraud) { m.fraud++; m.fraudAmt += t.amount; } else { m.good++; m.goodAmt += t.amount; }
      if (s.decision === 'block') {
        m.blocked++;
        if (t.isFraud) { m.blockedFraud++; m.blockedFraudAmt += t.amount; } else { m.blockedGood++; m.blockedGoodAmt += t.amount; }
      } else if (s.decision === 'review') {
        m.reviewed++;
        if (t.isFraud) { m.reviewedFraud++; m.reviewedFraudAmt += t.amount; } else { m.reviewedGood++; m.reviewedGoodAmt += t.amount; }
      } else {
        m.allowed++;
        if (t.isFraud) { m.allowedFraud++; m.allowedFraudAmt += t.amount; }
      }
    }

    const miss = 1 - c.reviewCatchRate;
    m.fraudCaught = m.blockedFraud + m.reviewedFraud * c.reviewCatchRate;
    m.fraudCaughtAmt = m.blockedFraudAmt + m.reviewedFraudAmt * c.reviewCatchRate;
    m.fraudMissed = m.fraud - m.fraudCaught;
    m.recall = m.fraud ? m.fraudCaught / m.fraud : 0;
    m.recallAmt = m.fraudAmt ? m.fraudCaughtAmt / m.fraudAmt : 0;
    m.fraudLoss = m.allowedFraudAmt + m.reviewedFraudAmt * miss + c.chargebackFee * (m.allowedFraud + m.reviewedFraud * miss);

    m.goodLost = m.blockedGood + m.reviewedGood * c.reviewAbandonRate;           // customers turned away
    m.goodLostAmt = m.blockedGoodAmt + m.reviewedGoodAmt * c.reviewAbandonRate;  // good sales lost
    m.falseDeclineRate = m.good ? m.blockedGood / m.good : 0;
    m.frictionRate = m.good ? (m.blockedGood + m.reviewedGood) / m.good : 0;
    m.falseDeclineCost = m.goodLostAmt * c.falseDeclineCost;
    m.reviewOpsCost = m.reviewed * c.reviewCost;
    m.totalCost = m.fraudLoss + m.falseDeclineCost + m.reviewOpsCost;

    m.blockPrecision = m.blocked ? m.blockedFraud / m.blocked : 0;
    m.goodPerFraudBlocked = m.blockedFraud ? m.blockedGood / m.blockedFraud : m.blockedGood;
    m.approvalRate = m.total ? (m.allowed + m.reviewedGood * (1 - c.reviewAbandonRate)) / m.total : 0;

    const baseRate = m.fraud / m.total;
    m.rules = RULES.map((r) => {
      const st = ruleStats[r.id];
      const precision = st.hits ? st.fraudHits / st.hits : 0;
      return {
        id: r.id, name: r.name, on: !!(config.rules[r.id] && config.rules[r.id].on),
        hits: st.hits, fraudHits: st.fraudHits, goodHits: st.hits - st.fraudHits,
        precision, lift: baseRate ? precision / baseRate : 0,
        coverage: m.fraud ? st.fraudHits / m.fraud : 0,
      };
    });

    // Fraud caught by typology
    m.byType = {};
    Object.keys(FRAUD_TYPES).forEach((k) => { m.byType[k] = { total: 0, caught: 0 }; });
    txns.forEach((t, i) => {
      if (!t.isFraud) return;
      const b = m.byType[t.fraudType];
      b.total++;
      const d = results[i].decision;
      b.caught += d === 'block' ? 1 : d === 'review' ? c.reviewCatchRate : 0;
    });

    return { metrics: m, results };
  }

  // Sweep the block threshold to draw the fraud-caught vs good-blocked trade-off curve.
  function tradeoffCurve(txns, config) {
    const scores = txns.map((t) => scoreTransaction(t, config).score);
    let fraud = 0, good = 0;
    txns.forEach((t) => (t.isFraud ? fraud++ : good++));
    const maxScore = Math.max(1, ...scores);
    const points = [];
    for (let th = maxScore + 1; th >= 1; th--) {
      let tp = 0, fp = 0;
      for (let i = 0; i < txns.length; i++) {
        if (scores[i] >= th) { if (txns[i].isFraud) tp++; else fp++; }
      }
      points.push({ threshold: th, recall: tp / fraud, fpr: fp / good });
    }
    return points;
  }

  function cloneConfig(config) {
    return JSON.parse(JSON.stringify(config));
  }

  const api = {
    generateDataset, evaluate, scoreTransaction, tradeoffCurve, cloneConfig,
    RULES, PRESETS, CATEGORIES, FRAUD_TYPES, DEFAULT_COSTS, DEFAULT_DATA_OPTIONS,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FraudEngine = api;
})(typeof window !== 'undefined' ? window : this);
