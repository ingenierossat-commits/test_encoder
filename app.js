const SERVICE='7b3e0001-5a1c-4f2e-9a10-3c0d1e2f4a50';
const LIVE='7b3e0002-5a1c-4f2e-9a10-3c0d1e2f4a50';
const CMD ='7b3e0004-5a1c-4f2e-9a10-3c0d1e2f4a50';
const CNT ='7b3e0005-5a1c-4f2e-9a10-3c0d1e2f4a50';
const TARGET_RPM=4;
const BTNS=['btnZero','btnFlt','m360','m1440','btnRele','rint'];

const $=id=>document.getElementById(id);
let dev=null, chCmd=null, wake=null;
let mode1440=false, filterOn=false, releInit=false;

function setEstado(t){$('estado').textContent=t}
function fmt(n){return n.toLocaleString('es-ES')}

if(!navigator.bluetooth){
  const w=$('warn');w.style.display='block';
  w.textContent='Este navegador no soporta Web Bluetooth. Usa Chrome en Android (en iPhone no funciona).';
  $('btnConn').disabled=true;
}

function paintMode(){
  $('m360').classList.toggle('act',!mode1440);
  $('m1440').classList.toggle('act',mode1440);
  $('flt').textContent=filterOn?'ON':'OFF';
}

function onLive(e){
  const d=e.target.value;
  const rpm=d.getUint16(0,true)/100, fl=d.getUint16(2,true);
  const ri=d.getUint16(4,true), rc=d.getUint16(6,true);
  const m=!!(fl&1), f=!!(fl&2), ra=!!(fl&4);
  if(m!==mode1440||f!==filterOn){mode1440=m;filterOn=f;paintMode()}
  $('rled').classList.toggle('on',ra);
  $('rcnt').textContent=rc;
  $('rstate').textContent=ri===0?'desactivado':('1 s cada '+ri+' s');
  if(!releInit){$('rint').value=ri;releInit=true}
  $('rpm').textContent=rpm.toFixed(2);
  const dl=rpm-TARGET_RPM;
  $('rpmN').textContent='objetivo '+TARGET_RPM.toFixed(2)+'  ·  Δ '+(dl>=0?'+':'')+dl.toFixed(2);
}

function onCnt(e){
  const d=e.target.value;
  const a=d.getUint32(0,true), b=d.getUint32(4,true), mx=d.getUint16(8,true);
  const df=a-b;
  $('cntA').textContent=fmt(a);
  $('cntB').textContent=fmt(b);
  $('cntD').textContent=(df>0?'+':'')+df;
  $('cntD').className='v'+(Math.abs(df)<=1?' ok':' bad');
  $('maxD').textContent=mx;
  $('maxD').className='v'+(mx<=1?' ok':' bad');
  $('turns').textContent=(a/360).toFixed(1);
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
    const chCnt=await svc.getCharacteristic(CNT);
    chCmd=await svc.getCharacteristic(CMD);
    chLive.addEventListener('characteristicvaluechanged',onLive);
    chCnt.addEventListener('characteristicvaluechanged',onCnt);
    releInit=false;
    await chLive.startNotifications();
    await chCnt.startNotifications();
    setEstado('Conectado: '+dev.name);
    $('btnConn').textContent='Desconectar';
    BTNS.forEach(i=>$(i).disabled=false);
    try{wake=await navigator.wakeLock.request('screen')}catch(_){}
  }catch(err){
    setEstado('Error: '+err.message);
  }
}

function onDesc(){
  setEstado('Desconectado (la placa sigue contando)');
  $('btnConn').textContent='Conectar';
  BTNS.forEach(i=>$(i).disabled=true);
  if(wake){wake.release();wake=null}
}

$('btnConn').onclick=()=>{
  if(dev&&dev.gatt.connected){dev.gatt.disconnect()}else{conectar()}
};
$('btnZero').onclick=()=>{
  if(!chCmd)return;
  if(confirm('¿Poner A y B a cero?'))chCmd.writeValue(Uint8Array.of(1));
};
$('btnFlt').onclick=()=>{
  if(!chCmd)return;
  if(confirm('Cambiar el filtro pone A y B a cero. ¿Continuar?'))chCmd.writeValue(Uint8Array.of(filterOn?3:2));
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
