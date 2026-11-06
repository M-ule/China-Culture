const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const path=require('node:path'),html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
function harness(){const nodes=new Map();const get=id=>{if(!nodes.has(id))nodes.set(id,{files:[],value:'',innerHTML:'',disabled:false,textContent:'',classList:{toggle(){}},setAttribute(){},querySelector:()=>({prepend(){}}),querySelectorAll:()=>[],close(){this.closed=true;}});return nodes.get(id);};
 const names=['쌀 농장','누에 숲','고령토 채석장','실 가공소','점토 가공소','비단 작업장','도자기 작업장'];let saves=0;
 const e={window:{},document:{getElementById:get,createElement:()=>({}),querySelector:get,querySelectorAll:()=>[]},state:Object.fromEntries(names.map(n=>[n,{lv:1,bldgs:1,mode:'30분',hours:'',stock:99}])),details:{},planState:{currencyStock:9,homes:{smallHome:{lv:1,count:1}},buildingOverrides:{'쌀 농장':90}},wStock:{silk:99,porc:99},CITY_PLAN_DATA:{homeProduction:{smallHome:{name:'소형 주택'},mediumHome:{name:'중형 주택'},premiumHome:{name:'호화 주택'}}},escapeText:s=>String(s),parseCompactNumber:s=>{const m=s.replace(/,/g,'').match(/^(\d+(?:\.\d+)?)([KM])?$/i);return m?Number(m[1])*(m[2]?.toUpperCase()==='K'?1000:m[2]?.toUpperCase()==='M'?1e6:1):NaN;},normalizedDetailMode:(b,lv,m)=>lv===1?'1분':m,syncUIFromState(){},renderAll(){},saveState(){saves++;}};
 vm.createContext(e);vm.runInContext(html.slice(html.indexOf('function parseCompactNumber('),html.indexOf('function fmtCompactInput(')),e);vm.runInContext(fs.readFileSync(path.join(__dirname,'../photo-import.js'),'utf8').replace(/\}\)\(\);\s*$/,'window.api={quantity,matchBuilding,parseStockLines,parseBuildingLines,mergeFindings,dedupePhotoPages,addMissing,apply,render,setRows:r=>findings=r,getRows:()=>findings};})();'),e);
 return {e,get,api:e.window.api,saves:()=>saves,select(rows){e.window.api.setRows(rows);get('photoReview').querySelectorAll=()=>rows.map((r,i)=>({dataset:{photoCheck:i}}));rows.forEach((r,i)=>get('[data-photo-value="'+i+'"]').value=String(r.value??''));}};
}
const card=(group,building,lv,count,source='a')=>['lv','count'].map((field,i)=>({kind:'building',group,building,field,value:i?count:lv,source}));
test('K/M, zero, and integer stock validation',()=>{const {api}=harness();for(const [s,n]of [['30,000',30000],['1.001K',1001],['1.5M',1500000],['0',0],['',null],['3.2',null],['-1',null]])assert.equal(api.quantity(s),n);});
test('Chinese building names distinguish premium and home types',()=>{const {api}=harness();for(const [s,id]of [['호화 쌀 농장','premiumRice'],['쌀 농장','쌀 농장'],['소형 주택','smallHome'],['호화 주택','premiumHome']])assert.equal(api.matchBuilding(s).id,id);});
test('stock name anchors keep all eight stocks including zero',()=>{const {api}=harness();const rows=api.parseStockLines(['오수전 1.5M','쌀 30,000','누에고치 2K','고령토 2,222','실 100','점토 20','비단 0','도자기 1'].map(text=>({text})));assert.equal(rows.length,8);assert.equal(rows[0].value,1500000);assert.equal(rows[6].value,0);});
test('building name anchors read same-line and nearby level/count',()=>{const {api}=harness();let rows=api.parseBuildingLines([{text:'쌀 농장 Lv.6 x12'}]);assert.deepEqual(Array.from(rows,r=>r.value),[6,12]);rows=api.parseBuildingLines([{text:'x 8',bbox:{x0:130,y0:50,x1:155,y1:65}},{text:'누에 숲',bbox:{x0:100,y0:100,x1:180,y1:120}},{text:'레벨 5',bbox:{x0:100,y0:125,x1:150,y1:145}}]);assert.deepEqual(Array.from(rows,r=>r.value),[5,8]);});
test('overlapping pages dedupe; conflicting counts require review',()=>{const {api}=harness();api.setRows([...card('a','쌀 농장',6,8,'0'),...card('b','쌀 농장',6,8,'1'),...card('c','쌀 농장',5,1,'1')]);api.dedupePhotoPages();assert.equal(api.getRows().length,4);api.setRows([...card('a','쌀 농장',6,8,'0'),...card('b','쌀 농장',6,3,'1')]);api.dedupePhotoPages();assert.equal(api.getRows()[1].value,null);});
test('mixed levels import exact configurations, sync city, preserve time/mode',()=>{const h=harness();h.select([...card('a','쌀 농장',6,8),...card('b','쌀 농장',5,1),{kind:'stock',target:'silk',value:0},{kind:'stock',target:'currency',value:30000},...card('c','smallHome',3,30)]);h.api.apply();assert.equal(h.saves(),1);assert.equal(h.e.state['쌀 농장'].bldgs,9);assert.equal(h.e.details['쌀 농장'].enabled,true);assert.equal(h.e.details['쌀 농장'].rows[1].lv,5);assert.equal(h.e.planState.buildingOverrides['쌀 농장'],undefined);assert.equal(h.e.planState.homes.smallHome.count,30);assert.equal(h.e.wStock.silk,0);assert.equal(h.e.planState.currencyStock,30000);assert.equal(h.e.state['실 가공소'].stock,99);});
test('partial selection and invalid levels leave all state untouched',()=>{for(const rows of [[card('a','쌀 농장',6,8)[1]],[...card('a','쌀 농장',7,8)]]){const h=harness();h.select([{kind:'stock',target:'silk',value:0},...rows]);h.api.apply();assert.equal(h.saves(),0);assert.equal(h.e.wStock.silk,99);}});
test('all levels of a detected building must be reviewed together',()=>{const h=harness(),rows=[...card('a','쌀 농장',6,8),...card('b','쌀 농장',5,1)];h.select(rows);h.get('photoReview').querySelectorAll=()=>[{dataset:{photoCheck:0}},{dataset:{photoCheck:1}}];h.api.apply();assert.equal(h.saves(),0);});
test('all wonder/level combinations find the next strictly higher worker bonus',()=>{const data=JSON.parse(html.match(/const DATA=(.*);/)[1]);const e={DATA:data,settings:{}};vm.createContext(e);vm.runInContext(html.match(/function getBonus\(\).*\nfunction getNextWorker\(\).*/)[0],e);for(const wonder of ['자금성','병마용','만리장성'])for(let level=0;level<=50;level++){e.settings={wonder,wLv:level};const expected=Array.from({length:50-level},(_,i)=>level+1+i).find(l=>data.bonus[wonder+'|'+l].w>data.bonus[wonder+'|'+level].w)??null;assert.equal(vm.runInContext('getNextWorker()',e),expected);}});
test('stock parser reads a detached number but leaves ambiguous neighbors for review',()=>{
 const {api}=harness();
 const label={text:'오수전',bbox:{x0:20,y0:30,x1:60,y1:50}};
 const number={text:'12.5 K',bbox:{x0:70,y0:30,x1:130,y1:50}};
 assert.equal(api.parseStockLines([label,number])[0].value,12500);
 assert.equal(api.parseStockLines([label,number,{text:'30',bbox:{x0:20,y0:55,x1:45,y1:75}}]).length,0);
});
test('contrast pass fills missing values and exposes conflicting amounts for review',()=>{
 const {api}=harness();
 const stock=value=>({kind:'stock',target:'currency',source:'stocks',value,needsReview:true});
 api.setRows([stock(null)]);
 api.mergeFindings([stock(30000)]);
 api.mergeFindings([stock(30)]);
 const [row]=api.getRows();
 assert.equal(row.needsReview,true);
 assert.deepEqual(Array.from(row.candidates),[30000,30]);
});
test('photo CSP permits local image decoding, the OCR worker, and model downloads',()=>{
 const policy=html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
 const sources=Object.fromEntries(policy.split(';').map(d=>d.trim().split(/\s+/)).map(([directive,...values])=>[directive,values]));
 assert.ok(sources['img-src'].includes('blob:'));
 assert.ok(sources['img-src'].includes('data:'));
 assert.ok(sources['worker-src'].includes('blob:'));
 assert.ok(sources['script-src'].includes("'wasm-unsafe-eval'"));
 for(const directive of ['script-src','connect-src'])assert.ok(sources[directive].includes('https://cdn.jsdelivr.net'));
});
test('Korean game labels map to their calculator fields',()=>{
 const {api}=harness();
 assert.equal(api.matchBuilding('벼 농장').id,'쌀 농장');
 assert.equal(api.matchBuilding('호화 벼 농장').id,'premiumRice');
 assert.equal(api.matchBuilding('실크 작업장').id,'비단 작업장');
 assert.equal(api.matchBuilding('소형 집').id,'smallHome');
 const rows=api.parseStockLines([{text:'나방 고치 36,352'},{text:'명주실 1,990'}]);
 assert.deepEqual(Array.from(rows,r=>[r.target,r.value]),[['누에 숲',36352],['실 가공소',1990]]);
});
