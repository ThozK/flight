import {createMountainLabels} from './mountain-labels.mjs?v=flight-dpad-2';
import * as THREE from './three.module.js';
import {DETAIL_LIMIT,DETAIL_JOBS,photoPriority,desiredPhotos} from './photo-policy.mjs?v=flight-dpad-2';
import {createStorePins} from './store-pins.mjs?v=flight-dpad-2';
import {REGION,DESTINATIONS,destinationStart,TERRAIN_RADIUS,TERRAIN_JOBS,wantedTerrain,inRegion,reconcileTerrain} from './region.mjs?v=flight-dpad-2';
const svg=body=>`<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;
const icons={play:svg('<path d="m8 5 11 7-11 7z"/>'),pause:svg('<path d="M8 5v14M16 5v14"/>'),mute:svg('<path d="m11 5-6 5H2v4h3l6 5zM16 9l6 6m0-6-6 6"/>'),sound:svg('<path d="m11 5-6 5H2v4h3l6 5zM16 8q6 4 0 8"/>'),settings:svg('<path d="M3 6h18M3 12h18M3 18h18"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="8" cy="18" r="2"/>'),left:svg('<path d="m14 6-6 6 6 6"/>'),right:svg('<path d="m10 6 6 6-6 6"/>')};
const $=s=>document.querySelector(s),clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const ZOOM=13,N=2**ZOOM,SCALE=Math.cos(36.18*Math.PI/180),TILE=2*Math.PI*6378137/N*SCALE;
function coord(lon,lat){return {x:(lon+180)/360*N,y:(1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*N}}
const center=coord(136.18,36.18),cx=Math.floor(center.x),cy=Math.floor(center.y);
function local(lon,lat){const p=coord(lon,lat);return {x:(p.x-center.x)*TILE,z:(p.y-center.y)*TILE}}
function geo(x,z){return {lon:(x/TILE+center.x)/N*360-180,lat:Math.atan(Math.sinh(Math.PI*(1-2*(z/TILE+center.y)/N)))*180/Math.PI}}
const initialDestination=DESTINATIONS.find(d=>d.id==='katsuyama')||DESTINATIONS[0];
const spawn=local(initialDestination.lon,initialDestination.lat),pos=new THREE.Vector3(spawn.x,650,spawn.z),held=new Set(),tiles=[],demCache=new Map();
const mc=$('#map').getContext('2d'),landmarks=DESTINATIONS.map(d=>[d.name,d.lon,d.lat]);
let currentDestination=initialDestination,tourIndex=(DESTINATIONS.indexOf(initialDestination)+1)%DESTINATIONS.length,terrainActive=0,worldX=null,worldY=null,sea;
const overview=[];
let boundaryPaths=null;
async function loadBoundaries(){try{const response=await fetch('./boundaries.json');if(!response.ok)throw new Error('boundary load');const data=await response.json();boundaryPaths={};for(const key of ['outer','inner']){const path=new Path2D();for(const line of data[key])line.forEach(([lon,lat],i)=>{const p=local(lon,lat);i?path.lineTo(p.x,p.z):path.moveTo(p.x,p.z)});boundaryPaths[key]=path}}catch{document.querySelector('.boundary-key').textContent='境界データを読み込めませんでした'}}

let speed=85,altitudeOffset=0,swipeLift=0;
let renderer,scene,camera,plane,propeller,heading=-.37,bank=0,elapsed=0,last=0,paused=false,started=false,muted=true,audio=null,mapTick=0;
function notify(text){$('#status').textContent=text;$('#status').style.opacity=1;clearTimeout(notify.t);notify.t=setTimeout(()=>$('#status').style.opacity=0,3000)}
let imageActive=0;const imageQueue=[];
function drainImages(){while(imageActive<6&&imageQueue.length){imageActive++;imageQueue.shift()()}}
function image(url){return new Promise((resolve,reject)=>{imageQueue.push(()=>{const im=new Image();im.crossOrigin='anonymous';let done=false;const finish=(err)=>{if(done)return;done=true;clearTimeout(timer);im.onload=im.onerror=null;imageActive--;err?reject(err):resolve(im);drainImages()};const timer=setTimeout(()=>{im.src='';finish(new Error('Image timeout'))},16000);im.onload=()=>finish();im.onerror=()=>finish(new Error('Image unavailable'));im.src=url});drainImages()})}

function decodeHeight(r,g,b){const n=r*65536+g*256+b;return n===8388608?NaN:(n<8388608?n:n-16777216)*.01}
const globalDemCache=new Map();
async function heightImage(url){const im=await image(url),c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(im,0,0);const rgba=ctx.getImageData(0,0,256,256).data,data=new Float32Array(65536);for(let i=0;i<data.length;i++)data[i]=decodeHeight(rgba[i*4],rgba[i*4+1],rgba[i*4+2]);return data}
async function dem(x,y){while(demCache.size>32)demCache.delete(demCache.keys().next().value);while(globalDemCache.size>8)globalDemCache.delete(globalDemCache.keys().next().value);const key=x+','+y;if(!demCache.has(key))demCache.set(key,(async()=>{try{return await heightImage(`https://cyberjapandata.gsi.go.jp/xyz/dem_png/${ZOOM-1}/${x}/${y}.png`)}catch{const gx=Math.floor(x/16),gy=Math.floor(y/16),gkey=gx+','+gy;if(!globalDemCache.has(gkey))globalDemCache.set(gkey,heightImage(`https://cyberjapandata.gsi.go.jp/xyz/demgm_png/8/${gx}/${gy}.png`));const coarse=await globalDemCache.get(gkey),data=new Float32Array(65536);for(let j=0;j<256;j++)for(let i=0;i<256;i++)data[j*256+i]=sample(coarse,(x%16)*16+i/16,(y%16)*16+j/16);return data}})());return demCache.get(key)}

