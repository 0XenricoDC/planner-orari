// ── Test generateSchedule completo (Phase 1, 1.5, 2, 2.5) ───────────────────
// Verifica che ogni dipendente accumuli esattamente le ore contrattuali.

const lunchBreakStart = "13:00";
const lunchBreakEnd   = "15:00";
const domenicaAperto  = false;
const domenicaApertura = '10:00';

const repartiData = [
  { id: 'r1', nome: 'Cassa',     minCopertura: 1, maxCopertura: null, chiusoDomenica: false },
  { id: 'r2', nome: 'Reparto',   minCopertura: 2, maxCopertura: 3,   chiusoDomenica: false },
  { id: 'r3', nome: 'Magazzino', minCopertura: 1, maxCopertura: null, chiusoDomenica: false },
];

const employeesData = [
  { id: 'e1', nome: 'Alice',   ore: 40, ruolo: 'Addetto',   reparti: ['r1'],      colore: '#6c63ff' },
  { id: 'e2', nome: 'Bruno',   ore: 40, ruolo: 'Addetto',   reparti: ['r2'],      colore: '#ff6584' },
  { id: 'e3', nome: 'Carla',   ore: 40, ruolo: 'Addetto',   reparti: ['r2'],      colore: '#43e97b' },
  { id: 'e4', nome: 'Davide',  ore: 40, ruolo: 'Addetto',   reparti: ['r2'],      colore: '#ffb347' },
  { id: 'e5', nome: 'Elena',   ore: 40, ruolo: 'Addetto',   reparti: ['r3'],      colore: '#64d8ff' },
  { id: 'e6', nome: 'Franco',  ore: 24, ruolo: 'Part-time', reparti: ['r1','r2'], colore: '#f093fb' },
  { id: 'e7', nome: 'Giada',   ore: 32, ruolo: 'Part-time', reparti: ['r2','r3'], colore: '#a8edea' },
  { id: 'e8', nome: 'Hana',    ore: 40, ruolo: 'Addetto',   reparti: ['r1'],      colore: '#fab23f' },
];

const turniConfig = [
  { id: 'intera',     label: 'Giornata Intera', start: '09:30', end: '20:00' },
  { id: 'mattina',    label: 'Solo Mattina',    start: '09:30', end: '13:00' },
  { id: 'pomeriggio', label: 'Solo Pomeriggio', start: '15:30', end: '20:00' },
];

// ── Utils ────────────────────────────────────────────────────────────────────
function parseHour(t) { if (!t) return 0; const [h,m]=t.split(':').map(Number); return h+m/60; }
function shiftHours(t) {
  const sh=parseHour(t.start),eh=parseHour(t.end);
  const lsh=parseHour(lunchBreakStart),leh=parseHour(lunchBreakEnd);
  const raw=eh-sh;
  if (sh<lsh && eh>leh) return raw-(leh-lsh);
  return raw;
}
function addDays(d,n) { const r=new Date(d); r.setDate(r.getDate()+n); return r; }
function fmt(d) { return d.toISOString().slice(0,10); }
function getMonday(d) {
  const date=new Date(d); const day=date.getDay();
  date.setDate(date.getDate()-day+(day===0?-6:1)); date.setHours(0,0,0,0); return date;
}
function addMinutes(timeStr,mins) {
  const [h,m]=timeStr.split(':').map(Number); const total=h*60+m+mins;
  return `${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`;
}
function empReparti(emp) { return Array.isArray(emp.reparti)?emp.reparti.filter(Boolean):[]; }
function isAbsence(type) { return ['malattia','ferie','permesso'].includes(type); }

