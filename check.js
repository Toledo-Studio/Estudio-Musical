

(()=> {
const $=id=>document.getElementById(id);
const canvas=$('pdfCanvas'),ctx=canvas.getContext('2d'),viewer=$('viewer');
let pdf=null,page=1,scale=1.15,photoUrl=null;
const inkCanvas=$('inkCanvas'),inkCtx=inkCanvas.getContext('2d');
let inkEnabled=false,inkStrokes=[],inkCurrent=null;
function annotationStorageKey(){
 const name=$('filename').textContent||'partitura';
 return 'estudio-musical-anotaciones:'+name+':'+page;
}
function resizeInkCanvas(){
 const r=viewer.getBoundingClientRect(),dpr=window.devicePixelRatio||1;
 inkCanvas.width=Math.max(1,Math.round(r.width*dpr));
 inkCanvas.height=Math.max(1,Math.round(r.height*dpr));
 inkCtx.setTransform(dpr,0,0,dpr,0,0);
 drawInk();
}
function drawInk(){
 const r=viewer.getBoundingClientRect();
 inkCtx.clearRect(0,0,r.width,r.height);
 for(const stroke of inkStrokes){
  if(!stroke.points.length)continue;
  inkCtx.beginPath();inkCtx.strokeStyle=stroke.color;inkCtx.lineWidth=stroke.width;
  inkCtx.lineCap='round';inkCtx.lineJoin='round';
  stroke.points.forEach((pt,i)=>{
   const x=pt.x*r.width,y=pt.y*r.height;
   if(i===0)inkCtx.moveTo(x,y);else inkCtx.lineTo(x,y);
  });
  if(stroke.points.length===1){
   const pt=stroke.points[0];inkCtx.lineTo(pt.x*r.width+.2,pt.y*r.height+.2);
  }
  inkCtx.stroke();
 }
}
function saveInk(){
 try{localStorage.setItem(annotationStorageKey(),JSON.stringify(inkStrokes));}
 catch(e){$('status').textContent='No se pudieron guardar las anotaciones en este dispositivo.';}
}
function loadInk(){
 try{inkStrokes=JSON.parse(localStorage.getItem(annotationStorageKey())||'[]');}
 catch(e){inkStrokes=[];}
 resizeInkCanvas();
}
function setAnnotationMode(enabled){
 inkEnabled=enabled;
 inkCanvas.classList.toggle('active',enabled);
 $('annotationTools').hidden=!enabled;
 $('annotateBtn').textContent=enabled?'✎ Dibujando…':'✎ Anotar';
 $('status').textContent=enabled?'Dibuja directamente sobre la partitura con el dedo o un lápiz táctil.':'';
}
$('annotateBtn').addEventListener('click',()=>setAnnotationMode(!inkEnabled));
$('doneInk').addEventListener('click',()=>setAnnotationMode(false));
$('undoInk').addEventListener('click',()=>{inkStrokes.pop();drawInk();saveInk();});
$('clearInk').addEventListener('click',()=>{
 if(confirm('¿Borrar todas las anotaciones de esta página?')){
  inkStrokes=[];drawInk();saveInk();
 }
});
inkCanvas.addEventListener('pointerdown',e=>{
 if(!inkEnabled)return;
 e.preventDefault();inkCanvas.setPointerCapture(e.pointerId);
 const r=inkCanvas.getBoundingClientRect();
 inkCurrent={color:$('inkColor').value,width:3,points:[{x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height}]};
 inkStrokes.push(inkCurrent);drawInk();
});
inkCanvas.addEventListener('pointermove',e=>{
 if(!inkEnabled||!inkCurrent)return;
 const r=inkCanvas.getBoundingClientRect();
 inkCurrent.points.push({x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height});
 drawInk();
});
function finishInk(){if(inkCurrent){inkCurrent=null;saveInk();}}
inkCanvas.addEventListener('pointerup',finishInk);
inkCanvas.addEventListener('pointercancel',finishInk);
window.addEventListener('resize',resizeInkCanvas);

if(window.pdfjsLib)pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
function updateZoomLabel(){ $('zoomPct').textContent=Math.round(scale*100)+'%'; }
let layoutResizeTimer=null,lastViewerWidth=0;
function refreshViewerLayout(){
 if(!pdf)return;
 const width=viewer.clientWidth;
 if(Math.abs(width-lastViewerWidth)<2)return;
 lastViewerWidth=width;
 renderPage();
}
window.addEventListener('resize',()=>{
 clearTimeout(layoutResizeTimer);
 layoutResizeTimer=setTimeout(refreshViewerLayout,220);
});
window.addEventListener('orientationchange',()=>{
 clearTimeout(layoutResizeTimer);
 layoutResizeTimer=setTimeout(()=>{lastViewerWidth=0;refreshViewerLayout();},350);
});
function renderPage(){
 if(!pdf)return;
 pdf.getPage(page).then(p=>{
  const base=p.getViewport({scale:1});
  const available=Math.max(240,viewer.clientWidth-4);lastViewerWidth=viewer.clientWidth;
  const fitScale=available/base.width;
  const v=p.getViewport({scale:fitScale*scale});
  canvas.width=Math.ceil(v.width);canvas.height=Math.ceil(v.height);
  canvas.style.width=Math.ceil(v.width)+'px';
  canvas.style.height=Math.ceil(v.height)+'px';
  return p.render({canvasContext:ctx,viewport:v}).promise;
 }).then(()=>{
  canvas.style.display='block';$('photo').style.display='none';$('empty').style.display='none';
  updateZoomLabel();
  $('pageinfo').textContent=`Página ${page} de ${pdf.numPages}`;
  if($('rehearsalPage'))updateRehearsalBar();loadInk();
  $('prev').disabled=page===1;$('next').disabled=page===pdf.numPages;
  viewer.scrollLeft=0;viewer.scrollTop=0;
 }).catch(()=>$('status').textContent='No se pudo mostrar esta página.');
}

// Historial local de partituras: guarda los archivos en IndexedDB del navegador.
const DB_NAME='estudio-musical-db', DB_STORE='scores';
function openHistoryDB(){
 return new Promise((resolve,reject)=>{
  const req=indexedDB.open(DB_NAME,1);
  req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(DB_STORE))db.createObjectStore(DB_STORE,{keyPath:'id',autoIncrement:true})};
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
 });
}
async function historySave(file,kind){
 try{
  const db=await openHistoryDB();
  await new Promise((resolve,reject)=>{
   const tx=db.transaction(DB_STORE,'readwrite');
   tx.objectStore(DB_STORE).add({name:file.name,type:file.type,kind,blob:file,addedAt:Date.now()});
   tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
  });
  db.close();renderHistory();
 }catch(err){$('status').textContent='No se pudo guardar el historial en este navegador.'}
}
async function historyAll(){
 const db=await openHistoryDB();
 const rows=await new Promise((resolve,reject)=>{
  const req=db.transaction(DB_STORE,'readonly').objectStore(DB_STORE).getAll();
  req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error);
 });
 db.close();return rows.sort((a,b)=>b.addedAt-a.addedAt);
}
async function renderHistory(){
 try{
  const rows=await historyAll(),list=$('historyList');list.innerHTML='';
  if(!rows.length){list.innerHTML='<span class="history-empty">Todavía no has cargado partituras.</span>';return}
  rows.slice(0,12).forEach(row=>{
   const item=document.createElement('div');item.className='history-item';
   const open=document.createElement('button');open.className='history-open';open.type='button';open.textContent=(row.kind==='pdf'?'▤ ':'♫ ')+row.name;
   open.onclick=()=>restoreHistory(row.id);
   const meta=document.createElement('span');meta.className='history-meta';meta.textContent=new Date(row.addedAt).toLocaleDateString('es-ES');
   const remove=document.createElement('button');remove.className='history-remove';remove.type='button';remove.textContent='×';remove.title='Eliminar del historial';
   remove.onclick=()=>deleteHistory(row.id);
   item.append(open,meta,remove);list.append(item);
  });
 }catch(err){$('historyList').textContent='El historial no está disponible en este navegador.'}
}
async function restoreHistory(id){
 const db=await openHistoryDB();
 const row=await new Promise((resolve,reject)=>{
  const req=db.transaction(DB_STORE,'readonly').objectStore(DB_STORE).get(id);
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
 });
 db.close();if(!row)return;
 const file=new File([row.blob],row.name,{type:row.type});
 if(row.kind==='pdf'){await loadPdfFile(file)}else loadImageFile(file);
}
async function deleteHistory(id){
 const db=await openHistoryDB();
 await new Promise((resolve,reject)=>{
  const tx=db.transaction(DB_STORE,'readwrite');tx.objectStore(DB_STORE).delete(id);
  tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
 });
 db.close();renderHistory();
}
$('clearHistory').onclick=async()=>{
 if(!confirm('¿Borrar todas las partituras guardadas en este dispositivo?'))return;
 const db=await openHistoryDB();
 await new Promise((resolve,reject)=>{
  const tx=db.transaction(DB_STORE,'readwrite');tx.objectStore(DB_STORE).clear();
  tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
 });
 db.close();renderHistory();
};
async function loadPdfFile(f){
 try{pdf=await pdfjsLib.getDocument({data:await f.arrayBuffer()}).promise;page=1;scale=1.15;$('filename').textContent=f.name;renderPage()}catch(err){$('status').textContent='No se pudo abrir el PDF. Comprueba que no esté protegido.'}
}
function loadImageFile(f){
 pdf=null;if(photoUrl)URL.revokeObjectURL(photoUrl);photoUrl=URL.createObjectURL(f);
 $('photo').src=photoUrl;$('photo').style.display='block';canvas.style.display='none';$('empty').style.display='none';
 $('photo').style.transform='';$('photo').dataset.zoom='1';scale=1;
 $('photo').onload=()=>{
  const maxW=Math.max(200,viewer.clientWidth-4),maxH=Math.max(200,viewer.clientHeight-4);
  const fit=Math.min(maxW/$('photo').naturalWidth,maxH/$('photo').naturalHeight,1);
  $('photo').style.width=Math.round($('photo').naturalWidth*fit)+'px';
  $('photo').style.height='auto';viewer.scrollLeft=0;viewer.scrollTop=0;loadInk();
 };
 $('filename').textContent=f.name;$('pageinfo').textContent='Imagen';$('prev').disabled=$('next').disabled=true;
}

