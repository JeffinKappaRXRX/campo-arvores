'use strict';
function distanceReviewItems(){return ['mt','bt','at'].filter(k=>$(k).checked&&CampoDistanceUnits.review($(k+'Distance').value)).map(k=>({key:k,cm:CampoDistanceUnits.number($(k+'Distance').value)}));}
function refreshDistanceUnits(){
 for(const k of ['mt','bt','at']){
  const input=$(k+'Distance'),hint=$(k+'DistanceHint'),warning=$(k+'DistanceWarning'),cm=CampoDistanceUnits.number(input.value),active=$(k).checked;
  hint.textContent=cm===null||!active?'Informe em centímetros':CampoDistanceUnits.format(cm)+' cm = '+CampoDistanceUnits.format(cm/100)+' m'+(cm===0?' · contato':'');
  const review=active&&CampoDistanceUnits.review(input.value);warning.hidden=!review;
  warning.textContent=review?'Confira a unidade: '+(cm<5?'valor abaixo de 5 cm.':'valor acima de 2.000 cm (20 m).')+' Para 1 metro, digite 100. Confirme se é o afastamento da copa até o condutor.':'';
  input.classList.toggle('distance-needs-review',review);
 }
}
function confirmDistanceReview(){const items=distanceReviewItems();return !items.length||confirm('Revisar distância em centímetros:\n'+items.map(x=>x.key.toUpperCase()+': '+CampoDistanceUnits.format(x.cm)+' cm = '+CampoDistanceUnits.format(x.cm/100)+' m').join('\n')+'\n\nOs valores estão abaixo de 5 cm ou acima de 20 m. Isso pode ser correto; confira a unidade.\n\nSalvar assim mesmo?');}
for(const k of ['mt','bt','at'])$(k+'Distance').addEventListener('input',refreshDistanceUnits);
refreshDistanceUnits();
