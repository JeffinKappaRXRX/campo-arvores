(function(root){'use strict';
 // One ordered writer, using the existing draft key. A failed write never clears a draft.
 function create({snapshot,write,read,remove}){
  let tail=Promise.resolve(),generation=0,queuedSave=null;
  const clone=value=>typeof structuredClone==='function'?structuredClone(value):JSON.parse(JSON.stringify(value));
  function enqueue(work){const task=tail.catch(()=>{}).then(work);tail=task;return task;}
  function save({verify=false}={}){const value=clone(snapshot()),captured=generation;if(!verify&&queuedSave&&!queuedSave.started&&queuedSave.generation===captured){queuedSave.value=value;return queuedSave.promise;}if(verify)queuedSave=null;const job={value,generation:captured,started:false};job.promise=enqueue(async()=>{job.started=true;if(queuedSave===job)queuedSave=null;if(captured!==generation)return {saved:false};await write(job.value);if(verify){const stored=await read();if(JSON.stringify(stored)!==JSON.stringify(job.value))throw Error('A conferência do rascunho não coincidiu. Mantenha esta aba aberta.');}return {saved:true};});if(!verify)queuedSave=job;return job.promise;}
  function checkpoint(){return save({verify:true});}
  function discard(){generation++;queuedSave=null;return enqueue(()=>remove());}
  return {save,checkpoint,discard};
 }
 root.CampoDraftStore={create};if(typeof module!=='undefined')module.exports=root.CampoDraftStore;
})(typeof globalThis!=='undefined'?globalThis:this);