$('pdfFile').onchange=async e=>{const f=e.target.files[0];if(!f)return;await loadPdfFile(f);await historySave(f,'pdf');e.target.value=''};
$('imgFile').onchange=async e=>{const f=e.target.files[0];if(!f)return;loadImageFile(f);await historySave(f,'image');e.target.value=''};
$('prev').onclick=()=>{if(page>1){page--;renderPage()}};$('next').onclick=()=>{if(pdf&&page<pdf.numPages){page++;renderPage()}};
$('fullScreen').onclick=()=>{if(document.fullscreenElement)document.exitFullscreen?.();else viewer.requestFullscreen?.();};
function updateRehearsalBar(){
 $('rehearsalPlay').textContent=running?'Ⅱ':'▶';
 $('rehearsalPage').textContent=pdf?`Página ${page} / ${pdf.numPages}`:'Modo ensayo';
 $('rehearsalPrev').disabled=!!pdf&&page<=1;
 $('rehearsalNext').disabled=!!pdf&&page>=pdf.numPages;
}
async function enterRehearsal(){if(inkEnabled)setAnnotationMode(false);
 try{
  await $('appMain').requestFullscreen();
  document.body.classList.add('rehearsal-mode');
  updateRehearsalBar();
  setTimeout(()=>{lastViewerWidth=0;refreshViewerLayout();},300);
 }catch(e){
  $('status').textContent='No se pudo activar pantalla completa. Prueba desde Chrome y vuelve a intentarlo.';
 }
}
$('rehearsalBtn').onclick=enterRehearsal;
$('rehearsalExit').onclick=()=>{if(document.fullscreenElement)document.exitFullscreen?.();};
$('rehearsalPrev').onclick=()=>{if(pdf&&page>1){page--;renderPage();updateRehearsalBar();}};
$('rehearsalNext').onclick=()=>{if(pdf&&page<pdf.numPages){page++;renderPage();updateRehearsalBar();}};
$('rehearsalPlay').onclick=()=>$('toggle').click();
document.addEventListener('fullscreenchange',()=>{
 const active=document.fullscreenElement===$('appMain');
 document.body.classList.toggle('rehearsal-mode',active);
 if(active)updateRehearsalBar();
 setTimeout(()=>{lastViewerWidth=0;refreshViewerLayout();},300);
});

