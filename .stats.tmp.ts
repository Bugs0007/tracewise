import { defaultInput } from '@/engine/inputs';
const ids = ['dp-climbing-stairs','dp-house-robber','dp-coin-change','dp-lcs','dp-edit-distance','dp-knapsack','dp-grid-paths','dp-topdown-bottomup'];
for (const id of ids) {
  const u = (await import(`/src/content/units/dsa/${id}.ts`)).default;
  const v = u.viz;
  const inputs = [{label:'default',input:defaultInput(v.inputs)}, ...v.presets.map((p:any)=>({label:p.label,input:{...defaultInput(v.inputs),...p.input}}))];
  for (const {label,input} of inputs) {
    const res = v.run(input);
    const long = res.frames.filter((f:any)=>f.caption.length>90).map((f:any)=>f.caption.length+':'+f.caption);
    console.log(id, label, res.frames.length, JSON.stringify(res.result).slice(0,60), long.length? 'LONG '+long.join(' | '):'');
  }
}
