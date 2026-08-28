export type MarketStatus='LIVE'|'STALE'|'DISCONNECTED';
export type MarketSource='NSE_PUBLIC'|'YAHOO_CHART_PUBLIC'|'YAHOO_PUBLIC'|'NSE_PUBLIC_PROXY'|'AUTHORIZED_FEED'|'DEMO';
export type Quote={price:number;prevClose:number;gapPct:number;activity:number;open:number;high:number;low:number;prevHigh?:number;prevLow?:number};
export type MarketSnapshot={source:MarketSource;status:MarketStatus;asOf:string;quotes:Record<string,Quote>;requested:number;received:number;valid:number};
export interface MarketDataAdapter{getSnapshot(symbols:string[]):Promise<MarketSnapshot>}

const NSE='https://www.nseindia.com';
const YAHOO='https://query1.finance.yahoo.com';
const PUBLIC_PROXY='https://nse-api-khaki.vercel.app';
const headers={accept:'application/json,text/plain,*/*','user-agent':'Mozilla/5.0','referer':'https://www.nseindia.com/market-data/live-equity-market'};

async function get(url:string,timeoutMs:number,extra:Record<string,string>={}){const c=new AbortController();const t=setTimeout(()=>c.abort(),timeoutMs);try{return await fetch(url,{headers:{...headers,...extra},signal:c.signal,cache:'no-store'})}finally{clearTimeout(t)}}
function n(v:any){const x=Number(String(v??'').replace(/,/g,''));return Number.isFinite(x)?x:0}
function firstNumber(row:any,keys:string[]){for(const key of keys){const value=n(row?.[key]);if(value)return value}return 0}
function snapshot(source:MarketSource,symbols:string[],quotes:Record<string,Quote>):MarketSnapshot{return {source,status:'LIVE',asOf:new Date().toISOString(),quotes,requested:symbols.length,received:Object.keys(quotes).length,valid:Object.values(quotes).filter(q=>q.price>0&&q.prevClose>0).length}}

async function fetchProxy(symbols:string[]):Promise<MarketSnapshot>{
  const quotes:Record<string,Quote>={};
  for(let i=0;i<symbols.length;i+=20){
    const batch=symbols.slice(i,i+20).join(',');
    const r=await get(`${PUBLIC_PROXY}/stock/list?symbols=${encodeURIComponent(batch)}&res=num`,3500,{'accept':'application/json'});
    if(!r.ok)throw new Error(`Public proxy ${r.status}`);
    const j=await r.json();
    for(const row of Array.isArray(j?.stocks)?j.stocks:[]){
      const symbol=String(row.symbol||'').replace(/\\.NS$/i,'');
      if(!symbols.includes(symbol))continue;
      const price=n(row.last_price),prevClose=n(row.previous_close);if(!price||!prevClose)continue;
      const q:Quote={price,prevClose,gapPct:n(row.percent_change)||((price-prevClose)/prevClose)*100,activity:n(row.volume),open:n(row.open)||price,high:n(row.day_high)||price,low:n(row.day_low)||price};
      const prevHigh=firstNumber(row,['previous_day_high','prev_day_high','previous_high','prev_high']);
      const prevLow=firstNumber(row,['previous_day_low','prev_day_low','previous_low','prev_low']);
      if(prevHigh&&prevLow){q.prevHigh=prevHigh;q.prevLow=prevLow}
      quotes[symbol]=q;
    }
  }
  if(Object.keys(quotes).length<Math.min(5,symbols.length))throw new Error(`Public proxy returned ${Object.keys(quotes).length} quotes`);
  return snapshot('NSE_PUBLIC_PROXY',symbols,quotes);
}

