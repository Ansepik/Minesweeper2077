/* ======================================================================
   CyberSweep Web — ИГРОВОЕ ЯДРО (переносимый модуль)
   Используется и в index.html, и в тестовом скрипте build_test.js
   ====================================================================== */

/* ---------- Детерминированный ГПСЧ (mulberry32 + string hash) ---------- */
function xmur3(str){let h=1779033703^str.length;for(let i=0;i<str.length;i++){h=Math.imul(h^str.charCodeAt(i),34328);h=(h^(h>>>13))|0;}return function(){h=Math.imul(h^(h>>>16),2246822507);h=Math.imul(h^(h>>>13),3266489909);return (h^=h>>>16)>>>0;};}
function mulberry32(a){return function(){a|=0;a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return ((t^(t>>>14))>>>0)/4294967296;};}
function makeRng(seedStr){const s=xmur3(String(seedStr));return mulberry32(s());}

/* ---------- Базовые утилиты поля ---------- */
function neighbors(w,h,x,y){
  const out=[];
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    if(!dx&&!dy)continue;
    const nx=x+dx,ny=y+dy;
    if(nx>=0&&nx<w&&ny>=0&&ny<h)out.push(ny*w+nx);
  }
  return out;
}
// Былые соседи (без выделения — только для генерации «ободка»)
function ringOf(w,h,cx,cy,radius){
  const cells=[];
  for(let y=cy-radius;y<=cy+radius;y++)for(let x=cx-radius;x<=cx+radius;x++){
    if(x<0||y<0||x>=w||y>=h)continue;
    const d=Math.max(Math.abs(x-cx),Math.abs(y-cy));
    if(d===radius)cells.push(y*w+x);
  }
  return cells;
}

