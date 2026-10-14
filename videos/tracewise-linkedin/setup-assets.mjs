import {mkdirSync,copyFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
const root=resolve('.');
const repo=resolve('../..');
for(const p of ['assets','capture/extracted','capture/assets','compositions/frames','renders'])mkdirSync(join(root,p),{recursive:true});
for(const name of ['watch-dark.png','watch-dp-dark.png','architect-dark.png','type-dark.png','home-dark.png']) {
 copyFileSync(join(repo,'docs/screenshots',name),join(root,'capture/assets',name));
 copyFileSync(join(repo,'docs/screenshots',name),join(root,'assets',name));
}
for(const weight of [400,700,800,900])copyFileSync(join(repo,`node_modules/@fontsource/schibsted-grotesk/files/schibsted-grotesk-latin-${weight}-normal.woff2`),join(root,`assets/schibsted-${weight}.woff2`));
copyFileSync(join(repo,'node_modules/@fontsource/commit-mono/files/commit-mono-latin-400-normal.woff2'),join(root,'assets/commit-mono.woff2'));
const logo=`<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 32 32"><polyline points="3,24 10,13 16,19 25,7" fill="none" stroke="#ecebe4" stroke-width="3" stroke-linecap="square" stroke-linejoin="miter"/><circle cx="26" cy="6.5" r="4" fill="#5b9cff"/></svg>`;
writeFileSync(join(root,'assets/tracewise-mark.svg'),logo);
writeFileSync(join(root,'capture/assets/tracewise-mark.svg'),logo);
writeFileSync(join(root,'capture/extracted/tokens.json'),JSON.stringify({title:'Tracewise',description:'Visual learning and hands-on software engineering practice.',colors:['#121211','#ecebe4','#5b9cff','#1b1b19','#36352f','#3dc99c','#f5c04a','#f0664f'],fonts:['Schibsted Grotesk','Commit Mono'],colorStats:[{hex:'#5b9cff',count:100,textCount:40,bgCount:30,interactiveBg:30},{hex:'#121211',count:100,bgCount:100},{hex:'#ecebe4',count:100,textCount:100}]},null,2));
writeFileSync(join(root,'capture/extracted/visible-text.txt'),`Tracewise. Watch it. Predict it. Type it yourself. Visual learning for software engineering. DSA, Backend, Frontend, System Design, AI Engineering, Cloud & DevOps. NeetCode 150 problems in 18 topic groups. Step-through visualizers. Predict the next step. Fill the blanks, Complete the body, Signature only, Blank page. Python tests run in browser. Free, no login required. tracewise-blue.vercel.app. Source: local README.md, src/content/ladder.ts, src/player/Player.tsx, src/dsa/catalog.ts, src/runner/python.worker.ts.`);
writeFileSync(join(root,'capture/extracted/asset-descriptions.md'),`# Local source inventory\nNo live assets were scraped. The user provided the local Tracewise repository as source earlier in this chat.\n\n- capture/assets/watch-dark.png: actual Dijkstra lesson screen, 1400x900, graph and code panels.\n- capture/assets/watch-dp-dark.png: actual dynamic programming lesson with dependency table.\n- capture/assets/architect-dark.png: actual architecture learning lab.\n- capture/assets/type-dark.png: actual coding/debug practice screen.\n- capture/assets/home-dark.png: actual home with software engineering modules.\n- capture/assets/tracewise-mark.svg: exact logo geometry copied from src/App.tsx; native dark-theme ink and cobalt.\n- assets/schibsted-*.woff2 and assets/commit-mono.woff2: fonts copied from the source project's installed @fontsource packages.\n`);
console.log('Local assets staged.');