let touchX=0,touchY=0,lastPanX=0,lastPanY=0,pinchStartDistance=0,pinchStartZoom=1,pinchActive=false,pinchChanged=false,pinchPreviewZoom=1,panActive=false;
function getTouchDistance(touches){
 const dx=touches[0].clientX-touches[1].clientX,dy=touches[0].clientY-touches[1].clientY;
 return Math.hypot(dx,dy);
}
function currentImageZoom(){return Math.max(.5,Math.min(3,parseFloat($('photo').dataset.zoom)||1));}
function setPinchPreview(value){
 pinchPreviewZoom=Math.max(.5,Math.min(3,value));
 const factor=pinchPreviewZoom/pinchStartZoom;
 const target=pdf?canvas:$('photo');
 target.style.transformOrigin='top left';
 target.style.transform=`scale(${factor})`;
 $('zoomPct').textContent=Math.round(pinchPreviewZoom*100)+'%';
}
function commitZoom(){
 const target=pdf?canvas:$('photo');
 target.style.transform='';
 if(pdf){scale=pinchPreviewZoom;renderPage();}
 else{
  const old=currentImageZoom();$('photo').dataset.zoom=String(pinchPreviewZoom);
  const ratio=pinchPreviewZoom/old;
  const w=parseFloat($('photo').style.width)||$('photo').clientWidth;
  const h=parseFloat($('photo').style.height)||$('photo').clientHeight;
  $('photo').style.width=Math.round(w*ratio)+'px';$('photo').style.height=Math.round(h*ratio)+'px';
 }
}
viewer.addEventListener('touchstart',e=>{
 if(e.touches.length===1){
  touchX=e.touches[0].clientX;touchY=e.touches[0].clientY;
  lastPanX=touchX;lastPanY=touchY;
  panActive=(pdf?scale:currentImageZoom())>1.02;
 }
 if(e.touches.length===2){
  pinchActive=true;panActive=false;pinchChanged=false;
  pinchStartDistance=getTouchDistance(e.touches);
  pinchStartZoom=pdf?scale:currentImageZoom();pinchPreviewZoom=pinchStartZoom;
 }
},{passive:true});
viewer.addEventListener('touchmove',e=>{
 if(pinchActive&&e.touches.length===2){
  e.preventDefault();
  const distance=getTouchDistance(e.touches);
  if(pinchStartDistance>0){
   const next=pinchStartZoom*(distance/pinchStartDistance);
   if(Math.abs(next-pinchStartZoom)>.015)pinchChanged=true;
   setPinchPreview(next);
  }
  return;
 }
 if(panActive&&e.touches.length===1){
  e.preventDefault();
  const x=e.touches[0].clientX,y=e.touches[0].clientY;
  viewer.scrollLeft-=x-lastPanX;viewer.scrollTop-=y-lastPanY;
  lastPanX=x;lastPanY=y;
 }
},{passive:false});
viewer.addEventListener('touchend',e=>{
 if(pinchActive&&e.touches.length<2){
  pinchActive=false;
  if(pinchChanged)commitZoom();
  else{$(pdf?'pdfCanvas':'photo').style.transform='';$('zoomPct').textContent=Math.round((pdf?scale:currentImageZoom())*100)+'%';}
  return;
 }
 if(panActive){panActive=false;return;}
 if(e.changedTouches.length!==1||!pdf||scale>1.02)return;
 const dx=e.changedTouches[0].clientX-touchX,dy=e.changedTouches[0].clientY-touchY;
 if(Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy)){
  if(dx<0&&page<pdf.numPages){page++;renderPage();}
  else if(dx>0&&page>1){page--;renderPage();}
 }
},{passive:true});
viewer.addEventListener('click',e=>{if(!pdf||scale>1.02||Math.abs(e.clientX-touchX)>30)return;const r=viewer.getBoundingClientRect(),x=e.clientX-r.left;if(x<r.width*.28&&page>1){page--;renderPage()}else if(x>r.width*.72&&page<pdf.numPages){page++;renderPage()}});