/* ---------- Генерация детерминированного уровня (волновой метод) ----------
   Ключевая идея: поле заполняется КОНЦЕНТРИЧЕСКИМИ ВОЛНАМИ мины/безопасные.
   1. Безопасное стартовое ядро (клястер 2x2..3x3) — всегда открыто.
   2. Первый фронт волн — ободок r=2 вокруг ядра ⇒ первое открытие
      гарантированно даёт числа, а вся граница открытой области состоит
      из клеток с числами (инвариант И1).
   3. Далее чередование: волна мин → безопасный ров → волна мин...
      Плотность волны растёт от 0.40 (центр) до 0.75 (край поля), так
      что суммарная плотность совпадает с campaignConfig.
   4. Волны соединяются «перемычками» через рвы (по одной на каждый
      угол/сторону): они не ломают разрешимость, но устраняют
      глобальные симметрии карты, которые иначе делают часть клеток
      логически неразличимыми (амбивалентность).
   5. Счётчики мин вычисляются классически; точное число мин
      обеспечивается добром/подрезкой (детерминированно).
   6. Solvability-валидатор подтверждает решаемость без угадывания;
      при неудаче сдвигается salt (полностью детерминировано).
-------------------------------------------------------------------------- */
function genLevelRaw(level,w,h,mines,saltShift){
  const rng=makeRng('CSW::L'+level+'::S'+saltShift);
  const total=w*h;
  // Стартовое ядро: центр с шумом
  const cx=Math.floor(w/2-1+(rng()*3|0));
  const cy=Math.floor(h/2-1+(rng()*3|0));
  const core=[[cx,cy]];
  const coreDirs=[[1,0],[0,1],[1,1],[-1,0],[0,-1],[-1,-1],[1,-1],[-1,1]];
  const coreSize=total>150?3:2;
  for(const[dx,dy]of coreDirs){
    if(core.length>=coreSize)break;
    const nx=cx+dx,ny=cy+dy;
    if(nx>=0&&ny>=0&&nx<w&&ny<h)core.push([nx,ny]);
  }
  const isCore=(x,y)=>core.some(([a,b])=>a===x&&b===y);
  const mineSet=new Set();
  const maxR=Math.max(cx,w-1-cx,cy,h-1-cy);
  function ringCells(rr){
    const cells=[];
    for(let y=cy-rr;y<=cy+rr;y++)for(let x=cx-rr;x<=cx+rr;x++){
      if(x<0||y<0||x>=w||y>=h)continue;
      if(Math.max(Math.abs(x-cx),Math.abs(y-cy))!==rr)continue;
      if(isCore(x,y))continue;
      cells.push(y*w+x);
    }
    return cells;
  }
  function ringHasCore(rr){
    for(let y=cy-rr;y<=cy+rr;y++)for(let x=cx-rr;x<=cx+rr;x++){
      if(Math.max(Math.abs(x-cx),Math.abs(y-cy))!==rr)continue;
      if(isCore(x,y))return true;
    }
    return false;
  }
  let wave=true; // первый фронт r=2 — мины
  for(let r=2;r<=maxR;r++){
    const cells=ringCells(r);
    if(cells.length===0)continue;
    if(ringHasCore(r)){wave=false;} // ядро касается фронта — ров вместо мин
    if(wave){
      // Перемешивание (Fisher-Yates, детерминированное) и выбор части под мины
      for(let i=cells.length-1;i>0;i--){const j=rng()*(i+1)|0;[cells[i],cells[j]]=[cells[j],cells[i]];}
      const t=maxR>1?((r-2)/(maxR-2)):0;           // 0 у центра → 1 у края
      const density=0.40+t*0.35;                   // 0.40 … 0.75
      const take=Math.min(cells.length,Math.max(1,Math.round(cells.length*density)));
      for(let i=0;i<take;i++)mineSet.add(cells[i]);
      // Перемычки через предыдущий ров (снимают симметрию волн)
      if(r>2){
        const prev=ringCells(r-1);
        if(prev.length){
          const idx=[0,Math.floor(prev.length/4),Math.floor(prev.length/2),Math.floor(prev.length*3/4)];
          for(const ix of idx){
            if(rng()<0.8){const c=prev[ix];if(c!==undefined&&isCore(c%w,(c/w)|0)===false)mineSet.add(c);}
          }
        }
      }
    }
    wave=!wave;
  }
  // Добор / подрезка до точного числа мин (детерминированно)
  let allNonMine=[];
  for(let i=0;i<total;i++)if(!mineSet.has(i)&&!isCore(i%w,(i/w)|0))allNonMine.push(i);
  for(let i=allNonMine.length-1;i>0;i--){const j=rng()*(i+1)|0;[allNonMine[i],allNonMine[j]]=[allNonMine[j],allNonMine[i]];}
  while(mineSet.size<mines&&allNonMine.length){
    const cand=allNonMine.pop();
    if(cand===undefined)break;
    mineSet.add(cand);
  }
  while(mineSet.size>mines){const last=[...mineSet].pop();mineSet.delete(last);}
  if(mineSet.size!==mines)return null;
  const grid=new Array(total).fill(0);
  for(const m of mineSet)grid[m]=-1;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const id=y*w+x;
    if(grid[id]===-1)continue;
    let n=0;for(const nb of neighbors(w,h,x,y))if(grid[nb]===-1)n++;
    grid[id]=n;
  }
  const safe=core.map(([x,y])=>y*w+x);
  return {grid,safe,mineSet:[...mineSet]};
}

