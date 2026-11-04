/* China screenshot import. Browser-local OCR; selected values only. */
(()=>{'use strict';
const el=id=>document.getElementById(id),safeText=escapeText;
const BUILDINGS=[
...Object.keys(state).map(name=>({id:name,name,aliases:[name.replace(/\s/g,''),...({'누에 숲':['누에나무숲'],'고령토 채석장':['고령토채석장'],'실 가공소':['실가공장'],'점토 가공소':['점토가공장']}[name]||[])],production:name})),
{id:'premiumRice',name:'호화 쌀 농장',aliases:['호화쌀농장','고급쌀농장']},
...Object.entries(CITY_PLAN_DATA.homeProduction).map(([id,b])=>({id,name:b.name,aliases:[b.name.replace(/\s/g,''),...({smallHome:['소형집'],mediumHome:['중형집','주택'],premiumHome:['호화집']}[id]||[])],home:id}))];
const STOCKS=[{name:'오수전',target:'currency'},...Object.entries({'쌀':'쌀 농장','누에고치':'누에 숲','고령토':'고령토 채석장','실':'실 가공소','점토':'점토 가공소','비단':'silk','도자기':'porc'}).map(([name,target])=>({name,target}))];
let worker=null,busy=false,findings=[];
const clean=s=>String(s).replace(/\s|[·:：]/g,'');
function status(s,bad=false){el('photoStatus').textContent=s;el('photoStatus').classList.toggle('bad',bad);}
async function engine(){if(worker)return worker;if(!window.Tesseract)await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';s.onload=resolve;s.onerror=()=>reject(new Error('인식 엔진을 불러오지 못했습니다. 인터넷 연결을 확인하세요.'));document.head.append(s);});worker=await Tesseract.createWorker('kor+eng',1,{logger:()=>{}});return worker;}
function quantity(s){if(String(s).trim()==='')return null;const n=parseCompactNumber(String(s).replace(/[Oo]/g,'0'));return Number.isFinite(n)&&Number.isInteger(n)&&n>=0&&n<=1e12?n:null;}
function matchBuilding(s){const text=clean(s);const exact=BUILDINGS.filter(b=>b.aliases.some(a=>text.includes(a))&&(!/호화|고급/.test(text)||/호화|고급/.test(b.name)));exact.sort((a,b)=>Math.max(...b.aliases.map(x=>x.length))-Math.max(...a.aliases.map(x=>x.length)));return exact[0]||null;}
function entry(id,label,value,extra={}){return {id,label,value,...extra};}
function parseStockLines(lines){const out=[];for(const line of lines){const text=clean(line.text),candidates=STOCKS.filter(s=>text.includes(clean(s.name))).sort((a,b)=>b.name.length-a.name.length),s=candidates[0];if(!s)continue;let after=text.slice(text.indexOf(clean(s.name))+clean(s.name).length);if(!/\d/.test(after)&&line.bbox){const p=line.bbox,next=lines.filter(l=>l.bbox&&l.bbox.y0>=p.y1&&l.bbox.y0-p.y1<(p.y1-p.y0)*2&&Math.abs(l.bbox.x0-p.x0)<30).sort((a,b)=>a.bbox.y0-b.bbox.y0)[0];after=next?.text||'';}const m=after.match(/^\s*(\d[\d,]*(?:\.\d+)?\s*[KkMm]?)\s*$/);if(m){const n=quantity(m[1]);if(n!==null)out.push(entry('stock_'+s.target,s.name+' 보유량',n,{kind:'stock',target:s.target}));}}return out;}
function parseBuildingLines(lines,width,height){
 const out=[];
 for(const line of lines){const b=matchBuilding(line.text);if(!b)continue;const p=line.bbox||{},rh=Math.max(15,(p.y1||0)-(p.y0||0));
 const below=lines.filter(l=>l!==line&&l.bbox&&l.bbox.y0>=(p.y1||0)-rh*.3&&l.bbox.y0<(p.y1||0)+rh*3&&Math.abs(l.bbox.x0-(p.x0||0))<rh*3);
 const above=lines.filter(l=>l!==line&&l.bbox&&l.bbox.y1<=(p.y0||0)+rh*.5&&l.bbox.y1>(p.y0||0)-rh*5&&l.bbox.x0>=(p.x0||0)-rh&&l.bbox.x0<(p.x0||0)+rh*10);
 const lv=(line.text+' '+below.map(l=>l.text).join(' ')).match(/(?:Lv\.?|레벨)\s*([1-6])(?!\d)/i),count=(line.text+' '+above.map(l=>l.text).join(' ')).match(/[x×X]\s*(\d{1,4})(?!\d)/);
 const group=b.id+'_'+Math.round(p.x0||0)+'_'+Math.round(p.y0||0);
 for(const [field,m]of [['lv',lv],['count',count]])out.push(entry(group+'_'+field,b.name+(field==='lv'?' 레벨':' 수량'),m?Number(m[1]):null,{kind:'building',building:b.id,field,group,anchor:p,needsReview:true}));
 }return out;
}
function mergeFindings(additions){for(const f of additions){const prior=findings.find(p=>p.source===f.source&&(f.kind==='stock'?p.kind==='stock'&&p.target===f.target:p.building===f.building&&p.field===f.field&&Math.abs((p.anchor?.y0||0)-(f.anchor?.y0||0))<25&&Math.abs((p.anchor?.x0||0)-(f.anchor?.x0||0))<25));if(!prior){findings.push(f);continue;}if(f.value===null||f.value===undefined)continue;if(prior.value===null||prior.value===undefined){prior.value=f.value;prior.needsReview=!!f.needsReview;}else if(prior.value!==f.value){prior.needsReview=true;prior.candidates=[...new Set([prior.value,f.value,...(prior.candidates||[])])];}}}
// Overlapping scrolling screenshots show the same card at different positions.
// Preserve its count once by matching a building and its displayed level.
function dedupePhotoPages(){
 const grouped=new Map(),seen=new Map(),removed=new Set();
 for(const f of findings){if(f.kind!=='building'||!f.group)continue;if(!grouped.has(f.group))grouped.set(f.group,{building:f.building,source:f.source});grouped.get(f.group)[f.field]=f;}
 for(const [group,card] of grouped){const lv=card.lv?.value;
  if(!Number.isInteger(lv)||lv<1||lv>6)continue;
  const key=card.building+'_'+lv,previous=seen.get(key);
  if(!previous){seen.set(key,{group,card});continue;}
  if(previous.card.source===card.source)continue;
  if(previous.card.count&&card.count){
   const old=previous.card.count,other=card.count;
   const options=[...new Set([...(old.candidates||[]),...(other.candidates||[]),old.value,other.value].filter(n=>n!==null&&n!==undefined))];
   if(old.value!==other.value){old.value=null;old.needsReview=true;old.candidates=options;}
   else if(other.needsReview){old.needsReview=true;old.candidates=options;}
  }
  if(previous.card.lv&&card.lv&&(previous.card.lv.needsReview||card.lv.needsReview)){
   previous.card.lv.needsReview=true;previous.card.lv.candidates=[...new Set([...(previous.card.lv.candidates||[]),...(card.lv.candidates||[]),lv])];
  }
  removed.add(group);
 }
 if(removed.size)findings=findings.filter(f=>!removed.has(f.group));
}
// Resolve the displayed level from the current group, including OCR recovery,
// candidate selection and manual edits; never keep the first visual guess.
function reviewLabel(f){if(f.kind!=='building')return f.label;const b=BUILDINGS.find(b=>b.id===f.building);if(!b)return f.label;const lv=findings.find(g=>g.group===f.group&&g.field==='lv')?.value;return b.name+(Number.isInteger(lv)&&lv>=1&&lv<=6?' (Lv.'+lv+')':'')+(f.field==='lv'?' 레벨':' 수량');}
function syncReviewLabels(group){for(const [i,f]of findings.entries()){if(!group||f.group!==group)continue;const label=reviewLabel(f),node=document.querySelector('[data-photo-label="'+i+'"]');if(node)node.textContent=label;for(const [selector,suffix]of [['[data-photo-value="'+i+'"]',' 인식값'],['[data-photo-check="'+i+'"]',' 적용']])document.querySelector(selector)?.setAttribute('aria-label',label+suffix);}}
function render(){el('photoReview').innerHTML=findings.length?'<button type="button" id="photoSkipUncertain">확인 필요 항목 선택 해제</button><table class="photo-table"><thead><tr><th>적용</th><th>항목</th><th>인식값 · 수정 가능</th></tr></thead><tbody>'+findings.map((f,i)=>'<tr><td><input type="checkbox" data-photo-check="'+i+'" '+(f.value!==null&&!f.needsReview&&!findings.some(g=>g.group&&g.group===f.group&&(g.value===null||g.needsReview))?'checked ':'')+'aria-label="'+safeText(reviewLabel(f))+' 적용"></td><td><span data-photo-label="'+i+'">'+safeText(reviewLabel(f))+'</span>'+(f.needsReview?'<small class="photo-caution">추가 확인 필요</small>':'')+'</td><td><input type="text" inputmode="decimal" placeholder="직접 입력" data-photo-value="'+i+'" value="'+(f.value??'')+'" aria-label="'+safeText(reviewLabel(f))+' 인식값">'+(f.candidates?.length&&(f.needsReview||f.candidates.length>1)?'<div class="photo-candidates">'+f.candidates.map(n=>'<button type="button" data-photo-pick="'+i+'" data-photo-number="'+n+'" aria-pressed="'+(f.value===n)+'">'+n+'</button>').join('')+'</div>':'')+(f.preview?'<img class="photo-preview" src="'+f.preview+'" alt="'+safeText(reviewLabel(f))+' 원본 숫자 확대">':'')+'</td></tr>').join('')+'</tbody></table><p class="photo-description">인식값을 수정한 뒤 적용할 항목을 체크하세요. 건물은 레벨과 수량을 함께 선택하세요.</p>':'';el('photoApply').disabled=!findings.length;}
async function scan(){
 if(busy)return;const buildingFiles=Array.from(el('photoBuildings').files||[]),stockFiles=Array.from(el('photoStocks').files||[]);
 if(buildingFiles.length>2){status('건물 목록 사진은 최대 2장까지 선택할 수 있습니다.',true);return;}
 const files=[...buildingFiles.map((f,i)=>['buildings',f,'buildings_'+i]),...stockFiles.slice(0,1).map(f=>['stocks',f,'stocks'])];
 if(!files.length){status('사진을 선택해주세요.',true);return;}
 busy=true;el('photoScan').disabled=true;el('photoApply').disabled=true;findings=[];render();syncClear();
 try{status('문자 인식 엔진을 준비하고 있습니다. 처음에는 시간이 걸릴 수 있습니다…');const w=await engine();await w.setParameters({tessedit_pageseg_mode:'11'});
 for(const [kind,file,source]of files){if(!file.type.startsWith('image/')||file.size>20*1024*1024)throw new Error('20MB 이하 이미지 파일을 선택하세요.');
 status('사진 '+(files.findIndex(f=>f[2]===source)+1)+' / '+files.length+' · 건물명과 숫자를 확인하고 있습니다…');
 const url=URL.createObjectURL(file);try{const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('사진을 열 수 없습니다.'));image.src=url;});
 const scale=Math.min(2,1600/image.naturalHeight,3000/image.naturalWidth),canvas=document.createElement('canvas');canvas.width=Math.round(image.naturalWidth*scale);canvas.height=Math.round(image.naturalHeight*scale);const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,canvas.width,canvas.height);
 const result=await w.recognize(canvas),lines=result.data.lines||[];
 const rows=kind==='buildings'?parseBuildingLines(lines,canvas.width,canvas.height):parseStockLines(lines);
 for(const f of rows){f.source=source;f.needsReview=true;if(f.group)f.group=source+'_'+f.group;}mergeFindings(rows);
 }finally{URL.revokeObjectURL(url);}}
 dedupePhotoPages();addMissing(files);render();status('분석 완료 · 인식값을 확인하고 적용할 항목을 선택하세요.');
 }catch(e){addMissing(files);render();status(e.message+' · 아래에서 직접 입력할 수도 있습니다.',true);}
 finally{busy=false;el('photoScan').disabled=false;syncClear();}
}
function addMissing(files){
 if(files.some(f=>f[0]==='stocks'))for(const s of STOCKS)if(!findings.some(f=>f.kind==='stock'&&f.target===s.target))findings.push(entry('stock_'+s.target,s.name+' 보유량',null,{kind:'stock',target:s.target,needsReview:true}));
 if(files.some(f=>f[0]==='buildings'))for(const b of BUILDINGS)if(!findings.some(f=>f.kind==='building'&&f.building===b.id))for(const field of ['lv','count'])findings.push(entry(b.id+'_'+field,b.name+(field==='lv'?' 레벨':' 수량'),null,{kind:'building',building:b.id,field,group:'manual_'+b.id,needsReview:true}));
}
function apply(){
 if(busy)return;const selected=[];
 for(const box of el('photoReview').querySelectorAll('[data-photo-check]:checked')){const f=findings[Number(box.dataset.photoCheck)],n=quantity(document.querySelector('[data-photo-value="'+box.dataset.photoCheck+'"]').value);
 if(n===null||f.field==='lv'&&(n<1||n>6)){status(reviewLabel(f)+' 값을 확인하세요.',true);return;}selected.push({...f,value:n});}
 if(!selected.length){status('확인한 항목에 체크해주세요.',true);return;}
 const groups=new Map(),stocks=new Set();for(const f of selected){if(f.kind==='stock'){if(stocks.has(f.target)){status('같은 보유량은 하나만 선택하세요.',true);return;}stocks.add(f.target);continue;}if(!groups.has(f.group))groups.set(f.group,{building:f.building});groups.get(f.group)[f.field]=f.value;}
 for(const g of groups.values())if(g.lv===undefined||g.count===undefined){status('건물은 같은 항목의 레벨과 수량을 함께 선택하세요.',true);return;}
 for(const g of groups.values())if(findings.some(f=>f.kind==='building'&&f.building===g.building&&!groups.has(f.group))){status('이 건물의 다른 레벨도 모두 선택하세요. 일부만 적용하면 기존 구성이 누락될 수 있습니다.',true);return;}
 const byBuilding=new Map();for(const g of groups.values()){if(!byBuilding.has(g.building))byBuilding.set(g.building,[]);byBuilding.get(g.building).push(g);}
 for(const [id,rows]of byBuilding){const b=BUILDINGS.find(b=>b.id===id);if(b.home&&new Set(rows.map(r=>r.lv)).size>1){status(b.name+'의 여러 레벨 구성은 도시 관리에서 직접 확인해주세요.',true);return;}}
 // All validation completes before any state is changed.
 for(const f of selected.filter(f=>f.kind==='stock')){if(f.target==='currency')planState.currencyStock=f.value;else if(['silk','porc'].includes(f.target))wStock[f.target]=f.value;else state[f.target].stock=f.value;}
 for(const [id,rows]of byBuilding){const b=BUILDINGS.find(b=>b.id===id),count=rows.reduce((s,r)=>s+r.count,0);
 if(b.home){planState.homes[b.home]={lv:rows[0].lv,count};delete planState.buildingOverrides[b.home];}
 else if(b.production){const old=state[b.production];details[b.production]={enabled:rows.length>1,rows:rows.map(r=>({lv:r.lv,count:r.count,mode:normalizedDetailMode(b.production,r.lv,old.mode),hours:old.hours}))};old.lv=rows[0].lv;old.bldgs=count;old.mode=normalizedDetailMode(b.production,old.lv,old.mode);delete planState.buildingOverrides[b.production];}
 else if(id==='premiumRice'){planState.premiumRice=count;planState.buildingOverrides.premiumRice=count;}}
 syncUIFromState();renderAll();saveState();status('선택한 값 '+selected.length+'개를 적용했습니다.');el('resetStatus').textContent='사진 입력 완료 · 선택한 항목만 반영했습니다.';el('photoImportDialog').close();
}
function reset(){if(busy)return;for(const id of ['photoBuildings','photoStocks'])el(id).value='';findings=[];render();syncClear();status('한 종류의 사진만 올려도 됩니다.');}
function syncClear(){for(const id of ['photoBuildings','photoStocks'])el(id).disabled=busy;el('photoBuildingsClear').disabled=busy||!el('photoBuildings').files.length;el('photoStocksClear').disabled=busy||!el('photoStocks').files.length;el('photoReset').disabled=busy||!el('photoBuildings').files.length&&!el('photoStocks').files.length&&!findings.length;}
el('photoReview').onclick=e=>{if(e.target.id==='photoSkipUncertain'){const uncertain=new Set(findings.filter(f=>f.value===null||f.needsReview).map(f=>f.group).filter(Boolean));for(const box of document.querySelectorAll('[data-photo-check]')){const f=findings[Number(box.dataset.photoCheck)];if(f.value===null||f.needsReview||uncertain.has(f.group))box.checked=false;}status('확인이 필요한 항목의 선택을 해제했습니다.');return;}const button=e.target.closest('[data-photo-pick]');if(!button)return;const i=Number(button.dataset.photoPick),n=Number(button.dataset.photoNumber);findings[i].value=n;const input=document.querySelector('[data-photo-value="'+i+'"]');input.value=n;document.querySelector('[data-photo-check="'+i+'"]').checked=true;syncReviewLabels(findings[i].group);for(const b of el('photoReview').querySelectorAll('[data-photo-pick="'+i+'"]'))b.setAttribute('aria-pressed',String(Number(b.dataset.photoNumber)===n));};
el('photoReview').oninput=e=>{const i=e.target.dataset.photoValue;if(i!==undefined){findings[Number(i)].value=quantity(e.target.value);document.querySelector('[data-photo-check="'+i+'"]').checked=e.target.value.trim()!=='';syncReviewLabels(findings[Number(i)].group);}};
const button=document.createElement('button');button.id='photoImportBtn';button.type='button';button.textContent='사진으로 입력';el('prodSettings').querySelector('.title-actions').prepend(button);
el('photoImportBtn').onclick=()=>el('photoImportDialog').showModal();el('photoImportClose').onclick=()=>el('photoImportDialog').close();el('photoScan').onclick=scan;el('photoApply').onclick=apply;el('photoReset').onclick=reset;for(const [input,button]of [['photoBuildings','photoBuildingsClear'],['photoStocks','photoStocksClear']]){el(input).onchange=()=>{findings=[];render();syncClear();};el(button).onclick=()=>{if(busy)return;el(input).value='';findings=[];render();syncClear();};}
})();