// ── generateSchedule (identico al browser, senza DOM) ───────────────────────
function runSchedule(weekStartDate, employees, reparti, initialSchedule = {}) {
  const schedule = {}; employees.forEach(e => { schedule[e.id] = JSON.parse(JSON.stringify(initialSchedule[e.id] || {})); });
  const dates = Array.from({length:7},(_,i)=>addDays(weekStartDate,i));
  const weekNum = Math.floor(new Date(weekStartDate).getTime()/(7*24*3600*1000));

  const isManualLocked = (empId,dk) => { const ex=(schedule[empId]||{})[dk]; return !!(ex&&(ex.manual||isAbsence(ex.type))); };
  const needsCoverage  = (d) => d.getDay()!==0||domenicaAperto;
  const empNeedsWork   = (emp,d) => {
    if (!needsCoverage(d)) return false;
    if (d.getDay()===0) {
      const depts=empReparti(emp);
      if (depts.length>0 && depts.every(rId=>{const r=reparti.find(r2=>r2.id===rId);return r&&r.chiusoDomenica;})) return false;
    }
    return true;
  };

  // ── PHASE 1 ──────────────────────────────────────────────────────────────
  const planWork={};
  employees.forEach(emp => { planWork[emp.id]={}; dates.forEach(d=>{ planWork[emp.id][fmt(d)]=empNeedsWork(emp,d)&&!isManualLocked(emp.id,fmt(d)); }); });

  const workerCount={};
  reparti.forEach(rep => { workerCount[rep.id]={}; dates.forEach(d=>{ const dk=fmt(d); workerCount[rep.id][dk]=employees.filter(emp=>empReparti(emp).includes(rep.id)&&planWork[emp.id][dk]).length; }); });

  const avgShiftH = shiftHours(turniConfig[0]);
  const halfConfCalc = turniConfig.find(t=>t.id==='mattina')||turniConfig.find(t=>t.id==='pomeriggio');
  const halfDayH = halfConfCalc ? shiftHours(halfConfCalc) : avgShiftH/2;
  const hasHalfDayConfig = !!(turniConfig.find(t=>t.id==='mattina')||turniConfig.find(t=>t.id==='pomeriggio'));

  const restDaysNeeded={};
  employees.forEach(emp => {
    const avail=dates.filter(d=>empNeedsWork(emp,d)&&!isManualLocked(emp.id,fmt(d))).length;
    if (!avail) { restDaysNeeded[emp.id]=0; return; }
    let wdt;
    if (hasHalfDayConfig) { const fdn=Math.ceil(Math.max(0,emp.ore-halfDayH)/avgShiftH); wdt=Math.min(avail,fdn+1); }
    else wdt=Math.min(avail,Math.ceil(emp.ore/avgShiftH));
    restDaysNeeded[emp.id]=Math.max(0,avail-wdt);
  });

  const sortedEmps=[...employees].sort((a,b)=>restDaysNeeded[b.id]-restDaysNeeded[a.id]);
  sortedEmps.forEach((emp,empOrder) => {
    const depts=empReparti(emp); let restLeft=restDaysNeeded[emp.id]; if (restLeft<=0) return;
    const canRest=(dk)=>{
      if (!planWork[emp.id][dk]||isManualLocked(emp.id,dk)) return false;
      if (!depts.length) return true;
      return depts.every(rId=>{const rep=reparti.find(r=>r.id===rId);if(!rep)return true;return(workerCount[rId][dk]??0)-1>=rep.minCopertura;});
    };
    const candidates=dates.filter(d=>canRest(fmt(d))).map(d=>{
      const dk=fmt(d);
      const slack=depts.length?Math.min(...depts.map(rId=>{const rep=reparti.find(r=>r.id===rId);return rep?(workerCount[rId][dk]??0)-rep.minCopertura:99;})):99;
      const maxExcess=depts.length?Math.max(...depts.map(rId=>{const rep=reparti.find(r=>r.id===rId);return rep?.maxCopertura?Math.max(0,(workerCount[rId][dk]??0)-rep.maxCopertura):0;})):0;
      return {d,dk,slack,maxExcess};
    }).sort((a,b)=>{
      if (b.maxExcess!==a.maxExcess) return b.maxExcess-a.maxExcess;
      if (b.slack!==a.slack) return b.slack-a.slack;
      const p=((empOrder+weekNum)%5)+1; return Math.abs(a.d.getDay()-p)-Math.abs(b.d.getDay()-p);
    });
    for (let i=0;i<candidates.length&&restLeft>0;i++) { const{dk}=candidates[i]; planWork[emp.id][dk]=false; depts.forEach(rId=>{if(workerCount[rId]?.[dk]!==undefined)workerCount[rId][dk]--;}); restLeft--; }
    if (restLeft>0) {
      const fallback=dates.filter(d=>empNeedsWork(emp,d)&&!isManualLocked(emp.id,fmt(d))&&planWork[emp.id][fmt(d)]).sort((a,b)=>{const p=((empOrder+weekNum)%6)+1;return Math.abs(a.getDay()-p)-Math.abs(b.getDay()-p);});
      for (let i=0;i<fallback.length&&restLeft>0;i++){const dk=fmt(fallback[i]);planWork[emp.id][dk]=false;depts.forEach(rId=>{if(workerCount[rId]?.[dk]!==undefined)workerCount[rId][dk]--;});restLeft--;}
    }
  });

  // ── PHASE 2 (dept assignment) ─────────────────────────────────────────────
  const dayAssignment={};
  dates.forEach(d=>{dayAssignment[fmt(d)]={};});
  dates.forEach(d=>{
    if (!needsCoverage(d)) return;
    const dk=fmt(d); const workingEmps=employees.filter(emp=>planWork[emp.id][dk]);
    workingEmps.forEach(emp=>{const depts=empReparti(emp);if(depts.length===1)dayAssignment[dk][emp.id]=depts[0];});
    const stillNeeded={};
    reparti.forEach(rep=>{const aa=workingEmps.filter(emp=>dayAssignment[dk][emp.id]===rep.id).length;stillNeeded[rep.id]=Math.max(0,rep.minCopertura-aa);});
    const multiEmps=workingEmps.filter(emp=>empReparti(emp).length>1&&!dayAssignment[dk][emp.id]).sort((a,b)=>empReparti(a).length-empReparti(b).length);
    multiEmps.forEach(emp=>{
      const depts=empReparti(emp);
      const sorted=depts.slice().sort((a,b)=>{
        const avA=workingEmps.filter(e=>empReparti(e).includes(a)).length,avB=workingEmps.filter(e=>empReparti(e).includes(b)).length;
        const urgA=(stillNeeded[a]||0)/(avA+0.01),urgB=(stillNeeded[b]||0)/(avB+0.01);
        if(urgB!==urgA)return urgB-urgA; return depts.indexOf(a)-depts.indexOf(b);
      });
      const chosen=sorted[0]; dayAssignment[dk][emp.id]=chosen; if(stillNeeded[chosen]>0)stillNeeded[chosen]--;
    });
    workingEmps.forEach(emp=>{if(!dayAssignment[dk][emp.id])dayAssignment[dk][emp.id]=empReparti(emp)[0]||'';});
  });

  // ── PHASE 1.5 (half-day) ──────────────────────────────────────────────────
  const halfDayDate={},halfDayConf={};
  const mattinaConf=turniConfig.find(t=>t.id==='mattina');
  const pomeriggioConf=turniConfig.find(t=>t.id==='pomeriggio');
  if (mattinaConf||pomeriggioConf) {
    const pickType=(emp,depts,dk)=>{
      if(!mattinaConf)return pomeriggioConf;if(!pomeriggioConf)return mattinaConf;
      let mC=0,pC=0;
      employees.forEach(e=>{if(e.id===emp.id||halfDayDate[e.id]!==dk)return;const eD=empReparti(e);if(!depts.some(d2=>eD.includes(d2)))return;if(halfDayConf[e.id]?.id==='mattina')mC++;else pC++;});
      return mC<=pC?mattinaConf:pomeriggioConf;
    };
    employees.forEach(emp=>{
      const depts=empReparti(emp);
      const allCS=depts.length>0&&depts.every(rId=>{const r=reparti.find(rep=>rep.id===rId);return r&&r.chiusoDomenica;});
      if (allCS) { const sat=dates.find(d=>d.getDay()===6);if(sat&&planWork[emp.id][fmt(sat)]&&!isManualLocked(emp.id,fmt(sat))){halfDayDate[emp.id]=fmt(sat);halfDayConf[emp.id]=pickType(emp,depts,fmt(sat));}}
      else {
        const cands=dates.filter(d=>planWork[emp.id][fmt(d)]&&!isManualLocked(emp.id,fmt(d))).map(d=>{
          const dk=fmt(d);
          const slack=depts.length?Math.min(...depts.map(rId=>{const rep=reparti.find(r=>r.id===rId);return rep?(workerCount[rId][dk]??0)-rep.minCopertura:99;})):99;
          const coHD=depts.reduce((s,rId)=>s+employees.filter(e=>e.id!==emp.id&&empReparti(e).includes(rId)&&halfDayDate[e.id]===dk).length,0);
          return{dk,slack,coHD};
        }).sort((a,b)=>a.coHD!==b.coHD?a.coHD-b.coHD:b.slack-a.slack);
        if(cands.length>0){halfDayDate[emp.id]=cands[0].dk;halfDayConf[emp.id]=pickType(emp,depts,cands[0].dk);}
      }
    });
  }

  // ── PHASE 2.5 (shift variant selection — hit exact hours) ─────────────────
  const turno=turniConfig[0];
  const baseStart=turno.start, baseEnd=turno.end;
  const MIN_SHIFT_H=5.5;
  const startOffs=[0,30,60,90], endOffs=[-60,-30,0];
  const morningEnd=addMinutes(lunchBreakStart,-30);
  const allVariants=[];
  for (const so of startOffs) for (const eo of endOffs) {
    const s=addMinutes(baseStart,so),e=addMinutes(baseEnd,eo);
    const h=shiftHours({start:s,end:e}); if(h>=MIN_SHIFT_H) allVariants.push({start:s,end:e,hours:h});
  }

  const empFullDayList={};
  employees.forEach(emp=>{ empFullDayList[emp.id]=dates.filter(d=>empNeedsWork(emp,d)&&planWork[emp.id][fmt(d)]&&halfDayDate[emp.id]!==fmt(d)&&!isManualLocked(emp.id,fmt(d))).map(d=>fmt(d)); });

  const targetDayH={};
  employees.forEach(emp=>{ const halfH2=halfDayConf[emp.id]?shiftHours(halfDayConf[emp.id]):0; const n=empFullDayList[emp.id].length; targetDayH[emp.id]=n>0?(emp.ore-halfH2)/n:(turno?shiftHours(turno):8); });

  const shiftVariant={};
  const cumulH={};
  employees.forEach(emp=>{cumulH[emp.id]=0;});

  dates.forEach(d=>{
    if(!needsCoverage(d))return;
    const dk=fmt(d); shiftVariant[dk]={};
    const dayBaseSt=d.getDay()===0?domenicaApertura:baseStart;
    employees.forEach(emp=>{
      if(!empFullDayList[emp.id].includes(dk))return;
      const remaining=empFullDayList[emp.id].filter(dk2=>dk2>=dk).length;
      const halfH2=halfDayConf[emp.id]?shiftHours(halfDayConf[emp.id]):0;
      const hoursLeft=Math.max(0,emp.ore-halfH2-cumulH[emp.id]);
      const todayTgt=remaining>0?hoursLeft/remaining:targetDayH[emp.id];
      const forceMorning=todayTgt<MIN_SHIFT_H;
      const minH=forceMorning?1.5:MIN_SHIFT_H;
      const isLastDay=remaining===1;
      const rId=dayAssignment[dk]?.[emp.id]||empReparti(emp)[0]||'';
      const isSoloDept=rId && employees.filter(e=>e.id!==emp.id&&empFullDayList[e.id].includes(dk)&&dayAssignment[dk]?.[e.id]===rId).length===0;
      const validSt=isSoloDept?[dayBaseSt]:startOffs.map(o=>addMinutes(dayBaseSt,o));
      const validEn=forceMorning?[morningEnd]
        :(isSoloDept&&(isLastDay||hoursLeft>=shiftHours(turno)))?[baseEnd]
        :(isLastDay||isSoloDept)?endOffs.map(o=>addMinutes(baseEnd,o))
        :[baseEnd];
      let best=null,bestDiff=Infinity;
      for (const s of validSt) for (const e of validEn) {
        const h=shiftHours({start:s,end:e}); if(h<minH)continue;
        if(isLastDay&&h>hoursLeft+0.01)continue;
        const diff=Math.abs(h-todayTgt);
        if(diff<bestDiff||(diff===bestDiff&&h<(best?.hours??Infinity))){bestDiff=diff;best={start:s,end:e,hours:h};}
      }
      if(!best&&isLastDay){
        const morStarts=startOffs.map(o=>addMinutes(dayBaseSt,o));
        for (const s of morStarts){const h=shiftHours({start:s,end:morningEnd});if(h<1.5||h>hoursLeft+0.01)continue;if(!best||h>best.hours)best={start:s,end:morningEnd,hours:h};}
      }
      if(!best){for(const s of validSt)for(const e of validEn){const h=shiftHours({start:s,end:e});if(h<minH)continue;if(!best||h<best.hours)best={start:s,end:e,hours:h};}}
      if(!best)best={start:dayBaseSt,end:baseEnd,hours:shiftHours(turno)};
      shiftVariant[dk][emp.id]=best; cumulH[emp.id]+=best.hours;
    });
  });

  // ── Scrivi schedule ────────────────────────────────────────────────────────
  employees.forEach(emp=>{
    dates.forEach(d=>{
      const dk=fmt(d); if(isManualLocked(emp.id,dk))return;
      if(!planWork[emp.id][dk]){
        schedule[emp.id][dk]={type:'riposo',label:'Riposo',start:'',end:''};
      } else if(halfDayDate[emp.id]===dk){
        const hc=halfDayConf[emp.id];
        const hStart=d.getDay()===0&&hc.id==='mattina'?domenicaApertura:hc.start;
        schedule[emp.id][dk]={type:hc.id,label:hc.label,start:hStart,end:hc.end,halfDay:true};
      } else if(needsCoverage(d)){
        const sv=shiftVariant[dk]?.[emp.id]||{start:baseStart,end:baseEnd};
        schedule[emp.id][dk]={type:turno.id,label:turno.label,start:sv.start,end:sv.end};
      }
    });
  });

  // ── PHASE 3c: completamento ore garantito ─────────────────────────────────
  const calcH = (empId) => {
    let t=0;
    dates.forEach(d=>{const s=(schedule[empId]||{})[fmt(d)];if(s&&!['riposo','malattia','ferie','permesso'].includes(s.type))t+=shiftHours(s);});
    return Math.round(t*10)/10;
  };
  employees.forEach(emp => {
    let shortfall = Math.round((emp.ore - calcH(emp.id))*10)/10;
    if (shortfall < 0.25) return;
    const extendable = dates.slice().reverse().filter(d=>{
      const dk=fmt(d); const s=(schedule[emp.id]||{})[dk];
      return s&&!['riposo','malattia','ferie','permesso','mattina','pomeriggio'].includes(s.type)&&s.end;
    });
    for (const d of extendable) {
      if (shortfall < 0.25) break;
      const dk=fmt(d); const s=schedule[emp.id][dk];
      while (shortfall >= 0.25) {
        const newEnd=addMinutes(s.end,30);
        if (parseHour(newEnd)>21) break;
        s.end=newEnd; shortfall=Math.round((emp.ore-calcH(emp.id))*10)/10;
      }
    }
  });

  return { schedule, dayAssignment, workerCount };
}

