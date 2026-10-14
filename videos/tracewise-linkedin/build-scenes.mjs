import { readFileSync, writeFileSync } from 'node:fs';

// Native UI roles override the preset remix's automatic light/dark inversion.
let spec=readFileSync('frame.md','utf8');
const roles={'ink-black':'#121211','ink-black-alt':'#1b1b19','fire-orange':'#5b9cff','cream':'#ecebe4','cream-muted':'#aaa89d','cream-hint':'#aaa89d','border-dark':'#36352f'};
for(const [key,value] of Object.entries(roles))spec=spec.replace(new RegExp(`(  ${key}: )"[^"]+"`),`$1"${value}"`);
spec=spec.replaceAll('IBM Plex Mono','Commit Mono').replace(/(  border-dark:.*)/,'$1\n  found: "#3dc99c"\n  pending: "#f5c04a"\n  comparing: "#f0664f"');
spec+='\n## Tracewise source adjustment\nPreserve dark paper as the main register, cobalt as the alternate register, and mint/mustard/tomato as correct/pending/comparison colors. Use repository fonts, title-safe 64px margins at 1080 square, and no shadows or lowercase conversion of product/course names. These adjustments preserve the actual UI rather than its automatic palette inversion.\n';
writeFileSync('frame.md',spec);
let board=readFileSync('STORYBOARD.md','utf8').replaceAll('asset_candidates: []','asset_candidates:').replace('asset_candidates: [capture/assets/tracewise-mark.svg, capture/assets/watch-dark.png]','asset_candidates: assets/tracewise-mark.svg - exact logo; assets/watch-dark.png - real Dijkstra screen').replace('asset_candidates: [capture/assets/architect-dark.png, capture/assets/watch-dp-dark.png]','asset_candidates: assets/architect-dark.png - real architecture lab; assets/watch-dp-dark.png - real DP screen').replace('asset_candidates: [capture/assets/tracewise-mark.svg]','asset_candidates: assets/tracewise-mark.svg - exact logo');
writeFileSync('STORYBOARD.md',board);

const common=`
@font-face{font-family:'Schibsted';src:url('../../assets/schibsted-400.woff2')}\n@font-face{font-family:'Schibsted';src:url('../../assets/schibsted-700.woff2');font-weight:700}\n@font-face{font-family:'Schibsted';src:url('../../assets/schibsted-800.woff2');font-weight:800}\n@font-face{font-family:'Schibsted';src:url('../../assets/schibsted-900.woff2');font-weight:900}\n@font-face{font-family:'Commit';src:url('../../assets/commit-mono.woff2')}
#root{position:relative;width:1080px;height:1080px;overflow:hidden;isolation:isolate;color:#ecebe4;font-family:'Schibsted',sans-serif;--blue:#5b9cff;--mint:#3dc99c;--yellow:#f5c04a;--red:#f0664f;--paper:#121211;--surface:#1b1b19;--rule:#36352f}
#root *{box-sizing:border-box}#root h1,#root h2,#root p{margin:0}#root .clip{position:absolute;inset:0;width:1080px;height:1080px}
`;
function scene(id,duration,css,html,js){
 const out=`<template>\n<div id="root" data-composition-id="${id}" data-start="0" data-duration="${duration}" data-width="1080" data-height="1080">\n<style>${common}\n${css}</style>\n<div class="clip" data-start="0" data-duration="${duration}" data-track-index="0" style="background:#121211" data-layout-ignore></div>\n<div class="clip" data-start="0" data-duration="${duration}" data-track-index="1">${html}</div>\n<script src="../../assets/gsap.min.js"></script><script>(function(){const tl=gsap.timeline({paused:true});${js}\nwindow.__timelines=window.__timelines||{};window.__timelines[${JSON.stringify(id)}]=tl;})();</script>\n</div>\n</template>`;
 writeFileSync(`compositions/frames/${id}.html`,out);
}
const foot=(id,text)=>`<div class="${id}-footer"><span>TRACEWISE</span><span>${text}</span></div>`;
const footcss=(id)=>`.${id}-footer{position:absolute;left:64px;right:64px;top:958px;border-top:1px solid #36352f;padding-top:24px;display:flex;justify-content:space-between;font-family:'Commit';font-size:20px;letter-spacing:1px;color:#aaa89d}`;

