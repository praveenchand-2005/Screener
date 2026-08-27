export type MarketStatus='LIVE'|'STALE'|'DISCONNECTED';
export type MarketSource='NSE_PUBLIC'|'YAHOO_CHART_PUBLIC'|'YAHOO_PUBLIC'|'NSE_PUBLIC_PROXY'|'AUTHORIZED_FEED'|'DEMO';
export type MarketSnapshot={source:MarketSource;status:MarketStatus;asOf:string;quotes:Record<string,{price:number;prevClose:number;gapPct:number;activity:number;open:number;high:number;low:number}>};
export interface MarketDataAdapter{getSnapshot(symbols:string[]):Promise<MarketSnapshot>}

const NSE='https://www.nseindia.com';
const YAHOO='https://query1.finance.yahoo.com';
const PUBLIC_PROXY='https://nse-api-khaki.vercel.app';
const headers={accept:'application/json,text/plain,*/*','user-agent':'Mozilla/5.0','referer':'https://www.nseindia.com/market-data/live-equity-market'};

async function get(url:string,timeoutMs:number,extra:Record<string,string>={}){const c=new AbortController();const t=setTimeout(()=>c.abort(),timeoutMs);try{return await fetch(url,{headers:{...headers,...extra},signal:c.signal,cache:'no-store'})}finally{clearTimeout(t)}}
function n(v:any){const x=Number(String(v??'').replace(/,/g,''));return Number.isFinite(x)?x:0}
function snapshot(source:MarketSource,quotes:MarketSnapshot['quotes']):MarketSnapshot{return {source,status:'LIVE',asOf:new Date().toISOString(),quotes}}

async function fetchProxy(symbols:string[]):Promise<MarketSnapshot>{
  const quotes:MarketSnapshot['quotes']={};
  for(let i=0;i<symbols.length;i+=20){
    const batch=symbols.slice(i,i+20).join(',');
    const r=await get(`${PUBLIC_PROXY}/stock/list?symbols=${encodeURIComponent(batch)}&res=num`,3500,{'accept':'application/json'});
    if(!r.ok)throw new Error(`Public proxy ${r.status}`);
    const j=await r.json();
    for(const row of Array.isArray(j?.stocks)?j.stocks:[]){
      const symbol=String(row.symbol||'').replace(/\\.NS$/i,'');
      if(!symbols.includes(symbol))continue;
      const price=n(row.last_price),prevClose=n(row.previous_close);if(!price||!prevClose)continue;
      quotes[symbol]={price,prevClose,gapPct:n(row.percent_change)||((price-prevClose)/prevClose)*100,activity:n(row.volume),open:n(row.open)||price,high:n(row.day_high)||price,low:n(row.day_low)||price};
    }
  }
  if(Object.keys(quotes).length<Math.min(5,symbols.length))throw new Error(`Public proxy returned ${Object.keys(quotes).length} quotes`);
  return snapshot('NSE_PUBLIC_PROXY',quotes);
}

async function fetchYahooQuote(symbols:string[]):Promise<MarketSnapshot>{
  const r=await get(`${YAHOO}/v7/finance/quote?symbols=${encodeURIComponent(symbols.map(s=>`${s}.NS`).join(','))}`,3000);
  if(!r.ok)throw new Error(`Yahoo ${r.status}`);
  const j=await r.json();const wanted=new Set(symbols);const quotes:MarketSnapshot['quotes']={};
  for(const row of Array.isArray(j?.quoteResponse?.result)?j.quoteResponse.result:[]){
    const symbol=String(row.symbol||'').replace(/\\.NS$/i,'');if(!wanted.has(symbol))continue;
    const price=n(row.regularMarketPrice),prevClose=n(row.regularMarketPreviousClose);if(!price||!prevClose)continue;
    quotes[symbol]={price,prevClose,gapPct:((price-prevClose)/prevClose)*100,activity:n(row.regularMarketVolume),open:n(row.regularMarketOpen)||price,high:n(row.regularMarketDayHigh)||price,low:n(row.regularMarketDayLow)||price};
  }
  if(Object.keys(quotes).length<Math.min(5,symbols.length))throw new Error(`Yahoo returned ${Object.keys(quotes).length} quotes`);
  return snapshot('YAHOO_PUBLIC',quotes);
}