// ── Calcola ore effettive ────────────────────────────────────────────────────
function calcWeekHours(empId,schedule,dates){
  let t=0;
  dates.forEach(d=>{const s=(schedule[empId]||{})[fmt(d)];if(s&&!['riposo','malattia','ferie','permesso'].includes(s.type))t+=shiftHours(s);});
  return Math.round(t*10)/10;
}

// ── Scenario runner ──────────────────────────────────────────────────────────
const DAY = ['Dom','Lun','Mar','Mer','Gio','Ven','Sab'];

function runScenario(name, employees, reparti, options = {}) {
  const weekStartIso  = options.weekStartIso  || '2026-05-18';
  const initialSchedule = options.initialSchedule || {};
  const expectations  = options.expectations   || {};
  const expectAllAtContract  = expectations.expectAllAtContract  !== false; // default true
  const expectCoverageGaps   = expectations.expectCoverageGaps   != null ? expectations.expectCoverageGaps : null;
  const singleWorkerOpensRId = expectations.singleWorkerOpensRId || null;
  const dualWorkerRId        = expectations.dualWorkerRId        || null;

  const weekStart = getMonday(new Date(weekStartIso));
  const dates = Array.from({length:7}, (_, i) => addDays(weekStart, i));
  const dks = dates.map(d => fmt(d));

  console.log('\n══════════════════════════════════════════════════════════');
  console.log(`  SCENARIO: ${name}`);
  console.log('══════════════════════════════════════════════════════════\n');

  // Run the algorithm
  const { schedule, dayAssignment, workerCount } = runSchedule(weekStart, employees, reparti, initialSchedule);

  const halfDayInfo = {};  // collect for display (not returned by runSchedule)
  // We derive half-day info from schedule entries for display purposes
  employees.forEach(emp => {
    const halfDk = dks.find(dk => (schedule[emp.id]||{})[dk]?.halfDay);
    if (halfDk) {
      const s = schedule[emp.id][halfDk];
      halfDayInfo[emp.id] = { type: s.type, dk: halfDk };
    }
  });

  const failures = [];
  let totalChecked = 0;

  // ── Per-employee display ─────────────────────────────────────────────────
  employees.forEach(emp => {
    const totalH = calcWeekHours(emp.id, schedule, dates);
    const contract = emp.ore;
    const diff = Math.abs(totalH - contract);
    let empOk = true;

    if (expectAllAtContract) {
      totalChecked++;
      if (diff > 0.6) {
        empOk = false;
        failures.push(`${emp.nome}: expected ${contract}h ±0.6, got ${totalH}h (diff ${diff.toFixed(1)}h)`);
      }
    }

    const restCount = dks.filter(dk => (schedule[emp.id]||{})[dk]?.type === 'riposo').length;
    const hd = halfDayInfo[emp.id];
    const halfLabel = hd ? `${hd.type}(${hd.dk})` : 'nessuna';

    const dayStr = dates.map(d => {
      const dk = fmt(d); const s = (schedule[emp.id]||{})[dk];
      if (!s) return `${DAY[d.getDay()]}:?`;
      if (s.type === 'riposo') return `${DAY[d.getDay()]}:RIP`;
      if (s.type === 'mattina') return `${DAY[d.getDay()]}:MAT(${s.start}-${s.end})`;
      if (s.type === 'pomeriggio') return `${DAY[d.getDay()]}:POM(${s.start}-${s.end})`;
      return `${DAY[d.getDay()]}:${s.start}-${s.end}(${shiftHours(s).toFixed(1)}h)`;
    }).join('  ');

    const mark = expectAllAtContract ? (empOk ? '✅' : '❌') : '  ';
    console.log(`${mark} ${emp.nome.padEnd(8)} | contratto:${String(contract).padStart(3)}h | effettivo:${String(totalH).padStart(5)}h | diff:${diff.toFixed(1)}h | riposi:${restCount} | mezza:${halfLabel}`);
    console.log(`   ${dayStr}`);
  });

  // ── Coverage display ─────────────────────────────────────────────────────
  console.log('\n── Copertura per reparto/giorno (lavoratori pianificati) ──');
  reparti.forEach(rep => {
    const row = dates.map(d => {
      if (d.getDay() === 0 && !domenicaAperto) return `${DAY[d.getDay()]}:-`;
      const n = workerCount[rep.id][fmt(d)] ?? 0;
      const maxMark = rep.maxCopertura && n > rep.maxCopertura ? '⚠' : n === rep.maxCopertura ? '=' : '';
      return `${DAY[d.getDay()]}:${n}${maxMark}`;
    }).join('  ');
    const maxStr = rep.maxCopertura ? ` max:${rep.maxCopertura}` : '';
    console.log(`  ${rep.nome.padEnd(10)} | min:${rep.minCopertura}${maxStr} | ${row}`);
  });

  // ── Coverage-gap assertion ───────────────────────────────────────────────
  if (expectCoverageGaps !== null) {
    totalChecked++;
    let gapCount = 0;
    for (const rep of reparti) {
      for (const dk of dks) {
        const dayOfWeek = new Date(dk).getDay(); // 0 = Sunday
        if (rep.chiusoDomenica && dayOfWeek === 0) continue;
        let working = 0;
        for (const emp of employees) {
          if (dayAssignment[dk] && dayAssignment[dk][emp.id] === rep.id) working++;
        }
        if (working < rep.minCopertura) gapCount++;
      }
    }
    console.log(`\n── Coverage-gap check: found ${gapCount} gap(s), expected >= ${expectCoverageGaps} ──`);
    if (gapCount >= expectCoverageGaps) {
      console.log(`✅ Coverage gaps detected correctly (${gapCount} gap slot(s))`);
    } else {
      console.log(`❌ Coverage gap assertion FAILED: expected >= ${expectCoverageGaps} gap(s), got ${gapCount}`);
      failures.push(`Coverage gaps: expected >= ${expectCoverageGaps}, got ${gapCount}`);
    }
  }

  // ── Single-worker isSoloDept opener-lock assertion ───────────────────────
  // Note: assertion excludes each employee's last working day. On the last day,
  // Phase 2.5 may legitimately start later to avoid overshooting contract hours —
  // the isLastDay fallback uses morStarts (all offsets) to hit exact hours.
  // The isSoloDept lock (validSt = [dayBaseSt]) only guarantees the opener start
  // on non-last working days.
  if (singleWorkerOpensRId) {
    const dayBaseSt = '09:30'; // Mon-Sat default base start
    let openChecked = 0;
    for (const emp of employees) {
      if (!empReparti(emp).includes(singleWorkerOpensRId)) continue;
      // Build the ordered list of full working days in r1 for this employee
      const workingDksInR1 = dks.filter(dk => {
        const dayOfWeek = new Date(dk).getDay();
        if (dayOfWeek === 0) return false;
        const assigned = dayAssignment[dk] && dayAssignment[dk][emp.id] === singleWorkerOpensRId;
        const entry = (schedule[emp.id]||{})[dk];
        return assigned && entry && entry.type !== 'riposo' && !isAbsence(entry.type) && !entry.halfDay;
      });
      const lastWorkDk = workingDksInR1[workingDksInR1.length - 1];
      for (const dk of workingDksInR1) {
        if (dk === lastWorkDk) continue; // skip last day — hour-exact constraint overrides opener lock
        totalChecked++;
        openChecked++;
        const entry = (schedule[emp.id]||{})[dk];
        if (entry.start !== dayBaseSt) {
          failures.push(`isSoloDept opener-lock FAIL: ${emp.nome} on ${dk} starts ${entry.start}, expected ${dayBaseSt}`);
        }
      }
    }
    console.log(`\n── isSoloDept opener-lock check: verified ${openChecked} non-last working day(s) in reparto ${singleWorkerOpensRId} ──`);
    const opFails = failures.filter(f => f.includes('isSoloDept'));
    if (opFails.length === 0) {
      console.log(`✅ Lone worker starts at ${dayBaseSt} on every assigned non-last working day`);
    } else {
      opFails.forEach(f => console.log(`❌ ${f}`));
    }
  }

  // ── Dual-worker rotation assertion ──────────────────────────────────────
  if (dualWorkerRId) {
    const distinctStarts = new Set();
    let hasOpener = false;
    const dayBaseSt = '09:30';
    for (const emp of employees) {
      if (!empReparti(emp).includes(dualWorkerRId)) continue;
      for (const dk of dks) {
        const dayOfWeek = new Date(dk).getDay();
        if (dayOfWeek === 0) continue;
        const assigned = dayAssignment[dk] && dayAssignment[dk][emp.id] === dualWorkerRId;
        const entry = (schedule[emp.id]||{})[dk];
        if (!assigned || !entry || entry.type === 'riposo' || isAbsence(entry.type)) continue;
        distinctStarts.add(entry.start);
        if (entry.start === dayBaseSt) hasOpener = true;
      }
    }
    totalChecked += 2;
    console.log(`\n── Dual-worker rotation check: distinct start times in reparto ${dualWorkerRId}: [${[...distinctStarts].join(', ')}] ──`);
    if (distinctStarts.size >= 2) {
      console.log(`✅ Rotation observable: ${distinctStarts.size} distinct start time(s)`);
    } else {
      console.log(`❌ Rotation NOT observable: only ${distinctStarts.size} distinct start time(s) — expected >= 2`);
      failures.push(`Dual-worker rotation: expected >= 2 distinct starts in ${dualWorkerRId}, got ${distinctStarts.size} [${[...distinctStarts].join(', ')}]`);
    }
    if (hasOpener) {
      console.log(`✅ Opener present: at least one cell uses start ${dayBaseSt}`);
    } else {
      console.log(`❌ No opener found: no cell in ${dualWorkerRId} starts at ${dayBaseSt}`);
      failures.push(`Dual-worker opener: no cell in ${dualWorkerRId} has start ${dayBaseSt}`);
    }
  }

  // ── Scenario result ──────────────────────────────────────────────────────
  const pass = failures.length === 0;
  console.log('');
  if (pass) {
    console.log(`✅ SCENARIO PASS: "${name}"`);
  } else {
    console.log(`❌ SCENARIO FAIL: "${name}"`);
    failures.forEach(f => console.log(`   FAIL: ${f}`));
  }

  return { name, pass, totalChecked, failures };
}

