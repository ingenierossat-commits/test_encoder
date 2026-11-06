const SERVICE='7b3e0001-5a1c-4f2e-9a10-3c0d1e2f4a50';
const LIVE='7b3e0002-5a1c-4f2e-9a10-3c0d1e2f4a50';
const CMD ='7b3e0004-5a1c-4f2e-9a10-3c0d1e2f4a50';
const CNT ='7b3e0005-5a1c-4f2e-9a10-3c0d1e2f4a50';
const TARGET_RPM=4;
const BTNS=['btnZero','m360','m1440','btnRele','rint','vTurns','vGo','vS'];

const $=id=>document.getElementById(id);
let dev=null, chCmd=null, wake=null;
let mode1440=false, filterUs=0, filterErr=false, releInit=false, turnsInit=false;
let seqSt=0, seqErr=0, turnsT=1, lastA=0, cycles=0;

function setEstado(t){$('estado').textContent=t}
function fmt(n){return n.toLocaleString('es-ES')}

if(!navigator.bluetooth){
  const w=$('warn');w.style.display='block';
  w.textContent='Este navegador no soporta Web Bluetooth. Usa Chrome en Android (en iPhone no funciona).';
  $('btnConn').disabled=true;
}

function setFb(dis){document.querySelectorAll('.fb').forEach(b=>b.disabled=dis)}

function paintMode(){
  $('m360').classList.toggle('act',!mode1440);
  $('m1440').classList.toggle('act',mode1440);
  $('flt').textContent=filterUs>0?(filterUs+' µs'):'OFF';
  document.querySelectorAll('.fb').forEach(b=>b.classList.toggle('act',parseInt(b.dataset.us,10)===filterUs));
  const n=$('fnote');
  if(filterErr){n.textContent='La placa ha RECHAZADO ese valor: filtro desactivado.';n.style.color='var(--bad)'}
  else{n.textContent='Máximo de la placa: 12 µs (1023 ciclos de APB a 80 MHz). Cambiarlo pone A y B a cero.';n.style.color='var(--dim)'}
}

const SEQ=['parado','buscando el imán (lenta)','rápida','lenta final, hasta el imán','FIN: parada en el imán','ERROR'];
const ERR=['','no encuentra el imán en 2 vueltas','el encoder no cuenta (3 s)','se pasó de la vuelta sin ver el imán'];
function paintSeq(){
  let t=SEQ[seqSt]||'?';
  if(seqSt===5)t='ERROR: '+(ERR[seqErr]||seqErr);
  if(seqSt===4){const o=turnsT*360;const dl=lastA-o;t+=' · A='+fmt(lastA)+' (objetivo '+fmt(o)+', Δ '+(dl>0?'+':'')+dl+')'}
  $('vseq').textContent=t;
  $('vseq').style.color=seqSt===5?'var(--bad)':(seqSt===4?'var(--ok)':'');
  $('vcyc').textContent=cycles;
}

function onLive(e){
  const d=e.target.value;
  const rpm=d.getUint16(0,true)/100, fl=d.getUint16(2,true);
  const ri=d.getUint16(4,true), rc=d.getUint16(6,true);
  const m=!!(fl&1), ra=!!(fl&4), fe=!!(fl&8);
  const fu=d.getUint16(8,true);
  if(m!==mode1440||fu!==filterUs||fe!==filterErr){mode1440=m;filterUs=fu;filterErr=fe;paintMode()}
  const v1=!!(fl&16), v2=!!(fl&32);
  $('vfast').classList.toggle('on',v1&&!v2);
  $('vslow').classList.toggle('on',v1&&v2);
  $('vdet').classList.toggle('on',!!(fl&64));
  if(d.byteLength>=16){
    turnsT=d.getUint16(10,true);const sq=d.getUint16(12,true);
    seqSt=sq&255;seqErr=sq>>8;cycles=d.getUint16(14,true);
    if(!turnsInit){$('vTurns').value=turnsT;turnsInit=true}
    paintSeq();
  }
  $('vst').textContent=!v1?'STOP':(v2?'LENTA':'RÁPIDA');
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
  lastA=a;
  if(seqSt===4)paintSeq();
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
    releInit=false;turnsInit=false;
    await chLive.startNotifications();
    await chCnt.startNotifications();
    setEstado('Conectado: '+dev.name);
    $('btnConn').textContent='Desconectar';
    BTNS.forEach(i=>$(i).disabled=false);
    setFb(false);
    try{wake=await navigator.wakeLock.request('screen')}catch(_){}
  }catch(err){
    setEstado('Error: '+err.message);
  }
}

function onDesc(){
  setEstado('Desconectado (la placa sigue contando)');
  $('btnConn').textContent='Conectar';
  BTNS.forEach(i=>$(i).disabled=true);
  setFb(true);
  if(wake){wake.release();wake=null}
}

$('btnConn').onclick=()=>{
  if(dev&&dev.gatt.connected){dev.gatt.disconnect()}else{conectar()}
};
$('btnZero').onclick=()=>{
  if(!chCmd)return;
  if(confirm('¿Poner A y B a cero?'))chCmd.writeValue(Uint8Array.of(1));
};
document.querySelectorAll('.fb').forEach(b=>{
  b.onclick=()=>{
    if(!chCmd)return;
    const us=parseInt(b.dataset.us,10);
    if(confirm('Cambiar el filtro pone A y B a cero. ¿Continuar?'))chCmd.writeValue(Uint8Array.of(7,us&255,(us>>8)&255));
  };
});
$('vGo').onclick=()=>{
  if(!chCmd)return;
  let n=parseInt($('vTurns').value,10);
  if(isNaN(n)||n<1)n=1;
  if(n>1000)n=1000;
  $('vTurns').value=n;
  chCmd.writeValue(Uint8Array.of(11,n&255,n>>8));
};
$('vS').onclick=()=>{if(chCmd)chCmd.writeValue(Uint8Array.of(8))};
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