scene('01-hook',4,`${footcss('h')}
.h-phase{position:absolute;inset:0;padding:110px 64px 190px;display:flex;flex-direction:column;justify-content:center}.h-label{font:24px 'Commit';letter-spacing:3px;margin-bottom:50px;color:#5b9cff}.h-line{font-size:140px;font-weight:900;line-height:1.02;letter-spacing:-7px}.h-blue{color:#5b9cff}.h-first-code{margin-top:65px;border-top:2px solid #36352f;padding-top:26px;display:flex;gap:24px;font:27px 'Commit';color:#aaa89d}.h-codepiece{display:block}.h-second{background:#5b9cff;color:#121211;opacity:0}.h-second .h-label{color:#121211}.h-second .h-line{font-size:128px}.h-second .h-tail{font-size:94px;letter-spacing:-4px;margin-top:16px}.h-process{margin-top:66px;display:flex;gap:20px;font:25px 'Commit'}.h-process span{border:2px solid #121211;padding:17px 25px;display:block}.h-second .h-rule{width:180px;height:10px;background:#121211;margin-top:42px;transform-origin:left}.h-inkfooter{color:#121211;border-color:#121211}
`, `<div class="h-phase" id="h-first"><div class="h-label" id="h-kicker">THE TOOLS HAVE CHANGED.</div><div class="h-line" id="h-ai">AI can</div><div class="h-line h-blue" id="h-write">write code.</div><div class="h-first-code"><span class="h-codepiece">def search():</span><span class="h-codepiece">...</span><span class="h-codepiece">return result</span></div></div>
<div class="h-phase h-second" id="h-second"><div class="h-label" id="h-kicker2">THE FUNDAMENTALS STILL MATTER.</div><div class="h-line" id="h-understand">Understand</div><div class="h-line h-tail" id="h-doing">what it's doing.</div><div class="h-rule" id="h-rule" data-layout-ignore></div><div class="h-process"><span class="h-step">input</span><span class="h-step">logic</span><span class="h-step">output</span></div></div>${foot('h','LEARN BY SEEING + DOING')}`,
`// Headline slam adapts the registry primitive's explicit scale landing.
tl.fromTo('#h-kicker',{opacity:0,y:18},{opacity:1,y:0,duration:.28},.05);
tl.fromTo('#h-ai',{scale:1.35,opacity:0},{scale:1,opacity:1,duration:.38,ease:'expo.out'},.15);
tl.fromTo('#h-write',{x:-160,opacity:0},{x:0,opacity:1,duration:.38,ease:'power4.out'},.65);
tl.fromTo('.h-codepiece',{opacity:0,y:20},{opacity:1,y:0,duration:.25,stagger:.13},1.05);
tl.set('#h-first',{opacity:0},1.8);tl.set('#h-second',{opacity:1},1.8);
tl.fromTo('#h-kicker2',{opacity:0},{opacity:1,duration:.18,immediateRender:false},1.8);
tl.fromTo('#h-understand',{scale:1.18,opacity:0},{scale:1,opacity:1,duration:.35,ease:'expo.out',immediateRender:false},1.85);
tl.fromTo('#h-doing',{y:85,opacity:0},{y:0,opacity:1,duration:.38,ease:'power3.out',immediateRender:false},2.25);
tl.fromTo('#h-rule',{scaleX:0},{scaleX:1,duration:.3,immediateRender:false},2.65);
tl.fromTo('.h-step',{x:60,opacity:0},{x:0,opacity:1,duration:.3,stagger:.13,immediateRender:false},2.9);
tl.to('.h-footer',{color:'#121211',borderColor:'#121211',duration:.1},1.8);`);

