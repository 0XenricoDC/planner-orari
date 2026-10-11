// Harness Node per Turni-offline.html: esegue il motore REALE (Engine) sui dati __SEED__
// Uso: node _harness_offline.js [YYYY-MM-DD] [runs] [seed]
const fs = require('fs'), vm = require('vm');
const html = fs.readFileSync(__dirname + '/Turni-offline.html', 'utf8');
const seedJson = html.match(/window\.__SEED__=(\{.*\});\n/)[1];
const eng = html.slice(html.indexOf('/* ===== Motore turni ===== */'), html.indexOf("if (typeof module !== 'undefined') module.exports = Engine;"));
const sb = {}; vm.createContext(sb); vm.runInContext(eng + '\nthis.Engine = Engine;', sb);
const E = sb.Engine, D = JSON.parse(seedJson);
const arr = o => Object.entries(o || {}).map(([id, v]) => ({ id, ...v }));
const fixedFromDoc = f => f ? Array.from({ length: 7 }, (_, d) => (f[String(d)] || []).map(p => [p.s, p.e])) : null;
const week = process.argv[2] || '2026-10-12', RUNS = +(process.argv[3] || 4), seed0 = +(process.argv[4] || 1);
const history = {}; for (const [k, w] of Object.entries(D.weeks)) if (k !== week) history[k] = { plan: Object.fromEntries(Object.entries(w.plan).map(([id, ds]) => [id, Array.from({ length: 7 }, (_, d) => ds[String(d)] || [])])) };
const input = { employees: arr(D.employees).map(e => ({ ...e, fixed: fixedFromDoc(e.fixed) })), departments: arr(D.departments), settings: D.settings, requests: arr(D.requests).concat(JSON.parse(process.env.REQS || "[]")), weekStart: week, history };
const ctx = E.prepare(input);
const IT = 500000, CH = 25000; let best = null;
const t0 = Date.now();
for (let r = 0; r < RUNS; r++) {
  const s = E.createSolver(ctx, seed0 * 1000 + r * 7919 + 1);
  let left = IT, T = 300;
  while (left > 0) { const n = Math.min(CH, left); const T1 = 300 * Math.pow(0.3 / 300, (IT - left + n) / IT); s.run(n, T, T1); T = T1; left -= n; }
  const res = s.result(); if (!best || res.cost < best.cost) best = res;
}
const an = E.analyze(input, best.plan);
let off = 0;
for (const [id, st] of Object.entries(an.emp)) { const bad = Math.abs(st.H - st.hoursT) > 0.01 || st.D !== st.daysT; if (bad) off++; if (bad || process.env.V) console.log((bad ? '!! ' : '   ') + id.padEnd(12), `${st.H}/${st.hoursT}h`, `${st.D}/${st.daysT}gg`); }
const cov = an.issues.filter(i => i.kind === 'cov');
console.log(`week ${week} cost=${best.cost.toFixed(1)} fuori-ore/giorni=${off} gap-copertura=${cov.length} other=${an.issues.filter(i => !['cov','hours','days'].includes(i.kind)).map(i=>i.text).join('; ')} (${Date.now() - t0}ms)`);
if (process.env.C) cov.forEach(i => console.log('   ', i.text));
