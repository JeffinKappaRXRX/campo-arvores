const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('docs/gestao-map.js','utf8'),html=fs.readFileSync('docs/gestao.html','utf8');
const start=source.indexOf(' function setTiles('),end=source.indexOf(' function appendParams(',start);
assert(start>=0&&end>start,'setTiles must remain available in the management map');
assert.match(html,/<option value="local">Rede local · offline<\/option>/,'management offers the same offline local-map choice as field inspection');

const nodes={basemap:{value:'hybrid'},networkStatus:{textContent:''}},created=[],removed=[];
const map={removeLayer:layer=>removed.push(layer)};
const L={tileLayer(url,options){const handlers={};const layer={url,options,handlers,on(name,fn){handlers[name]=fn;return this;},addTo(target){this.target=target;return this;}};created.push(layer);return layer;}};
const navigator={onLine:true};
const context=vm.createContext({map,L,navigator,$:id=>nodes[id],status:text=>nodes.networkStatus.textContent=text,tiles:null});
vm.runInContext(source.slice(start,end),context);

context.setTiles();
assert.equal(created.length,1);
assert.match(created[0].url,/google\.com/);
created[0].handlers.tileerror();created[0].handlers.tileerror();
assert.equal(nodes.basemap.value,'hybrid','isolated tile failures do not discard the selected background');
created[0].handlers.tileerror();
assert.equal(nodes.basemap.value,'local','repeated online failures fall back to the local network');
assert.equal(context.tiles,null);
assert.match(nodes.networkStatus.textContent,/rede local ativada/i);

nodes.basemap.value='streets';navigator.onLine=false;context.setTiles();
assert.equal(nodes.basemap.value,'local','offline startup selects the local network immediately');
assert.equal(created.length,1,'offline mode does not create a failing online tile layer');
assert(removed.includes(created[0]));
console.log('PASS management basemap: local offline option, immediate offline fallback and repeated tile-error fallback.');