let audio=null,running=false,timer=null,nextTime=0,beat=0,sub=0,visualTimers=[],scheduledSources=[];
let tapTimes=[], tapIntervals=[], barsElapsed=0;
function applyBpm(value){
 const bpm=Math.max(30,Math.min(240,Math.round(value)));
 $('bpm').value=bpm;$('bpmValue').textContent=String(bpm);
}
function median(values){
 const sorted=[...values].sort((a,b)=>a-b);
 const mid=Math.floor(sorted.length/2);
 return sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;
}
$('tapTempo').onclick=()=>{
 const now=performance.now();
 const previous=tapTimes.length?tapTimes[tapTimes.length-1]:null;
 if(previous!==null && now-previous>2200){
  tapTimes=[];tapIntervals=[];
 }
 if(previous!==null){
  const interval=now-previous;
  // Solo acepta pulsaciones dentro del rango de 30–240 BPM.
  if(interval>=250 && interval<=2000){
   tapIntervals.push(interval);
   if(tapIntervals.length>5)tapIntervals.shift();
  }else if(interval<250){
   $('tapHint').textContent='Demasiado rápido';
  }
 }
 tapTimes.push(now);
 if(tapTimes.length>6)tapTimes.shift();

 if(tapIntervals.length>=3){
  const center=median(tapIntervals);
  // Descarta golpes aislados que se alejen más de un 20% de la cadencia central.
  const consistent=tapIntervals.filter(value=>Math.abs(value-center)<=center*0.20);
  if(consistent.length>=2){
   const stableInterval=median(consistent);
   applyBpm(60000/stableInterval);
   $('tapHint').textContent=$('bpm').value+' BPM';
  }else{
   $('tapHint').textContent='Sigue marcando el pulso…';
  }
 }else{
  $('tapHint').textContent=`Calculando ${tapIntervals.length}/3`;
 }
};

function getMeter(){const v=$('meter').value;if(v.endsWith('e'))return Number(v.slice(0,-1))/3;return Number(v)}
function defaultAccentPattern(){
 const meter=$('meter').value;
 const patterns={'2':['strong','weak'],'3':['strong','weak','weak'],'4':['strong','weak','medium','weak'],'5':['strong','weak','medium','weak','weak'],'6':['strong','weak','medium','weak','medium','weak'],'7':['strong','weak','medium','weak','medium','weak','weak'],'6e':['strong','weak'],'9e':['strong','weak','weak'],'12e':['strong','weak','medium','weak']};
 return patterns[meter]||Array.from({length:getMeter()},(_,i)=>i===0?'strong':'weak');
}
const accentNames={strong:'Fuerte',medium:'Semifuerte',weak:'Débil',none:'Sin acento'};
function drawDots(){
 const n=getMeter(),pattern=defaultAccentPattern();
 $('dots').innerHTML='';$('accentOptions').innerHTML='';
 for(let i=0;i<n;i++){
  const d=document.createElement('i');$('dots').appendChild(d);
  const wrap=document.createElement('div');wrap.className='accent-step';
  const title=document.createElement('strong');title.textContent='Pulso '+(i+1);
  const select=document.createElement('select');select.dataset.accentBeat=String(i);select.setAttribute('aria-label','Acentuación del pulso '+(i+1));
  for(const value of ['strong','medium','weak','none']){const option=document.createElement('option');option.value=value;option.textContent=accentNames[value];select.appendChild(option)}
  select.value=pattern[i]||'weak';wrap.appendChild(title);wrap.appendChild(select);$('accentOptions').appendChild(wrap);
 }
}
function getBeatAccent(index){
 if(!$('accent').checked)return 'none';
 const select=$('accentOptions').querySelector(`[data-accent-beat="${index}"]`);
 return select?select.value:'none';
}

