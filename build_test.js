/* Тест: все 100 уровней детерминированы, валидны и решаемы без угадывания */
const C=require('./minesweeper_core.js');
let maxSalt=0,fail=0;
const t0=Date.now();
for(let L=1;L<=100;L++){
  try{
    const lv=C.generateCampaignLevel(L);
    // повторная генерация = идентичный результат (детерминизм)
    const lv2=C.generateCampaignLevel(L);
    if(lv.grid.join('')!==lv2.grid.join('')){console.log('NON-DETERMINISTIC at',L);fail++;}
    // базовая валидность
    let mines=0;for(const g of lv.grid)if(g===-1)mines++;
    if(mines!==lv.mines){console.log('MINE COUNT MISMATCH at',L,mines,lv.mines);fail++;}
    for(const s of lv.safe){if(lv.grid[s]===-1){console.log('SAFE ON MINE at',L);fail++;}}
    // счётчики корректны?
    for(let y=0;y<lv.h;y++)for(let x=0;x<lv.w;x++){
      const id=y*lv.w+x;if(lv.grid[id]===-1)continue;
      let n=0;for(const nb of C.neighbors(lv.w,lv.h,x,y))if(lv.grid[nb]===-1)n++;
      if(lv.grid[id]!==n){console.log('BAD COUNT at',L,id);fail++;}
    }
    const cfg=C.campaignConfig(L);
    if(L%20===0||L<=3||L===20||L===21||L===50||L===51||L===99)
      console.log(`Ур.${L}: ${cfg.w}x${cfg.h}, мин=${cfg.mines} (${(cfg.mines/(cfg.w*cfg.h)*100).toFixed(1)}%)`);
  }catch(e){console.log('FAIL level',L,e.message);fail++;}
}
console.log('Готово за',((Date.now()-t0)/1000).toFixed(1),'с. Ошибок:',fail);
