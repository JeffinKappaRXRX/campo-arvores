/* Network distances: centimetres on screen, metres in the existing record/API schema. */
(function(root){
 'use strict';
 const number=value=>value!==null&&value!==undefined&&String(value).trim()!==''&&Number.isFinite(Number(value))?Number(value):null;
 const rounded=value=>String(Number(value.toPrecision(12)));
 const format=value=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:4}).format(value);
 function toMetres(value){const n=number(value);return n===null?'':rounded(n/100);}
 function toCentimetres(value){const n=number(value);return n===null?'':rounded(n*100);}
 function review(value){const n=number(value);return n!==null&&n>=0&&(n>0&&n<5||n>2000);}
 function formatMetresAsCm(value){const n=number(value);return n===null?'— cm':format(n*100)+' cm';}
 root.CampoDistanceUnits={number,format,toMetres,toCentimetres,review,formatMetresAsCm,isNetworkField:id=>/^(mt|bt|at)Distance$/.test(id)};
 if(typeof module!=='undefined')module.exports=root.CampoDistanceUnits;
})(typeof globalThis!=='undefined'?globalThis:this);
