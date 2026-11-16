// Planejamento de manejo: só deriva listas; não altera cadastros, OS ou autorizações.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CampoManejo=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 'use strict';
 const BASE=Date.UTC(2020,0,1),DAY=86400000;
 const number=v=>v===null||v===undefined||v===''?null:Number.isFinite(Number(v))?Number(v):null;
 const day=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s))?Math.floor((Date.parse(s+'T00:00:00Z')-BASE)/DAY):null;
 const iso=d=>d==null?'':new Date(BASE+d*DAY).toISOString().slice(0,10);
 const today=()=>{const p=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Rio_Branco',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());return ['year','month','day'].map(k=>p.find(x=>x.type===k).value).join('-');};
 const norm=v=>String(v??'').trim().toUpperCase();
 const trecho=v=>{const n=Number(String(v??'').replace(/^T/i,''));return [1,2,3].includes(n)?'T'+n:'';};
 function addMonths(d,n){if(d==null)return null;const a=new Date(BASE+d*DAY),dom=a.getUTCDate();a.setUTCDate(1);a.setUTCMonth(a.getUTCMonth()+n);const last=new Date(Date.UTC(a.getUTCFullYear(),a.getUTCMonth()+1,0)).getUTCDate();a.setUTCDate(Math.min(dom,last));return Math.floor((a-BASE)/DAY);}
 function build({trees=[],posts=[],keys=[],reference,date=today(),lead=60,months=6,urgent=30,observedCycle=false}){
  const now=day(date),ref=day(reference),byPost=new Map(posts.map(p=>[String(p.id),p])),byKey=new Map(keys.map(k=>[norm(k.chave),k])),linked=new Set();
  if(now==null||!Number.isFinite(now))throw Error('Data de referência inválida.');
  const decorate=(r,p={})=>{const k=byKey.get(norm(r.chave||p.chave))||{},tr=trecho(p.tr)||trecho(k.trecho),due=number(r.due),delta=due==null?null:due-now;return {...p,...r,trecho:tr,chave:r.chave||p.chave||'',alim:r.alim||p.alim||'',polo:r.polo||p.polo||'',conj:r.conj||p.conj||'',due,deadline:iso(due),days:delta,delay:delta==null?null:Math.max(0,-delta),status:delta==null?'Sem prazo calculável':delta<0?'Fora do prazo':delta<urgent?'Vence em breve':'No prazo',inspection:iso(r.inspectionDay),lastPrune:iso(number(r.pruneDay)==null?number(p.ult):number(p.ult)==null?number(r.pruneDay):Math.max(number(r.pruneDay),number(p.ult))),restriction:[p.lic?'Licença: '+p.lic:'',p.restr||''].filter(Boolean).join(' · '),osOpen:p.nAb||0,sourceDate:reference};};
  const out=trees.map(t=>{const p=byPost.get(String(t.poste))||{};if(t.poste!=null&&t.poste!=='')linked.add(String(t.poste));const touch=number(t.diasToque),last=number(t.ultPoda),historical=number(p.ult),stale=historical!=null&&historical>(last??-Infinity)&&ref!=null&&historical>ref;return decorate({...t,rowId:'tree:'+t.id,id:String(t.id),kind:'Árvore VERA',post:String(t.poste||''),quantity:1,estimated:false,due:ref!=null&&touch!=null&&!stale?ref+touch-lead:null,inspectionDay:number(t.lev),pruneDay:last,equipe:t.equipeIT||'A definir',basis:stale?'Poda posterior à referência: revisar previsão':touch==null||ref==null?'Sem previsão de crescimento':'Crescimento VERA; antecedência de '+lead+' dias'},p);});
  for(const p of posts){if(linked.has(String(p.id)))continue;const touch=number(p.toque),base=number(p.base),last=number(p.ult),cycle=observedCycle?number(p.ciclo):null,observed=last!=null&&cycle>0,validTouch=touch!=null&&!(ref!=null&&last!=null&&last>ref),due=validTouch?touch-lead:observed?last+Math.round(cycle):base!=null?addMonths(base,months):null;out.push(decorate({rowId:'post:'+p.id,id:String(p.id),post:String(p.id),kind:'Poste do histórico',quantity:number(p.arvE)>0?Math.ceil(number(p.arvE)):null,estimated:true,due,inspectionDay:null,pruneDay:number(p.ult),equipe:'A definir em campo',cycleDays:observed?Math.round(cycle):null,basis:validTouch?'Previsão VERA agregada no poste':observed?Math.round(cycle)+' dias de ciclo histórico após a última poda':base!=null?months+' meses após '+(p.baseF||'data-base'):'Sem data-base',especie:'A conferir em campo'},p));}
  const rank={'CRÍTICO':0,'ALTO':1,'MÉDIO':2,'BAIXO':3};
  return out.sort((a,b)=>(a.days==null?2:a.days<0?0:1)-(b.days==null?2:b.days<0?0:1)||(rank[a.classe]??4)-(rank[b.classe]??4)||(a.due??Infinity)-(b.due??Infinity)||a.trecho.localeCompare(b.trecho)||a.rowId.localeCompare(b.rowId));
 }
 function workday(start,offset){let d=start;while([0,6].includes(new Date(BASE+d*DAY).getUTCDay()))d++;const weekday=new Date(BASE+d*DAY).getUTCDay();return d+offset+Math.floor((weekday-1+offset)/5)*2;}
 function schedule(rows,{start=today(),inspectors=1,target=100,pruning=0}={}){
  const first=day(start),rate=number(inspectors)*number(target),poda=number(pruning)||0;if(first==null||!Number.isFinite(first)||rate<=0)throw Error('Informe início, inspetores e meta diária válidos.');let inspected=0,pruned=0;
  return rows.map(r=>{const q=number(r.quantity);let inspectDate='',pruneDate='';if(q>0){inspected+=q;inspectDate=iso(workday(first,Math.ceil(inspected/rate)-1));if(r.due!=null&&poda>0){pruned+=q;pruneDate=iso(workday(first,Math.ceil(pruned/poda)-1));}}return {...r,inspectDate,pruneDate,afterDeadline:pruneDate&&day(pruneDate)>r.due?'Após a data-limite':pruneDate?'Até a data-limite':'Sem programação de poda'};});
 }
 function csv(cols,rows){const cell=v=>{let s=String(v??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};return '\uFEFF'+[cols.map(c=>cell(c[0])).join(';'),...rows.map(r=>cols.map(c=>cell(typeof c[1]==='function'?c[1](r):r[c[1]])).join(';'))].join('\r\n');}
 return {build,schedule,csv,today,day,iso,addMonths};
});