async function fetchNse(symbols:string[]):Promise<MarketSnapshot>{
  const home=await get(`${NSE}/`,2000);if(!home.ok)throw new Error(`NSE home ${home.status}`);
  const h:any=home.headers;const cookies=typeof h.getSetCookie==='function'?h.getSetCookie():[];const cookie=Array.isArray(cookies)?cookies.map((x:string)=>x.split(';')[0]).join('; '):'';
  const quotes:MarketSnapshot['quotes']={};
  for(const index of ['NIFTY 50','NIFTY NEXT 50']){
    const r=await get(`${NSE}/api/equity-stockIndices?index=${encodeURIComponent(index)}`,2500,cookie?{cookie}:{});if(!r.ok)throw new Error(`NSE ${index} ${r.status}`);const j=await r.json();
    for(const row of Array.isArray(j?.data)?j.data:[]){const symbol=String(row.symbol||'');if(!symbols.includes(symbol))continue;const price=n(row.lastPrice),prevClose=n(row.previousClose);if(!price||!prevClose)continue;quotes[symbol]={price,prevClose,gapPct:((price-prevClose)/prevClose)*100,activity:n(row.totalTradedVolume),open:n(row.open)||price,high:n(row.dayHigh)||price,low:n(row.dayLow)||price};}
  }
  if(Object.keys(quotes).length<Math.min(5,symbols.length))throw new Error(`NSE returned ${Object.keys(quotes).length} quotes`);
  return snapshot('NSE_PUBLIC',quotes);
}

async function fetchYahooChart(symbols:string[]):Promise<MarketSnapshot>{
  const quotes:MarketSnapshot['quotes']={};
  const batch=symbols.slice(0,10);
  await Promise.all(batch.map(async symbol=>{try{const r=await get(`${YAHOO}/v8/finance/chart/${encodeURIComponent(symbol+'.NS')}?range=1d&interval=5m`,2500);if(!r.ok)return;const j=await r.json();const result=j?.chart?.result?.[0],q=result?.indicators?.quote?.[0]||{},m=result?.meta||{};const closes=Array.isArray(q.close)?q.close.filter((v:any)=>Number.isFinite(Number(v))):[];const price=n(m.regularMarketPrice)||n(closes.at(-1));const prevClose=n(m.previousClose)||n(m.chartPreviousClose);if(!price||!prevClose)return;quotes[symbol]={price,prevClose,gapPct:((price-prevClose)/prevClose)*100,activity:n(Array.isArray(q.volume)?q.volume.filter((v:any)=>Number.isFinite(Number(v))).at(-1):0),open:n(Array.isArray(q.open)?q.open.at(-1):0)||price,high:n(Array.isArray(q.high)?q.high.at(-1):0)||price,low:n(Array.isArray(q.low)?q.low.at(-1):0)||price}}catch{}}));
  if(Object.keys(quotes).length<Math.min(5,symbols.length))throw new Error(`Yahoo chart returned ${Object.keys(quotes).length} quotes`);return snapshot('YAHOO_CHART_PUBLIC',quotes);
}

export const nsePublicAdapter:MarketDataAdapter={async getSnapshot(symbols){
  // Fastest free public source first. The fallbacks are deliberately short so a Hobby serverless function cannot time out.
  try{return await fetchProxy(symbols)}catch(proxyError){
    try{return await fetchYahooQuote(symbols)}catch(yahooError){
      try{return await fetchNse(symbols)}catch(nseError){
        try{return await fetchYahooChart(symbols)}catch(chartError){throw new Error(`Market data unavailable: Proxy=${(proxyError as Error)?.message||proxyError}; Yahoo=${(yahooError as Error)?.message||yahooError}; NSE=${(nseError as Error)?.message||nseError}; Chart=${(chartError as Error)?.message||chartError}`)}
      }
    }
  }
}};

export function isFresh(snapshot:MarketSnapshot,maxAgeMs=60_000,now=Date.now()){return now-new Date(snapshot.asOf).getTime()<=maxAgeMs}
export function normalizeStatus(snapshot:MarketSnapshot,maxAgeMs=60_000):MarketSnapshot{if(snapshot.source==='DEMO')return snapshot;return isFresh(snapshot,maxAgeMs)?snapshot:{...snapshot,status:'STALE'}}
export const demoAdapter:MarketDataAdapter={async getSnapshot(symbols){const now=new Date().toISOString();const quotes=Object.fromEntries(symbols.map((symbol,i)=>[symbol,{price:250+i*3,prevClose:245+i*3,gapPct:2.04-i*.08,activity:600000+i*45000,open:248+i*3,high:253+i*3,low:247+i*3}]));return {source:'DEMO',status:'LIVE',asOf:now,quotes}}};