const nums=[-8,-3,2,7,12,19,25,31];
scene('02-visualize',9,`${footcss('v')}
.v-phase{position:absolute;inset:0;padding:94px 64px 190px}.v-intro{display:flex;flex-direction:column;justify-content:center;align-items:center;padding-bottom:260px}.v-lockup{display:flex;align-items:center;gap:22px}.v-lockup img{width:134px;height:134px}.v-name{font-size:132px;font-weight:900;letter-spacing:-7px}.v-promise{font-size:62px;letter-spacing:-2px;margin-top:34px}.v-loop{font:24px 'Commit';display:flex;gap:34px;margin-top:78px;color:#aaa89d}.v-loop span{border-bottom:4px solid #5b9cff;padding-bottom:15px}.v-predict,.v-watch{opacity:0}.v-eyebrow{font:22px 'Commit';letter-spacing:3px;color:#5b9cff;margin-bottom:26px}.v-heading{font-size:88px;font-weight:800;letter-spacing:-4px;line-height:1.04;max-width:920px}.v-target{display:inline-block;background:#1b1b19;border:1px solid #36352f;padding:20px 28px;margin-top:40px;font:29px 'Commit';color:#f5c04a}.v-array{display:flex;gap:12px;margin-top:88px;width:952px}.v-cell{display:flex;position:relative;width:108px;height:112px;border:2px solid #36352f;align-items:center;justify-content:center;font:38px 'Commit';background:#1b1b19}.v-index{position:absolute;top:134px;font:22px 'Commit';color:#aaa89d}.v-marker{position:absolute;left:424px;top:570px;width:90px;text-align:center;font:24px 'Commit';color:#5b9cff}.v-question{font-size:38px;margin-top:106px;line-height:1.3;max-width:900px}.v-answer{opacity:0;position:absolute;left:64px;top:743px;font-size:36px;color:#3dc99c}.v-window{margin-top:46px;width:952px;height:550px;border:1px solid #36352f;overflow:hidden;position:relative;background:#1b1b19}.v-image{display:block;width:1400px;height:900px;max-width:none;transform-origin:0 0}.v-watch .v-heading{font-size:79px}.v-watch-note{margin-top:26px;font:24px 'Commit';color:#aaa89d}
`, `<div class="v-phase v-intro" id="v-intro"><div class="v-lockup"><img id="v-logo" src="../../assets/tracewise-mark.svg" alt="Tracewise mark"><div class="v-name" id="v-name">Tracewise</div></div><div class="v-promise" id="v-promise">Learn it visually.</div><div class="v-loop"><span>01 PREDICT</span><span>02 WATCH</span><span>03 TYPE</span></div></div>
<div class="v-phase v-predict" id="v-predict"><div class="v-eyebrow">01 / PREDICT</div><h1 class="v-heading" id="v-predict-title">Predict the next step.</h1><div class="v-target">BINARY SEARCH / TARGET: 19</div><div class="v-array">${nums.map((n,i)=>`<div class="v-cell" id="v-cell-${i}"><span>${n}</span><span class="v-index">${i}</span></div>`).join('')}</div><div class="v-marker" id="v-marker">mid</div><div class="v-question" id="v-question">7 is smaller than 19. Which half stays?</div><div class="v-answer" id="v-answer">Discard half. Find 19.</div></div>
<div class="v-phase v-watch" id="v-watch"><div class="v-eyebrow">02 / WATCH</div><h1 class="v-heading" id="v-watch-title">Watch the logic unfold.</h1><div class="v-window" data-layout-allow-overflow><img class="v-image" id="v-image" src="../../assets/watch-dark.png" alt="Actual Tracewise Dijkstra visualizer" data-layout-ignore></div><div class="v-watch-note">STEP THROUGH. CHANGE INPUTS. SEE WHY.</div></div>${foot('v','PREDICT / WATCH / TYPE')}`,
`tl.fromTo('#v-logo',{rotation:-15,scale:.4,opacity:0},{rotation:0,scale:1,opacity:1,duration:.4,ease:'power3.out'},.05);
tl.fromTo('#v-name',{x:130,opacity:0},{x:0,opacity:1,duration:.4,ease:'expo.out'},.2);
tl.fromTo('#v-promise',{y:40,opacity:0},{y:0,opacity:1,duration:.35},.45);
tl.fromTo('.v-loop span',{opacity:0,y:20},{opacity:1,y:0,duration:.3,stagger:.15},.8);
tl.set('#v-intro',{opacity:0},1.7);tl.set('#v-predict',{opacity:1},1.7);
tl.fromTo('#v-predict-title',{x:-100,opacity:0},{x:0,opacity:1,duration:.35,ease:'expo.out',immediateRender:false},1.75);
tl.fromTo('.v-cell',{y:80,opacity:0},{y:0,opacity:1,duration:.32,stagger:.045,immediateRender:false},2.05);
tl.to('#v-cell-3',{backgroundColor:'#5b9cff',color:'#121211',borderColor:'#5b9cff',duration:.2},2.65);
tl.fromTo('#v-marker',{opacity:0,y:25},{opacity:1,y:0,duration:.2,immediateRender:false},2.65);
tl.fromTo('#v-question',{opacity:0,y:25},{opacity:1,y:0,duration:.25,immediateRender:false},2.8);
tl.to(['#v-cell-0','#v-cell-1','#v-cell-2','#v-cell-3'],{opacity:.23,y:28,duration:.35,stagger:.04,ease:'power3.inOut'},3.65);
tl.to('#v-marker',{x:240,duration:.3,ease:'power4.out'},3.85);
tl.to('#v-cell-5',{backgroundColor:'#3dc99c',color:'#121211',borderColor:'#3dc99c',scale:1.08,duration:.3,ease:'back.out(1.4)'},4.15);
tl.to('#v-question',{opacity:0,duration:.15},4.1);tl.fromTo('#v-answer',{opacity:0,y:18},{opacity:1,y:0,duration:.3,immediateRender:false},4.2);
tl.set('#v-predict',{opacity:0},5.2);tl.set('#v-watch',{opacity:1},5.2);
tl.fromTo('#v-watch-title',{x:120,opacity:0},{x:0,opacity:1,duration:.32,ease:'expo.out',immediateRender:false},5.2);
tl.fromTo('.v-window',{y:85,opacity:0},{y:0,opacity:1,duration:.42,ease:'power3.out',immediateRender:false},5.35);
tl.fromTo('#v-image',{scale:.68,x:0,y:0},{scale:.68,x:0,y:0,duration:.01,immediateRender:false},5.35);
tl.to('#v-image',{scale:1.25,x:-54,y:-415,duration:1.1,ease:'power3.inOut'},6.25);
tl.fromTo('.v-watch-note',{opacity:0},{opacity:1,duration:.3,immediateRender:false},7.55);`);

