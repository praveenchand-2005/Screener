export type MarketStatus='CONNECTED'|'STALE'|'DISCONNECTED';
export type MarketSnapshot={source:'NSE_PUBLIC'|'AUTHORIZED_FEED'|'DEMO';status:MarketStatus;asOf:string;quotes:Record<string,{price:number;prevClose:number;gapPct:number;activity:number}>};
export interface MarketDataAdapter{getSnapshot(symbols:string[]):Promise<MarketSnapshot>}
export function isFresh(snapshot:MarketSnapshot,maxAgeMs=15_000,now=Date.now()){return now-new Date(snapshot.asOf).getTime()<=maxAgeMs}
export function normalizeStatus(snapshot:MarketSnapshot,maxAgeMs=15_000):MarketSnapshot{if(snapshot.source==='DEMO')return snapshot;return isFresh(snapshot,maxAgeMs)?snapshot:{...snapshot,status:'STALE'};}
export const demoAdapter:MarketDataAdapter={async getSnapshot(symbols){const now=new Date().toISOString();const quotes=Object.fromEntries(symbols.map((symbol,i)=>[symbol,{price:250+i*3,prevClose:245+i*3,gapPct:2.04-i*.08,activity:600000+i*45000}]));return {source:'DEMO',status:'CONNECTED',asOf:now,quotes};}};
