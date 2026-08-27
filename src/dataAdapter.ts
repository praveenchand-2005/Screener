export type MarketStatus='LIVE'|'STALE'|'DISCONNECTED';
export type MarketSnapshot={source:'NSE_PUBLIC'|'AUTHORIZED_FEED'|'DEMO';status:MarketStatus;asOf:string;quotes:Record<string,{price:number;prevClose:number;gapPct:number;activity:number;open:number;high:number;low:number}>};
export interface MarketDataAdapter{getSnapshot(symbols:string[]):Promise<MarketSnapshot>}

const NSE='https://www.nseindia.com';
const browserHeaders={
  accept:'application/json,text/plain,*/*',
  'accept-language':'en-US,en;q=0.9',
  'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  referer:'https://www.nseindia.com/market-data/live-equity-market'
};

async function fetchWithTimeout(url:string,headers:Record<string,string>,timeoutMs=9000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{return await fetch(url,{headers,signal:controller.signal,cache:'no-store'});}finally{clearTimeout(timer)}
}

function cookieHeader(response:Response){
  const anyHeaders=response.headers as any;
  const cookies=typeof anyHeaders.getSetCookie==='function'?anyHeaders.getSetCookie():[];
  if(Array.isArray(cookies)&&cookies.length)return cookies.map((x:string)=>x.split(';')[0]).join('; ');
  const raw=response.headers.get('set-cookie')||'';
  return raw?raw.split(/,(?=[^;,]+=)/).map(x=>x.split(';')[0]).join('; '):'';
}

function number(value:any){const n=Number(String(value??'').replace(/,/g,''));return Number.isFinite(n)?n:0}

async function nseIndex(index:string,cookie=''){
  const home=await fetchWithTimeout(NSE+'/',browserHeaders);
  const sessionCookie=cookie||cookieHeader(home);
  const headers={...browserHeaders,...(sessionCookie?{cookie:sessionCookie}:{})};
  const response=await fetchWithTimeout(`${NSE}/api/equity-stockIndices?index=${encodeURIComponent(index)}`,headers);
  if(!response.ok)throw new Error(`NSE ${response.status}`);
  const json=await response.json();
  return {json,cookie:sessionCookie};
}

export const nsePublicAdapter:MarketDataAdapter={async getSnapshot(symbols){
  const wanted=new Set(symbols);
  const all:any[]=[];
  const indices=['NIFTY 50','NIFTY NEXT 50'];
  let cookie='';
  for(const index of indices){
    const result=await nseIndex(index,cookie);
    cookie=result.cookie;
    const rows=Array.isArray(result.json?.data)?result.json.data:[];
    all.push(...rows);
  }
  const rows=all.filter(row=>wanted.has(String(row.symbol||'')));
  if(rows.length<Math.min(5,symbols.length))throw new Error('NSE returned insufficient constituent data');
  const asOf=new Date().toISOString();
  const quotes:MarketSnapshot['quotes']={};
  for(const row of rows){
    const price=number(row.lastPrice);
    const prevClose=number(row.previousClose);
    if(!price||!prevClose)continue;
    quotes[row.symbol]={
      price,prevClose,
      gapPct:((price-prevClose)/prevClose)*100,
      activity:number(row.totalTradedVolume),
      open:number(row.open),high:number(row.dayHigh),low:number(row.dayLow)
    };
  }
  if(Object.keys(quotes).length<Math.min(5,symbols.length))throw new Error('NSE quote payload incomplete');
  return {source:'NSE_PUBLIC',status:'LIVE',asOf,quotes};
}};

export function isFresh(snapshot:MarketSnapshot,maxAgeMs=15_000,now=Date.now()){return now-new Date(snapshot.asOf).getTime()<=maxAgeMs}
export function normalizeStatus(snapshot:MarketSnapshot,maxAgeMs=15_000):MarketSnapshot{if(snapshot.source==='DEMO')return snapshot;return isFresh(snapshot,maxAgeMs)?snapshot:{...snapshot,status:'STALE'};}

export const demoAdapter:MarketDataAdapter={async getSnapshot(symbols){const now=new Date().toISOString();const quotes=Object.fromEntries(symbols.map((symbol,i)=>[symbol,{price:250+i*3,prevClose:245+i*3,gapPct:2.04-i*.08,activity:600000+i*45000,open:248+i*3,high:253+i*3,low:247+i*3}]));return {source:'DEMO',status:'LIVE',asOf:now,quotes};}};
