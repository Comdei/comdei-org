/* Medição de visitas (PostHog, região EU) com aviso de cookies.
   Sem aceite: persistence 'memory' (nada no navegador além da escolha, se houver).
   Com aceite: cookie/localStorage do próprio comdei.org para reconhecer visitas repetidas.
   Propriedade derivada 'origem' (instagram/facebook/whatsapp/google/outro_site/direto). */
!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="capture register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset identify".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);

(function(){
  var KEY='comdei_consent'; // 'yes' | 'no' (gravado só depois da escolha)
  function getC(){try{return localStorage.getItem(KEY)}catch(e){return null}}
  function setC(v){try{localStorage.setItem(KEY,v)}catch(e){}}
  // Origem: Instagram por referrer ou pelo navegador interno do app.
  var ref=document.referrer||'', ua=navigator.userAgent||'';
  var q=new URLSearchParams(location.search);
  var origem='direto';
  if(/(^|\.)instagram\.com|android-app:\/\/com\.instagram/i.test(ref)||/Instagram/i.test(ua)||/instagram/i.test(q.get('utm_source')||'')) origem='instagram';
  else if(/facebook\.com|android-app:\/\/com\.facebook|FBAN|FBAV/i.test(ref+' '+ua)) origem='facebook';
  else if(/whatsapp/i.test(ref+' '+ua)) origem='whatsapp';
  else if(/google\./i.test(ref)) origem='google';
  else if(ref && ref.indexOf(location.host)<0) origem='outro_site';
  var c=getC();
  posthog.init('phc_ueMhpAvHLJfbrvLEdFDaqZZVFcA5kdiYf65fHyNY2zee',{
    api_host:'https://eu.i.posthog.com',
    persistence: c==='yes'?'localStorage+cookie':'memory',
    person_profiles: c==='yes'?'identified_only':'never',
    autocapture:false, capture_pageview:true, capture_pageleave:false,
    disable_session_recording:true, disable_surveys:true, advanced_disable_flags:true,
    loaded:function(ph){ph.register({origem:origem, in_app_instagram:/Instagram/i.test(ua), consentimento:c||'pendente'});}
  });
  if(c) return;
  function banner(){
    var d=document.createElement('div');d.id='cc-banner';d.setAttribute('role','dialog');d.setAttribute('aria-label','Aviso de cookies');
    d.style.cssText='position:fixed;left:12px;right:12px;bottom:12px;z-index:9999;max-width:640px;margin:0 auto;background:#1f2a24;color:#fff;padding:14px 16px;border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.25);font:15px/1.4 system-ui,sans-serif';
    d.innerHTML='Usamos medição de visitas anônima e, se você aceitar, um cookie para reconhecer visitas repetidas. Veja a <a href="/privacidade" style="color:#f3d27a">privacidade</a>.<div style="margin-top:10px;display:flex;gap:8px;justify-content:flex-end"><button id="cc-no" style="padding:8px 14px;border-radius:8px;border:1px solid #fff;background:transparent;color:#fff;cursor:pointer">Recusar</button><button id="cc-yes" style="padding:8px 14px;border-radius:8px;border:0;background:#f3d27a;color:#1f2a24;font-weight:600;cursor:pointer">Aceitar</button></div>';
    document.body.appendChild(d);
    document.getElementById('cc-yes').onclick=function(){setC('yes');posthog.set_config({persistence:'localStorage+cookie',person_profiles:'identified_only'});posthog.register({consentimento:'yes'});posthog.capture('consentimento',{escolha:'yes'});d.remove();};
    document.getElementById('cc-no').onclick=function(){setC('no');posthog.register({consentimento:'no'});d.remove();};
  }
  if(document.body) banner(); else document.addEventListener('DOMContentLoaded',banner);
})();