/* ---------- Solvability-валидатор (чистая логика, без угадываний) ----------
   Правила (по возрастанию силы):
   R1. Классика: rem==|cells| ⇒ все мины; rem==0 ⇒ все безопасны.
   R2. Подмножества: A⊆B (полный набор пар).
   R3. XORSUM по всем парам уравнений (симметрическая разница).
   R4. Полный CSP по КАЖДОЙ компоненте связности скрытых клеток
       (DFS с точным подсчётом, лимит конфигураций 60000).
   Уровень помечается решаемым, если все скрытые клетки покрыты
   флагами. Детерминированно и точно для всех практических случаев.
-------------------------------------------------------------------------- */
function validateSolvable(w,h,grid,safeCells){
  const total=w*h;
  const state=new Array(total).fill(0); // 0 скрыта, 1 открыта, 2 флаг
  const knownMines=new Set();
  const coords=id=>[id%w,(id/w)|0];
  // Лавинное открытие от безопасного ядра (как в реальной игре)
  const openCell=(id)=>{
    if(state[id])return;
    state[id]=1;
    if(grid[id]===0)for(const nb of neighbors(w,h,...coords(id)))openCell(nb);
  };
  for(const s of safeCells)openCell(s);
  const hiddenCount=()=>state.reduce((a,v)=>a+(v===0?1:0),0);
  const flagAll=(ids)=>{for(const id of ids)if(state[id]===0){state[id]=2;knownMines.add(id);}};
  const revealAll=(ids)=>{for(const id of ids)if(state[id]===0)openCell(id);};

  let guard=0;
  while(guard++<5000){
    if(hiddenCount()===knownMines.size)break; // решён
    // Сбор уравнений граничных клеток: {множество скрытых соседей, остаток мин}
    const eqs=[];
    for(let id=0;id<total;id++){
      if(state[id]!==1||grid[id]<=0)continue;
      const ns=neighbors(w,h,...coords(id));
      const cells=ns.filter(n=>state[n]===0).sort((a,b)=>a-b);
      if(!cells.length)continue;
      const rem=grid[id]-ns.filter(n=>state[n]===2).length;
      if(rem<0)return false; // противоречие — не должно случаться
      eqs.push({cells,rem,key:cells.join(',')});
    }
    let progressed=false;
    // --- R1: прямое и обратное классические правила
    for(const e of eqs){
      if(e.rem===e.cells.length){flagAll(e.cells);progressed=true;}
      else if(e.rem===0){revealAll(e.cells);progressed=true;}
    }
    if(progressed)continue;
    // --- R2: полный набор подмножеств (A ⊆ B)
    const seen=new Set();const uniq=[];
    for(const e of eqs){if(!seen.has(e.key)){seen.add(e.key);uniq.push(e);}}
    for(const a of uniq){
      for(const b of uniq){
        if(a===b)continue;
        if(a.cells.length<b.cells.length&&a.cells.every(c=>b.cells.includes(c))){
          const setA=new Set(a.cells);
          const diff=b.cells.filter(c=>!setA.has(c));
          if(b.rem===a.rem){revealAll(diff);progressed=true;}
          else if(b.rem-a.rem===diff.length){flagAll(diff);progressed=true;}
        }
      }
      if(progressed)break;
    }
    if(progressed)continue;
    // --- R3: XORSUM по всем парам (симметрическая разница множеств)
    outerX: for(const a of uniq){
      for(const b of uniq){
        if(a===b)continue;
        const sa=new Set(a.cells),sb=new Set(b.cells);
        const inter=a.cells.filter(c=>sb.has(c));
        if(inter.length===0)continue;
        const onlyA=a.cells.filter(c=>!sb.has(c)),onlyB=b.cells.filter(c=>!sa.has(c));
        if(onlyA.length+onlyB.length===0)continue;
        if(onlyA.length+onlyB.length>14)continue;
        const dA=a.rem-inter.length,dB=b.rem-inter.length;
        if(dA<0||dB<0)continue;
        if(dA>onlyA.length||dB>onlyB.length)continue;
        const combos=(k,arr)=>{const res=[];const rec=(i,cur)=>{if(cur.length===k){res.push(cur.slice());return;}for(let j=i;j<arr.length;j++){cur.push(arr[j]);rec(j+1,cur);cur.pop();}};if(k<=arr.length)rec(0,[]);return res;};
        const cands=[];
        for(const ca of combos(dA,onlyA))for(const cb of combos(dB,onlyB))cands.push(new Set([...ca,...cb]));
        if(cands.length===0)continue;
        for(const cell of [...onlyA,...onlyB]){
          if(cands.every(s=>s.has(cell))){flagAll([cell]);progressed=true;break outerX;}
          if(cands.every(s=>!s.has(cell))){revealAll([cell]);progressed=true;break outerX;}
        }
      }
    }
    if(progressed)continue;
    // --- R4: ПОЛНЫЙ CSP по каждой компоненте связности скрытых клеток
    const hiddenIds=[];for(let i=0;i<total;i++)if(state[i]===0)hiddenIds.push(i);
    const hidSet=new Set(hiddenIds);
    const compSeen=new Set();let cspMove=null;
    for(const st of hiddenIds){
      if(compSeen.has(st))continue;
      const comp=[];const stack=[st];
      while(stack.length){
        const v=stack.pop();if(compSeen.has(v))continue;compSeen.add(v);comp.push(v);
        const[vx,vy]=coords(v);
        for(const n of neighbors(w,h,vx,vy))if(hidSet.has(n)&&!compSeen.has(n))stack.push(n);
      }
      // Ограничения, полностью внутри компоненты
      const cons=[];
      let touchesOutside=false;
      for(let id=0;id<total;id++){
        if(state[id]!==1||grid[id]<=0)continue;
        const ns=neighbors(w,h,...coords(id));
        const inComp=ns.filter(n=>hidSet.has(n)&&comp.includes(n));
        const outComp=ns.filter(n=>hidSet.has(n)&&!comp.includes(n));
        if(outComp.length){touchesOutside=true;continue;}
        if(inComp.length===0)continue;
        const rem=grid[id]-ns.filter(n=>state[n]===2).length;
        cons.push({cells:inComp,rem});
      }
      if(touchesOutside)continue; // компоненту нельзя решить изолированно
      if(comp.length>28)continue;
      // Точный DFS-перебор всех конфигураций мин в компоненте
      const results=[];const cur=[];const cnt=new Array(cons.length).fill(0);
      const inCons=cons.map(c=>new Set(c.cells));
      const affected=cons.map(c=>c.cells);
      const maxRem=Math.min(...cons.map(c=>c.rem),comp.length);
      let overflow=false;
      const rec=(i,k)=>{
        if(overflow)return;
        if(results.length>=60000){overflow=true;return;}
        if(i===comp.length){
          for(let j=0;j<cons.length;j++)if(cnt[j]!==cons[j].rem)return;
          results.push(cur.slice());return;
        }
        const cell=comp[i];
        // вариант «мина»
        if(k+1<=maxRem){
          let ok=true;
          for(let j=0;j<cons.length;j++){
            if(inCons[j].has(cell)){
              // сколько ещё мест для мино после i?
              let rest=0;for(let q=i+1;q<comp.length;q++)if(inCons[j].has(comp[q]))rest++;
              if(cnt[j]+1+rest<cons[j].rem)ok=false;
            }
          }
          if(ok){
            cur.push(cell);
            for(let j=0;j<cons.length;j++)if(inCons[j].has(cell))cnt[j]++;
            rec(i+1,k+1);
            for(let j=0;j<cons.length;j++)if(inCons[j].has(cell))cnt[j]--;
            cur.pop();
          }
        }
        if(overflow)return;
        // вариант «безопасно»
        let ok=true;
        for(let j=0;j<cons.length;j++){
          if(inCons[j].has(cell)){
            let rest=0;for(let q=i+1;q<comp.length;q++)if(inCons[j].has(comp[q]))rest++;
            if(cnt[j]+rest<cons[j].rem)ok=false;
          }
        }
        if(ok)rec(i+1,k);
      };
      rec(0,0);
      if(overflow||results.length===0)continue;
      for(const cell of comp){
        const inAll=results.every(r=>r.includes(cell));
        const inNone=results.every(r=>!r.includes(cell));
        if(inAll){cspMove={cell,type:'flag'};break;}
        if(inNone){cspMove={cell,type:'safe'};break;}
      }
      if(cspMove)break;
    }
    if(cspMove){
      if(cspMove.type==='flag'){state[cspMove.cell]=2;knownMines.add(cspMove.cell);}
      else openCell(cspMove.cell);
      continue;
    }
    break; // застряли — уровень требует угадывания
  }
  const solved=hiddenCount()===knownMines.size;
  let minesOk=0;for(let i=0;i<total;i++)if(grid[i]===-1)minesOk++;
  return solved&&minesOk>0&&safeCells.every(s=>grid[s]!==-1);
}

