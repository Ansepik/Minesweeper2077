const C=require('./minesweeper_core.js');
for(const L of [1,50,123,345,500]){
  const lv=C.generateCampaignLevel(L);
  const g=new C.MinesGame(lv);
  let steps=0;
  while(g.won===false&&g.dead===false&&steps<lv.w*lv.h+50){
    steps++;
    const safeHidden=[];const mineHidden=[];
    for(let i=0;i<g.total;i++)if(g.state[i]===0){if(g.grid[i]===-1)mineHidden.push(i);else safeHidden.push(i);}
    if(safeHidden.length){g.reveal(safeHidden[0]);}
    else {for(const m of mineHidden)g.toggleFlag(m);}
  }
  console.log('L'+L,'won='+g.won,'dead='+g.dead,'steps',steps,'mines',lv.mines,'размер',lv.w+'x'+lv.h);
}
