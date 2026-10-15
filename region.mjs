// A buffer around Fukui's extreme points includes all of Reihoku and Reinan.
export const REGION={west:135.35,east:136.93,south:35.25,north:36.38};
export const DESTINATIONS=[
  {id:'plain',name:'福井平野',lon:136.19,lat:36.155},
  {id:'tojinbo',name:'東尋坊・三国',lon:136.14,lat:36.224},
  {id:'fukui',name:'福井市',lon:136.219,lat:36.064},
  {id:'sabae',name:'鯖江',lon:136.184,lat:35.956},
  {id:'echizen',name:'越前市',lon:136.168,lat:35.904},
  {id:'tsuruga',name:'敦賀',lon:136.055,lat:35.645},
  {id:'mihama',name:'美浜',lon:135.941,lat:35.600},
  {id:'mikata',name:'三方五湖・若狭',lon:135.884,lat:35.588},
  {id:'obama',name:'小浜',lon:135.746,lat:35.495},
  {id:'oi',name:'おおい',lon:135.617,lat:35.481},
  {id:'takahama',name:'高浜',lon:135.552,lat:35.490},
  {id:'ono',name:'大野',lon:136.488,lat:35.981},
  {id:'katsuyama',name:'勝山',lon:136.501,lat:36.061}
];
export const TERRAIN_RADIUS=3,TERRAIN_JOBS=3;
export function wantedTerrain(x,y,radius=TERRAIN_RADIUS){const out=[];for(let j=y-radius;j<=y+radius;j++)for(let i=x-radius;i<=x+radius;i++)out.push({x:i,y:j});return out.sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y))}
export function inRegion(lon,lat){return lon>=REGION.west&&lon<=REGION.east&&lat>=REGION.south&&lat<=REGION.north}
export function reconcileTerrain(tiles,desired,dispose){const keys=new Set(desired.map(t=>t.x+','+t.y));for(let i=tiles.length-1;i>=0;i--)if(!keys.has(tiles[i].x+','+tiles[i].y)){dispose(tiles[i]);tiles.splice(i,1)}for(const p of desired)if(!tiles.some(t=>t.x===p.x&&t.y===p.y))tiles.push(p);return tiles}
