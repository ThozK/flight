import * as THREE from './three.module.js';
export const CHAIN_COLORS={lawson:'#35a9ff',familymart:'#39df74',seven:'#ff8934',yamazaki:'#ffd541',other:'#c88fff'};
export const PIN_LIMIT=90,PIN_RANGE=6500;
export function nearestStores(stores,pos){return stores.map(s=>({...s,distance:Math.hypot(s.x-pos.x,s.z-pos.z)})).filter(s=>s.distance<PIN_RANGE).sort((a,b)=>a.distance-b.distance).slice(0,PIN_LIMIT)}
export function createStorePins({scene,height,local,position,camera}){
  const status=document.querySelector('#stores-status'),toggle=document.querySelector('#pins-toggle'),labelHost=document.querySelector('#pin-labels');
  const group=new THREE.Group();scene.add(group);
  const coreMat=new THREE.MeshBasicMaterial({transparent:true,opacity:.96,depthWrite:false,fog:false,toneMapped:false});
  const glowMat=new THREE.MeshBasicMaterial({transparent:true,opacity:.15,depthWrite:false,blending:THREE.AdditiveBlending,fog:false,toneMapped:false});
  // Two instanced meshes keep every visible beam to two draw calls, no lights.
  const core=new THREE.InstancedMesh(new THREE.CylinderGeometry(1.3,1.3,1,5),coreMat,PIN_LIMIT);
  const glow=new THREE.InstancedMesh(new THREE.CylinderGeometry(10,16,1,6,1,true),glowMat,PIN_LIMIT);
  core.count=glow.count=0;core.frustumCulled=glow.frustumCulled=false;group.add(core,glow);
  const dummy=new THREE.Object3D(),color=new THREE.Color(),screen=new THREE.Vector3();let stores=[],visible=[],ready=false;
  const labels=Array.from({length:4},()=>{const el=document.createElement('div');el.className='pin-label';el.hidden=true;labelHost.append(el);return el});
  function update(){if(!ready)return;group.visible=toggle.checked;visible=toggle.checked?nearestStores(stores,position).filter(s=>height(s.x,s.z)!==null):[];core.count=glow.count=visible.length;visible.forEach((s,i)=>{s.base=height(s.x,s.z)+3;s.top=s.base+850;dummy.position.set(s.x,s.base+425,s.z);dummy.scale.set(1,850,1);dummy.updateMatrix();color.set(CHAIN_COLORS[s.chain]||CHAIN_COLORS.other);for(const mesh of [core,glow]){mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,color)}});for(const mesh of [core,glow]){mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true}status.textContent=toggle.checked?`近くの ${visible.length} 店舗を表示 · 取得 ${stores.length} 件`:`光柱を非表示 · 取得 ${stores.length} 件`}
  function positionLabels(){labels.forEach(el=>el.hidden=true);if(!toggle.checked)return;let count=0;for(const s of visible){if(count>=labels.length||s.distance>3800)break;screen.set(s.x,Math.min(s.top,position.y-120),s.z).project(camera);if(screen.z< -1||screen.z>1||Math.abs(screen.x)>.92||screen.y<-.62||screen.y>.65)continue;const x=(screen.x+1)*innerWidth/2,y=(1-screen.y)*innerHeight/2;if(x>innerWidth-270&&y<340)continue;if(innerWidth<700&&x<innerWidth*.5&&y<innerHeight*.5)continue;const el=labels[count++];el.hidden=false;el.style.left=x+'px';el.style.top=y+'px';el.style.setProperty('--chain',CHAIN_COLORS[s.chain]||CHAIN_COLORS.other);el.textContent=s.name+' · '+(s.distance/1000).toFixed(1)+' km'}}
  toggle.addEventListener('change',()=>{update();positionLabels()});
  fetch('./convenience.json').then(r=>{if(!r.ok)throw new Error('Store data unavailable');return r.json()}).then(data=>{stores=data.stores.map(s=>({...s,...local(s.lon,s.lat)}));ready=true;status.title=`OSMデータ日時：${data.data_timestamp}`;update()}).catch(()=>{status.textContent='店舗位置を取得できませんでした';toggle.checked=false;toggle.disabled=true});
  return {update,labels:positionLabels};
}