function generateCampaignLevel(level){
  const cfg=campaignConfig(level);
  let salt=0;
  for(;;){
    const raw=genLevelRaw(level,cfg.w,cfg.h,cfg.mines,salt);
    if(raw&&validateSolvable(cfg.w,cfg.h,raw.grid,raw.safe)){
      return {...cfg,grid:raw.grid,safe:raw.safe,id:level};
    }
    salt++;
    if(salt>5000)throw new Error('Не удалось построить уровень '+level);
  }
}

/* ---------- Конфигурация кампании: размеры и плотность мин ---------- */
function campaignConfig(L){
  let w,h,d;
  if(L<=50){                       // ЭОН I: обучение, малые сети 5x5–8x8
    w=h=5+Math.floor((L-1)/10);    // 5,5,5,5,5, 6,6,6,6,6, 7..., 8...
    const base=0.10+((L-1)%10)*0.004;
    d=Math.min(0.20,base);
  }else if(L<=200){                // ЭОН II: средние сети 9x9–15x15
    const t=(L-51)/149;
    w=h=9+Math.floor(t*6.999);     // 9..15
    d=0.14+t*0.06;                 // 14%..20%
  }else{                           // ЭОН III: крупные сети 16x16–24x24
    const t=(L-201)/299;
    w=h=16+Math.floor(t*8.999);    // 16..24
    d=0.20+t*0.08;                 // 20%..28%
  }
  w=Math.min(w,24);h=Math.min(h,24);
  let mines=Math.round(w*h*d);
  mines=Math.max(1,Math.min(mines,w*h-10));
  return {w,h,mines};
}

