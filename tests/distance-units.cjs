const assert=require('node:assert/strict');
const u=require('../docs/distance-units.js');
for(const [cm,m] of [['100','1'],['50','0.5'],['0','0'],['1','0.01'],['250','2.5'],['0.1','0.001'],['2000','20'],['','']]){assert.equal(u.toMetres(cm),m);assert.equal(u.toCentimetres(m),cm);}
assert.equal(u.toCentimetres(1.2),'120');
for(const value of [null,undefined,'',' ','bad'])assert.equal(u.toMetres(value),'');
for(const value of ['0.1','1','4.9','2000.1','5000'])assert(u.review(value));
for(const value of ['',null,'0','5','50','100','2000'])assert(!u.review(value));
let metres='1.25';for(let i=0;i<100;i++)metres=u.toMetres(u.toCentimetres(metres));assert.equal(metres,'1.25');
assert.equal(u.formatMetresAsCm('0'),'0 cm');assert.equal(u.formatMetresAsCm(''),'— cm');
console.log('PASS: conversion, empty/zero, review thresholds, 100 round trips, formatted units.');