// ── Esegui scenari ───────────────────────────────────────────────────────────
const scenarioResults = [];

scenarioResults.push(runScenario(
  'Default — 8 employees, 3 reparti, all hit contract hours',
  employeesData,
  repartiData
));

// EDGE-02/ALG-03 — Scenario 1: Single-worker department
scenarioResults.push(runScenario(
  'EDGE-02/ALG-03 — single-worker department (Cassa has only Alice, must open every day)',
  [
    { id: 'e1', nome: 'Alice', ore: 40, ruolo: 'Addetto', reparti: ['r1'], colore: '#6c63ff' },
    { id: 'e2', nome: 'Bruno', ore: 40, ruolo: 'Addetto', reparti: ['r2'], colore: '#ff6584' },
    { id: 'e3', nome: 'Carla', ore: 40, ruolo: 'Addetto', reparti: ['r2'], colore: '#43e97b' },
  ],
  [
    { id: 'r1', nome: 'Cassa',   minCopertura: 1, maxCopertura: null, chiusoDomenica: false },
    { id: 'r2', nome: 'Reparto', minCopertura: 2, maxCopertura: null, chiusoDomenica: false },
  ],
  { expectations: { expectAllAtContract: true, singleWorkerOpensRId: 'r1' } }
));

// ALG-03 — Scenario 2: Dual-worker department
scenarioResults.push(runScenario(
  'ALG-03 — dual-worker department (opener/closer rotation across Mon-Sat)',
  [
    { id: 'e1', nome: 'Alice',  ore: 40, ruolo: 'Addetto', reparti: ['r1'], colore: '#6c63ff' },
    { id: 'e2', nome: 'Bruno',  ore: 40, ruolo: 'Addetto', reparti: ['r1'], colore: '#ff6584' },
    { id: 'e3', nome: 'Carla',  ore: 40, ruolo: 'Addetto', reparti: ['r2'], colore: '#43e97b' },
    { id: 'e4', nome: 'Davide', ore: 40, ruolo: 'Addetto', reparti: ['r2'], colore: '#ffb347' },
  ],
  [
    { id: 'r1', nome: 'Cassa',   minCopertura: 1, maxCopertura: null, chiusoDomenica: false },
    { id: 'r2', nome: 'Reparto', minCopertura: 2, maxCopertura: null, chiusoDomenica: false },
  ],
  { expectations: { expectAllAtContract: true, dualWorkerRId: 'r1' } }
));