function sample(data,x,y){x=clamp(x,0,255);y=clamp(y,0,255);const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,h=(a,b)=>{const v=data[Math.min(b,255)*256+Math.min(a,255)];return Number.isFinite(v)?Math.max(0,v):0};return (h(ix,iy)*(1-fx)+h(ix+1,iy)*fx)*(1-fy)+(h(ix,iy+1)*(1-fx)+h(ix+1,iy+1)*fx)*fy}
function height(x,z){const tx=x/TILE+center.x,ty=z/TILE+center.y,t=tiles.find(t=>t.x===Math.floor(tx)&&t.y===Math.floor(ty));return t?.heights?sample(t.heights,((t.x%2)+tx-t.x)*128,((t.y%2)+ty-t.y)*128):null}
async function mountainHeight(x,z){const tx=x/TILE+center.x,ty=z/TILE+center.y,dx=Math.floor(tx/2),dy=Math.floor(ty/2);const data=await dem(dx,dy);return sample(data,(tx-dx*2)*128,(ty-dy*2)*128)}
function makeTerrain(t,data){const seg=96,g=new THREE.PlaneGeometry(TILE,TILE,seg,seg);g.rotateX(-Math.PI/2);const v=g.attributes.position;for(let i=0;i<v.count;i++){const u=(v.getX(i)+TILE/2)/TILE,w=(v.getZ(i)+TILE/2)/TILE;v.setY(i,data?sample(data,((t.x%2)+u)*128,((t.y%2)+w)*128):0)}g.computeVertexNormals();const mat=new THREE.MeshBasicMaterial({color:0x69858a,side:THREE.DoubleSide}),mesh=new THREE.Mesh(g,mat);mesh.position.set((t.x+.5-center.x)*TILE,0,(t.y+.5-center.y)*TILE);scene.add(mesh);t.mesh=mesh;t.heights=data;
// Vertical skirts conceal elevation sampling seams between neighboring tiles.
const edge=[];for(let i=0;i<=seg;i++)edge.push(i);for(let i=1;i<=seg;i++)edge.push(i*(seg+1)+seg);for(let i=seg-1;i>=0;i--)edge.push(seg*(seg+1)+i);for(let i=seg-1;i>=0;i--)edge.push(i*(seg+1));const p=[],uv=[],ix=[];edge.forEach((i,j)=>{p.push(v.getX(i),v.getY(i),v.getZ(i),v.getX(i),v.getY(i)-65,v.getZ(i));const a=g.attributes.uv;uv.push(a.getX(i),a.getY(i),a.getX(i),a.getY(i));if(j<edge.length-1){let k=j*2;ix.push(k,k+1,k+2,k+1,k+3,k+2)}});const skirt=new THREE.BufferGeometry();skirt.setAttribute('position',new THREE.Float32BufferAttribute(p,3));skirt.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));skirt.setIndex(ix);mesh.add(new THREE.Mesh(skirt,mat))}
let detailActive=0,detailTick=0,storePins=null,mountainLabels=null;
function setTexture(t,texture){t.mesh.material.map=texture;t.mesh.material.color.set(0xffffff);t.mesh.material.needsUpdate=true}
function configureTexture(texture){texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),8);texture.needsUpdate=true;return texture}
async function photo(t){const im=await image(`https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/${ZOOM}/${t.x}/${t.y}.jpg`);if(t.disposed)return;t.baseTexture=configureTexture(new THREE.Texture(im));t.image=im;setTexture(t,t.baseTexture)}
function releaseDetail(t){if(!t.detailTexture)return;if(!t.disposed)setTexture(t,t.baseTexture);t.detailTexture.dispose();t.detailTexture=null;t.lastUsed=0}
async function upgradePhoto(t){detailActive++;t.busy=true;try{const factor=4,canvas=document.createElement('canvas');canvas.width=canvas.height=1024;const ctx=canvas.getContext('2d');
// Two tile jobs, two images per job: at most four high-detail requests at once.
for(let i=0;i<16;i+=2){if(t.disposed||!desiredPhotos(photoPriority(tiles,pos.x,pos.z,TILE,center),TILE).includes(t))return;const images=await Promise.all([i,i+1].map(j=>image(`https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/${ZOOM+2}/${t.x*factor+j%factor}/${t.y*factor+Math.floor(j/factor)}.jpg`)));images.forEach((im,k)=>ctx.drawImage(im,(i+k)%factor*256,Math.floor((i+k)/factor)*256))}
const desired=desiredPhotos(photoPriority(tiles,pos.x,pos.z,TILE,center),TILE);if(t.disposed||!desired.includes(t))return;
const cached=tiles.filter(p=>p.detailTexture);if(cached.length>=DETAIL_LIMIT){const oldest=cached.filter(p=>!desired.includes(p)).sort((a,b)=>a.lastUsed-b.lastUsed)[0];if(oldest)releaseDetail(oldest);else return}
t.detailTexture=configureTexture(new THREE.CanvasTexture(canvas));t.lastUsed=performance.now();setTexture(t,t.detailTexture)
}catch{t.retryAfter=performance.now()+30000}finally{t.busy=false;detailActive--}}
function streamPhotos(){if(!started||document.hidden)return;const ranked=photoPriority(tiles,pos.x,pos.z,TILE,center),desired=desiredPhotos(ranked,TILE),now=performance.now();for(const p of ranked){if(desired.includes(p.tile))p.tile.lastUsed=now;if(p.distance>TILE*2.8)releaseDetail(p.tile)}for(const t of desired){if(detailActive>=DETAIL_JOBS)break;if(!t.detailTexture&&!t.busy&&!(t.retryAfter>now))void upgradePhoto(t)}const complete=desired.filter(t=>t.detailTexture).length;$('#photo-status').textContent=`近景 ${complete}/${desired.length} 高精細${detailActive?' · 更新中':''}`}