/* ---------- Классическое состояние партии ---------- */
class MinesGame{
  constructor(levelData){
    this.w=levelData.w;this.h=levelData.h;
    this.grid=levelData.grid.slice();
    this.total=this.w*this.h;
    this.state=new Array(this.total).fill(0); // 0 скрыт,1 открыт,2 флаг,3 вопрос
    this.dead=false;this.won=false;
    this.flags=new Array(this.total).fill(0);
    this.mineCount=levelData.mines;
    this.hiddenLeft=this.total;
    this.firstAction=true;
    this.revealedStart=0;
    for(const s of levelData.safe)this.openCell(s,true);
    this.revealedStart=[...this.state].filter(v=>v===1).length;
    this.levelId=levelData.id;
  }
  coords(id){return [id%this.w,(id/this.w)|0];}
  nb(id){const[x,y]=this.coords(id);return neighbors(this.w,this.h,x,y);}
  flagCount(){return this.flags.filter(f=>f>0).length;}
  openCell(id,silent){
    if(this.state[id]!==0)return false;
    this.state[id]=1;this.hiddenLeft--;
    if(!silent&&this.grid[id]===-1)return 'boom';
    if(this.grid[id]===0){for(const n of this.nb(id))if(this.state[n]===0)this.openCell(n,silent);}
    return true;
  }
  reveal(id){
    if(this.dead||this.won)return null;
    if(this.state[id]!==0)return null;
    if(this.grid[id]===-1){this.state[id]=1;this.dead=true;this.exploded=id;return 'boom';}
    this.openCell(id,false);
    this.checkWin();
    return 'ok';
  }
  toggleFlag(id){
    if(this.dead||this.won)return null;
    if(this.state[id]===1)return null;
    const cyc={0:2,2:3,3:0};
    const prev=this.state[id];this.state[id]=cyc[prev];
    this.flags[id]=this.state[id]===2?1:0;
    return this.state[id];
  }
  chord(id){
    if(this.dead||this.won)return null;
    if(this.state[id]!==1||this.grid[id]<=0)return null;
    const ns=this.nb(id);
    const fl=ns.filter(n=>this.state[n]===2).length;
    if(fl!==this.grid[id])return null;
    let boom=false;
    for(const n of ns){
      if(this.state[n]===0){
        if(this.grid[n]===-1){this.state[n]=1;this.dead=true;this.exploded=n;boom=true;}
        else this.openCell(n,false);
      }
    }
    if(!boom)this.checkWin();
    return boom?'boom':'ok';
  }
  checkWin(){
    const hidden=[];
    for(let i=0;i<this.total;i++)if(this.state[i]!==1)hidden.push(i);
    const allMinesFound=hidden.every(i=>this.grid[i]===-1)&&hidden.length===this.mineCount;
    if(allMinesFound){
      this.won=true;
      for(const i of hidden)if(this.state[i]!==2){this.state[i]=2;this.flags[i]=1;}
      return true;
    }
    return false;
  }
  allMineIds(){const o=[];for(let i=0;i<this.total;i++)if(this.grid[i]===-1)o.push(i);return o;}
}

if(typeof module!=='undefined')module.exports={makeRng,generateCampaignLevel,campaignConfig,MinesGame,validateSolvable,neighbors};
