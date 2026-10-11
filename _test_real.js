// ── Test con dati reali shiftflow-preset-2026-05-18.json ─────────────────────
const fs = require('fs');
const preset = JSON.parse(fs.readFileSync('C:\\Users\\gaiad\\Downloads\\shiftflow-preset-2026-05-18.json', 'utf8'));

const employees      = preset.employees;
const reparti        = preset.reparti;
const turniConfig    = preset.turniConfig;
const lunchBreakStart = preset.lunchBreakStart;
const lunchBreakEnd   = preset.lunchBreakEnd;
const domenicaAperto  = preset.domenicaAperto;
const domenicaApertura = preset.domenicaApertura;

// ── Utils ────────────────────────────────────────────────────────────────────
const parseHour = t => { if (!t) return 0; const [h,m]=t.split(':').map(Number); return h+m/60; };
const shiftHours = t => {
  const sh=parseHour(t.start),eh=parseHour(t.end);
  const lsh=parseHour(lunchBreakStart),leh=parseHour(lunchBreakEnd);
  const raw=eh-sh;
  if (sh<lsh && eh>leh) return raw-(leh-lsh);
  return raw;
};
const addDays = (d,n) => { const r=new Date(d); r.setDate(r.getDate()+n); return r; };
const fmt = d => d.toISOString().slice(0,10);
const getMonday = d => { const date=new Date(d); const day=date.getDay(); date.setDate(date.getDate()-day+(day===0?-6:1)); date.setHours(0,0,0,0); return date; };
const addMinutes = (t,m) => { const [h,mm]=t.split(':').map(Number); const tot=h*60+mm+m; return `${String(Math.floor(tot/60)).padStart(2,'0')}:${String(tot%60).padStart(2,'0')}`; };
const empReparti = emp => Array.isArray(emp.reparti)?emp.reparti.filter(Boolean):[];
const isAbsence = type => ['malattia','ferie','permesso'].includes(type);
const DAY = ['Dom','Lun','Mar','Mer','Gio','Ven','Sab'];
const isManualLocked = (empId,dk,sched) => { const ex=(sched[empId]||{})[dk]; return !!(ex&&(ex.manual||isAbsence(ex.type))); };