function disposeTile(t){t.disposed=true;if(t.mesh){scene.remove(t.mesh);t.mesh.traverse(o=>{if(o.geometry)o.geometry.dispose()});t.mesh.material.dispose()}t.baseTexture?.dispose();t.detailTexture?.dispose();t.image=null;t.heights=null}
function readyTile(x,z){const tx=Math.floor(x/TILE+center.x),ty=Math.floor(z/TILE+center.y);return tiles.find(t=>t.x===tx&&t.y===ty&&t.heights&&t.baseTexture)}
function progressWorld(){const photos=tiles.filter(t=>t.baseTexture).length,elevations=tiles.filter(t=>t.heights).length;$('#load-detail').textContent=`周辺の航空写真 ${photos}/${tiles.length} · 標高 ${elevations}/${tiles.length}`;
if(!started&&readyTile(pos.x,pos.z)){pos.y=Math.max(650,(height(pos.x,pos.z)||0)+600);started=true;$('#loading').classList.add('done');$('#retry').hidden=true}
$('#data-note').textContent=terrainActive?'周辺の地形を更新中':'航空写真 × 実地形';if(!started&&!terrainActive&&!tiles.some(t=>!t.ready&&!(t.retryAfter>performance.now()))){$('#loading b').textContent='この地域のデータを読み込めませんでした';$('#retry').hidden=false}}
async function loadTile(t){let data=null;try{data=await dem(Math.floor(t.x/2),Math.floor(t.y/2));if(t.disposed)return;makeTerrain(t,data);await photo(t);if(t.disposed)return;t.ready=true}catch{if(!t.disposed){t.retryAfter=performance.now()+30000;if(t.mesh){scene.remove(t.mesh);t.mesh.traverse(o=>o.geometry?.dispose());t.mesh.material.dispose();t.mesh=null;t.heights=null}}}}
function pumpWorld(){if(document.hidden)return;while(terrainActive<TERRAIN_JOBS){const tx=pos.x/TILE+center.x,ty=pos.z/TILE+center.y,t=tiles.filter(t=>!t.ready&&!t.loading&&!(t.retryAfter>performance.now())).sort((a,b)=>Math.hypot(a.x+.5-tx,a.y+.5-ty)-Math.hypot(b.x+.5-tx,b.y+.5-ty))[0];if(!t)break;t.loading=true;terrainActive++;loadTile(t).finally(()=>{t.loading=false;terrainActive--;progressWorld();pumpWorld()})}}
function streamWorld(force=false){const x=Math.floor(pos.x/TILE+center.x),y=Math.floor(pos.z/TILE+center.y);if(force||x!==worldX||y!==worldY){worldX=x;worldY=y;reconcileTerrain(tiles,wantedTerrain(x,y),disposeTile)}pumpWorld();progressWorld()}
function beginFlight(destination){currentDestination=destination;const departure=destinationStart(destination),p=local(departure.lon,departure.lat);pos.set(p.x,650,p.z);heading=departure.heading;bank=0;elapsed=0;altitudeOffset=0;started=false;$('#photo-status').textContent='近景写真を準備中…';tourIndex=DESTINATIONS.includes(destination)?(DESTINATIONS.indexOf(destination)+1)%DESTINATIONS.length:DESTINATIONS.reduce((best,d,i)=>Math.hypot(d.lon-destination.lon,d.lat-destination.lat)<Math.hypot(DESTINATIONS[best].lon-destination.lon,DESTINATIONS[best].lat-destination.lat)?i:best,0);clearHeld();$('#loading').classList.remove('done');$('#loading b').textContent=destination.name+'の空を準備しています';$('#retry').hidden=true;streamWorld(true);mountainLabels?.refresh();updateUI();storePins?.update()}
async function loadOverview(){const lo=coord(REGION.west,REGION.north),hi=coord(REGION.east,REGION.south),factor=32;for(let y=Math.floor(lo.y/factor);y<=Math.floor(hi.y/factor);y++)for(let x=Math.floor(lo.x/factor);x<=Math.floor(hi.x/factor);x++){try{overview.push({x,y,image:await image(`https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/8/${x}/${y}.jpg`)})}catch{/* Keep labels and the aircraft visible if overview imagery fails. */}}}

