const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('docs/shared-trees.js','utf8'),start=source.indexOf('function stopSharedLive'),end=source.indexOf('async function runSharedCycle');
assert(start>=0&&end>start,'field live functions are present');
let cycles=0,status='';
class FakeWebSocket{static instances=[];constructor(url){this.url=url;FakeWebSocket.instances.push(this);}close(){this.closed=true;}emit(data){this.onmessage?.({data:JSON.stringify(data)});}}
const scope={WebSocket:FakeWebSocket,location:{protocol:'https:',host:'campo.test'},navigator:{onLine:true},document:{hidden:false},sharedReady:true,sharedLiveSocket:null,sharedLiveRetry:null,sharedLiveGeneration:0,sharedCycle:async()=>{cycles++;},sharedStatus:text=>{status=text;},clearTimeout,setTimeout};
vm.createContext(scope);vm.runInContext(source.slice(start,end)+'\nthis.connectSharedLive=connectSharedLive;this.stopSharedLive=stopSharedLive;',scope);
scope.connectSharedLive();assert.equal(FakeWebSocket.instances.length,1);assert.equal(FakeWebSocket.instances[0].url,'wss://campo.test/api/shared/live');
FakeWebSocket.instances[0].onopen();assert.match(status,/Tempo real conectado/);
FakeWebSocket.instances[0].emit({type:'change',kind:'admin-delete'});setImmediate(()=>{assert.equal(cycles,1,'management changes pull the central revision into the inspection app');scope.stopSharedLive();assert(FakeWebSocket.instances[0].closed);console.log('PASS realtime field: authenticated live channel pulls management changes and closes safely.');});
