(function () {
  const TIMEOUT_MS = 6000;
  function ensureProtocol(url){ return /^https?:\/\//i.test(url) ? url : `https://${url}`; }
  function targetFrom(url){ try{ const u=new URL(ensureProtocol(url)); return `${u.origin}/favicon.ico?cb=${Date.now()}`;}catch{return null;} }
  function describeTarget(url){ const t=targetFrom(url); if(!t) return {origin:'—',url:'—'}; const u=new URL(t); return {origin:u.origin,url:t}; }
  async function pingOnce(url){
    const target = targetFrom(url);
    if (!target) return { ok:false, ms:null, target:null, error:'bad url' };
    const controller = new AbortController(); const t0 = performance.now();
    const timer = setTimeout(()=>controller.abort(), TIMEOUT_MS);
    try{
      await fetch(target,{method:'GET',mode:'no-cors',cache:'no-cache',signal:controller.signal});
      clearTimeout(timer); return { ok:true, ms:Math.round(performance.now()-t0), target };
    }catch{
      clearTimeout(timer); return { ok:false, ms:null, target, error:'unreachable' };
    }
  }
  window.PingBoard = window.PingBoard || {};
  window.PingBoard.Pinger = { pingOnce, describeTarget, ensureProtocol };
})();
