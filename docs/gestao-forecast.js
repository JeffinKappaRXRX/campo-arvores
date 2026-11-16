'use strict';
window.CampoForecast=(()=>{
 const fmt=n=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1}).format(n);
 function span(days){return fmt(days)+(days===1?' dia de trabalho':' dias de trabalho')+(days>=22?' · '+fmt(days/22)+(days===22?' mês':' meses'):'')+(days>=264?' · '+fmt(days/264)+(days===264?' ano':' anos'):'');}
 function estimate(qty,seconds,hours=8){if(!Number.isFinite(qty)||qty<=0||!Number.isFinite(hours)||hours<=0||hours>24)return null;const active=Number.isFinite(seconds)&&seconds>0?qty*seconds/3600:null;return {active,days:active===null?null:active/hours,target:qty/100,minimum:qty/70};}
 function paint(state){const $=id=>document.getElementById(id),qty=Number($('forecastCount').value),hours=Number($('forecastHours').value),e=estimate(qty,state?.summary[$('forecastMode').value],hours);
  $('forecast').textContent=!e?'Informe uma quantidade e uma jornada válidas.':e.active===null?'Tempo ainda não medido':fmt(e.active)+' horas ativas · '+span(e.days);
  $('forecastTarget').textContent=e?'1 inspetor · Meta de 100/dia: '+span(e.target)+'. No mínimo de 70/dia: '+span(e.minimum)+'.':'';
  const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Rio_Branco',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),count=state?.daily.find(d=>d.name===day)?.count||0;
  $('dailyGoal').textContent='Hoje, nos filtros atuais: '+fmt(count)+' cadastros · '+fmt(count)+'% da meta de 100 · '+(count<70?'faltam '+fmt(70-count)+' para o mínimo de 70':count<100?'mínimo de 70 alcançado; faltam '+fmt(100-count)+' para a meta':'meta de 100 alcançada')+'.';
 }
 return {estimate,span,paint};
})();
