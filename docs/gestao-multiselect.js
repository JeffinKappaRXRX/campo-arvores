'use strict';

const GestaoMulti = (() => {
 const collator=new Intl.Collator('pt-BR',{numeric:true,sensitivity:'base'});
 const searchKey=value=>String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
 const selected=select=>[...select.selectedOptions].map(option=>option.value).filter(Boolean);
 const controls=new WeakMap();
 let bound=false;
 function mount(select,label) {
  if(controls.has(select))return controls.get(select);
  if(!bound){
   document.addEventListener('click',e=>document.querySelectorAll('details.gestao-multi[open]').forEach(menu=>{
    if(!menu.contains(e.target))menu.open=false;
   }));
   bound=true;
  }
  select.multiple=true;
  select.hidden=true;
  const menu=document.createElement('details');
  menu.className='msel gestao-multi';
  menu.innerHTML='<summary>Todos</summary><div class="msel-pop"><input type="search" placeholder="Buscar" autocomplete="off"><div class="msel-acoes"><button type="button" data-all>Marcar visíveis</button><button type="button" data-clear>Limpar</button></div><div class="msel-lista"></div></div>';
  const container=select.parentElement;
  if(container?.tagName==='LABEL'){
   const wrapper=document.createElement('div'), caption=document.createElement('span');
   wrapper.className='msel-campo gestao-multi-field';
   wrapper.dataset.filter=select.id||select.name;
   caption.textContent=label;
   container.replaceWith(wrapper);wrapper.append(caption,select,menu);
  }else select.after(menu);
  const title=menu.querySelector('summary'), query=menu.querySelector('input'), list=menu.querySelector('.msel-lista');
  query.setAttribute('aria-label','Buscar em '+label);
  function filter(){
   const text=searchKey(query.value.trim());
   for(const item of list.children)item.hidden=!searchKey(item.textContent).includes(text);
  }
  function paint(){
   const values=selected(select);
   title.textContent=values.length===0?'Todos':values.length===1?[...select.selectedOptions].find(x=>x.value)?.textContent:values.length+' selecionados';
   const marked=new Set(values);
   for(const input of list.querySelectorAll('input'))input.checked=marked.has(input.value);
  }
  function changed(){
   paint();
   select.dispatchEvent(new Event('change',{bubbles:true}));
  }
  list.addEventListener('change',event=>{
   event.stopPropagation();
   const option=[...select.options].find(x=>x.value===event.target.value);
   if(option){option.selected=event.target.checked;changed();}
  });
  menu.querySelector('[data-all]').onclick=()=>{
   const shown=new Set([...list.children].filter(x=>!x.hidden).map(x=>x.firstChild.value));
   for(const option of select.options)if(shown.has(option.value))option.selected=true;
   changed();
  };
  menu.querySelector('[data-clear]').onclick=()=>{for(const option of select.options)option.selected=false;changed();};
  query.oninput=filter;
  menu.addEventListener('keydown',event=>{if(event.key==='Escape'){menu.open=false;title.focus();event.stopPropagation();}});
  menu.addEventListener('toggle',()=>{
   if(!menu.open)return;
   const pop=menu.querySelector('.msel-pop'); pop.classList.remove('align-end');
   if(pop.getBoundingClientRect().right>window.innerWidth-12)pop.classList.add('align-end');
   query.focus();
  });
  select.addEventListener('change',paint);
  const control={set(pairs,values=selected(select)){
   const token=JSON.stringify(pairs);
   if(list.dataset.values!==token){
    list.dataset.values=token;
    const options=document.createDocumentFragment(),checks=document.createDocumentFragment();
    options.append(new Option('Todos',''));
    const seen=new Set(values);
    for(const [value,caption] of pairs){
     if(!value)continue;
     options.append(new Option(caption,value,false,seen.has(String(value))));
     const item=document.createElement('label'),input=document.createElement('input'),text=document.createElement('span');
     input.type='checkbox';input.value=value;text.textContent=caption;
     item.append(input,text);checks.append(item);
    }
    select.replaceChildren(options);list.replaceChildren(checks);filter();
   }else{
    const wanted=new Set(values.map(String));
    for(const option of select.options)option.selected=wanted.has(option.value);
   }
   menu.hidden=select.disabled;
   paint();
  }};
  controls.set(select,control);
  control.set([...select.options].filter(x=>x.value).map(x=>[x.value,x.textContent]));
  return control;
 }
 const pairs=values=>[...new Set(values.filter(Boolean).map(String))].sort(collator.compare).map(value=>[value,value]);
 return {mount,selected,pairs};
})();
