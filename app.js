const SERVICE='7b3e0001-5a1c-4f2e-9a10-3c0d1e2f4a50';
const LIVE='7b3e0002-5a1c-4f2e-9a10-3c0d1e2f4a50';
const ZEVT='7b3e0003-5a1c-4f2e-9a10-3c0d1e2f4a50';
const CMD ='7b3e0004-5a1c-4f2e-9a10-3c0d1e2f4a50';
const NOMINAL=360;

const $=id=>document.getElementById(id);
let dev=null, chCmd=null, filterOn=false, ledTimer=null, wake=null;

function setEstado(t){$('estado').textContent=t}

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

function onLive(e){
  const d=e.target.value;
  $('liveA').textContent=d.getUint16(0,true);
  $('liveB').textContent=d.getUint16(2,true);
}

function paintZ(d){
  const dA=d.getUint16(0,true), dB=d.getUint16(2,true);
  const mn=d.getUint16(4,true), mx=d.getUint16(6,true);
  const revs=d.getUint32(8,true), errs=d.getUint32(12,true);
  const first=(dA===0xFFFF);
  const eA=$('revA'), eB=$('revB');
  eA.textContent=first?'—':dA;
  eB.textContent=first?'—':dB;
  eA.className='v'+(first?'':(dA===NOMINAL?' ok':' bad'));
  eB.className='v'+(first?'':(dB===NOMINAL?' ok':' bad'));
  $('revs').textContent=revs;
  $('errs').textContent=errs;
  $('errs').className='v'+(errs>0?' bad':'');
  $('minA').textContent=(mn===0xFFFF)?'—':mn;
  $('maxA').textContent=(revs===0)?'—':mx;
  $('zinfo').textContent=first?'Primera Z (referencia)':'Última vuelta completa: '+revs;
}

function onZ(e){
  paintZ(e.target.value);
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
    paintZ(await chZ.readValue());
    setEstado('Conectado: '+dev.name);
    $('btnConn').textContent='Desconectar';
    $('btnReset').disabled=false;$('btnFlt').disabled=false;
    try{wake=await navigator.wakeLock.request('screen')}catch(_){}
  }catch(err){
    setEstado('Error: '+err.message);
  }
}

function onDesc(){
  setEstado('Desconectado');
  $('btnConn').textContent='Conectar';
  $('btnReset').disabled=true;$('btnFlt').disabled=true;
  if(wake){wake.release();wake=null}
}

$('btnConn').onclick=()=>{
  if(dev&&dev.gatt.connected){dev.gatt.disconnect()}else{conectar()}
};
$('btnReset').onclick=()=>{if(chCmd)chCmd.writeValue(Uint8Array.of(1))};
$('btnFlt').onclick=async()=>{
  if(!chCmd)return;
  filterOn=!filterOn;
  await chCmd.writeValue(Uint8Array.of(filterOn?2:3));
  $('flt').textContent=filterOn?'ON':'OFF';
  $('liveA').textContent='0';$('liveB').textContent='0';
};