// EDGE-02 — Scenario 3: All-absent department day
const mondayDk = (() => {
  const ws = getMonday(new Date('2026-05-18'));
  return fmt(ws); // Monday key
})();

scenarioResults.push(runScenario(
  'EDGE-02 — all employees in Cassa manually absent on Monday (must complete + report gap)',
  [
    { id: 'e1', nome: 'Alice',  ore: 40, ruolo: 'Addetto', reparti: ['r1'], colore: '#6c63ff' },
    { id: 'e2', nome: 'Bruno',  ore: 40, ruolo: 'Addetto', reparti: ['r1'], colore: '#ff6584' },
    { id: 'e3', nome: 'Carla',  ore: 40, ruolo: 'Addetto', reparti: ['r2'], colore: '#43e97b' },
    { id: 'e4', nome: 'Davide', ore: 40, ruolo: 'Addetto', reparti: ['r2'], colore: '#ffb347' },
  ],
  [
    { id: 'r1', nome: 'Cassa',   minCopertura: 1, maxCopertura: null, chiusoDomenica: false },
    { id: 'r2', nome: 'Reparto', minCopertura: 2, maxCopertura: null, chiusoDomenica: false },
  ],
  {
    initialSchedule: {
      e1: { [mondayDk]: { type: 'ferie',    label: 'Ferie',    start: '', end: '', manual: true } },
      e2: { [mondayDk]: { type: 'malattia', label: 'Malattia', start: '', end: '', manual: true } },
    },
    expectations: {
      expectAllAtContract: false,  // Alice and Bruno will be short hours due to forced Monday absence
      expectCoverageGaps: 1,       // Monday Cassa: 0 workers vs minCopertura 1 → 1 gap
    }
  }
));

// ── Final summary ────────────────────────────────────────────────────────────
const totalRun    = scenarioResults.length;
const totalPassed = scenarioResults.filter(r => r.pass).length;
const totalFailed = totalRun - totalPassed;

console.log('\n══════════════════════════════════════════════════════════');
console.log(`  SUMMARY: ${totalRun} scenarios run, ${totalPassed} passed, ${totalFailed} failed`);
console.log('══════════════════════════════════════════════════════════\n');

process.exit(totalFailed === 0 ? 0 : 1);
