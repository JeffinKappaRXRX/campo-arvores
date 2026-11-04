// Telas de manutenção, orçamento e parque dentro do painel de gestão.
// A central roda num quadro da mesma origem: as abas do painel e os filtros de cada tela não se misturam.
(()=>{'use strict';
 const P='#c-',$=id=>document.getElementById(id),area=$('areaCentral'),quadro=$('quadroCentral'),work=$('workspace'),menus=[...document.querySelectorAll('.rail-menu')],modulos=[...document.querySelectorAll('.gestao-modulos a')],itens=[...document.querySelectorAll('.rail nav:not(.modulos) a')];
 let carregado=false,ligado=false,modulo='poda';
 const nome=()=>location.hash.startsWith(P)?location.hash.slice(P.length):'';
 function marca(){const h=location.hash||'#resumo',item=itens.find(a=>a.getAttribute('href')===h),grupo=item?.closest('.rail-menu')?.dataset.mod.split(' ')||[];if(grupo.length&&!grupo.includes(modulo))modulo=grupo[0];menus.forEach(m=>{m.hidden=!m.dataset.mod.split(' ').includes(modulo);});modulos.forEach(a=>a.classList.toggle('active',a.dataset.modulo===modulo));itens.forEach(a=>a.classList.toggle('active',a===item));const nav=item?.closest('nav');if(nav&&nav.scrollWidth>nav.clientWidth)nav.scrollLeft=item.offsetLeft-nav.offsetLeft-20;}
 function aplica(){const n=nome(),liberado=!work.hidden,on=Boolean(n&&liberado),voltou=ligado&&!on;ligado=on;document.body.classList.toggle('central-on',on);area.hidden=!on;
  if(on){if(!carregado){quadro.src='central.html?embed=1#'+n;carregado=true;}else if(quadro.contentWindow.location.hash!=='#'+n)quadro.contentWindow.location.replace(quadro.contentWindow.location.href.split('#')[0]+'#'+n);}
  // Sem sessão, nada da central fica carregado na página.
  if(!liberado&&carregado){quadro.src='about:blank';carregado=false;}
  if(voltou&&liberado){dispatchEvent(new Event('resize'));$(location.hash.slice(1))?.scrollIntoView();}
  marca();}
 addEventListener('hashchange',aplica);
 new MutationObserver(aplica).observe(work,{attributes:true,attributeFilter:['hidden']});
 // Link interno de uma tela da central: o endereço do painel acompanha.
 addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==quadro.contentWindow||e.data?.tipo!=='central-vista')return;const h=P+e.data.nome;if(location.hash!==h)history.replaceState(null,'',h);marca();});
 addEventListener('storage',e=>{if(e.key==='campo-theme')document.documentElement.classList.toggle('dark',e.newValue==='dark');});
 aplica();
})();