const binaryCode=`def search(nums, target):\n    lo, hi = 0, len(nums) - 1\n    while lo <= hi:\n        mid = (lo + hi) // 2\n        if nums[mid] == target:\n            return mid\n        if nums[mid] < target:\n            lo = mid + 1\n        else:\n            hi = mid - 1\n    return -1`;
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const highlight=line=>escape(line).replace(/\b(def|while|if|else|return)\b/g,'<span class="p-kw">$1</span>').replace(/\b(search|len)\b/g,'<span class="p-fn">$1</span>');
scene('03-practice',6,`${footcss('p')}
.p-page{padding:88px 64px 190px}.p-eyebrow{font:22px 'Commit';color:#5b9cff;letter-spacing:3px;margin-bottom:24px}.p-heading{font-size:88px;font-weight:800;line-height:1.06;letter-spacing:-4px}.p-rail{display:flex;gap:12px;margin-top:42px}.p-step{flex:1;border:1px solid #36352f;padding:19px 12px;font:21px 'Commit';text-align:center;color:#aaa89d;background:#1b1b19}.p-editor{position:relative;margin-top:27px;border:1px solid #36352f;background:#1b1b19;height:463px;overflow:hidden}.p-editorbar{height:56px;border-bottom:1px solid #36352f;padding:16px 24px;display:flex;justify-content:space-between;font:20px 'Commit';color:#aaa89d}.p-code{position:absolute;left:26px;top:84px;font:25px/32px 'Commit';white-space:pre;margin:0}.p-skeleton{color:#aaa89d}.p-coded{color:#ecebe4;opacity:0}.p-code-line{display:block;white-space:pre;line-height:30px}.p-line-no{display:inline-block;width:34px;color:#aaa89d;font-size:20px;user-select:none}.p-kw{color:#5b9cff}.p-fn{color:#3dc99c}.p-blank{background:#5b9cff;color:#121211;padding:1px 10px}.p-status{margin-top:28px;display:flex;align-items:center;gap:20px;font:27px 'Commit'}.p-test{display:block;background:#3dc99c;color:#121211;padding:15px 22px;opacity:0}.p-note{color:#aaa89d;font-size:22px}.p-caret{display:inline-block;width:15px;height:25px;background:#5b9cff;vertical-align:middle;margin-left:2px}.p-caption{opacity:0;font-size:26px;color:#aaa89d}
`, `<div class="p-page"><div class="p-eyebrow">03 / TYPE IT</div><h1 class="p-heading" id="p-title">Then write it yourself.</h1><div class="p-rail">${['Blanks','Body','Signature','Blank page'].map((s,i)=>`<div class="p-step" id="p-step-${i}">${s}</div>`).join('')}</div><div class="p-editor" id="p-editor"><div class="p-editorbar"><span>binary_search.py</span><span>PYTHON / IN YOUR BROWSER</span></div><pre class="p-code p-skeleton" id="p-skeleton">def search(nums, target):
    lo, hi = <span class="p-blank">___</span>, len(nums) - 1
    while lo &lt;= hi:
        mid = <span class="p-blank">________</span>
        if nums[mid] == target:
            return <span class="p-blank">___</span></pre><div class="p-code p-coded" id="p-coded">${binaryCode.split('\n').map((line,i)=>`<div class="p-code-line" id="p-code-line-${i}"><span class="p-line-no">${i+1}</span><span class="p-typed" data-line="${escape(line)}">${highlight(line)}</span>${i===10?'<span class="p-caret" id="p-caret"></span>':''}</div>`).join('')}</div></div><div class="p-status"><span class="p-test" id="p-test">Tests passed</span><span class="p-caption" id="p-caption">Less help. More practice.</span></div></div>${foot('p','SEE IT / WRITE IT / TEST IT')}`,
`tl.fromTo('#p-title',{y:55,opacity:0},{y:0,opacity:1,duration:.4,ease:'power3.out'},.05);
tl.fromTo('#p-editor',{y:45,opacity:0},{y:0,opacity:1,duration:.4},.2);
for(let i=0;i<4;i++){const at=.4+i*.8;tl.to('#p-step-'+i,{color:'#121211',backgroundColor:'#5b9cff',borderColor:'#5b9cff',duration:.12},at);if(i>0)tl.to('#p-step-'+(i-1),{color:'#aaa89d',backgroundColor:'#1b1b19',borderColor:'#36352f',duration:.12},at);}
const skeleton=document.getElementById('p-skeleton');
const states=[{t:0,html:skeleton.innerHTML},{t:1.2,html:'def search(nums, target):\\n    # complete the function body\\n    lo, hi = 0, len(nums) - 1\\n    # your code here'},{t:2,html:'def search(nums, target):\\n    # your code here\\n    pass'},{t:2.8,html:'# Define search from scratch.\\n'}];
const driver={t:0};tl.to(driver,{t:6,duration:6,ease:'none',onUpdate:()=>{let state=states[0];for(const s of states)if(driver.t>=s.t)state=s;skeleton.innerHTML=state.html;}},0);
tl.set('#p-skeleton',{opacity:0},3.05);tl.set('#p-coded',{opacity:1},3.05);
// Typed-prompt registry pattern: a pure schedule and a timeline-driven cursor.
const lines=Array.from(document.querySelectorAll('.p-code-line'));
lines.forEach((line,i)=>tl.fromTo(line,{opacity:0,x:10},{opacity:1,x:0,duration:.16,immediateRender:false},3.1+i*.17));
tl.fromTo('#p-caret',{opacity:0},{opacity:1,duration:.15,repeat:5,yoyo:true,ease:'none',immediateRender:false},4.95);
tl.fromTo('#p-test',{scale:.83,opacity:0,y:14},{scale:1,opacity:1,y:0,duration:.25,ease:'back.out(1.4)',immediateRender:false},5.2);
tl.fromTo('#p-caption',{opacity:0,x:25},{opacity:1,x:0,duration:.25,immediateRender:false},5.4);`);

