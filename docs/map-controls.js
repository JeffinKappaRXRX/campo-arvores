'use strict';
// Reuse existing controls and handlers in one bounded panel over the map.
const mapCanvas=document.querySelector('.map-canvas');
const mapMenuButton=document.createElement('button');
mapMenuButton.id='mapMenuButton';mapMenuButton.type='button';mapMenuButton.className='map-menu-button secondary';mapMenuButton.textContent='☰';mapMenuButton.setAttribute('aria-label','Abrir camadas e filtros do mapa');mapMenuButton.setAttribute('aria-expanded','false');mapMenuButton.setAttribute('aria-controls','mapMenu');
const mapMenu=document.createElement('section');mapMenu.id='mapMenu';mapMenu.className='map-menu';mapMenu.hidden=true;mapMenu.setAttribute('aria-label','Camadas e filtros do mapa');
mapMenu.innerHTML='<div class="map-menu-head"><strong>Mapa · camadas e filtros</strong><button type="button" id="closeMapMenu" class="secondary" aria-label="Minimizar menu do mapa">×</button></div>';
const baseControls=$('basemap').closest('.maptoolbar');
mapMenu.append(baseControls,$('downloadStreets').closest('details'),$('mapLayerControls'),$('mapSearch'));
mapCanvas.append(mapMenuButton,mapMenu);
$('mapFeederFilter').closest('label').hidden=true;
const feederPanel=document.createElement('details');feederPanel.className='map-feeders';feederPanel.id='mapFeedersPanel';
feederPanel.innerHTML='<summary id="mapFeedersSummary">Todos os alimentadores</summary><label>Pesquisar alimentador<input id="mapFeederSearch" type="search" placeholder="Ex.: RBR, TAN, AAL…" autocomplete="off"></label><button type="button" id="allMapFeeders" class="secondary">Mostrar todos · limpar seleção</button><div id="mapFeederChoices"></div><p class="hint">Marque um ou vários. Sem seleção, o mapa mostra todos. O alimentador do cadastro é independente.</p>';
baseControls.after(feederPanel);
function openMapMenu(){mapMenu.hidden=false;mapMenuButton.setAttribute('aria-expanded','true');}
function closeMapMenu(){if(typeof sharedReady!=='undefined'&&sharedReady)renderInspectionPins();mapMenu.hidden=true;mapMenuButton.setAttribute('aria-expanded','false');}
mapMenuButton.onclick=()=>mapMenu.hidden?openMapMenu():closeMapMenu();$('closeMapMenu').onclick=closeMapMenu;
$('mapFeederSearch').oninput=renderFeederChoices;
$('allMapFeeders').onclick=()=>setMapFeeders([]);
function renderFeederChoices(){const chosen=new Set(selectedMapFeeders()),term=$('mapFeederSearch').value.trim().toLocaleUpperCase();$('mapFeedersSummary').textContent='Alimentadores · '+mapFeedersLabel();const options=[...$('mapFeederFilter').options].map(o=>o.value).filter(v=>v&&!v.includes(', '));const values=[...new Set([...options,...chosen])].filter(v=>v.toLocaleUpperCase().includes(term));$('mapFeederChoices').innerHTML=values.map(v=>`<label class="layercheck"><input type="checkbox" value="${esc(v)}" ${chosen.has(v)?'checked':''}>${esc(v)}</label>`).join('')||'<p>Nenhum alimentador encontrado.</p>';$('mapFeederChoices').querySelectorAll('input').forEach(input=>input.onchange=()=>{const next=new Set(selectedMapFeeders());if(input.checked)next.add(input.value);else next.delete(input.value);setMapFeeders([...next]);});}
// The expanded map shares this same menu instead of duplicating a single-value picker.
$('fullFeeder').closest('label').hidden=true;
renderFeederChoices();
L.DomEvent.disableClickPropagation(mapMenu);L.DomEvent.disableScrollPropagation(mapMenu);L.DomEvent.disableClickPropagation(mapMenuButton);
const originalMinimizeNetworkSearch=minimizeNetworkSearch;
minimizeNetworkSearch=function(focus=true){originalMinimizeNetworkSearch(false);closeMapMenu();if(focus)mapMenuButton.focus();};
