export type MarketStatus='LIVE'|'STALE'|'DISCONNECTED';
export type MarketSource='NSE_PUBLIC'|'YAHOO_PUBLIC'|'AUTHORIZED_FEED'|'DEMO';
export type MarketSnapshot={source:MarketSource;status:MarketStatus;asOf:string;quotes:Record<string,{price:number;prevClose:number;gapPct:number;activity:number;open:number;high:number;low:number}>};
export interface MarketDataAdapter{getSnapshot(symbols:string[]):Promise<MarketSnapshot>}

const NSE='https://www.nseindia.com';
const YAHOO='https://query1.finance.yahoo.com/v7/finance/quote';
const browserHeaders={accept:'application/json,text/plain,*/*','accept-language':'en-US,en;q=0.9','user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',referer:'https://www.nseindia.com/market-data/live-equity-market'};

async function fetchWithTimeout(url:string,headers:Record<string,string>,timeoutMs=3500){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{return await fetch(url,{headers,signal:controller.signal,cache:'no-store'});}finally{clearTimeout(timer)}
}
function cookieHeader(response:Response){
  const h=response.headers as any;
  const cookies=typeof h.getSetCookie==='function'?h.getSetCookie():[];
  if(Array.isArray(cookies)&&cookies.length)return cookies.map((x:string)=>x.split(';')[0]).join('; ');
  const raw=response.headers.get('set-cookie')||'';
  return raw?raw.split(/,(?=[^;,]+=)/).map(x=>x.split(';')[0]).join('; '):'';
}
function number(value:any){const n=Number(String(value??'').replace(/,/g,''));return Number.isFinite(n)?n:0}

async function fetchNse(symbols:string[]):Promise<MarketSnapshot>{
  const wanted=new Set(symbols);
  const home=await fetchWithTimeout(NSE+'/',browserHeaders);
  if(!home.ok)throw new Error(`NSE home ${home.status}`);
  const cookie=cookieHeader(home);
  const headers={...browserHeaders,...(cookie?{cookie}:{})};
  const indices=await Promise.all(['NIFTY 50','NIFTY NEXT 50'].map(async index=>{
    const response=await fetchWithTimeout(`${NSE}/api/equity-stockIndices?index=${encodeURIComponent(index)}`,headers);
    if(!response.ok)throw new Error(`NSE ${index} ${response.status}`);
    return response.json();
  }));
  const rows=indices.flatMap((json:any)=>Array.isArray(json?.data)?json.data:[]).filter((row:any)=>wanted.has(String(row.symbol||'')));
  const quotes:MarketSnapshot['quotes']={};
  for(const row of rows){
    const price=number(row.lastPrice),prevClose=number(row.previousClose);
    if(!price||!prevClose)continue;
    quotes[row.symbol]={price,prevClose,gapPct:((price-prevClose)/prevClose)*100,activity:number(row.totalTradedVolume),open:number(row.open),high:number(row.dayHigh),low:number(row.dayLow)};
  }
  if(Object.keys(quotes).length<Math.min(5,symbols.length))throw new Error('NSE quote payload incomplete');
  return {source:'NSE_PUBLIC',status:'LIVE',asOf:new Date().toISOString(),quotes};
}

async function fetchYahoo(symbols:string[]):Promise<MarketSnapshot>{
  const yahooSymbols=symbols.map(s=>`${s}.NS`).join(',');
  const response=await fetchWithTimeout(`${YAHOO}?symbols=${encodeURIComponent(yahooSymbols)}`,{accept:'application/json,text/plain,*/*','user-agent':'Mozilla/5.0'},4500);
  if(!response.ok)throw new Error(`Yahoo quote ${response.status}`);
  const json=await response.json();
  const rows=Array.isArray(json?.quoteResponse?.result)?json.quoteResponse.result:[];
  const wanted=new Set(symbols);
  const quotes:MarketSnapshot['quotes']={};
  for(const row of rows){
    const symbol=String(row.symbol||'').replace(/\.NS$/i,'');
    if(!wanted.has(symbol))continue;
    const price=number(row.regularMarketPrice),prevClose=number(row.regularMarketPreviousClose);
    if(!price||!prevClose)continue;
    quotes[symbol]={price,prevClose,gapPct:((price-prevClose)/prevClose)*100,activity:number(row.regularMarketVolume),open:number(row.regularMarketOpen)||price,high:number(row.regularMarketDayHigh)||price,low:number(row.regularMarketDayLow)||price};
  }
  if(Object.keys(quotes).length<Math.min(5,symbols.length))throw new Error('Yahoo quote payload incomplete');
  return {source:'YAHOO_PUBLIC',status:'LIVE',asOf:new Date().toISOString(),quotes};
}

export const nsePublicAdapter:MarketDataAdapter={async getSnapshot(symbols){
  try{return await fetchNse(symbols)}catch(nseError){
    try{return await fetchYahoo(symbols)}catch(yahooError){
      throw new Error(`Market data unavailable: NSE=${(nseError as Error)?.message||nseError}; Yahoo=${(yahooError as Error)?.message||yahooError}`);
    }
  }
}};

export function isFresh(snapshot:MarketSnapshot,maxAgeMs=60_000,now=Date.now()){return now-new Date(snapshot.asOf).getTime()<=maxAgeMs}
export function normalizeStatus(snapshot:MarketSnapshot,maxAgeMs=60_000):MarketSnapshot{if(snapshot.source==='DEMO')return snapshot;return isFresh(snapshot,maxAgeMs)?snapshot:{...snapshot,status:'STALE'};}

export const demoAdapter:MarketDataAdapter={async getSnapshot(symbols){const now=new Date().toISOString();const quotes=Object.fromEntries(symbols.map((symbol,i)=>[symbol,{price:250+i*3,prevClose:245+i*3,gapPct:2.04-i*.08,activity:600000+i*45000,open:248+i*3,high:253+i*3,low:247+i*3}]));return {source:'DEMO',status:'LIVE',asOf:now,quotes};}};