const icons=[
`<rect x="4" y="20" width="28" height="32"/><rect x="42" y="20" width="28" height="32"/><rect x="80" y="20" width="28" height="32"/><path d="M55 5V16M49 11L55 17L61 11"/>`,
`<rect x="4" y="18" width="32" height="36"/><rect x="76" y="18" width="32" height="36"/><path d="M36 36H76M68 28L76 36L68 44"/>`,
`<rect x="4" y="4" width="104" height="64"/><path d="M4 21H108M41 21V68M51 34H96M51 48H85"/>`,
`<rect x="40" y="5" width="32" height="22"/><rect x="4" y="48" width="32" height="22"/><rect x="76" y="48" width="32" height="22"/><path d="M56 27V36H20V48M56 36H92V48"/>`,
`<rect x="4" y="18" width="28" height="32"/><circle cx="57" cy="34" r="15"/><rect x="82" y="18" width="28" height="32"/><path d="M32 34H42M72 34H82"/>`,
`<path d="M6 47H106M20 20V47M56 6V47M92 30V47"/><rect x="11" y="13" width="18" height="14"/><rect x="47" y="3" width="18" height="14"/><rect x="83" y="23" width="18" height="14"/>`
];
scene('04-breadth',7,`${footcss('b')}
.b-phase{position:absolute;inset:0;padding:88px 64px 190px}.b-eyebrow{font:22px 'Commit';color:#5b9cff;letter-spacing:3px;margin-bottom:25px}.b-heading{font-size:101px;font-weight:900;letter-spacing:-5px;line-height:1.04}.b-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:49px}.b-card{background:#1b1b19;border:1px solid #36352f;height:164px;padding:23px;display:flex;gap:22px;align-items:center;min-width:0}.b-card svg{width:108px;height:70px;flex:none;stroke:#5b9cff;stroke-width:2.5;fill:none}.b-name{font-size:31px;line-height:1.16;font-weight:700;letter-spacing:-.6px}.b-number{display:block;font:20px 'Commit';color:#aaa89d;margin-top:9px}.b-stat{opacity:0}.b-stat-title{font-size:38px;color:#aaa89d;margin-top:10px}.b-big{font-size:275px;font-weight:900;line-height:1;letter-spacing:-13px;color:#5b9cff;margin-top:35px}.b-stat-label{font-size:66px;font-weight:800;letter-spacing:-2px;margin-top:6px}.b-stat-meta{font:27px 'Commit';margin-top:25px;color:#aaa89d}.b-plates{display:flex;gap:22px;margin-top:32px;height:170px;overflow:hidden}.b-plate{width:465px;height:170px;overflow:hidden;border:1px solid #36352f;background:#1b1b19}.b-plate img{width:465px;height:300px;object-fit:cover;object-position:center 40%;display:block}.b-unit{color:#ecebe4;font-size:28px;position:absolute;top:785px;right:75px}
`, `<div class="b-phase" id="b-breadth"><div class="b-eyebrow">SOFTWARE ENGINEERING / VISUALIZED</div><h1 class="b-heading" id="b-title">More than DSA.</h1><div class="b-grid">${['DSA','Backend','Frontend','System Design','AI Engineering','Cloud & DevOps'].map((name,i)=>`<div class="b-card" id="b-card-${i}"><svg viewBox="0 0 112 76" data-layout-ignore>${icons[i]}</svg><div><div class="b-name">${name}</div><span class="b-number">MODULE 0${i+1}</span></div></div>`).join('')}</div></div>
<div class="b-phase b-stat" id="b-stat"><div class="b-eyebrow">YOUR INTERVIEW PRACTICE TRACK</div><div class="b-big" id="b-big">150</div><div class="b-stat-label" id="b-label">NeetCode problems.</div><div class="b-stat-meta" id="b-meta">18 pattern groups. Step by step.</div><div class="b-plates" data-layout-allow-overflow><div class="b-plate"><img src="../../assets/watch-dp-dark.png" alt="Actual dynamic programming lesson" data-layout-ignore></div><div class="b-plate"><img src="../../assets/architect-dark.png" alt="Actual architecture lab" data-layout-ignore></div></div></div>${foot('b','FUNDAMENTALS / INTERVIEW PREP')}`,
`tl.fromTo('#b-title',{x:-120,opacity:0},{x:0,opacity:1,duration:.4,ease:'expo.out'},.05);
// Registry grid-card-assemble entrance, scheduled across the shot.
for(let i=0;i<6;i++){const at=.35+i*.45;tl.fromTo('#b-card-'+i,{opacity:0,y:42},{opacity:1,y:0,duration:.4,ease:'power3.out'},at);tl.to('#b-card-'+i,{borderColor:'#5b9cff',duration:.12,yoyo:true,repeat:1},at+.4);}
tl.to('#b-breadth',{opacity:0,scale:.93,duration:.22,ease:'power3.in'},4.35);
tl.set('#b-stat',{opacity:1},4.5);
tl.fromTo('#b-big',{scale:1.28,opacity:0,y:20},{scale:1,opacity:1,y:0,duration:.45,ease:'expo.out',immediateRender:false},4.5);
tl.fromTo('#b-label',{x:-60,opacity:0},{x:0,opacity:1,duration:.3,immediateRender:false},4.85);
tl.fromTo('#b-meta',{y:25,opacity:0},{y:0,opacity:1,duration:.3,immediateRender:false},5.2);
tl.fromTo('.b-plate',{opacity:0,y:40},{opacity:1,y:0,duration:.35,stagger:.12,immediateRender:false},5.55);`);