// ── Core schedule generator (copia fedele del browser) ───────────────────────
function runSchedule(weekStartDate, employees, reparti, initialSchedule={}) {
  const schedule = {};
  employees.forEach(e => { schedule[e.id] = JSON.parse(JSON.stringify(initialSchedule[e.id]||{})); });
  const dates = Array.from({length:7},(_,i)=>addDays(weekStartDate,i));
  const weekNum = Math.floor(new Date(weekStartDate).getTime()/(7*24*3600*1000));

  const isManualLocked = (empId,dk) => { const ex=(schedule[empId]||{})[dk]; return !!(ex&&(ex.manual||isAbsence(ex.type))); };
  const needsCoverage  = d => d.getDay()!==0||domenicaAperto;
  const empNeedsWork   = (emp,d) => {
    if (!needsCoverage(d)) return false;
    if (d.getDay()===0) {
      const depts=empReparti(emp);
      if (depts.length>0 && depts.every(rId=>{const r=reparti.find(r2=>r2.id===rId);return r&&r.chiusoDomenica;})) return false;
    }
    return true;
  };

  employees.forEach(emp => { dates.forEach(d=>{ const dk=fmt(d); if(!isManualLocked(emp.id,dk)) delete schedule[emp.id][dk]; }); });

  const avgShiftH = shiftHours(turniConfig[0]);
  const halfConfCalc = turniConfig.find(t=>t.id==='mattina')||turniConfig.find(t=>t.id==='pomeriggio');
  const halfDayH = halfConfCalc ? shiftHours(halfConfCalc) : avgShiftH/2;
  const hasHalf = !!(turniConfig.find(t=>t.id==='mattina')||turniConfig.find(t=>t.id==='pomeriggio'));

  // PHASE 1
  const planWork={};
  employees.forEach(emp => { planWork[emp.id]={}; dates.forEach(d=>{ planWork[emp.id][fmt(d)]=empNeedsWork(emp,d)&&!isManualLocked(emp.id,fmt(d)); }); });

  const workerCount={};
  reparti.forEach(rep => { workerCount[rep.id]={}; dates.forEach(d=>{ const dk=fmt(d); workerCount[rep.id][dk]=employees.filter(emp=>empReparti(emp).includes(rep.id)&&planWork[emp.id][dk]).length; }); });

  const restDaysNeeded={};
  employees.forEach(emp => {
    const avail=dates.filter(d=>empNeedsWork(emp,d)&&!isManualLocked(emp.id,fmt(d))).length;
    if (!avail) { restDaysNeeded[emp.id]=0; return; }
    let wdt;
    if (hasHalf) { const fdn=Math.ceil(Math.max(0,emp.ore-halfDayH)/avgShiftH); wdt=Math.min(avail,fdn+1); }
    else wdt=Math.min(avail,Math.ceil(emp.ore/avgShiftH));
    restDaysNeeded[emp.id]=Math.max(0,avail-wdt);
  });

  const sortedEmps=[...employees].sort((a,b)=>restDaysNeeded[b.id]-restDaysNeeded[a.id]);
  sortedEmps.forEach((emp,empOrder) => {
    const depts=empReparti(emp); let restLeft=restDaysNeeded[emp.id]; if(restLeft<=0)return;
    const canRest=dk=>{
      if(!planWork[emp.id][dk]||isManualLocked(emp.id,dk))return false;
      if(!depts.length)return true;
      return depts.every(rId=>{const rep=reparti.find(r=>r.id===rId);if(!rep)return true;return(workerCount[rId][dk]??0)-1>=rep.minCopertura;});
    };
    const cands=dates.filter(d=>canRest(fmt(d))).map(d=>{
      const dk=fmt(d);
      const slack=depts.length?Math.min(...depts.map(rId=>{const rep=reparti.find(r=>r.id===rId);return rep?(workerCount[rId][dk]??0)-rep.minCopertura:99;})):99;
      const maxEx=depts.length?Math.max(...depts.map(rId=>{const rep=reparti.find(r=>r.id===rId);return rep?.maxCopertura?Math.max(0,(workerCount[rId][dk]??0)-rep.maxCopertura):0;})):0;
      return{d,dk,slack,maxEx};
    }).sort((a,b)=>{
      if(b.maxEx!==a.maxEx)return b.maxEx-a.maxEx;
      if(b.slack!==a.slack)return b.slack-a.slack;
      const p=((empOrder+weekNum)%5)+1; return Math.abs(a.d.getDay()-p)-Math.abs(b.d.getDay()-p);
    });
    for(let i=0;i<cands.length&&restLeft>0;i++){const{dk}=cands[i];planWork[emp.id][dk]=false;depts.forEach(rId=>{if(workerCount[rId]?.[dk]!==undefined)workerCount[rId][dk]--;});restLeft--;}
    if(restLeft>0){
      const fb=dates.filter(d=>empNeedsWork(emp,d)&&!isManualLocked(emp.id,fmt(d))&&planWork[emp.id][fmt(d)]).sort((a,b)=>{const p=((empOrder+weekNum)%6)+1;return Math.abs(a.getDay()-p)-Math.abs(b.getDay()-p);});
      for(let i=0;i<fb.length&&restLeft>0;i++){const dk=fmt(fb[i]);planWork[emp.id][dk]=false;depts.forEach(rId=>{if(workerCount[rId]?.[dk]!==undefined)workerCount[rId][dk]--;});restLeft--;}
    }
  });

  // PHASE 1.5 — runs BEFORE Phase 2 so half-day info is available when assigning depts
  const halfDayDate={},halfDayConf={};
  const mattinaConf=turniConfig.find(t=>t.id==='mattina');
  const pomeriggioConf=turniConfig.find(t=>t.id==='pomeriggio');
  if(mattinaConf||pomeriggioConf){
    const pickType=(emp,depts,dk)=>{
      if(!mattinaConf)return pomeriggioConf;if(!pomeriggioConf)return mattinaConf;
      let mC=0,pC=0;
      employees.forEach(e=>{if(e.id===emp.id||halfDayDate[e.id]!==dk)return;const eD=empReparti(e);if(!depts.some(d2=>eD.includes(d2)))return;if(halfDayConf[e.id]?.id==='mattina')mC++;else pC++;});
      return mC<=pC?mattinaConf:pomeriggioConf;
    };
    employees.forEach(emp=>{
      const depts=empReparti(emp);
      const allCS=depts.length>0&&depts.every(rId=>{const r=reparti.find(rep=>rep.id===rId);return r&&r.chiusoDomenica;});
      if(allCS){const sat=dates.find(d=>d.getDay()===6);if(sat&&planWork[emp.id][fmt(sat)]&&!isManualLocked(emp.id,fmt(sat))){halfDayDate[emp.id]=fmt(sat);halfDayConf[emp.id]=pickType(emp,depts,fmt(sat));}}
      else{
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

  // PHASE 2 — half-day employees placed in dept for display but don't count toward max/stillNeeded
  const dayAssignment={};
  dates.forEach(d=>{dayAssignment[fmt(d)]={};});
  const assignedCnt={};
  reparti.forEach(rep=>{assignedCnt[rep.id]={};dates.forEach(d=>{assignedCnt[rep.id][fmt(d)]=0;});});
  dates.forEach(d=>{
    if(!needsCoverage(d))return;
    const dk=fmt(d); const workingEmps=employees.filter(emp=>planWork[emp.id][dk]);
    // Step A: single-reparto — assign but exclude half-day from count
    workingEmps.forEach(emp=>{
      const depts=empReparti(emp);
      if(depts.length===1){
        dayAssignment[dk][emp.id]=depts[0];
        if(assignedCnt[depts[0]]&&halfDayDate[emp.id]!==dk)assignedCnt[depts[0]][dk]++;
      }
    });
    // Step B: stillNeeded excludes half-day workers
    const stillNeeded={};
    reparti.forEach(rep=>{
      if(d.getDay()===0&&rep.chiusoDomenica){stillNeeded[rep.id]=0;return;}
      const aa=workingEmps.filter(emp=>dayAssignment[dk][emp.id]===rep.id&&halfDayDate[emp.id]!==dk).length;
      stillNeeded[rep.id]=Math.max(0,rep.minCopertura-aa);
    });
    const isClosedToday=rId=>{const r=reparti.find(x=>x.id===rId);return !!(d.getDay()===0&&r?.chiusoDomenica);};
    // Step C: multi-reparto, prefer urgent/headroom dept
    const multi=workingEmps.filter(emp=>empReparti(emp).length>1&&!dayAssignment[dk][emp.id]).sort((a,b)=>empReparti(a).length-empReparti(b).length);
    multi.forEach(emp=>{
      const depts=empReparti(emp);
      const openD=depts.filter(rId=>!isClosedToday(rId));
      const baseD=openD.length?openD:depts;
      const eligD=baseD.filter(rId=>{const r=reparti.find(x=>x.id===rId);return!(r?.maxCopertura!=null&&(assignedCnt[rId]?.[dk]||0)>=r.maxCopertura);});
      const pool=eligD.length?eligD:baseD;
      const sorted=pool.slice().sort((a,b)=>{
        const avA=workingEmps.filter(e=>empReparti(e).includes(a)).length,avB=workingEmps.filter(e=>empReparti(e).includes(b)).length;
        const uA=(stillNeeded[a]||0)/(avA+0.01),uB=(stillNeeded[b]||0)/(avB+0.01);
        if(uB!==uA)return uB-uA;
        const repA=reparti.find(r=>r.id===a),repB=reparti.find(r=>r.id===b);
        if(uA>0){
          const capA=repA?.maxCopertura??9999,capB=repB?.maxCopertura??9999;
          if(capA!==capB)return capA-capB;
        }else{
          const hrA=repA?.maxCopertura!=null?repA.maxCopertura-(assignedCnt[a]?.[dk]||0):999;
          const hrB=repB?.maxCopertura!=null?repB.maxCopertura-(assignedCnt[b]?.[dk]||0):999;
          if(hrA!==hrB)return hrB-hrA;
        }
        return depts.indexOf(a)-depts.indexOf(b);
      });
      const chosen=sorted[0]; dayAssignment[dk][emp.id]=chosen;
      if(assignedCnt[chosen])assignedCnt[chosen][dk]++;
      if(stillNeeded[chosen]>0)stillNeeded[chosen]--;
    });
    // Step D: fallback
    workingEmps.forEach(emp=>{
      if(!dayAssignment[dk][emp.id]){
        const depts=empReparti(emp);
        const openD=depts.filter(rId=>!isClosedToday(rId));
        const base=openD.length?openD:depts;
        const chosen=base.find(rId=>{const r=reparti.find(x=>x.id===rId);return!(r?.maxCopertura!=null&&(assignedCnt[rId]?.[dk]||0)>=r.maxCopertura);})||base[0]||depts[0]||'';
        dayAssignment[dk][emp.id]=chosen;
        if(chosen&&assignedCnt[chosen])assignedCnt[chosen][dk]++;
      }
    });
  });

  // PHASE 2.5
  const turno=turniConfig[0];
  const baseStart=turno.start,baseEnd=turno.end;
  const MIN_SHIFT_H=5.5;
  const startOffs=[0,30,60,90],endOffs=[-60,-30,0];
  const morningEnd=addMinutes(lunchBreakStart,-30);

  const empFullDayList={};
  employees.forEach(emp=>{empFullDayList[emp.id]=dates.filter(d=>empNeedsWork(emp,d)&&planWork[emp.id][fmt(d)]&&halfDayDate[emp.id]!==fmt(d)&&!isManualLocked(emp.id,fmt(d))).map(d=>fmt(d));});

  const targetDayH={};
  employees.forEach(emp=>{const hH=halfDayConf[emp.id]?shiftHours(halfDayConf[emp.id]):0;const n=empFullDayList[emp.id].length;targetDayH[emp.id]=n>0?(emp.ore-hH)/n:shiftHours(turno);});

  const shiftVariant={};
  const cumulH={};
  employees.forEach(emp=>{cumulH[emp.id]=0;});

  dates.forEach(d=>{
    if(!needsCoverage(d))return;
    const dk=fmt(d);shiftVariant[dk]={};
    const dayBaseSt=d.getDay()===0?domenicaApertura:baseStart;
    employees.forEach(emp=>{
      if(!empFullDayList[emp.id].includes(dk))return;
      const remaining=empFullDayList[emp.id].filter(dk2=>dk2>=dk).length;
      const hH=halfDayConf[emp.id]?shiftHours(halfDayConf[emp.id]):0;
      const hoursLeft=Math.max(0,emp.ore-hH-cumulH[emp.id]);
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
      for(const s of validSt)for(const e of validEn){const h=shiftHours({start:s,end:e});if(h<minH)continue;if(isLastDay&&h>hoursLeft+0.01)continue;const diff=Math.abs(h-todayTgt);if(diff<bestDiff||(diff===bestDiff&&h<(best?.hours??Infinity))){bestDiff=diff;best={start:s,end:e,hours:h};}}
      if(!best&&isLastDay){const ms=startOffs.map(o=>addMinutes(dayBaseSt,o));for(const s of ms){const h=shiftHours({start:s,end:morningEnd});if(h<1.5||h>hoursLeft+0.01)continue;if(!best||h>best.hours)best={start:s,end:morningEnd,hours:h};}}
      if(!best){for(const s of validSt)for(const e of validEn){const h=shiftHours({start:s,end:e});if(h<minH)continue;if(!best||h<best.hours)best={start:s,end:e,hours:h};}}
      if(!best)best={start:dayBaseSt,end:baseEnd,hours:shiftHours(turno)};
      shiftVariant[dk][emp.id]=best;cumulH[emp.id]+=best.hours;
    });
  });

  // Write schedule
  employees.forEach(emp=>{
    dates.forEach(d=>{
      const dk=fmt(d);if(isManualLocked(emp.id,dk))return;
      if(!planWork[emp.id][dk]){schedule[emp.id][dk]={type:'riposo',label:'Riposo',start:null,end:null};}
      else if(halfDayDate[emp.id]===dk){
        const hc=halfDayConf[emp.id];if(!hc)return;
        const hStart=d.getDay()===0&&hc.id==='mattina'?domenicaApertura:hc.start;
        schedule[emp.id][dk]={type:hc.id,label:hc.label,start:hStart,end:hc.end,reparto:dayAssignment[dk]?.[emp.id]||null};
      }else if(needsCoverage(d)){
        const sv=shiftVariant[dk]?.[emp.id]||{start:baseStart,end:baseEnd};
        schedule[emp.id][dk]={type:turno.id,label:turno.label,start:sv.start,end:sv.end,reparto:dayAssignment[dk]?.[emp.id]||null};
      }
    });
  });

  // PHASE 3c: hour completion
  const calcH=empId=>{let t=0;dates.forEach(d=>{const s=(schedule[empId]||{})[fmt(d)];if(s&&!['riposo','malattia','ferie','permesso'].includes(s.type))t+=shiftHours(s);});return Math.round(t*10)/10;};
  employees.forEach(emp=>{
    let sf=Math.round((emp.ore-calcH(emp.id))*10)/10;if(sf<0.25)return;
    const ext=dates.slice().reverse().filter(d=>{const s=(schedule[emp.id]||{})[fmt(d)];return s&&!['riposo','malattia','ferie','permesso','mattina','pomeriggio'].includes(s.type)&&s.end;});
    for(const d of ext){if(sf<0.25)break;const dk=fmt(d);const s=schedule[emp.id][dk];while(sf>=0.25){const ne=addMinutes(s.end,30);if(parseHour(ne)>21)break;s.end=ne;sf=Math.round((emp.ore-calcH(emp.id))*10)/10;}}
  });

  return {schedule,planWork,halfDayDate,halfDayConf,workerCount,restDaysNeeded,dayAssignment,calcH};
}

// ═══════════════════════════════════════════════════════════════════════════════
// ESEGUI TUTTE LE SETTIMANE CON DATI NEL PRESET
// ═══════════════════════════════════════════════════════════════════════════════
const WEEKS = ['2026-05-11','2026-05-17','2026-05-24'].map(d=>getMonday(new Date(d)));

const BUGS = [];
const WARNS = [];

console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║  ShiftFlow — TEST CON DATI REALI                            ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

// ── ANALISI STATICA DEI DATI ──────────────────────────────────────────────────
console.log('─── ANALISI CONFIGURAZIONE ─────────────────────────────────────');

// Bug 1: Dipendenti senza reparti
const noRep = employees.filter(e=>empReparti(e).length===0);
if(noRep.length){
  BUGS.push({sev:'⚠ WARN',code:'NO_REPARTO',msg:`${noRep.length} dipendente/i senza reparto: ${noRep.map(e=>e.nome).join(', ')}. Non vengono assegnati a nessun reparto e non contribuiscono alla copertura minima.`});
}

// Bug 2: Turno base
const avgH = shiftHours(turniConfig[0]);
const matH = turniConfig.find(t=>t.id==='mattina')?shiftHours(turniConfig.find(t=>t.id==='mattina')):null;
const pomH = turniConfig.find(t=>t.id==='pomeriggio')?shiftHours(turniConfig.find(t=>t.id==='pomeriggio')):null;
console.log(`  Turno pieno : ${turniConfig[0].start}-${turniConfig[0].end} = ${avgH}h`);
console.log(`  Mattina     : ${matH}h | Pomeriggio: ${pomH}h`);
console.log(`  Pausa pranzo: ${lunchBreakStart}-${lunchBreakEnd} (${parseHour(lunchBreakEnd)-parseHour(lunchBreakStart)}h)`);
console.log(`  Domenica    : ${domenicaAperto?'APERTA ('+domenicaApertura+')':'CHIUSA'}`);

// Bug 3: reparti con chiusoDomenica ma domenicaAperto=true
reparti.forEach(rep=>{
  if(rep.chiusoDomenica && domenicaAperto){
    const empInRep=employees.filter(e=>empReparti(e).includes(rep.id)&&empReparti(e).length===1);
    if(empInRep.length) WARNS.push(`Reparto "${rep.nome}" chiuso domenica ma domenicaAperto=true. Dipendenti esclusi domenica: ${empInRep.map(e=>e.nome).join(', ')}`);
  }
});

// Bug 4: max < min
reparti.forEach(rep=>{
  if(rep.maxCopertura!==null&&rep.maxCopertura!==undefined&&rep.maxCopertura<rep.minCopertura)
    BUGS.push({sev:'🔴 BUG',code:'MAX_LESS_MIN',msg:`Reparto "${rep.nome}": max(${rep.maxCopertura}) < min(${rep.minCopertura}) — impossibile rispettare entrambi.`});
});

// Bug 5: reparti con nessun dipendente
reparti.forEach(rep=>{
  const cnt=employees.filter(e=>empReparti(e).includes(rep.id)).length;
  if(cnt<rep.minCopertura) BUGS.push({sev:'🔴 BUG',code:'UNDERSTAFFED',msg:`Reparto "${rep.nome}": ${cnt} dipendenti ma minCopertura=${rep.minCopertura}. Copertura impossibile.`});
});

console.log('');

// ── TEST SETTIMANE ────────────────────────────────────────────────────────────
WEEKS.forEach(weekStart=>{
  const dates=Array.from({length:7},(_,i)=>addDays(weekStart,i));
  const weekLabel=`${fmt(dates[0])} → ${fmt(dates[6])}`;

  console.log(`\n─── SETTIMANA ${weekLabel} ─────────────────────────`);

  const {schedule,planWork,halfDayDate,halfDayConf,workerCount,restDaysNeeded,dayAssignment,calcH}
    = runSchedule(weekStart, employees, reparti, preset.schedule);

  let weekOk=true;

  // Verifica ore per ogni dipendente
  employees.forEach(emp=>{
    const totalH=calcH(emp.id);
    const diff=Math.round((emp.ore-totalH)*10)/10;
    const absEntries=dates.filter(d=>isAbsence((schedule[emp.id]||{})[fmt(d)]?.type));
    const restCount=dates.filter(d=>(schedule[emp.id]||{})[fmt(d)]?.type==='riposo').length;
    const halfLabel=halfDayConf[emp.id]?.id||'—';
    const manualDays=dates.filter(d=>(schedule[emp.id]||{})[fmt(d)]?.manual).length;

    // Controlla se ci sono assenze manuali (non contano per monte ore)
    const hasManualAbsence=absEntries.length>0||manualDays>0;

    let status='✅';
    if(Math.abs(diff)>0.6&&!hasManualAbsence){status='❌';weekOk=false;BUGS.push({sev:'🔴 BUG',code:'HOURS_MISMATCH',msg:`[${weekLabel}] ${emp.nome}: contratto ${emp.ore}h, effettivo ${totalH}h (Δ ${diff>0?'+':''}${diff}h)`});}
    else if(Math.abs(diff)>0.6&&hasManualAbsence){status='⚠️';}

    const dayStr=dates.map(d=>{
      const dk=fmt(d);const s=(schedule[emp.id]||{})[dk];
      if(!s)return `${DAY[d.getDay()]}:?`;
      if(s.type==='riposo')return `${DAY[d.getDay()]}:RIP`;
      if(s.type==='malattia')return `${DAY[d.getDay()]}:MAL`;
      if(s.type==='ferie')return `${DAY[d.getDay()]}:FER`;
      if(s.type==='permesso')return `${DAY[d.getDay()]}:PER`;
      const h=shiftHours(s).toFixed(1);
      return `${DAY[d.getDay()]}:${s.start}-${s.end}(${h}h)${s.manual?'🔒':''}`;
    }).join(' ');

    console.log(`  ${status} ${emp.nome.padEnd(22)} | ${String(emp.ore).padStart(2)}h→${String(totalH).padStart(4)}h | Δ${(diff>=0?'+':'')+diff}h | riposi:${restCount} | mezza:${halfLabel}`);
    console.log(`     ${dayStr}`);
  });

  // Verifica copertura reparti (usa dayAssignment per conteggio reale, non workerCount che somma tutti i reparti)
  console.log(`\n  Copertura reparti:`);
  reparti.forEach(rep=>{
    const row=dates.map(d=>{
      if(!domenicaAperto&&d.getDay()===0)return null;
      if(rep.chiusoDomenica&&d.getDay()===0)return null;
      const dk=fmt(d);
      const n=employees.filter(e=>(dayAssignment[dk]||{})[e.id]===rep.id).length;
      let flag='';
      if(n<rep.minCopertura)flag='🔴';
      else if(rep.maxCopertura&&n>rep.maxCopertura)flag='⚠️';
      return `${DAY[d.getDay()]}:${n}${flag}`;
    }).filter(Boolean).join(' ');
    const maxStr=rep.maxCopertura?`/max${rep.maxCopertura}`:'';
    const empCount=employees.filter(e=>empReparti(e).includes(rep.id)).length;
    console.log(`    ${rep.nome.padEnd(12)} (min${rep.minCopertura}${maxStr}, ${empCount} emp) | ${row}`);

    // Controlla copertura insufficiente
    dates.forEach(d=>{
      if(!domenicaAperto&&d.getDay()===0)return;
      if(rep.chiusoDomenica&&d.getDay()===0)return;
      const dk=fmt(d);
      const n=employees.filter(e=>(dayAssignment[dk]||{})[e.id]===rep.id).length;
      if(n<rep.minCopertura) BUGS.push({sev:'🔴 BUG',code:'COVERAGE_GAP',msg:`[${weekLabel}] ${rep.nome} ${DAY[d.getDay()]}: ${n}/${rep.minCopertura} (copertura insufficiente)`});
    });
  });

  // Controlla dipendenti senza reparto assegnato un giorno lavorativo
  const noAssigned=[];
  dates.forEach(d=>{
    if(!domenicaAperto&&d.getDay()===0)return;
    const dk=fmt(d);
    employees.forEach(emp=>{
      const s=(schedule[emp.id]||{})[dk];
      if(!s||['riposo','malattia','ferie','permesso'].includes(s.type))return;
      if(!s.reparto&&empReparti(emp).length>0) noAssigned.push(`${emp.nome} il ${DAY[d.getDay()]}`);
    });
  });
  if(noAssigned.length) WARNS.push(`[${weekLabel}] Turno senza reparto assegnato: ${noAssigned.join(', ')}`);

  // Controlla duplicati mezzagiornata
  employees.forEach(emp=>{
    const hd=halfDayDate[emp.id];
    if(!hd)return;
    if(isManualLocked(emp.id,hd,schedule)){
      WARNS.push(`[${weekLabel}] ${emp.nome}: mezza giornata calcolata su ${hd} che è bloccata manualmente — possibile conflitto.`);
    }
  });

  if(weekOk) console.log(`\n  ✅ Settimana OK`);
  else console.log(`\n  ❌ Problemi rilevati (vedi report finale)`);
});

// ─── REPORT FINALE ───────────────────────────────────────────────────────────
console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║  REPORT BUG & SOLUZIONI                                     ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

if(!BUGS.length&&!WARNS.length){
  console.log('✅ Nessun bug rilevato con i dati reali.\n');
}

const allIssues=[...BUGS,...WARNS.map(m=>({sev:'⚠ WARN',code:'WARN',msg:m}))];
const byCode={};
allIssues.forEach(b=>{if(!byCode[b.code])byCode[b.code]=[];byCode[b.code].push(b);});

const SOLUTIONS={
  NO_REPARTO: `SOLUZIONE: Assegna almeno un reparto a ogni dipendente dal tab 🏪 Reparti.
     I manager senza reparto non possono contribuire alla copertura minima dei reparti.
     Se intenzionalmente non sono associati a nessun reparto, il generatore li pianifica
     comunque con orari corretti ma non li conta nel workerCount di nessun reparto.`,

  MAX_LESS_MIN: `SOLUZIONE: Correggi maxCopertura nel tab Reparti: deve essere ≥ minCopertura.
     Il generatore non può rispettare entrambi i vincoli contemporaneamente.`,

  UNDERSTAFFED: `SOLUZIONE: Aggiungi dipendenti al reparto o abbassa minCopertura.
     Con meno dipendenti del minimo non è possibile garantire la copertura.`,

  HOURS_MISMATCH: `SOLUZIONE: La Phase 3c estende l'ultimo turno fino alle 21:00.
     Se dopo 21:00 le ore non tornano ancora, il problema è strutturale:
     • Troppi giorni di ferie/malattia manuali che riducono i giorni lavorativi
     • Contratto ore non raggiungibile con i turni configurati
     Verifica contratto e disponibilità giorni lavorativi.`,

  COVERAGE_GAP: `SOLUZIONE: La Phase 3b (coverage repair) promuove a straordinario
     i dipendenti a riposo. Se la copertura è ancora insufficiente significa che
     non ci sono abbastanza dipendenti nel reparto. Aggiungi personale o abbassa minCopertura.`,

  WARN: `SOLUZIONE: Verificare manualmente — potrebbero non essere errori critici.`,
};

Object.entries(byCode).forEach(([code,items])=>{
  console.log(`${items[0].sev} [${code}] — ${items.length} occorrenza/e`);
  items.forEach(i=>console.log(`  → ${i.msg}`));
  if(SOLUTIONS[code]) console.log(`\n  ${SOLUTIONS[code]}\n`);
});

// Riepilogo varianti orarie
console.log('\n─── RIEPILOGO VARIANTI ORARIE DISPONIBILI ─────────────────────');
const startOffs=[0,30,60,90],endOffs=[-60,-30,0];
const baseStart=turniConfig[0].start,baseEnd=turniConfig[0].end;
const variants=[];
for(const so of startOffs)for(const eo of endOffs){
  const s=addMinutes(baseStart,so),e=addMinutes(baseEnd,eo);
  const h=shiftHours({start:s,end:e});
  if(h>=5.5)variants.push(`${s}-${e}=${h}h`);
}
console.log(`  ${variants.join(' | ')}`);
console.log(`  Mattina (mezza): ${turniConfig.find(t=>t.id==='mattina').start}-${turniConfig.find(t=>t.id==='mattina').end} = ${matH}h`);
console.log(`  Pomeriggio (mezza): ${turniConfig.find(t=>t.id==='pomeriggio').start}-${turniConfig.find(t=>t.id==='pomeriggio').end} = ${pomH}h`);

const maxH=Math.max(...variants.map(v=>parseFloat(v.split('=')[1])));
const minH=Math.min(...variants.map(v=>parseFloat(v.split('=')[1])));
console.log(`  Range: ${minH}h–${maxH}h per turno pieno`);

// Verifica raggiungibilità 40h
const avgHour=shiftHours(turniConfig[0]);
employees.filter(e=>e.ore>0).forEach(emp=>{
  const avail=domenicaAperto?7:6;
  const hH=matH||pomH||avgHour/2;
  const fdn=Math.ceil(Math.max(0,emp.ore-hH)/avgHour);
  const wdt=Math.min(avail,fdn+1);
  const fullDays=wdt-1;
  const tgt=(emp.ore-hH)/Math.max(1,fullDays);
  if(tgt>maxH+0.01||tgt<minH-0.01){
    BUGS.push({sev:'⚠ WARN',code:'TARGET_OUT_OF_RANGE',msg:`${emp.nome}: target/giorno=${tgt.toFixed(2)}h fuori range varianti [${minH}-${maxH}h]`});
    console.log(`  ⚠️  ${emp.nome}: target ${tgt.toFixed(2)}h/giorno — FUORI RANGE [${minH}-${maxH}h]`);
  }
});

console.log('\n══════════════════════════════════════════════════════════════\n');