function flashVisual(isBeat,accentLevel,index,eventBeat){
 const isAccent=accentLevel==='strong'||accentLevel==='medium';
 const play=$('toggle');
 play.classList.remove('pulse');void play.offsetWidth;play.classList.add('pulse');
 const bars=[...$('metroBeat').children];
 bars.forEach((bar,i)=>{bar.classList.toggle('active',i===index%bars.length);bar.classList.remove('accent','accent-strong','accent-medium');});
 if(isBeat&&accentLevel==='strong')bars[index%bars.length].classList.add('accent-strong');
 else if(isBeat&&accentLevel==='medium')bars[index%bars.length].classList.add('accent-medium');
 [...$('dots').children].forEach((d,i)=>d.classList.toggle('current',i===eventBeat));
 const strips=[$('leftStrip'),$('rightStrip')];
 strips.forEach(strip=>{
  strip.classList.remove('flash','subflash');void strip.offsetWidth;
  strip.classList.add(isBeat?'flash':'subflash');
  setTimeout(()=>strip.classList.remove('flash','subflash'),isBeat?150:85);
 });
 setTimeout(()=>play.classList.remove('pulse'),isAccent?190:120);

}
function schedule(){
 if(!running||!audio)return;
 const now=audio.currentTime;
 while(nextTime<now+.12){
  const bpm=Number($('bpm').value),subdiv=Number($('subdivision').value);
  const beatDur=60/bpm,subDur=beatDur/subdiv;
  const eventBeat=beat,eventSub=sub;
  const isBeat=eventSub===0;
  const accentLevel=isBeat?getBeatAccent(eventBeat):'none';
  const mode=$('metroMode').value;
  if(mode!=='visual'){
   const osc=audio.createOscillator(),gain=audio.createGain();
   osc.type='sine';
   const sound={strong:{frequency:1450,volume:.30},medium:{frequency:1120,volume:.22},weak:{frequency:850,volume:.14},none:{frequency:700,volume:.11}};
   const tone=isBeat?sound[accentLevel]:{frequency:760,volume:.09};
   osc.frequency.setValueAtTime(tone.frequency,nextTime);
   gain.gain.setValueAtTime(.0001,nextTime);
   gain.gain.linearRampToValueAtTime(tone.volume,nextTime+.004);
   gain.gain.exponentialRampToValueAtTime(.0001,nextTime+.065);
   osc.connect(gain);gain.connect(audio.destination);
   osc.start(nextTime);osc.stop(nextTime+.07);
   scheduledSources.push(osc);
  }
  if(mode!=='sound'){
   const delay=Math.max(0,(nextTime-now)*1000);
   const t=setTimeout(()=>flashVisual(isBeat,accentLevel,eventSub,eventBeat),delay);
   visualTimers.push(t);
  }
  nextTime+=subDur;
  sub++;
  if(sub>=subdiv){
   sub=0;beat=(beat+1)%getMeter();
   if(beat===0){
    barsElapsed++;
    $('progressCount').textContent=String(barsElapsed);
    if($('progressEnabled').checked && barsElapsed%Number($('progressBars').value)===0){
     const current=Number($('bpm').value);
     const target=Math.max(30,Math.min(240,Number($('progressTarget').value)||240));
     if(current<target)applyBpm(Math.min(target,current+Number($('progressStep').value)));
     if(Number($('bpm').value)>=target)$('status').textContent='Has alcanzado la velocidad máxima configurada.';
    }
   }
  }
 }
 timer=setTimeout(schedule,20);
}
async function start(){
 try{const AC=window.AudioContext||window.webkitAudioContext;if(!AC)throw Error('Audio no compatible');if(!audio)audio=new AC();await audio.resume();if(audio.state!=='running')throw Error('Audio bloqueado por el navegador');
 running=true;beat=0;sub=0;barsElapsed=0;$('progressCount').textContent='0';nextTime=audio.currentTime+.05;$('toggle').textContent='Ⅱ';$('toggle').setAttribute('aria-label','Detener metrónomo');$('status').textContent='Metrónomo activo.';schedule()
 }catch(e){$('status').textContent='No se pudo activar el audio. Pulsa Iniciar de nuevo y comprueba el volumen multimedia.'}
}
function stop(resetPhase=false){
 running=false;
 if(timer)clearTimeout(timer);
 visualTimers.forEach(clearTimeout);visualTimers=[];
 timer=null;
 scheduledSources.forEach(source=>{try{source.stop()}catch(e){}});
 scheduledSources=[];
 $('toggle').textContent='▶';$('toggle').setAttribute('aria-label','Iniciar metrónomo');
 $('metroBeat').querySelectorAll('i').forEach(b=>b.classList.remove('active','accent','accent-strong','accent-medium'));
 [...$('dots').children].forEach(d=>d.classList.remove('current'));
 if(resetPhase){beat=0;sub=0;}
}
$('toggle').onclick=()=>{if(running)stop();else start();setTimeout(updateRehearsalBar,0);};
$('metroMode').onchange=()=>{
 const wasRunning=running;
 if(wasRunning){stop(true);start();}
 $('status').textContent=$('metroMode').value==='sound'?'Modo solo sonido.':$('metroMode').value==='visual'?'Modo solo indicador visual.':'Modo sonido e indicador visual.';
};
function updateBpm(){ $('bpmValue').textContent=$('bpm').value }
$('bpm').oninput=updateBpm;$('minus').onclick=()=>{$('bpm').value=Math.max(30,Number($('bpm').value)-5);updateBpm()};$('plus').onclick=()=>{$('bpm').value=Math.min(240,Number($('bpm').value)+5);updateBpm()};
$('quickMinus').addEventListener('click',()=>$('minus').click());
$('quickPlus').addEventListener('click',()=>$('plus').click());

