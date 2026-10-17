import {SIGHTS} from './region.mjs?v=flight-dpad-2';
import * as THREE from './three.module.js';
export function createMountainLabels({camera,position,local,height,mountainHeight}){
 const layer=document.createElement('div');layer.id='mountain-labels';layer.setAttribute('aria-hidden','true');document.body.append(layer);
 const pool=Array.from({length:6},()=>{const el=document.createElement('div');el.className='mountain-marker';el.hidden=true;const stem=document.createElement('i'),label=document.createElement('span');el.append(stem,label);layer.append(el);return {el,stem,label}});
 const sights=SIGHTS.map(m=>({...m,sight:true,...local(m.lon,m.lat)}));
 let mountains=[...sights],tick=1,candidates=[],active=0;
 const elevation=new Map(),pending=new Set(),retry=new Map();
 function preload(){for(const {m}of candidates){if(active>=2)break;if(elevation.has(m)||pending.has(m)||(retry.get(m)||0)>performance.now())continue;pending.add(m);active++;mountainHeight(m.x,m.z).then(y=>{if(Number.isFinite(y))elevation.set(m,y)}).catch(()=>retry.set(m,performance.now()+30000)).finally(()=>{pending.delete(m);active--})}}
const point=new THREE.Vector3(),foot=new THREE.Vector3();
 fetch('./mountains.json').then(r=>{if(!r.ok)throw Error('mountains');return r.json()}).then(d=>{mountains=[...sights,...d.mountains.filter(m=>!SIGHTS.some(s=>s.anchor==='山頂'&&s.name===m.name)).map(m=>({...m,...local(m.lon,m.lat)}))]}).catch(()=>{});
 return {refresh(){tick=1;candidates=[];pool.forEach(p=>p.el.hidden=true)},update(dt){
 tick+=dt;
 // Rank nearby mountains infrequently; project the moving anchors every frame.
 if(tick>=.5){tick=0;candidates=mountains.map(m=>({m,d:Math.hypot(m.x-position.x,m.z-position.z)})).filter(p=>p.d<12500).sort((a,b)=>(a.d*(a.m.sight?.6:1))-(b.d*(b.m.sight?.6:1)));preload()}
 pool.forEach(p=>p.el.hidden=true);
 const boxes=[],w=innerWidth,h=innerHeight,limit=w<=700?3:6;let count=0;
 for(const {m}of candidates){if(count>=limit)break;const d=Math.hypot(m.x-position.x,m.z-position.z);if(d>=12000)continue;const ground=height(m.x,m.z)??elevation.get(m);if(!Number.isFinite(ground))continue;
 let blocked=false;for(const ratio of [.25,.5,.75]){const x=camera.position.x+(m.x-camera.position.x)*ratio,z=camera.position.z+(m.z-camera.position.z)*ratio,terrain=height(x,z);if(terrain!==null&&terrain>camera.position.y+(ground-camera.position.y)*ratio+30){blocked=true;break}}
 if(blocked)continue;
 foot.set(m.x,ground+5,m.z).project(camera);point.set(m.x,ground+200,m.z).project(camera);if(point.z< -1||point.z>1||foot.z< -1||foot.z>1)continue;
 const x=(point.x*.5+.5)*w,y=(-point.y*.5+.5)*h,fx=(foot.x*.5+.5)*w,fy=(-foot.y*.5+.5)*h;
 if(x<65||x>w-65||y<85||y>h-155)continue;
 const width=Math.min(230,m.name.length*13+12),box={l:x-width/2,r:x+width/2,t:y-23,b:y};if(boxes.some(b=>box.l<b.r+12&&box.r>b.l-12&&box.t<b.b+12&&box.b>b.t-12))continue;boxes.push(box);
 const {el,stem,label}=pool[count++];label.textContent=m.name;el.style.transform=`translate3d(${x}px,${y}px,0)`;el.style.opacity=String(Math.min(1,(12000-d)/2500));const dx=fx-x,dy=fy-y;stem.style.height=Math.hypot(dx,dy)+'px';stem.style.transform=`rotate(${Math.atan2(-dx,dy)}rad)`;el.hidden=false;
 }
 }};
}