async function fetchYahooQuote(symbols:string[]):Promise<MarketSnapshot>{
  const r=await get(`${YAHOO}/v7/finance/quote?symbols=${encodeURIComponent(symbols.map(s=>`${s}.NS`).join(','))}`,3000);
  if(!r.ok)throw new Error(`Yahoo ${r.status}`);
  const j=await r.json();const wanted=new Set(symbols);const quotes:Record<string,Quote>={};
  for(const row of Array.isArray(j?.quoteResponse?.result)?j.quoteResponse.result:[]){
    const symbol=String(row.symbol||'').replace(/\\.NS$/i,'');if(!wanted.has(symbol))continue;
    const price=n(row.regularMarketPrice),prevClose=n(row.regularMarketPreviousClose);if(!price||!prevClose)continue;
    quotes[symbol]={price,prevClose,gapPct:((price-prevClose)/prevClose)*100,activity:n(row.regularMarketVolume),open:n(row.regularMarketOpen)||price,high:n(row.regularMarketDayHigh)||price,low:n(row.regularMarketDayLow)||price};
  }
  if(Object.keys(quotes).length<Math.min(5,symbols.length))throw new Error(`Yahoo returned ${Object.keys(quotes).length} quotes`);
  return snapshot('YAHOO_PUBLIC',symbols,quotes);
}

async function fetchNse(symbols:string[]):Promise<MarketSnapshot>{
  const home=await get(`${NSE}/`,2000);if(!home.ok)throw new Error(`NSE home ${home.status}`);
  const h:any=home.headers;const cookies=typeof h.getSetCookie==='function'?h.getSetCookie():[];const cookie=Array.isArray(cookies)?cookies.map((x:string)=>x.split(';')[0]).join('; '):'';
  const quotes:Record<string,Quote>={};
  for(const index of ['NIFTY 50','NIFTY NEXT 50']){
    const r=await get(`${NSE}/api/equity-stockIndices?index=${encodeURIComponent(index)}`,2500,cookie?{cookie}:{});if(!r.ok)throw new Error(`NSE ${index} ${r.status}`);const j=await r.json();
    for(const row of Array.isArray(j?.data)?j.data:[]){const symbol=String(row.symbol||'');if(!symbols.includes(symbol))continue;const price=n(row.lastPrice),prevClose=n(row.previousClose);if(!price||!prevClose)continue;quotes[symbol]={price,prevClose,gapPct:((price-prevClose)/prevClose)*100,activity:n(row.totalTradedVolume),open:n(row.open)||price,high:n(row.dayHigh)||price,low:n(row.dayLow)||price};}
  }
  if(Object.keys(quotes).length<Math.min(5,symbols.length))throw new Error(`NSE returned ${Object.keys(quotes).length} quotes`);
  return snapshot('NSE_PUBLIC',symbols,quotes);
}

async function fetchYahooChart(symbols:string[]):Promise<MarketSnapshot>{
  const quotes:Record<string,Quote>={};
  await Promise.all(symbols.map(async symbol=>{try{const r=await get(`${YAHOO}/v8/finance/chart/${encodeURIComponent(symbol+'.NS')}?range=5d&interval=5m`,3500);if(!r.ok)return;const j=await r.json();const result=j?.chart?.result?.[0],q=result?.indicators?.quote?.[0]||{},m=result?.meta||{};const timestamps=Array.isArray(result?.timestamp)?result.timestamp:[];const closes=Array.isArray(q.close)?q.close:[],opens=Array.isArray(q.open)?q.open:[],highs=Array.isArray(q.high)?q.high:[],lows=Array.isArray(q.low)?q.low:[],volumes=Array.isArray(q.volume)?q.volume:[];const valid=closes.map((v:any,i:number)=>({i,v:n(v),t:Number(timestamps[i]||0)})).filter(x=>x.v>0&&x.t>0);const price=n(m.regularMarketPrice)||n(valid.at(-1)?.v);const prevClose=n(m.previousClose)||n(m.chartPreviousClose);if(!price||!prevClose)return;const todayStart=Math.floor(Date.now()/1000)-24*60*60;const prior=valid.filter(x=>x.t<todayStart);const prevDay=Math.floor((prior.at(-1)?.t||0)/86400);const prevIdx=valid.map((x,idx)=>({x,idx})).filter(z=>Math.floor(z.x.t/86400)===prevDay).map(z=>z.idx);const currentIdx=valid.map((x,idx)=>({x,idx})).filter(z=>Math.floor(z.x.t/86400)===Math.floor(Date.now()/1000/86400)).map(z=>z.idx);const dayIdx=currentIdx.length?currentIdx:valid.map((x,idx)=>({x,idx})).filter(z=>Math.floor(z.x.t/86400)===Math.floor(valid.at(-1)?.t/86400)).map(z=>z.idx);const prevHigh=prevIdx.length?Math.max(...prevIdx.map(i=>n(highs[i]))):0;const prevLow=prevIdx.length?Math.min(...prevIdx.map(i=>n(lows[i]))):0;const activity=dayIdx.reduce((sum,i)=>sum+n(volumes[i]),0);const open=dayIdx.length?n(opens[dayIdx[0]]):price;const high=dayIdx.length?Math.max(...dayIdx.map(i=>n(highs[i]))):price;const low=dayIdx.length?Math.min(...dayIdx.map(i=>n(lows[i]))):price;quotes[symbol]={price,prevClose,gapPct:((price-prevClose)/prevClose)*100,activity,open:open||price,high:high||price,low:low||price,prevHigh:prevHigh||undefined,prevLow:prevLow||undefined}}catch{}}));
  if(Object.keys(quotes).length<Math.min(5,symbols.length))throw new Error(`Yahoo chart returned ${Object.keys(quotes).length} quotes`);return snapshot('YAHOO_CHART_PUBLIC',symbols,quotes);
}