$('meter').onchange=()=>{
 const wasRunning=running;
 if(wasRunning)stop(true);else{beat=0;sub=0;}barsElapsed=0;$('progressCount').textContent='0';
 drawDots();
 if(wasRunning)start();
};
// Afinador cromático mediante micrófono y análisis de frecuencia.
let tunerStream=null,tunerContext=null,tunerAnalyser=null,tunerSource=null,tunerFrame=0,tunerBuffer=null;
const tunerNames=['Do','Do♯','Re','Re♯','Mi','Fa','Fa♯','Sol','Sol♯','La','La♯','Si'];
function stopTuner(){
 if(tunerFrame)cancelAnimationFrame(tunerFrame);
 tunerFrame=0;
 if(tunerSource){try{tunerSource.disconnect()}catch(e){} tunerSource=null;}
 if(tunerStream){tunerStream.getTracks().forEach(track=>track.stop());tunerStream=null;}
 if(tunerContext){tunerContext.close().catch(()=>{});tunerContext=null;}
 tunerAnalyser=null;
 $('tunerToggle').textContent='🎙 Activar afinador';
 $('tunerNote').textContent='—';$('tunerFrequency').textContent='— Hz';
 $('tunerOctave').textContent='Escuchando…';$('tunerCents').textContent='Centra la aguja para afinar';
 $('tunerNeedle').style.left='50%';
 $('tunerHint').textContent='Afinador apagado.';
}
function detectPitch(buffer,sampleRate){
 let rms=0;
 for(let i=0;i<buffer.length;i++)rms+=buffer[i]*buffer[i];
 rms=Math.sqrt(rms/buffer.length);
 if(rms<0.012)return null;
 const minLag=Math.floor(sampleRate/1000),maxLag=Math.min(Math.floor(sampleRate/65),buffer.length-2);
 let bestLag=-1,bestCorr=0;
 // Autocorrelación normalizada: busca el periodo más parecido.
 for(let lag=minLag;lag<=maxLag;lag++){
  let corr=0,energyA=0,energyB=0;
  const limit=buffer.length-lag;
  for(let i=0;i<limit;i+=2){
   const a=buffer[i],b=buffer[i+lag];
   corr+=a*b;energyA+=a*a;energyB+=b*b;
  }
  const norm=corr/Math.sqrt((energyA*energyB)||1);
  if(norm>bestCorr){bestCorr=norm;bestLag=lag;}
 }
 if(bestLag<0||bestCorr<0.78)return null;
 // Interpolación parabólica para afinar la estimación del periodo.
 const correlationAt=lag=>{
  let c=0,a2=0,b2=0;
  for(let i=0;i<buffer.length-lag;i+=2){const a=buffer[i],b=buffer[i+lag];c+=a*b;a2+=a*a;b2+=b*b;}
  return c/Math.sqrt((a2*b2)||1);
 };
 const left=bestLag>minLag?correlationAt(bestLag-1):bestCorr;
 const right=bestLag<maxLag?correlationAt(bestLag+1):bestCorr;
 const denom=left-2*bestCorr+right;
 const shift=Math.abs(denom)>1e-8?0.5*(left-right)/denom:0;
 const period=bestLag+Math.max(-0.5,Math.min(0.5,shift));
 return {frequency:sampleRate/period,confidence:bestCorr};
}
function updateTuner(){
 if(!tunerAnalyser||!tunerBuffer)return;
 tunerAnalyser.getFloatTimeDomainData(tunerBuffer);
 const result=detectPitch(tunerBuffer,tunerContext.sampleRate);
 if(result){
  const midi=69+12*Math.log2(result.frequency/440);
  const nearest=Math.round(midi),cents=Math.round((midi-nearest)*100);
  const noteIndex=((nearest%12)+12)%12,octave=Math.floor(nearest/12)-1;
  $('tunerNote').textContent=tunerNames[noteIndex];
  $('tunerFrequency').textContent=result.frequency.toFixed(1)+' Hz';
  $('tunerOctave').textContent='Octava '+octave;
  $('tunerCents').textContent=(cents>0?'+':'')+cents+' cents · '+(Math.abs(cents)<=5?'Afinada':cents<0?'Demasiado grave':'Demasiado aguda');
  $('tunerNeedle').style.left=(50+Math.max(-50,Math.min(50,cents))*0.9)+'%';
 }else{
  $('tunerNote').textContent='—';$('tunerFrequency').textContent='— Hz';
  $('tunerOctave').textContent='Toca una nota sostenida';
  $('tunerCents').textContent='Esperando una señal clara';
  $('tunerNeedle').style.left='50%';
 }
 tunerFrame=requestAnimationFrame(updateTuner);
}
$('tunerToggle').addEventListener('click',async()=>{
 if(tunerStream){stopTuner();return;}
 try{
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia)throw new Error('El navegador no permite acceder al micrófono. Abre la app desde HTTPS en Chrome.');
  tunerStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
  const AC=window.AudioContext||window.webkitAudioContext;
  if(!AC)throw new Error('Este dispositivo no admite el análisis de audio.');
  tunerContext=new AC();await tunerContext.resume();
  tunerAnalyser=tunerContext.createAnalyser();tunerAnalyser.fftSize=4096;tunerAnalyser.smoothingTimeConstant=0.15;
  tunerBuffer=new Float32Array(tunerAnalyser.fftSize);
  tunerSource=tunerContext.createMediaStreamSource(tunerStream);tunerSource.connect(tunerAnalyser);
  $('tunerToggle').textContent='■ Apagar afinador';
  $('tunerHint').textContent='Micrófono activo. Toca una nota individual y mantenla estable.';
  updateTuner();
 }catch(err){
  stopTuner();
  $('tunerHint').textContent=err&&err.name==='NotAllowedError'?'Permite el acceso al micrófono en los ajustes del navegador.':(err.message||'No se pudo activar el micrófono.');
 }
});
window.addEventListener('pagehide',stopTuner);


