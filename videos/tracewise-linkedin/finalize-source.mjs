import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
for(const name of readdirSync('compositions/frames').filter(x=>x.endsWith('.html'))){
 let html=readFileSync('compositions/frames/'+name,'utf8').replaceAll('../../assets/','assets/');
 if(name==='02-visualize.html')html=html.replace('top:570px','top:400px');
 if(name==='02-visualize.html')html=html.replaceAll('class="v-cell"','class="v-cell" data-layout-allow-overflow');
 if(name==='04-breadth.html')html=html.replace("opacity:0,scale:.93,duration:.22","opacity:0,scale:.93,duration:.15");
 const id=name.replace('.html','');
 let clipNumber=0;
 html=html.replace(/<div class="clip"/g,()=>`<div id="${id}-layer-${clipNumber++}" class="clip"`);
 html=html.replace(/id="(\d\d-[^"]+-layer-\d+)"/g,'id="layer-$1"');
 writeFileSync('compositions/frames/'+name,html);
}
let index=readFileSync('index.html','utf8');
index=index.replace(/<script src="https:\/\/cdn.jsdelivr.net\/npm\/gsap[^>]*><\/script>/,'<script src="assets/gsap.min.js"></script>');
index=index.replaceAll('class="scene"','class="scene clip"').replace('background: #ecebe4;','background: #121211;');
writeFileSync('index.html',index);
writeFileSync('index.motion.json',JSON.stringify({duration:30,assertions:[{kind:'keepsMoving',withinSelector:'[data-composition-id="main"]',maxStaticSec:3.1}]},null,2));
console.log('Local runtimes, root asset paths, and source-safe layout finalized.');
