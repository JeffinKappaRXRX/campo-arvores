const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {JSDOM}=require('jsdom');

const dom=new JSDOM(fs.readFileSync('docs/gestao.html','utf8'),{runScripts:'outside-only',url:'https://mapeamento-arvores.pages.dev/gestao.html'});
const w=dom.window,$=id=>w.document.getElementById(id),canvas=$('controlMap'),markers=[],links=[];
let online=true,available=true,dragged=false;
Object.defineProperty(w.navigator,'onLine',{get:()=>online});
canvas.getBoundingClientRect=()=>({left:50,top:50,width:500,height:400});
w.HTMLAnchorElement.prototype.click=function(){links.push(this.href);};
w.CampoControl={authorized:()=>true};
const map={
 getContainer:()=>canvas,dragging:{moved:()=>dragged},
 mouseEventToLatLng:event=>({lat:event.clientY/100-12,lng:event.clientX/100-70})
};
w.CampoControlMap={onAvailable:attach=>attach(map),canPlacePoint:()=>available};
w.L={divIcon:x=>x,marker(point){
 const m={point,handlers:{},setLatLng(value){this.point=value;return this;},getLatLng(){return this.point;},
  addTo(){markers.push(this);return this;},remove(){this.removed=true;},
  bindPopup(panel){this.panel=panel;},setPopupContent(panel){this.panel=panel;},openPopup(){},
  on(name,fn){this.handlers[name]=fn;}};
 return m;
}};
for(const script of ['street-view.js','gestao-localizar.js'])vm.runInContext(fs.readFileSync('docs/'+script,'utf8'),dom.getInternalVMContext());
assert.equal(w.document.getElementById('streetViewToggle'),null,'the field panorama UI is not mounted in management');
const pin=$('controlDropPin'),street=$('controlStreetView'),press=button=>button.getAttribute('aria-pressed');
assert.equal(pin.disabled,false);
function clickMap(x,y){
 return canvas.dispatchEvent(new w.MouseEvent('click',{bubbles:true,cancelable:true,clientX:x,clientY:y}));
}
function pointer(target,type,x,y){
 const event=new w.MouseEvent(type,{bubbles:true,clientX:x,clientY:y,button:0});
 Object.defineProperty(event,'pointerId',{value:1});
 target.dispatchEvent(event);
}
pin.click();
assert.equal(press(pin),'true');
assert.equal(clickMap(200,300),false,'map selection consumes the click before ordinary map tools');
const pinMarker=markers[0];
assert.equal(pinMarker.point.lat,-9);
assert.equal(pinMarker.point.lng,-68);
const mapLink=new URL(pinMarker.panel.querySelector('a').href);
assert.equal(mapLink.searchParams.get('query'),'-9.0000000, -68.0000000');
assert.equal(press(pin),'false');

pointer(street,'pointerdown',100,80);
pointer(street,'pointermove',240,350);
assert.equal(w.document.querySelector('.control-location-ghost').hidden,false);
pointer(street,'pointerup',240,350);
assert.equal(w.document.querySelector('.control-location-ghost').hidden,true);
assert.equal(links.length,1);
const pano=new URL(links[0]);
assert.equal(pano.searchParams.get('map_action'),'pano');
assert.equal(pano.searchParams.get('viewpoint'),'-8.5000000,-67.6000000');
assert.equal(press(street),'false');
assert(!pinMarker.removed,'the original pin remains separate from the panorama point');

online=false;
markers[1].handlers.dragstart();
markers[1].point={lat:-9.5,lng:-68};
markers[1].handlers.dragend();
assert.equal(links.length,1);
assert.match($('controlLocationStatus').textContent,/Conecte-se/);
assert.equal(new URL(markers[1].panel.querySelector('a').href).searchParams.get('viewpoint'),'-9.5000000,-68.0000000');
assert.equal(clickMap(250,350),true);
pin.click();dragged=true;
assert.equal(clickMap(250,350),true,'panning does not move the pin');
dragged=false;
w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape'}));
assert.equal(press(pin),'false');
pin.click();available=false;
assert.equal(clickMap(250,350),true,'route and polygon picking retain priority');
assert.equal(press(pin),'false');
pinMarker.panel.querySelector('button').click();
assert(pinMarker.removed);
w.dispatchEvent(new w.Event('campo-control-logout'));
assert(markers[1].removed);

vm.runInContext(fs.readFileSync('docs/gestao-cadastro-mapa.js','utf8'),dom.getInternalVMContext());
const cadastro=w.CampoGestaoCadastroMapa,placed=[];
w.CampoGestaoFotos={formReady:()=>true,sendToForm:data=>{placed.push(data);return true;}};
cadastro.attachMap(map);available=true;
clickMap(200,300);assert.equal(placed.length,0,'the regular map leaves the draft alone');
cadastro.setEnabled(true);
clickMap(200,300);assert.deepEqual(JSON.parse(JSON.stringify(placed.at(-1))),{type:'map-position',point:{lat:-9,lon:-68}});
clickMap(250,340);assert.equal(placed.length,2,'consecutive map clicks reposition the tree without arming a tool');
pin.click();clickMap(230,350);assert.equal(placed.length,2,'the separate pin tool retains its own click');
available=false;clickMap(200,300);assert.equal(placed.length,2,'route and polygon tools retain priority');
available=true;const photoNode=draftPhoto();
photoNode.dispatchEvent(new w.MouseEvent('click',{bubbles:true,clientX:200,clientY:300}));
assert.equal(placed.length,2,'clicking an existing marker keeps its own action');
function draftPhoto(){const element=w.document.createElement('div');element.className='leaflet-marker-icon';canvas.append(element);return element;}
dom.window.close();
console.log('PASS management pin and Street View: map selection, drop, marker repositioning, offline link and coexistence with route picking.');
