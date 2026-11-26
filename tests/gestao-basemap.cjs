const fs=require('node:fs'),assert=require('node:assert/strict');
const {controller}=require('../docs/gestao-fundo.js');
const html=fs.readFileSync('docs/gestao.html','utf8');
assert.match(html,/<option value="local">Rede local · offline<\/option>/);

const layers=[];
let choice='hybrid',online=true,status='';
const backgrounds=controller({},{
 choice:()=>choice,online:()=>online,status:text=>{status=text;},
 layer:(url,options)=>{
  const tile={url,options,events:{},on(name,fn){this.events[name]=fn;},addTo(){},remove(){this.removed=true;},setZIndex(){}};
  layers.push(tile);return tile;
 }
});
const load=(layer,event,count)=>{for(let i=0;i<count;i++)layer.events[event]();};
(async()=>{
backgrounds.select();
assert.match(layers[0].url,/google\.com/);
load(layers[0],'tileerror',1);
load(layers[0],'tileload',3);
layers[0].events.load();
assert.equal(layers.length,1,'a partial tile failure does not change the background');
layers[0].events.loading();
load(layers[0],'tileerror',5);
layers[0].events.load();
assert.equal(layers.length,1,'tile event finishes before the active layer can be removed');
await Promise.resolve();
assert.equal(choice,'hybrid','fallback preserves the chosen map');
assert.match(layers[1].url,/arcgisonline/);
assert(!layers[0].removed,'previous tiles stay on screen during recovery');
load(layers[1],'tileload',2);layers[1].events.load();
assert(layers[0].removed);
assert.match(status,/satélite de reserva/);
online=false;backgrounds.select();
assert.equal(layers.length,2,'offline recovery does not request new tiles');
assert(!layers[1].removed);
online=true;backgrounds.select();
assert.match(layers[2].url,/google\.com/);
load(layers[2],'tileload',2);layers[2].events.load();
assert(layers[1].removed);
assert.equal(status,'');
choice='local';backgrounds.select();
assert(layers[2].removed);
console.log('PASS management basemap: partial failure tolerance, fallback retains map selection, reconnect restores hybrid, explicit local mode.');
})().catch(error=>{console.error(error);process.exitCode=1;});
