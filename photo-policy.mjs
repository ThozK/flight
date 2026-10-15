// Fixed limits keep near-field imagery bounded as the aircraft moves.
export const DETAIL_LIMIT=12,NEAR_COUNT=9,DETAIL_JOBS=2;
export function photoPriority(tiles,x,z,tileSize,center){
  return tiles.filter(t=>t.baseTexture).map(t=>({tile:t,distance:Math.hypot((t.x+.5-center.x)*tileSize-x,(t.y+.5-center.y)*tileSize-z)})).sort((a,b)=>a.distance-b.distance);
}
export function desiredPhotos(ranked,tileSize){return ranked.filter(p=>p.distance<tileSize*2.1).slice(0,NEAR_COUNT).map(p=>p.tile)}