scene('05-cta',4,`${footcss('c')}
.c-ground{position:absolute;inset:0;background:#5b9cff}.c-page{position:absolute;inset:0;padding:135px 64px 190px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#121211}.c-mark{width:122px;height:122px;margin-bottom:28px}.c-brand{font-size:139px;font-weight:900;letter-spacing:-8px;line-height:1.03}.c-tagline{display:flex;gap:15px;margin-top:28px;font-size:37px;font-weight:700;letter-spacing:-1px}.c-tagline span{display:block}.c-url{background:#121211;color:#ecebe4;font:40px 'Commit';padding:27px 30px;margin-top:58px;text-align:center;white-space:nowrap;max-width:952px}.c-access{display:flex;gap:35px;align-items:center;font-size:31px;font-weight:700;margin-top:33px}.c-dot{width:8px;height:8px;background:#121211;border-radius:50%}.c-footer{border-color:#121211;color:#121211}.c-mark polyline{stroke:#121211}.c-mark circle{fill:#121211}.c-cta{font:22px 'Commit';letter-spacing:3px;margin-bottom:28px}
`, `<div class="c-ground" data-layout-ignore></div><div class="c-page"><div class="c-cta" id="c-try">TRY IT FOR YOURSELF</div><svg class="c-mark" id="c-mark" viewBox="0 0 32 32" aria-label="Tracewise mark"><polyline points="3,24 10,13 16,19 25,7" fill="none" stroke-width="3" stroke-linecap="square" stroke-linejoin="miter"/><circle cx="26" cy="6.5" r="4"/></svg><div class="c-brand" id="c-brand">Tracewise</div><div class="c-tagline"><span>See it.</span><span>Understand it.</span><span>Build it.</span></div><div class="c-url" id="c-url">tracewise-blue.vercel.app</div><div class="c-access"><span id="c-free">Free</span><i class="c-dot" data-layout-ignore></i><span id="c-login">No login required</span></div></div>${foot('c','START WITH ONE CONCEPT')}`,
`tl.fromTo('#c-try',{opacity:0,y:20},{opacity:1,y:0,duration:.28},.05);
tl.fromTo('#c-mark',{rotation:-14,scale:.55,opacity:0},{rotation:0,scale:1,opacity:1,duration:.4,ease:'power3.out'},.1);
tl.fromTo('#c-brand',{y:60,opacity:0},{y:0,opacity:1,duration:.45,ease:'expo.out'},.3);
tl.fromTo('.c-tagline span',{x:32,opacity:0},{x:0,opacity:1,duration:.3,stagger:.15},.6);
tl.fromTo('#c-url',{scaleX:.84,y:32,opacity:0},{scaleX:1,y:0,opacity:1,duration:.35,ease:'power4.out'},1.1);
tl.fromTo('#c-free',{y:20,opacity:0},{y:0,opacity:1,duration:.25},1.35);
tl.fromTo('#c-login',{y:20,opacity:0},{y:0,opacity:1,duration:.25},1.5);`);

// Check the exact displayed algorithm against the six demo cases.
function search(nums,target){let lo=0,hi=nums.length-1;while(lo<=hi){const mid=Math.floor((lo+hi)/2);if(nums[mid]===target)return mid;if(nums[mid]<target)lo=mid+1;else hi=mid-1;}return -1;}
const cases=[[nums,19,5],[nums,5,-1],[nums,-8,0],[nums,31,7],[[4],4,0],[[],1,-1]];
for(const [a,t,want]of cases)if(search(a,t)!==want)throw new Error('Demo binary search failed.');
writeFileSync('demo-binary-search.py',binaryCode+'\n\nassert search([-8,-3,2,7,12,19,25,31],19)==5\nassert search([-8,-3,2,7,12,19,25,31],5)==-1\nassert search([-8,-3,2,7,12,19,25,31],-8)==0\nassert search([-8,-3,2,7,12,19,25,31],31)==7\nassert search([4],4)==0\nassert search([],1)==-1\nprint("Six displayed-code cases passed.")\n');
board=readFileSync('STORYBOARD.md','utf8').replaceAll('status: outline','status: animated');writeFileSync('STORYBOARD.md',board);
console.log('Five deterministic frames authored. Six demo cases passed.');