// Registro local de sesiones de estudio.
const STUDY_KEY='toledo-estudio-musical-sessions-v1';
let studyStartedAt=null,studyInterval=null;
function readStudySessions(){
 try{const v=JSON.parse(localStorage.getItem(STUDY_KEY)||'[]');return Array.isArray(v)?v:[];}
 catch(e){return [];}
}
function formatStudyTime(ms){
 const sec=Math.max(0,Math.floor(ms/1000)),h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=sec%60;
 return [h,m,s].map(n=>String(n).padStart(2,'0')).join(':');
}
function updateStudyClock(){if(studyStartedAt)$('studyTimer').textContent=formatStudyTime(Date.now()-studyStartedAt);}
function renderStudyProgress(){
 const rows=readStudySessions(),total=rows.reduce((sum,r)=>sum+(Number(r.duration)||0),0),hours=total/3600000;
 $('studyTotal').textContent=hours<1?Math.round(total/60000)+' min':hours.toFixed(1)+' h';
 $('studySessions').textContent=String(rows.length);
 const list=$('studyHistory');list.innerHTML='';
 if(!rows.length){list.innerHTML='<li>Aún no hay sesiones registradas.</li>';return;}
 rows.slice(0,12).forEach(r=>{
  const li=document.createElement('li'),date=new Date(r.date);
  const dateText=isNaN(date.getTime())?'Fecha desconocida':date.toLocaleString('es-ES',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
  const title=(r.piece||'Práctica general').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  li.innerHTML=`<b>${title}</b><br>${dateText} · ${formatStudyTime(r.duration)} · ${r.bpm} BPM`;
  list.appendChild(li);
 });
}
$('studyStart').addEventListener('click',()=>{
 if(studyStartedAt)return;
 studyStartedAt=Date.now();$('studyStart').disabled=true;$('studyStop').disabled=false;$('studyNote').disabled=true;
 updateStudyClock();studyInterval=setInterval(updateStudyClock,1000);
});
$('studyStop').addEventListener('click',()=>{
 if(!studyStartedAt)return;
 const duration=Date.now()-studyStartedAt;studyStartedAt=null;clearInterval(studyInterval);studyInterval=null;
 const rows=readStudySessions();
 rows.unshift({date:new Date().toISOString(),duration,piece:$('studyNote').value.trim()||$('filename').textContent.replace('Ningún archivo cargado','Práctica general'),bpm:Number($('bpm').value)||80});
 try{localStorage.setItem(STUDY_KEY,JSON.stringify(rows.slice(0,200)));}
 catch(e){$('status').textContent='No se pudo guardar el progreso en este dispositivo.';}
 $('studyTimer').textContent='00:00:00';$('studyStart').disabled=false;$('studyStop').disabled=true;$('studyNote').disabled=false;
 renderStudyProgress();
});
$('studyClear').addEventListener('click',()=>{
 if(!confirm('¿Borrar todo el historial de estudio?'))return;
 localStorage.removeItem(STUDY_KEY);renderStudyProgress();
});
renderStudyProgress();

drawDots();updateBpm();renderHistory();resizeInkCanvas();
})();


