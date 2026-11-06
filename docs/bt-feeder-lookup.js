'use strict';
(function(root){
 const feederPattern=/^[A-Z]{3}-[0-9]{2}[A-Z][0-9]$/,cacheName='campo-private-network-v1',endpoint=new URL('/api/network/bt-feeders',root.location?.href||'https://campo.invalid/').href;
 let byBlock={},byId={},meta=null,loading=null;
 const key=name=>String(name).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]/g,'').toLowerCase();
 function values(properties){const out={};for(const [name,value]of Object.entries(properties||{}))out[key(name)]=value;return out;}
 function isBt(properties){const p=values(properties),value=String(p.class||p.classe||p.tiporede||p.layer||'').toUpperCase();return value.includes('BT');}
 function isFeeder(value){return feederPattern.test(String(value||'').trim().toUpperCase());}
 function validMap(value,limit){if(!value||typeof value!=='object'||Array.isArray(value))return null;const entries=Object.entries(value);if(entries.length>limit||entries.some(([k,v])=>!k||k.length>80||!isFeeder(v)))return null;return Object.fromEntries(entries.map(([k,v])=>[String(k).trim().toUpperCase(),String(v).trim().toUpperCase()]));}
 function hydrate(data){const blocks=validMap(data?.byBlock,15000),ids=validMap(data?.byId,1000);if(!blocks||!ids)return false;byBlock=blocks;byId=ids;meta=data.meta&&typeof data.meta==='object'?Object.freeze({...data.meta}):null;return true;}
 async function load(force=false){if(loading&&!force)return loading;loading=(async()=>{let response=null;try{response=await fetch(endpoint,{cache:'no-store',credentials:'same-origin'});if(response.ok&&root.caches){const cache=await caches.open(cacheName);await cache.put(endpoint,response.clone());}}catch{}if((!response||!response.ok)&&root.caches)response=await (await caches.open(cacheName)).match(endpoint)||null;if(!response?.ok)return false;let data;try{data=await response.json();}catch{return false;}return hydrate(data);})();try{return await loading;}finally{loading=null;}}
 function lookup(properties){if(!isBt(properties))return null;const p=values(properties),id=String(p.id||p.idvao||p.vao||'').trim().toUpperCase(),block=String(p.namebloco||'').trim().toUpperCase();return byId[id]||byBlock[block]||null;}
 const api={lookup,isFeeder,hydrate,refresh:()=>load(true),ready:load(),get meta(){return meta;}};
 root.CampoBtFeeder=api;
 if(typeof root.addEventListener==='function')root.addEventListener('campo-account-changed',()=>{if(root.CampoAccount?.verified?.())void api.refresh();});
 if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
