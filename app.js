const SERVICE='7b3e0001-5a1c-4f2e-9a10-3c0d1e2f4a50';
const LIVE='7b3e0002-5a1c-4f2e-9a10-3c0d1e2f4a50';
const ZEVT='7b3e0003-5a1c-4f2e-9a10-3c0d1e2f4a50';
const CMD ='7b3e0004-5a1c-4f2e-9a10-3c0d1e2f4a50';
const TARGET_RPM=4;

const $=id=>document.getElementById(id);
let dev=null, chCmd=null, ledTimer=null, wake=null;
let mode1440=false, filterOn=false, lastZ=null, releInit=false;

function setEstado(t){$('estado').textContent=t}
function nom(){return mode1440?1440:360}

if(!navigator.bluetooth){
  const w=$('warn');w.style.display='block';
  w.textContent='Este navegador no soporta Web Bluetooth. Usa Chrome en Android (en iPhone no funciona).';
  $('btnConn').disabled=true;
}

function ledFlash(){
  $('led').classList.add('on');
  clearTimeout(ledTimer);
  ledTimer=setTimeout(()=>$('led').classList.remove('on'),1000);
}

function paintMode(){
  $('m360').classList.toggle('act',!mode1440);
  $('m1440').classList.toggle('act',mode1440);
  $('lblLiveM').textContent=mode1440?'A+B x4 en tiempo real':'A en tiempo real';
  $('lblRevM').textContent=mode1440?'A+B x4 entre Z (última vuelta)':'A entre Z (última vuelta)';
  $('revNote').textContent='esperado: '+nom();
  $('flt').textContent=filterOn?'ON':'OFF';
  if(lastZ)paintZ();
}

function onLive(e){
  const d=e.target.value;
  const a=d.getUint16(0,true), b=d.getUint16(2,true), q=d.getUint16(4,true);
  const rpm=d.getUint16(8,true)/100, fl=d.getUint16(10,true);
  const m=!!(fl&1), f=!!(fl&2), ra=!!(fl&4);
  const ri=d.getUint16(12,true), rc=d.getUint16(14,true);
  $('rled').classList.toggle('on',ra);
  $('rcnt').textContent=rc;
  $('rstate').textContent=ri===0?'desactivado':('1 s cada '+ri+' s');
  if(!releInit){$('rint').value=ri;releInit=true}
  if(m!==mode1440||f!==filterOn){mode1440=m;filterOn=f;paintMode()}
  $('liveM').textContent=mode1440?q:a;
  $('liveB').textContent=b;
  $('rpm').textContent=rpm.toFixed(2);
  const dl=rpm-TARGET_RPM;
  $('rpmN').textContent='objetivo '+TARGET_RPM.toFixed(2)+'  ·  Δ '+(dl>=0?'+':'')+dl.toFixed(2);
}

function parseZ(d){
  return {dA:d.getUint16(0,true),dB:d.getUint16(2,true),dQ:d.getUint16(4,true),
          mn:d.getUint16(6,true),mx:d.getUint16(8,true),rz:d.getUint16(10,true),
          revs:d.getUint32(12,true),errs:d.getUint16(16,true),errsR:d.getUint16(18,true)};
}

function paintZ(){
  const z=lastZ, first=(z.dA===0xFFFF);
  const vM=mode1440?z.dQ:z.dA;
  const eM=$('revM'), eB=$('revB');
  eM.textContent=first?'—':vM;
  eB.textContent=first?'—':z.dB;
  eM.className='v'+(first?'':(vM===nom()?' ok':' bad'));
  eB.className='v'+(first?'':(z.dB===360?' ok':' bad'));
  $('revs').textContent=z.revs;
  $('errs').textContent=z.errs;
  $('errs').className='v'+(z.errs>0?' bad':'');
  $('errsR').textContent=z.errsR;
  $('errsR').className='v'+(z.errsR>0?' bad':'');
  $('minM').textContent=(z.mn===0xFFFF)?'—':z.mn;
  $('maxM').textContent=(z.revs===0)?'—':z.mx;
  $('aq').textContent=first?'—':(z.dA+' / '+z.dQ);
  $('rpmZ').textContent=(z.rz===0xFFFF)?'—':(z.rz/100).toFixed(2);
  $('zinfo').textContent=first?'Primera Z (referencia)':'Última vuelta completa: '+z.revs;
}

function onZ(e){
  lastZ=parseZ(e.target.value);
  paintZ();
  ledFlash();
}

async function conectar(){
  try{
    setEstado('Buscando…');
    dev=await navigator.bluetooth.requestDevice({filters:[{namePrefix:'ENCODER'}],optionalServices:[SERVICE]});
    dev.addEventListener('gattserverdisconnected',onDesc);
    setEstado('Conectando…');
    const srv=await dev.gatt.connect();
    const svc=await srv.getPrimaryService(SERVICE);
    const chLive=await svc.getCharacteristic(LIVE);
    const chZ=await svc.getCharacteristic(ZEVT);
    chCmd=await svc.getCharacteristic(CMD);
    chLive.addEventListener('characteristicvaluechanged',onLive);
    chZ.addEventListener('characteristicvaluechanged',onZ);
    await chLive.startNotifications();
    await chZ.startNotifications();
    releInit=false;
    lastZ=parseZ(await chZ.readValue());
    paintZ();
    setEstado('Conectado: '+dev.name);
    $('btnConn').textContent='Desconectar';
    ['btnReset','btnFlt','m360','m1440','btnRele','rint'].forEach(i=>$(i).disabled=false);
    try{wake=await navigator.wakeLock.request('screen')}catch(_){}
  }catch(err){
    setEstado('Error: '+err.message);
  }
}

function onDesc(){
  setEstado('Desconectado');
  $('btnConn').textContent='Conectar';
  ['btnReset','btnFlt','m360','m1440','btnRele','rint'].forEach(i=>$(i).disabled=true);
  if(wake){wake.release();wake=null}
}

$('btnConn').onclick=()=>{
  if(dev&&dev.gatt.connected){dev.gatt.disconnect()}else{conectar()}
};
$('btnReset').onclick=()=>{if(chCmd)chCmd.writeValue(Uint8Array.of(1))};
$('btnFlt').onclick=()=>{
  if(!chCmd)return;
  chCmd.writeValue(Uint8Array.of(filterOn?3:2));
  $('liveM').textContent='0';$('liveB').textContent='0';
};
$('m360').onclick=()=>{if(chCmd)chCmd.writeValue(Uint8Array.of(4))};
$('m1440').onclick=()=>{if(chCmd)chCmd.writeValue(Uint8Array.of(5))};
$('btnRele').onclick=()=>{
  if(!chCmd)return;
  let s=parseInt($('rint').value,10);
  if(isNaN(s)||s<0)s=0;
  if(s>65535)s=65535;
  if(s===1)s=2;
  $('rint').value=s;
  chCmd.writeValue(Uint8Array.of(6,s&255,(s>>8)&255));
};
paintMode();