function makePlane(){
 const group=new THREE.Group(),materials=[0xe8ded0,0xa44b34,0x37576a].map(color=>new THREE.MeshStandardMaterial({color,roughness:.5}));
 const variants=[];let activeRotor=null;
 function mesh(parent,geometry,x,y,z,material=0){const o=new THREE.Mesh(geometry,materials[material]);o.position.set(x,y,z);parent.add(o);return o}
 function box(parent,x,y,z,w,h,d,m=0){return mesh(parent,new THREE.BoxGeometry(w,h,d),x,y,z,m)}
 for(let type=0;type<4;type++){
  const v=new THREE.Group();group.add(v);variants.push(v);
  if(type===0){
   // Curved fabric canopy, suspension lines and a seated pilot.
   const vertices=[],indices=[],segments=24;
   for(let i=0;i<=segments;i++){const t=i/segments*Math.PI,x=-Math.cos(t)*13,y=8+Math.sin(t)*5;vertices.push(x,y,-2.5,x,y,2.5);if(i<segments){const k=i*2;indices.push(k,k+1,k+2,k+1,k+3,k+2)}}
   const canopy=new THREE.BufferGeometry();canopy.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));canopy.setIndex(indices);canopy.computeVertexNormals();
   const fabric=new THREE.MeshStandardMaterial({color:0xc86542,side:THREE.DoubleSide,roughness:.85});v.add(new THREE.Mesh(canopy,fabric));
   const ropes=[];for(const x of [-12,-8,-4,4,8,12])for(const z of [-2.5,2.5]){const y=8+Math.sqrt(1-(x/13)**2)*5;ropes.push(x,y,z,x<0?-.7:.7,0,0)}
   const lines=new THREE.BufferGeometry();lines.setAttribute('position',new THREE.Float32BufferAttribute(ropes,3));v.add(new THREE.LineSegments(lines,new THREE.LineBasicMaterial({color:0x53645d})));
   mesh(v,new THREE.SphereGeometry(.65,12,8),0,-.2,0,2);box(v,0,-1.6,.2,1.4,2,1.2,2);box(v,0,-2.6,-.8,1.5,.6,2.4,1);
  }else if(type===1){
   mesh(v,new THREE.SphereGeometry(1,20,12),0,0,-1).scale.set(3,2.5,5);
   mesh(v,new THREE.SphereGeometry(1,16,10),0,.5,-3,2).scale.set(2.7,2,2.5);
   box(v,0,0,6,1,1,10,1);box(v,0,2,10,.3,4,2,1);
   for(const x of [-2.5,2.5]){box(v,x,-3,0,.3,.3,9,2);box(v,x,-1.8,0,.2,2.4,.2,2)}
   const rotor=new THREE.Group();rotor.position.y=3;v.add(rotor);box(v,0,2.6,0,.3,1,.3,2);box(rotor,0,0,0,22,.22,.9,1);mesh(rotor,new THREE.SphereGeometry(.5,12,8),0,0,0,2);v.userData.rotor=rotor;
  }else{
   const body=mesh(v,new THREE.CapsuleGeometry(1.15,type===2?8:12,8,16),0,0,1);body.rotation.x=Math.PI/2;
   box(v,0,1.4,-1.1,1.9,1.5,3.1,2);
   if(type===2){box(v,0,1.5,0,22,.28,3);box(v,-10,1.5,0,2,.3,3,1);box(v,10,1.5,0,2,.3,3,1);const rotor=box(v,0,0,-4.7,.22,6,.16,1);v.userData.rotor=rotor;}
   else{for(const sign of [-1,1]){const wing=box(v,sign*5,0,2,11,.25,3);wing.rotation.y=-sign*.35;mesh(v,new THREE.CylinderGeometry(.8,.8,4,16),sign*2,0,5,2).rotation.x=Math.PI/2;}mesh(v,new THREE.ConeGeometry(1.15,4,16),0,0,-7).rotation.x=-Math.PI/2;}
   box(v,0,.3,6,7,.2,1.8);box(v,0,1.8,6,.25,3,2,1);
  }
 }
 group.userData.choose=index=>{variants.forEach((v,i)=>v.visible=i===index);activeRotor=variants[index].userData.rotor;group.userData.type=index};
 group.userData.animate=dt=>{if(activeRotor){if(group.userData.type===1)activeRotor.rotation.y+=dt*12;else activeRotor.rotation.z+=dt*65}};
 group.userData.choose([85,170,340,680].indexOf(speed));group.scale.setScalar(1.25);scene.add(group);return group;
}
function init(){try{renderer=new THREE.WebGLRenderer({canvas:$('#world'),antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));renderer.setSize(innerWidth,innerHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;scene=new THREE.Scene();scene.background=new THREE.Color('#c4dae5');scene.fog=new THREE.Fog('#c4dae5',8500,16000);camera=new THREE.PerspectiveCamera(55,innerWidth/innerHeight,10,22000);scene.add(new THREE.HemisphereLight(0xffffff,0x52675a,2.3));const sun=new THREE.DirectionalLight(0xfff2d5,2);sun.position.set(-1000,3000,-1500);scene.add(sun);sea=new THREE.Mesh(new THREE.PlaneGeometry(70000,70000),new THREE.MeshBasicMaterial({color:0x567f90,depthWrite:false,depthTest:false}));sea.renderOrder=-1;sea.rotation.x=-Math.PI/2;sea.position.y=-4;scene.add(sea);plane=makePlane();mountainLabels=createMountainLabels({camera,position:pos,local,height,mountainHeight});storePins=createStorePins({scene,height,local,position:pos,camera});streamWorld(true);loadOverview();loadBoundaries();requestAnimationFrame(frame)}catch(e){console.error(e);$('#loading b').textContent='3D表示を開始できませんでした';$('#load-detail').textContent='WebGLに対応したブラウザで開いてください。';$('#retry').hidden=false}}
function updateUI(){const degrees=((heading*180/Math.PI)%360+360)%360;$('#compass-needle').setAttribute('transform',`rotate(${-degrees} 50 50)`);$('.compass').setAttribute('aria-label',`方位磁針：進行方向 ${Math.round(degrees)}度`);const g=geo(pos.x,pos.z),near=[...landmarks].sort((a,b)=>Math.hypot(g.lon-a[1],g.lat-a[2])-Math.hypot(g.lon-b[1],g.lat-b[2]))[0];$('#place').innerHTML=`${near[0]}周辺の空<small>${g.lat.toFixed(4)}° N · ${g.lon.toFixed(4)}° E</small>`;$('#altitude').innerHTML=`${Math.round(pos.y)} <small>m</small>`;$('#timer').textContent=`${Math.floor(elapsed/60).toString().padStart(2,'0')}:${Math.floor(elapsed%60).toString().padStart(2,'0')}`}
function frame(t){const dt=Math.min(Math.max(0,(t-last)/1000),.05);last=t;const steer=clamp(Number(held.has('right'))-Number(held.has('left'))+swipeTurn,-1,1);if(started&&!paused){altitudeOffset=clamp(altitudeOffset+(Number(held.has('up'))-Number(held.has('down'))+swipeLift)*180*dt,-100,3000);elapsed+=dt;let turn=steer*.24;if(!steer){let target=local(DESTINATIONS[tourIndex].lon,DESTINATIONS[tourIndex].lat);if(Math.hypot(target.x-pos.x,target.z-pos.z)<Math.max(1600,speed/3.6*18)){tourIndex=(tourIndex+1)%DESTINATIONS.length;target=local(DESTINATIONS[tourIndex].lon,DESTINATIONS[tourIndex].lat)}const desired=Math.atan2(target.x-pos.x,-(target.z-pos.z)),diff=Math.atan2(Math.sin(desired-heading),Math.cos(desired-heading));turn=clamp(diff*.1,-.08,.08)}const g=geo(pos.x,pos.z);if(g.lon<REGION.west+.025||g.lon>REGION.east-.025||g.lat<REGION.south+.025||g.lat>REGION.north-.025){const p=local(clamp(g.lon,REGION.west+.07,REGION.east-.07),clamp(g.lat,REGION.south+.07,REGION.north-.07)),desired=Math.atan2(p.x-pos.x,-(p.z-pos.z)),diff=Math.atan2(Math.sin(desired-heading),Math.cos(desired-heading));turn=clamp(diff*.3,-.3,.3)}heading+=turn*dt;bank=THREE.MathUtils.damp(bank,-turn*1.35,3,dt);const nx=pos.x+Math.sin(heading)*speed/3.6*dt,nz=pos.z-Math.cos(heading)*speed/3.6*dt;if(readyTile(nx,nz)&&inRegion(geo(nx,nz).lon,geo(nx,nz).lat)){pos.x=nx;pos.z=nz}let required=600+altitudeOffset;for(const d of [0,400,900,Math.max(1800,speed/3.6*12)]){const ground=height(pos.x+Math.sin(heading)*d,pos.z-Math.cos(heading)*d);if(ground!==null)required=Math.max(required,ground+Math.max(150,330+altitudeOffset))}pos.y=Math.max(500,(height(pos.x,pos.z)||0)+150,THREE.MathUtils.damp(pos.y,required,1.1,dt));plane.userData.animate(dt)}sea.position.x=pos.x;sea.position.z=pos.z;plane.position.copy(pos);plane.rotation.set(0,-heading,bank);camera.position.set(pos.x-Math.sin(heading)*110,pos.y+43,pos.z+Math.cos(heading)*110);camera.lookAt(pos.x+Math.sin(heading)*650,pos.y-310,pos.z-Math.cos(heading)*650);renderer.render(scene,camera);detailTick+=dt;if(detailTick>.8){streamWorld();streamPhotos();storePins?.update();detailTick=0}storePins?.labels();mountainLabels?.update(dt);mapTick+=dt;if(mapTick>.2){updateUI();drawMap();mapTick=0}requestAnimationFrame(frame)}
function drawMap(){mc.setTransform(2,0,0,2,0,0);mc.fillStyle='#648798';mc.fillRect(0,0,300,210);const a=local(REGION.west,REGION.north),b=local(REGION.east,REGION.south),scale=Math.min(290/(b.x-a.x),200/(b.z-a.z)),ox=150-(a.x+b.x)/2*scale,oy=105-(a.z+b.z)/2*scale;for(const t of overview)mc.drawImage(t.image,ox+(t.x*32-center.x)*TILE*scale,oy+(t.y*32-center.y)*TILE*scale,32*TILE*scale+.3,32*TILE*scale+.3);if(boundaryPaths){mc.save();mc.translate(ox,oy);mc.scale(scale,scale);mc.lineJoin='round';mc.strokeStyle='#102c36';mc.lineWidth=2.6/scale;mc.stroke(boundaryPaths.outer);mc.strokeStyle='#ffdc85';mc.lineWidth=1.4/scale;mc.stroke(boundaryPaths.outer);mc.strokeStyle='#ffffffdd';mc.lineWidth=.7/scale;mc.stroke(boundaryPaths.inner);mc.restore()}mc.fillStyle='#fff';mc.font='8px sans-serif';mc.shadowColor='#17281a';mc.shadowBlur=3;for(const [name,lon,lat]of landmarks.filter((_,i)=>[1,2,5,7,8,10,11,12].includes(i))){const p=local(lon,lat);mc.fillText(name,ox+p.x*scale,oy+p.z*scale)}mc.shadowBlur=0;mc.save();mc.translate(ox+pos.x*scale,oy+pos.z*scale);mc.rotate(heading);mc.fillStyle='#e53935';mc.strokeStyle='#ffffff';mc.lineWidth=1;mc.beginPath();mc.moveTo(0,-7);mc.lineTo(-4,5);mc.lineTo(0,2);mc.lineTo(4,5);mc.closePath();mc.fill();mc.stroke();mc.restore()}

let swipeTurn=0,gesture=null;
function clearHeld(){swipeTurn=0;swipeLift=0;gesture=null;held.clear();document.querySelectorAll('.held').forEach(b=>b.classList.remove('held'))}for(const dir of ['left','right','up','down']){const b=$('#'+dir);b.onpointerdown=e=>{e.preventDefault();b.setPointerCapture(e.pointerId);held.add(dir);b.classList.add('held')};for(const e of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(e,()=>{held.delete(dir);b.classList.remove('held')})}
addEventListener('keydown',e=>{if(e.target.tagName==='SELECT')return;if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyW','KeyS','KeyA','KeyD','Space'].includes(e.code)&&!['BUTTON','SELECT'].includes(e.target.tagName))e.preventDefault();if(['ArrowUp','KeyW'].includes(e.code))held.add('up');if(['ArrowDown','KeyS'].includes(e.code))held.add('down');if(['ArrowLeft','KeyA'].includes(e.code))held.add('left');if(['ArrowRight','KeyD'].includes(e.code))held.add('right');if(e.code==='Space'&&!e.repeat&&!['BUTTON','SELECT'].includes(e.target.tagName))togglePause()});addEventListener('keyup',e=>{if(['ArrowUp','KeyW'].includes(e.code))held.delete('up');if(['ArrowDown','KeyS'].includes(e.code))held.delete('down');if(['ArrowLeft','KeyA'].includes(e.code))held.delete('left');if(['ArrowRight','KeyD'].includes(e.code))held.delete('right')});addEventListener('blur',clearHeld);document.addEventListener('visibilitychange',()=>{clearHeld();last=performance.now();updateAudio()});
// Procedural aircraft sound: one bounded noise loop plus tonal engine layers.
function createFlightAudio(){
 const ctx=new(window.AudioContext||window.webkitAudioContext)(),master=ctx.createGain();master.gain.value=0;master.connect(ctx.destination);
 const buffer=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate),data=buffer.getChannelData(0);let brown=0;
 for(let i=0;i<data.length;i++){brown=(brown+Math.random()*.04-.02)/1.02;data[i]=brown*3.5}
 const noise=ctx.createBufferSource();noise.buffer=buffer;noise.loop=true;
 const filter=ctx.createBiquadFilter();filter.type='lowpass';const wind=ctx.createGain();noise.connect(filter);filter.connect(wind);wind.connect(master);noise.start();
 const tones=[1,2,3].map(()=>{const osc=ctx.createOscillator(),gain=ctx.createGain();osc.type='sine';gain.gain.value=0;osc.connect(gain);gain.connect(master);osc.start();return {osc,gain}});
 const pulse=ctx.createOscillator(),pulseGain=ctx.createGain();pulse.type='sine';pulse.connect(pulseGain);pulseGain.connect(wind.gain);pulse.start();
 return {ctx,master,filter,wind,tones,pulse,pulseGain};
}
function updateAudio(){if(!audio)return;const {ctx,master,filter,wind,tones,pulse,pulseGain}=audio,t=ctx.currentTime,index=[85,170,340,680].indexOf(speed);
 const profiles=[
  {cutoff:1700,noise:.42,pulse:0,rate:1,frequencies:[0,0,0],levels:[0,0,0]},
  {cutoff:550,noise:.24,pulse:.17,rate:17,frequencies:[48,96,144],levels:[.11,.05,.025]},
  {cutoff:950,noise:.15,pulse:.055,rate:32,frequencies:[80,160,240],levels:[.10,.055,.025]},
  {cutoff:4200,noise:.44,pulse:.01,rate:45,frequencies:[220,440,880],levels:[.025,.017,.008]}
 ],p=profiles[index];
 master.gain.setTargetAtTime(!document.hidden&&!muted&&!paused?.16:0,t,.25);
 filter.frequency.setTargetAtTime(p.cutoff,t,.35);wind.gain.setTargetAtTime(p.noise,t,.35);pulse.frequency.setTargetAtTime(p.rate,t,.35);pulseGain.gain.setTargetAtTime(p.pulse,t,.35);
 tones.forEach(({osc,gain},i)=>{osc.frequency.setTargetAtTime(p.frequencies[i]||1,t,.35);gain.gain.setTargetAtTime(p.levels[i],t,.35)});
}
function togglePause(){paused=!paused;$('#pause').innerHTML=paused?icons.play:icons.pause;$('#pause').setAttribute('aria-label',paused?'飛行を再開':'飛行を一時停止');updateAudio();notify(paused?'ひと休み中。もう一度押すと再開します。':'遊覧飛行を再開しました。')}
$('#pause').onclick=togglePause;$('#reset').onclick=()=>{if(paused)togglePause();$('#destination').value=currentDestination.id;beginFlight(currentDestination);notify(currentDestination.name+'の出発地点へ戻りました。')};$('#retry').onclick=()=>beginFlight(currentDestination);
const destinationSelect=$('#destination');for(const group of ['出発エリア',...new Set(DESTINATIONS.filter(d=>d.municipality).map(d=>d.municipality))]){const optgroup=document.createElement('optgroup');optgroup.label=group;for(const d of DESTINATIONS.filter(d=>(d.municipality||'出発エリア')===group)){const option=document.createElement('option');option.value=d.id;option.textContent=d.name;optgroup.append(option)}destinationSelect.append(optgroup)}destinationSelect.value=initialDestination.id;destinationSelect.onchange=()=>{const d=DESTINATIONS.find(d=>d.id===destinationSelect.value);if(d){beginFlight(d);notify(d.name+'へ移動しました。')}};
$('#sound').onclick=async()=>{try{if(!audio)audio=createFlightAudio();await audio.ctx.resume();muted=!muted;updateAudio();$('#sound').innerHTML=muted?icons.mute:icons.sound;$('#sound').setAttribute('aria-pressed',String(!muted))}catch{notify('音声を再生できませんでした。')}};
addEventListener('resize',()=>{if(!renderer)return;camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});
const speeds=[85,170,340,680];
const aircraftNames=['パラグライダー','ヘリコプター','セスナ','小型ジェット'];
function cycleAircraft(){const index=(speeds.indexOf(speed)+1)%speeds.length;speed=speeds[index];plane?.userData.choose(index);updateAudio();$('#speed-display').innerHTML=`${speed} <small>km/h</small>`;$('#aircraft-cycle').textContent=`${aircraftNames[index]} · ${speed} km/h ↻`;$('#aircraft-cycle').setAttribute('aria-label',`${aircraftNames[index]}、${speed}キロ毎時。押すと${aircraftNames[(index+1)%4]}に切り替え`);$('#aircraft-quick').setAttribute('aria-label',`${aircraftNames[index]}、${speed}キロ毎時。押すと${aircraftNames[(index+1)%4]}に切り替え`);notify(`${aircraftNames[index]} · ${speed} km/h`)}
$('#aircraft-cycle').onclick=cycleAircraft;
$('#aircraft-quick').onclick=cycleAircraft;
$('#data-note').textContent='航空写真・標高を取得中';init();

// The settings panel keeps native selects available for mobile browsers.
const settings=$('#details-toggle');settings.addEventListener('click',()=>{const open=document.body.classList.toggle('flight-details');settings.setAttribute('aria-expanded',String(open));settings.setAttribute('aria-label',open?'飛行設定を閉じる':'出発エリア・飛行速度を表示')});
const world=$('#world');world.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'||gesture)return;e.preventDefault();gesture={id:e.pointerId,x:e.clientX,y:e.clientY};world.setPointerCapture(e.pointerId)});
world.addEventListener('pointermove',e=>{if(gesture?.id!==e.pointerId)return;e.preventDefault();swipeTurn=clamp((e.clientX-gesture.x)/90,-1,1);swipeLift=clamp((gesture.y-e.clientY)/90,-1,1)});
for(const event of ['pointerup','pointercancel','lostpointercapture'])world.addEventListener(event,e=>{if(gesture?.id===e.pointerId){gesture=null;swipeTurn=0;swipeLift=0}});

for(const [id,icon]of Object.entries({sound:icons.mute,pause:icons.pause,'details-toggle':icons.settings,left:icons.left,right:icons.right}))$('#'+id).innerHTML=icon;

// Welcome copy fades after ten seconds; the brand reveals it again.
document.body.classList.add('intro-welcome');
setTimeout(()=>document.body.classList.remove('intro-welcome'),10000);
const brand=$('.brand');
brand.addEventListener('pointerenter',()=>document.body.classList.add('intro-reveal'));
brand.addEventListener('pointerleave',()=>document.body.classList.remove('intro-reveal'));
brand.addEventListener('focus',()=>document.body.classList.add('intro-reveal'));
brand.addEventListener('blur',()=>document.body.classList.remove('intro-reveal'));

// Invert the same projection used by the overview map.
$('#map').addEventListener('click',event=>{
 const rect=event.currentTarget.getBoundingClientRect();
 if(!rect.width||!rect.height)return;
 const x=(event.clientX-rect.left)/rect.width*300,y=(event.clientY-rect.top)/rect.height*210;
 const a=local(REGION.west,REGION.north),b=local(REGION.east,REGION.south);
 const scale=Math.min(290/(b.x-a.x),200/(b.z-a.z)),ox=150-(a.x+b.x)/2*scale,oy=105-(a.z+b.z)/2*scale;
 const point=geo((x-ox)/scale,(y-oy)/scale);
 if(!inRegion(point.lon,point.lat)){notify('地図内の飛行エリアを選んでください。');return}
 const destination={id:'map-point',name:'地図で選んだ地点',lon:point.lon,lat:point.lat};
 destinationSelect.value='';beginFlight(destination);notify('選んだ地点へ移動しました。');
});

// Reuse one destination selector across desktop map and mobile settings.
const destinationSetting=destinationSelect.closest('label');
const destinationHome=destinationSetting.parentElement;
const desktopDestination=document.createElement('div');desktopDestination.className='map-destination';$('.map').append(desktopDestination);
const desktopMapLayout=matchMedia('(min-width:701px) and (min-height:501px)');
function placeDestinationSetting(){if(desktopMapLayout.matches)desktopDestination.append(destinationSetting);else destinationHome.insertBefore(destinationSetting,destinationHome.querySelector('.speed-setting'));}
placeDestinationSetting();desktopMapLayout.addEventListener('change',placeDestinationSetting);

// Desktop map and store controls share an edge drawer; mobile rules keep them hidden.
const desktopDrawer=document.createElement('aside');desktopDrawer.className='desktop-drawer';desktopDrawer.setAttribute('aria-label','地図・コンビニ設定');
const drawerHandle=document.createElement('button');drawerHandle.type='button';drawerHandle.className='drawer-handle';drawerHandle.textContent='地図・設定';drawerHandle.setAttribute('aria-controls','desktop-drawer-content');drawerHandle.setAttribute('aria-expanded','false');
const drawerContent=document.createElement('div');drawerContent.id='desktop-drawer-content';drawerContent.append($('.map'),$('.store-legend'));desktopDrawer.append(drawerHandle,drawerContent);document.body.append(desktopDrawer);
function updateDrawerState(){drawerHandle.setAttribute('aria-expanded',String(desktopDrawer.matches(':hover')||desktopDrawer.contains(document.activeElement)))}
for(const event of ['pointerenter','pointerleave','focusin'])desktopDrawer.addEventListener(event,updateDrawerState);
desktopDrawer.addEventListener('focusout',()=>queueMicrotask(updateDrawerState));