async function enrichPreviousSession(snapshotIn:MarketSnapshot):Promise<MarketSnapshot>{
  const needs=Object.entries(snapshotIn.quotes).filter(([_,q])=>!q.prevHigh||!q.prevLow).filter(([_,q])=>Math.abs(q.gapPct)>=1&&q.activity>=500_000).map(([symbol])=>symbol);
  if(!needs.length)return snapshotIn;
  const enriched=await Promise.all(needs.map(async symbol=>{try{const r=await get(`${YAHOO}/v8/finance/chart/${encodeURIComponent(symbol+'.NS')}?range=5d&interval=1d`,3500);if(!r.ok)return null;const j=await r.json();const result=j?.chart?.result?.[0],quote=result?.indicators?.quote?.[0]||{},timestamps=Array.isArray(result?.timestamp)?result.timestamp:[];const closes=Array.isArray(quote.close)?quote.close:[],highs=Array.isArray(quote.high)?quote.high:[],lows=Array.isArray(quote.low)?quote.low:[];const rows=timestamps.map((t:any,i:number)=>({t:Number(t),c:n(closes[i]),h:n(highs[i]),l:n(lows[i])})).filter(x=>x.t&&x.c&&x.h&&x.l);if(rows.length<2)return null;const prev=rows.at(-2)!;return {symbol,prevHigh:prev.h,prevLow:prev.l}}catch{return null}}));
  for(const item of enriched){if(!item)continue;const q=snapshotIn.quotes[item.symbol];if(q){q.prevHigh=item.prevHigh;q.prevLow=item.prevLow}}
  return snapshotIn;
}

export const nsePublicAdapter:MarketDataAdapter={async getSnapshot(symbols){
  try{return await enrichPreviousSession(await fetchProxy(symbols))}catch(proxyError){
    try{return await enrichPreviousSession(await fetchYahooQuote(symbols))}catch(yahooError){
      try{return await enrichPreviousSession(await fetchNse(symbols))}catch(nseError){
        try{return await fetchYahooChart(symbols)}catch(chartError){throw new Error(`Market data unavailable: Proxy=${(proxyError as Error)?.message||proxyError}; Yahoo=${(yahooError as Error)?.message||yahooError}; NSE=${(nseError as Error)?.message||nseError}; Chart=${(chartError as Error)?.message||chartError}`)}
      }
    }
  }
}};

export function isFresh(snapshot:MarketSnapshot,maxAgeMs=60_000,now=Date.now()){return now-new Date(snapshot.asOf).getTime()<=maxAgeMs}
export function normalizeStatus(snapshot:MarketSnapshot,maxAgeMs=60_000):MarketSnapshot{if(snapshot.source==='DEMO')return snapshot;return isFresh(snapshot,maxAgeMs)?snapshot:{...snapshot,status:'STALE'}}
export const demoAdapter:MarketDataAdapter={async getSnapshot(symbols){const now=new Date().toISOString();const quotes=Object.fromEntries(symbols.map((symbol,i)=>[symbol,{price:250+i*3,prevClose:245+i*3,gapPct:2.04-i*.08,activity:600000+i*45000,open:248+i*3,high:253+i*3,low:247+i*3,prevHigh:252+i*3,prevLow:246+i*3}]));return {source:'DEMO',status:'LIVE',asOf:now,quotes,requested:symbols.length,received:symbols.length,valid:symbols.length}}};
