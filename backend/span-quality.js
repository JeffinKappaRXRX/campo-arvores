// Published route geometry and the private MT package allow checking older records.
function spanRouteIndex(routes,wanted){
 const result=new Map();
 for(const route of routes){
  if(routeIsTest(route))continue;
  for(const span of route.spans||[]){
   const id=CampoSpanQuality.key(span.id);
   if(!wanted.has(id))continue;
   if(!result.has(id))result.set(id,new Map());
   const byFeeder=result.get(id),feeder=CampoSpanQuality.key(span.feeder||route.feeder);
   if(!byFeeder.has(feeder))byFeeder.set(feeder,{feeder,geometry:{type:'LineString',coordinates:span.line}});
  }
 }
 return new Map([...result].map(([id,byFeeder])=>[id,[...byFeeder.values()]]));
}
async function spanPrivateIndex(env,wanted){
 const index=new Map();
 if(!wanted.size||!env.LOGIN_GUARD)return index;
 try{
  const response=await routeGeometry(new Request('https://campo-internal/api/routes/geometry'),env,true);
  const reader=response.body.pipeThrough(new DecompressionStream('gzip')).pipeThrough(new TextDecoderStream()).getReader();
  let buffer='',feeders=null;
  function add(row){
   // The compact route package starts each row with a numeric or quoted span ID.
   const raw=row.slice(1,row.indexOf(','));
   const id=CampoSpanQuality.key(raw.startsWith('"')?raw.slice(1,-1):raw);
   if(!wanted.has(id))return;
   const fields=JSON.parse(row),xy=fields[10],line=[];
   for(let i=0;i<xy.length;i+=2)line.push([xy[i]/1e6,xy[i+1]/1e6]);
   if(!index.has(id))index.set(id,[]);
   index.get(id).push({feeder:feeders[fields[1]],geometry:{type:'LineString',coordinates:line}});
  }
  try{
   for(;;){
    const {value,done}=await reader.read();
    if(done)break;
    buffer+=value;
    if(!feeders){
     const rows=buffer.indexOf('"rows":[');
     if(rows<0){if(buffer.length>500000)throw Error('Cabeçalho do pacote MT inválido.');continue;}
     feeders=JSON.parse(buffer.slice(0,rows)+'"rows":[]}').feeders;
     buffer=buffer.slice(rows+8);
    }
    // Each row ends with its flat coordinate array and the enclosing row bracket.
    let from=0,to;
    while((to=buffer.indexOf(']],',from))!==-1){add(buffer.slice(from,to+2));from=to+3;}
    buffer=buffer.slice(from);
    if(buffer.length>500000)throw Error('Linha do pacote MT inválida.');
   }
   if(feeders&&buffer.startsWith('[')&&buffer.endsWith(']]]}'))add(buffer.slice(0,-2));
  }finally{await reader.cancel();}
  return index;
 }catch{return new Map();}
}
async function spanCheckRecords(env,records,routes){
 const Q=CampoSpanQuality;
 const eligible=records.filter(record=>Q.key(record.span)&&sharedCoordinate(record.lat,90)&&sharedCoordinate(record.lon,180));
 const wanted=new Set(eligible.map(record=>Q.key(record.span)));
 const byRoute=spanRouteIndex(routes,wanted),checked=new Map(),pending=[];
 function add(record,candidates){
  const selected=Q.select(candidates||[],record.feeder);
  const found=Q.measure(record.lat,record.lon,selected?.geometry);
  if(!found)return false;
  checked.set(record.id,{...Q.reference(record,found.nearest),metres:found.metres});
  return true;
 }
 for(const record of eligible){
  const captured=Q.read(record);
  if(captured)checked.set(record.id,captured);
  else if(!(record.bt&&!record.mt||record.at&&!record.mt)&&!add(record,byRoute.get(Q.key(record.span))))pending.push(record);
 }
 const privateIndex=await spanPrivateIndex(env,new Set(pending.map(record=>Q.key(record.span))));
 for(const record of pending)add(record,privateIndex.get(Q.key(record.span)));
 return checked;
}
async function adminSpanChecks(env,db,data,params){
 const filters=controlFilters(params),rows=data.records.filter(record=>controlMatches(record,filters));
 const page=Number(params.get('page')||0);
 if(!Number.isSafeInteger(page)||page<0)throw sharedError('Página inválida.');
 let routes=[];
 try{
  const plans=await db.prepare("SELECT data FROM campo_routes WHERE COALESCE(json_extract(data,'$.deletedAt'),'')='' ORDER BY created_at DESC").all();
  routes=plans.results.map(row=>JSON.parse(row.data));
 }catch(error){if(!centralMissingTable(error))throw error;}
 const checked=await spanCheckRecords(env,rows,routes),alerts=rows.flatMap(record=>{
  const check=checked.get(record.id);
  return check?.metres>CampoSpanQuality.threshold?[{...check,id:record.id,feeder:record.feeder,species:record.species}]:[];
 }).sort((a,b)=>b.metres-a.metres);
 const last=Math.max(0,Math.ceil(alerts.length/50)-1),current=Math.min(page,last);
 return json({checked:checked.size,total:rows.length,count:alerts.length,items:alerts.slice(current*50,(current+1)*50),page:current,last});
}
