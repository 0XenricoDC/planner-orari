// Harness Node: esegue il codice REALE di shift-planner.html in un vm context
// con un DOM minimo stubbato. Uso: node _harness.js "<preset.json>" [YYYY-MM-DD]
const fs = require('fs');
const vm = require('vm');

const presetPath = process.argv[2] || 'Preset orari offi.json';
const weekStart  = process.argv[3] || '2026-09-14'; // lunedì

const html = fs.readFileSync('shift-planner.html', 'utf8');
const code = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)]
  .map(m => m[1]).join('\n');

// ── DOM stub ────────────────────────────────────────────────────────────────
const mkEl = (id) => ({
  id, value: '', checked: false, innerHTML: '', textContent: '', dataset: {},
  style: {}, classList: { add(){}, remove(){}, toggle(){}, contains(){return false} },
  appendChild(){}, removeChild(){}, remove(){}, addEventListener(){},
  querySelector(){ return null }, querySelectorAll(){ return [] },
  insertAdjacentHTML(){}, focus(){}, click(){}, setAttribute(){}, getAttribute(){return null},
  options: [], children: [], parentNode: null, offsetWidth: 0, scrollIntoView(){}
});
const els = {};
const document = {
  getElementById: (id) => (els[id] ||= mkEl(id)),
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: (t) => mkEl(t),
  addEventListener(){}, body: mkEl('body'),
};
const storage = {};
const sandbox = {
  document, console,
  window: { addEventListener(){}, matchMedia: () => ({ matches:false, addEventListener(){} }) },
  localStorage: {
    getItem: k => (k in storage ? storage[k] : null),
    setItem: (k,v) => { storage[k] = String(v) },
    removeItem: k => { delete storage[k] },
  },
  setTimeout: (fn) => { /* no-op: evita toast asincroni */ return 0 },
  clearTimeout(){}, setInterval(){ return 0 }, clearInterval(){},
  alert(){}, confirm: () => true, prompt: () => null,
  ExcelJS: {}, Date, Math, JSON, navigator: { userAgent: 'node' },
  requestAnimationFrame: (fn) => 0,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: 'shift-planner.html' });

// ── inietta il preset e neutralizza il rendering ────────────────────────────
const preset = JSON.parse(fs.readFileSync(presetPath, 'utf8'));
vm.runInContext(`
  renderEmpList = () => {};
  renderRepartiList = () => {};
  renderTurniConfig = () => {};
  populateRepartiChecklist = () => {};
  updateRemoveSelect = () => {};
  updateWeekLabel = () => {};
  saveData = () => {};
  showToast = (m) => { TOASTS.push(m); };
  var TOASTS = [];
  var P = PRESET;
  employees = P.employees;
  reparti = P.reparti;
  turniConfig = P.turniConfig;
  domenicaAperto = P.domenicaAperto;
  domenicaApertura = P.domenicaApertura;
  lunchBreakStart = P.lunchBreakStart;
  lunchBreakEnd = P.lunchBreakEnd;
  // turni salvati nel preset: generateSchedule tiene assenze/turni manuali e rigenera il resto
  schedule = P.schedule || {};
  currentWeekStart = new Date(WEEK + 'T00:00:00');
  generateSchedule();
`.replace('PRESET', JSON.stringify(preset)).replace('WEEK', JSON.stringify(weekStart)), sandbox);

// ── report ──────────────────────────────────────────────────────────────────
const out = vm.runInContext(`(() => {
  const dates = Array.from({length:7},(_,i)=>addDays(currentWeekStart,i));
  const rows = employees.map(emp => {
    let h=0, riposi=0, mezze=[], assenze=0;
    dates.forEach(d => {
      const s = (schedule[emp.id]||{})[fmt(d)];
      if (!s) { return; }
      if (s.type==='riposo') { riposi++; return; }
      if (isAbsence(s.type)) { assenze++; return; }
      h += shiftHours(s);
      if (s.type==='mattina' || s.type==='pomeriggio')
        mezze.push(dayName(d)+':'+s.type+'('+s.start+'-'+s.end+')'+(s.note==='Mezza giornata'?'*':''));
    });
    return { nome: emp.nome, ore: Math.round(h*10)/10, target: emp.ore, riposi, assenze, mezze };
  });
  // copertura per reparto/giorno (slot mattina/pomeriggio simultanei)
  const gaps = [];
  reparti.forEach(rep => dates.forEach(d => {
    const dow = d.getDay();
    if (dow===0 && !domenicaAperto) return;
    if (dow===0 && rep.chiusoDomenica) return;
    const c = repSlotCoverage(rep.id, fmt(d));
    if (c < rep.minCopertura) gaps.push(rep.nome+' '+dayName(d)+' ='+c+'/'+rep.minCopertura);
    const oc = repOpenClose(rep.id, fmt(d));
    if (rep.minCopertura && oc.holes.length) gaps.push(rep.nome+' '+dayName(d)+' VUOTO '+oc.holesTxt);
  }));
  const vhtml = buildValidationPanel(dates);
  const anomalie = vhtml.indexOf('Tutti i controlli OK') >= 0 ? 'tutti OK' : 'anomalie presenti';
  return JSON.stringify({ rows, gaps, toasts: TOASTS, VALID: anomalie }, null, 1);
})()`, sandbox);

const DUMPNAME = process.env.DUMP;
if (DUMPNAME) {
  const dmp = vm.runInContext(`(() => {
    const dates = Array.from({length:7},(_,i)=>addDays(currentWeekStart,i));
    const e = employees.find(x => x.nome.indexOf(DN) === 0);
    return JSON.stringify(dates.map(d => { const s=(schedule[e.id]||{})[fmt(d)]||{}; return dayName(d)+' '+(s.type||'-')+' '+(s.start||'')+'-'+(s.end||'')+(s.breakStart?(' brk'+s.breakStart+'-'+s.breakEnd):'')+(s.note?(' ['+s.note+']'):''); }));
  })()`.replace('DN', JSON.stringify(DUMPNAME)), sandbox);
  console.log('DUMP ' + DUMPNAME + ':', JSON.parse(dmp).join(' | '));
}
const r = JSON.parse(out);
let ot = 0, under = 0, nMatt = 0, nPom = 0;
console.log('PRESET:', presetPath, '| settimana:', weekStart);
for (const e of r.rows) {
  const flag = e.ore > e.target + 0.01 ? ' ⚠OT' : (e.ore < e.target - 0.01 ? ' ⚠UNDER' : '');
  ot += Math.max(0, e.ore - e.target); under += Math.max(0, e.target - e.ore);
  nMatt += e.mezze.filter(m => m.includes(':mattina')).length;
  nPom  += e.mezze.filter(m => m.includes(':pomeriggio')).length;
  console.log(` ${e.nome.padEnd(24)} ${String(e.ore).padStart(5)}h/${e.target}h rip=${e.riposi} ass=${e.assenze} ${e.mezze.join(' ')}${flag}`);
}
console.log('--- TOTALI: straordinari=' + Math.round(ot*10)/10 + 'h  mancanti=' + Math.round(under*10)/10 + 'h  mezze MATTINA=' + nMatt + '  mezze POMERIGGIO=' + nPom);
const marked = e => e.mezze.filter(m => m.endsWith('*')).length;
const multi = r.rows.filter(e => marked(e) !== 1).map(e => e.nome + '(' + marked(e) + ')');
console.log('--- Pannello verifica:', r.VALID, '| dipendenti senza esattamente 1 mezza giornata:', multi.join(', ') || 'nessuno');
console.log('--- GAP copertura (' + r.gaps.length + '):', r.gaps.join(' | ') || 'nessuno');
