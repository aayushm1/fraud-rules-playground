// Regenerates the before/after numbers quoted in README.md.
// Usage: node scripts/report.js
const E = require('../assets/engine.js');

const txns = E.generateDataset();
const inr = (v) => '₹' + Math.round(v).toLocaleString('en-IN');
const pct = (v) => (v * 100).toFixed(1) + '%';

const rows = [
  ['Fraud caught (count)', (m) => pct(m.recall)],
  ['Fraud caught (₹ value)', (m) => pct(m.recallAmt)],
  ['Fraud losses', (m) => inr(m.fraudLoss)],
  ['Good customers blocked', (m) => String(m.blockedGood)],
  ['False-decline rate', (m) => pct(m.falseDeclineRate)],
  ['Good customers blocked per fraud stopped', (m) => m.goodPerFraudBlocked.toFixed(1)],
  ['Manual review queue', (m) => String(m.reviewed)],
  ['Approval rate', (m) => pct(m.approvalRate)],
  ['Total cost of fraud', (m) => inr(m.totalCost)],
];

const results = {};
Object.entries(E.PRESETS).forEach(([k, p]) => { results[k] = E.evaluate(txns, p.config).metrics; });

const base = results.legacy;
console.log(`Dataset: ${base.total} txns, ${base.fraud} fraud (${pct(base.fraud / base.total)}), fraud value ${inr(base.fraudAmt)}\n`);
console.log(['Metric', ...Object.values(E.PRESETS).map((p) => p.label)].join(' | '));
rows.forEach(([label, fn]) => console.log([label, ...Object.values(results).map(fn)].join(' | ')));

console.log('\nCatch rate by fraud type (legacy → tuned):');
Object.entries(E.FRAUD_TYPES).forEach(([k, f]) => {
  const a = results.legacy.byType[k], b = results.tuned.byType[k];
  console.log(`  ${f.label}: ${pct(a.caught / a.total)} → ${pct(b.caught / b.total)} (n=${a.total})`);
});

console.log(`\nAnnualised saving on this simulated book (×12 months): ${inr((base.totalCost - results.tuned.totalCost) * 12)}`);
