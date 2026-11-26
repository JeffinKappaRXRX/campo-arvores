'use strict';
const assert=require('node:assert/strict');
global.CampoRoutes=require('../docs/route-core.js');
const {ledger,select,annual,parkCatalogue,parkCoverage,parkReport}=require('../docs/vera-progress-core.js');

const span=(day,id,metres,section='1',source='')=>[day,id,metres,'AAL-01C9','RBR111',section,'URBANO',source];
const db=ledger({
 coverage:[span('2025-10-18','1',800),span('2026-05-02','1',800)],
 trees:[['2025-10-18','AAL-01C9','1','URBANO',5],['2026-05-02','AAL-01C9','1','URBANO',18]],
 orders:[{id:'1',status:'pendente',feeder:'AAL-01C9',day:'',inspector:'Bruno'}]
},{
 coverage:[span('2026-05-04','1',800),span('2026-05-08','2',600)],
 orders:[{id:'1',status:'executada',feeder:'AAL-01C9',day:'2026-05-08',inspector:'',team:'AFA-INRD01'}]
},{
 routes:[{id:'route',spans:[{id:'2',metres:600,section:'1',feeder:'AAL-01C9',block:'RBR111'}]},
  {id:'test',homologation:true,spans:[{id:'3',metres:3000}]}],
 visits:[{routeId:'route',day:'2026-05-06',ranges:[{spanId:'2',start:0,end:5000}]},
  {routeId:'test',day:'2026-05-07',ranges:[{spanId:'3',start:0,end:10000}]}]
});
assert.deepEqual(db.credited.map(row=>[row.day,row.source,row.metres]),[
 ['2025-10-18','VERA',800],['2026-05-02','VERA',800],['2026-05-06','ARBORA',300],['2026-05-08','SGM',300]
]);
assert.deepEqual(select(db,{period:'2026-05',field:'day',section:'12'}).periods.map(p=>[p.when,p.metres,p.accumulated,p.trees]),[
 ['2026-05-02',800,800,18],['2026-05-06',300,1100,0],['2026-05-08',300,1400,0]
]);
assert.equal(select(db,{period:'2026',field:'month',feeder:'TAN-01C6'}).metres,0);
assert.equal(select(db,{period:'2025',field:'month'}).trees,5);
const routed=ledger({coverage:[span('2026-05-01','1',800)]},{},{
 routes:[{id:'returned',returned:{reasonCode:'outro'},spans:[{id:'1',metres:800,section:1,feeder:'AAL-01C9',parallel:[{id:'9',metres:600,feeder:'AAL-01C2',flip:true}]}]},
  {id:'test-returned',returned:{reasonCode:'gestao_homologacao'},spans:[{id:'3',metres:3000,section:1,feeder:'AAL-01C9'}]}],
 visits:[{routeId:'returned',day:'2026-05-07',trackMetres:7000,ranges:[{spanId:'1',start:0,end:5000}]},
  {routeId:'returned',day:'2026-05-07',trackMetres:7000,ranges:[{spanId:'1',start:0,end:5000}]},
  {routeId:'test-returned',day:'2026-05-07',ranges:[{spanId:'3',start:0,end:10000}]}]
});
const a=select(routed,{period:'2026',field:'month',feeder:'AAL-01C9',section:'12'});
assert.deepEqual([a.metres,a.routeMetres,a.netRouteMetres],[800,400,0]);
const b=select(routed,{period:'2026',field:'month',feeder:'AAL-01C2'});
assert.deepEqual([b.metres,b.routeMetres,b.netRouteMetres],[300,300,300]);
assert.equal(select(routed,{period:'2026',field:'month',feeder:'AAL-01C2',section:'12'}).metres,0);

assert.deepEqual(db.orders.map(order=>[order.status,order.inspector]),[['executada','Bruno']]);
const goals=annual({credited:[
 {day:'2025-01-01',section:'1',metres:311005},
 {day:'2026-11-18',section:'1',metres:360300.48},
 {day:'2026-11-19',section:'3',metres:350000},
 {day:'2026-12-01',section:'1',metres:80000}
]},'2026-11-23');
assert.equal(goals[0].realised,360300.48);
assert.equal(goals[0].pending,0);
assert.equal(goals[1].advance,368600);
assert.ok(Math.abs(goals[2].advance-72700.48)<1e-6);
const catalogue=parkCatalogue({
 ids:['1','2','3','4','5'],metres:[800,600,1200,400,100],groupIds:[0,0,1,2,3],
 groups:[['AAL-01C9','1'],['TAN-01C5','2'],['AAL-01C9','3'],['TAN-01C5','']]
});
const park=parkReport(parkCoverage(db,catalogue,'2026-05-06'));
assert.deepEqual(park.map(row=>[row.section,row.total,row.done,row.pending,row.complete,row.partial]),[
 ['1',1400,1100,300,1,1],['2',1200,0,1200,0,0],['3',400,0,400,0,0],['',100,0,100,0,0],['total',3100,1100,2000,1,1]
]);
assert.equal(parkReport(parkCoverage(db,catalogue,'2026-05-09'),'AAL-01C9').at(-1).pending,400);
assert.equal(parkReport(parkCoverage(db,catalogue,'2026-05-09'),'TAN-01C5').at(-1).progress,0);
assert.equal(parkReport(parkCoverage(db,catalogue,'2025-12-31')).at(-1).done,800);
console.log('Histórico, deduplicação, SGM, metas e saldo do parque por trecho verificados.');
