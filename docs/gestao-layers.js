'use strict';
// Catálogo do painel de gestão: grupos, cores e escala das camadas, no espírito do QGIS.
// O GPKG continua só no navegador de quem o abriu; camadas com dados pessoais nem são indexadas por padrão.
(()=>{
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const GROUPS=[['rede','Rede elétrica'],['postes','Postes e estruturas'],['equip','Equipamentos'],['terr','Território e ambiental'],['sens','Consumidores, faturamento e projetos'],['outros','Outras camadas']];
 const line=(color,weight=2.3)=>({color,weight}),dot=(color,fillColor,radius=7)=>({color,fillColor,radius,weight:1.4,fillOpacity:1}),area=color=>({color,weight:1.5,fill:false});
 // [nome, grupo, classe, zoom mínimo, visível ao abrir, indexar por padrão, dado pessoal, estilo, forma]
 const RULES=[
  [/vaos?_?at\b|vaos_at/i,'rede','AT',0,true,true,false,line('#c64f95',2.6)],
  [/vaos?_?mt\b|vaos_mt/i,'rede','MT',0,true,true,false,line('#33d4c1')],
  [/bt_?secund/i,'rede','BT',14,true,true,false,line('#01ff51',1.8)],
  [/bt_?servi/i,'rede','BT',17,false,false,false,line('#7fbf63',1.2)],
  [/bt_?ilumina/i,'rede','BT',16,false,false,false,line('#e8d44d',1.2)],
  [/torres/i,'postes','POSTE',11,true,true,false,dot('#3a0f33','#c64f95',6)],
  [/postes?_?transmiss/i,'postes','POSTE',12,true,true,false,dot('#3a0f33','#d98cc0',6)],
  [/postes?_?ornamen/i,'postes','POSTE',16,false,false,false,dot('#555','#ccc',5)],
  [/13_?postes|^postes?$/i,'postes','POSTE',15,true,true,false,dot('#000','#fff',7)],
  [/estrutura_?civil/i,'postes','POSTE',15,false,false,false,dot('#444','#a7a7a7',5)],
  [/\b10_ip\b/i,'postes','POSTE',17,false,false,false,dot('#6b5a00','#f2d94e',4)],
  [/transformador/i,'equip','EQUIPAMENTO',15,true,true,false,dot('#fff','#1f3a93',7),'square'],
  [/isolacao|chave/i,'equip','EQUIPAMENTO',15,true,true,false,dot('#fff','#111827',7),'square'],
  [/sentido/i,'equip','EQUIPAMENTO',16,false,false,false,line('#ffb54b',1.2)],
  [/regulador|regulacao/i,'equip','EQUIPAMENTO',15,true,true,false,dot('#fff','#0ea5b7',6),'square'],
  [/protecao/i,'equip','EQUIPAMENTO',15,true,true,false,dot('#fff','#7c2d12',6),'square'],
  [/tp_?tc/i,'equip','EQUIPAMENTO',15,false,true,false,dot('#fff','#475569',5),'square'],
  [/subestacao/i,'terr','REDE',0,true,true,false,area('#ff5c5c')],
  [/conjunto/i,'terr','REDE',0,false,true,false,area('#9a8cff')],
  [/municipios/i,'terr','REDE',0,true,true,false,area('#8a8a8a')],
  [/urbano_?rural/i,'terr','REDE',0,false,true,false,area('#b5a642')],
  [/regiao_?projeto/i,'terr','REDE',13,false,false,false,area('#7aa7c7')],
  [/licen/i,'terr','REDE',0,false,true,false,area('#3fae6b')],
  [/terras_?indigenas/i,'terr','REDE',0,false,true,false,area('#c47a35')],
  [/unidades_?conservacao/i,'terr','REDE',0,false,true,false,area('#2f8f5b')],
  [/embargos/i,'sens','REDE',0,false,false,true,area('#d44')],
  [/consumidor|ponto_?entrega|leituras|faturamento|book/i,'sens','REDE',16,false,false,true,dot('#444','#e0e0e0',4)]
 ];
 const plain=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'');
 const rule=name=>RULES.find(r=>r[0].test(plain(name)));
 const info=name=>{const r=rule(name);return r?{group:r[1],classification:r[2],minZoom:r[3],visible:r[4],index:r[5],personal:r[6],style:r[7],shape:r[8]}:{group:'outros',classification:'REDE',minZoom:14,visible:false,index:false,personal:false,style:line('#886b42',1.6)};};
 const pick=(columns,re)=>(columns||[]).find(c=>re.test(c))||'';
 // Perfis do app de campo (Rede_Campo) têm prioridade; os demais recebem o estilo do catálogo.
 function prepare(l){const i=info(l.table_name),columns=l.columns||[],span=['MT','BT','AT'].includes(i.classification),base=l.profile||{style:i.style,shape:i.shape,labels:[pick(columns,/^name$/i)||pick(columns,/^nome$/i)||pick(columns,/^id$/i)].filter(Boolean),categoryField:'',categories:{}};const mapping=base.mapping||{feeder:pick(columns,/^alimentador$/i)||pick(columns,/alimentador|feeder/i),pole:i.classification==='POSTE'?pick(columns,/^id$/i):'',span:span?pick(columns,/^id$/i):'',voltage:pick(columns,/tens[aã]o/i)};return {...l,classification:base.classification||i.classification,mapping,profile:{...base,classification:base.classification||i.classification,mapping}};}
 const label=n=>Number(n||0).toLocaleString('pt-BR');
 // Pergunta só quando a base é pesada ou tem dados pessoais; a Rede_Campo do Drive continua direta.
 function choose(layers){const heavy=layers.reduce((n,l)=>n+Number(l.count||0),0)>300000,personal=layers.some(l=>info(l.table_name).personal);if(!heavy&&!personal)return Promise.resolve(layers);const dialog=document.getElementById('layerChoiceDialog');if(!dialog)return Promise.resolve(layers.filter(l=>info(l.table_name).index));const list=document.getElementById('layerChoiceList'),total=document.getElementById('layerChoiceTotal');list.innerHTML=GROUPS.map(([id,name])=>{const items=layers.filter(l=>info(l.table_name).group===id);if(!items.length)return '';return '<fieldset class="layer-choice"><legend>'+esc(name)+'</legend>'+items.map(l=>{const i=info(l.table_name);return '<label class="map-check"><input type="checkbox" data-choice="'+esc(l.table_name)+'" '+(i.index?'checked':'')+'> <span>'+esc(l.table_name)+' <small>'+label(l.count)+(i.personal?' · dados pessoais':'')+'</small></span></label>';}).join('')+'</fieldset>';}).join('');const sum=()=>{const on=new Set([...list.querySelectorAll('[data-choice]:checked')].map(b=>b.dataset.choice));total.textContent=label(layers.filter(l=>on.has(l.table_name)).reduce((n,l)=>n+Number(l.count||0),0))+' feições para indexar neste PC. Acima de 1,5 milhão a preparação fica bem mais demorada.';};list.onchange=sum;sum();return new Promise(resolve=>{let answered=false;const done=value=>{if(answered)return;answered=true;resolve(value);if(dialog.open)dialog.close();};document.getElementById('layerChoiceOk').onclick=()=>{const on=new Set([...list.querySelectorAll('[data-choice]:checked')].map(b=>b.dataset.choice)),chosen=layers.filter(l=>on.has(l.table_name));if(chosen.length)done(chosen);else total.textContent='Marque ao menos uma camada.';};document.getElementById('layerChoiceCancel').onclick=()=>done(null);dialog.oncancel=()=>done(null);dialog.showModal();});}
 function swatch(s){const fill=s?.fillColor||s?.color||'#888';return '<i class="layer-swatch'+(s?.fillColor?' dot':'')+'" style="background:'+esc(/^#[0-9a-f]{3,8}$/i.test(fill)?fill:'#888')+'"></i>';}
 function render(root,layers,visible,changed){root.innerHTML=GROUPS.map(([id,name])=>{const items=layers.filter(l=>info(l.table_name).group===id);if(!items.length)return '';const on=items.filter(l=>visible[l.table_name]).length;return '<details class="layer-group" '+(on||id==='rede'?'open':'')+'><summary><input type="checkbox" data-group="'+id+'" aria-label="Ligar ou desligar '+esc(name)+'" '+(on===items.length?'checked':'')+'> '+esc(name)+' <small>'+on+'/'+items.length+'</small></summary>'+items.map(l=>{const i=info(l.table_name);return '<label>'+'<input type="checkbox" data-layer="'+esc(l.table_name)+'" '+(visible[l.table_name]?'checked':'')+'> '+swatch(l.profile?.style)+'<span>'+esc(l.table_name)+(i.minZoom?' <small>zoom ≥ '+i.minZoom+'</small>':'')+'</span></label>';}).join('')+'</details>';}).join('');root.querySelectorAll('[data-layer]').forEach(b=>b.onchange=()=>{visible[b.dataset.layer]=b.checked;changed();});root.querySelectorAll('[data-group]').forEach(b=>{b.onclick=e=>e.stopPropagation();b.onchange=()=>{for(const l of layers)if(info(l.table_name).group===b.dataset.group)visible[l.table_name]=b.checked;render(root,layers,visible,changed);changed();};});}
 window.CampoGestaoLayers={prepare,choose,render,inScale:(name,zoom)=>zoom>=info(name).minZoom,defaultVisible:name=>info(name).visible||Boolean(rule(name)&&info(name).index&&info(name).group==='rede'),info};
})();
