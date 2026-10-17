function showStartupError(error){
 console.error('Flight startup failed',error);
 const loading=document.querySelector('#loading');
 loading.classList.remove('done');
 loading.querySelector('b').textContent='起動中にエラーが発生しました';
 document.querySelector('#load-detail').textContent=error.message||'画面を再読み込みしてください。';
 const retry=document.querySelector('#retry');retry.hidden=false;retry.onclick=()=>location.reload();
}
import('./flight.js?v=flight-dpad-2').catch(showStartupError);
