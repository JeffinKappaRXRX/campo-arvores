'use strict';
(()=>{
 const radius=6371000, radians=Math.PI/180;
 const number=value=>{
  if(typeof value==='number')return value;
  if(typeof value!=='string'||!value.trim())return NaN;
  return Number(value.trim().replace(',','.'));
 };
 function index(trees){
  const byCoordinate=new Map(),invalid=[];
  for(const tree of trees){
   const lat=number(tree.lat),lon=number(tree.lon);
   if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180||(!lat&&!lon)){
    invalid.push(tree);
    continue;
   }
   const key=lat+':'+lon;
   if(!byCoordinate.has(key)){
    const phi=lat*radians,lambda=lon*radians;
    const horizontal=radius*Math.cos(phi);
    byCoordinate.set(key,{lat,lon,trees:[],xyz:[horizontal*Math.cos(lambda),horizontal*Math.sin(lambda),radius*Math.sin(phi)]});
   }
   byCoordinate.get(key).trees.push(tree);
  }
  return {points:[...byCoordinate.values()],invalid};
 }
 function nearby(points,limit){
  if(limit<=0)return [];
  const grid=new Map(),pairs=[];
  for(const point of points){
   const [x,y,z]=point.xyz.map(value=>Math.floor(value/limit));
   for(let i=x-1;i<=x+1;i++)for(let j=y-1;j<=y+1;j++)for(let k=z-1;k<=z+1;k++){
    for(const other of grid.get(i+':'+j+':'+k)||[]){
     const chord=Math.hypot(...point.xyz.map((value,axis)=>value-other.xyz[axis]));
     const distance=2*radius*Math.asin(chord/(2*radius));
     if(distance<=limit)pairs.push({points:[other,point],distance});
    }
   }
   const key=x+':'+y+':'+z;
   if(!grid.has(key))grid.set(key,[]);
   grid.get(key).push(point);
  }
  return pairs.sort((a,b)=>a.distance-b.distance);
 }
 if(typeof module!=='undefined'){module.exports={index,nearby};return;}

 const $=id=>document.getElementById(id),panel=$('coordinateAudit');
 const refresh=$('coordinateAuditRefresh'),status=$('coordinateAuditStatus'),body=$('coordinateAuditRows');
 const updatedLabel=$('coordinateAuditUpdated'),clock=updatedLabel.querySelector('time');
 const previous=$('coordinateAuditPrevious'),next=$('coordinateAuditNext'),pageLabel=$('coordinateAuditPage');
 const fmt=value=>value.toLocaleString('pt-BR'),distanceFmt=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:3});
 const coordinateFmt=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:12,useGrouping:false});
 const stamp=new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit',timeZone:'America/Rio_Branco'});
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const normalize=value=>String(value??'').normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('pt-BR');
 const pageSize=25;
 let data=null,pairs=[],page=0,generation=0,signature='',actions=[],summary='';
 const allowed=()=>window.CampoControl?.authorized();
 function action(label,run){
  return '<button type="button" data-coordinate-action="'+(actions.push(run)-1)+'">'+label+'</button>';
 }
 function record(tree){
  const fields=[tree.origem,tree.alimentador,tree.poste&&'Poste '+tree.poste,tree.vao&&'Vão '+tree.vao,tree.data].filter(Boolean);
  return '<div><strong>'+esc(tree.id)+'</strong> · '+esc(tree.especies||'Espécie a identificar')+
   '<small>'+esc(fields.join(' · '))+'</small>'+
   action('Abrir ficha',()=>window.CampoParque.openTree(tree.id,tree))+'</div>';
 }
 function pointCell(point,letter){
  const location=[point.lat,point.lon].map(value=>coordinateFmt.format(value)).join(' / ');
  const details=point.trees.length===1?record(point.trees[0]):
   '<details><summary>'+fmt(point.trees.length)+' cadastros</summary>'+point.trees.map(record).join('')+'</details>';
  return '<strong>'+letter+' · '+location+'</strong>'+details;
 }
 function paint(){
  if(!data)return;
  const query=normalize($('coordinateAuditSearch').value.trim());
  const type=$('coordinateAuditType').value;
  const matches=tree=>!query||[tree.id,tree.especies,tree.alimentador,tree.poste,tree.vao,tree.origem].some(value=>normalize(value).includes(query));
  const matchesPoint=point=>point.trees.some(matches);
  const identical=data.points.filter(point=>point.trees.length>1&&matchesPoint(point))
   .sort((a,b)=>b.trees.length-a.trees.length).map(point=>({points:[point],distance:0}));
  const different=pairs.filter(pair=>pair.points.some(matchesPoint));
  const invalid=data.invalid.filter(matches).map(tree=>({tree}));
  const rows=[...(!type||type==='identical'?identical:[]),...(!type||type==='nearby'?different:[]),...(!type||type==='invalid'?invalid:[])];
  const pages=Math.max(1,Math.ceil(rows.length/pageSize));
  page=Math.min(page,pages-1);
  actions=[];
  body.innerHTML=rows.slice(page*pageSize,(page+1)*pageSize).map(row=>{
   if(row.tree){
    const {lat,lon}=row.tree;
    return '<tr><td>Ausente ou inválida</td><td>—</td><td><strong>'+esc(lat??'—')+' / '+esc(lon??'—')+
     '</strong>'+record(row.tree)+'</td><td>—</td><td></td></tr>';
   }
   const [a,b]=row.points,kind=b?'Pontos distintos próximos':'Coordenadas iguais';
   const distance=row.distance>0&&row.distance<.001?'< 0,001':distanceFmt.format(row.distance);
   return '<tr><td>'+kind+'</td><td>'+esc(distance)+' m</td><td>'+pointCell(a,'A')+
    '</td><td>'+(b?pointCell(b,'B'):'—')+'</td><td>'+
    action('Ver no mapa',()=>window.CampoControlMap?.locateAudit(row.points))+'</td></tr>';
  }).join('')||'<tr><td colspan="5">Nenhuma ocorrência neste filtro.</td></tr>';
  summary=fmt(data.total)+' cadastros no parque · '+fmt(identical.length)+' coordenadas repetidas · '+
   fmt(different.length)+' pares próximos · '+fmt(invalid.length)+' cadastros com coordenada ausente ou inválida';
  status.textContent=summary;
  previous.disabled=page===0;
  next.disabled=page===pages-1;
  pageLabel.textContent='Página '+fmt(page+1)+' de '+fmt(pages);
 }
 function setRadius(){
  if(data)pairs=nearby(data.points,Number($('coordinateAuditRadius').value));
  page=0;
  paint();
 }
 async function load(){
  if(!panel.open||!allowed()||refresh.disabled)return;
  const serial=generation;
  refresh.disabled=true;
  if(!data)status.textContent='Consultando coordenadas do parque…';
  try{
   const trees=await window.CampoParque.readCurrentTrees();
   if(serial!==generation||!allowed())return;
   const snapshot=JSON.stringify(trees.map(t=>[t.id,t.lat,t.lon,t.especies,t.origem,t.alimentador,t.poste,t.vao,t.data]));
   const now=new Date();
   clock.dateTime=now.toISOString();
   clock.textContent=stamp.format(now);
   updatedLabel.hidden=false;
   if(!data||snapshot!==signature){
    signature=snapshot;
    data={...index(trees),total:trees.length};
    pairs=nearby(data.points,Number($('coordinateAuditRadius').value));
    paint();
   }else if(status.textContent!==summary)status.textContent=summary;
  }catch(error){
   if(serial===generation)status.textContent='Falha ao consultar o parque. '+(data?'Exibindo a última consulta. ':'')+error.message;
  }finally{
   if(serial===generation)refresh.disabled=false;
  }
 }
 body.addEventListener('click',event=>{
  const control=event.target.closest('[data-coordinate-action]');
  if(control&&allowed())actions[Number(control.dataset.coordinateAction)]?.();
 });
 panel.addEventListener('toggle',()=>void load());
 refresh.onclick=()=>void load();
 $('coordinateAuditRadius').onchange=setRadius;
 $('coordinateAuditType').onchange=$('coordinateAuditSearch').oninput=()=>{page=0;paint();};
 previous.onclick=()=>{page--;paint();};
 next.onclick=()=>{page++;paint();};
 window.addEventListener('campo-control-logout',()=>{
  generation++;
  panel.open=false;
  refresh.disabled=false;
  data=null;
  pairs=[];
  actions=[];
  signature='';
  summary='';
  updatedLabel.hidden=true;
  page=0;
  body.replaceChildren();
  status.textContent='';
  pageLabel.textContent='';
  previous.disabled=next.disabled=true;
 });
 setInterval(()=>{
  const bounds=panel.getBoundingClientRect();
  if(!document.hidden&&navigator.onLine&&bounds.height&&bounds.bottom>0&&bounds.top<innerHeight)void load();
 },60000);
})();