if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js").catch(err => console.warn("No se pudo registrar el modo app:", err)));
}


(()=>{
 const $=id=>document.getElementById(id);
 const buttons=[...document.querySelectorAll('[data-audio-type]')];
 let audioType='youtube',objectUrl=null;
 const saved=localStorage.getItem('estudioMusicalAudioLink')||'';
 $('audioUrl').value=saved;
 function setType(type){
  audioType=type;buttons.forEach(b=>b.classList.toggle('active',b.dataset.audioType===type));
  $('audioLinkArea').hidden=type==='mp3';$('audioFileArea').hidden=type!=='mp3';
  $('audioPlayerArea').innerHTML='';
 }
 buttons.forEach(b=>b.addEventListener('click',()=>setType(b.dataset.audioType)));
 function youtubeId(raw){
  try{const u=new URL(raw);if(u.hostname==='youtu.be')return u.pathname.slice(1).split('/')[0];if(!/(^|\.)youtube\.com$/.test(u.hostname))return null;if(u.pathname==='/watch')return u.searchParams.get('v');const m=u.pathname.match(/^\/(?:embed|shorts|live)\/([^/?]+)/);return m?m[1]:null}catch{return null}
 }
 function spotifyEmbed(raw){
  try{const u=new URL(raw);if(!/(^|\.)open\.spotify\.com$/.test(u.hostname))return null;const m=u.pathname.match(/^\/(track|album|playlist|episode|show)\/([A-Za-z0-9]+)/);return m?`https://open.spotify.com/embed/${m[1]}/${m[2]}?utm_source=generator`:null}catch{return null}
 }
 function loadLink(){
  const raw=$('audioUrl').value.trim();if(!raw){alert('Pega primero un enlace.');return;}
  const area=$('audioPlayerArea');area.innerHTML='';
  if(audioType==='youtube'){
   const id=youtubeId(raw);if(!id){alert('No reconozco ese enlace de YouTube. Usa un enlace de vídeo normal, youtu.be o Shorts.');return;}
   const frame=document.createElement('iframe');frame.className='audio-embed';frame.style.height='220px';frame.src=`https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?playsinline=1&rel=0`;frame.title='Reproductor de YouTube';frame.allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';frame.allowFullscreen=true;area.appendChild(frame);
  }else if(audioType==='spotify'){
   const embed=spotifyEmbed(raw);if(!embed){alert('Usa un enlace de Spotify de una canción, álbum, lista o episodio.');return;}
   const frame=document.createElement('iframe');frame.className='audio-embed';frame.style.height='152px';frame.src=embed;frame.title='Reproductor de Spotify';frame.allow='autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';area.appendChild(frame);
  }
  localStorage.setItem('estudioMusicalAudioLink',raw);
 }
 $('loadAudioLink').addEventListener('click',loadLink);
 $('audioUrl').addEventListener('keydown',e=>{if(e.key==='Enter')loadLink()});
 $('audioFile').addEventListener('change',e=>{
  const file=e.target.files&&e.target.files[0];if(!file)return;
  if(!/^audio\/(mpeg|mp3)$/.test(file.type)&&!file.name.toLowerCase().endsWith('.mp3')){alert('Selecciona un archivo MP3.');e.target.value='';return;}
  if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=URL.createObjectURL(file);
  $('audioFileName').textContent=file.name;
  const area=$('audioPlayerArea');area.innerHTML='';const player=document.createElement('audio');player.className='audio-player';player.controls=true;player.preload='metadata';player.src=objectUrl;area.appendChild(player);
 });
 if(saved){const match=youtubeId(saved);const spotify=spotifyEmbed(saved);if(match)setType('youtube');else if(spotify)setType('spotify');if(match||spotify)loadLink();}
 window.addEventListener('beforeunload',()=>{if(objectUrl)URL.revokeObjectURL(objectUrl)});
})();
