export type MarketStatus='LIVE'|'STALE'|'DISCONNECTED';
export type MarketSource='NSE_PUBLIC'|'YAHOO_CHART_PUBLIC'|'YAHOO_PUBLIC'|'NSE_PUBLIC_PROXY'|'AUTHORIZED_FEED'|'DEMO';
export type Quote={price:number;prevClose:number;gapPct:number;activity:number;open:number;high:number;low:number;prevHigh?:number;prevLow?:number};
export type MarketSnapshot={source:MarketSource;status:MarketStatus;asOf:string;quotes:Record<string,Quote>;requested:number;received:number;valid:number};
export interface MarketDataAdapter{getSnapshot(symbols:string[]):Promise<MarketSnapshot>}

type Bar={t:number;c:number;o:number;h:number;l:number;v:number};
const NSE='https://www.nseindia.com';
const YAHOO='https://query1.finance.yahoo.com';
const PUBLIC_PROXY='https://nse-api-khaki.vercel.app';
const headers={accept:'application/json,text/plain,*/*','user-agent':'Mozilla/5.0','referer':'https://www.nseindia.com/market-data/live-equity-market'};

async function get(url:string,timeoutMs:number,extra:Record<string,string>={}){const c=new AbortController();const t=setTimeout(()=>c.abort(),timeoutMs);try{return await fetch(url,{headers:{...headers,...extra},signal:c.signal,cache:'no-store'})}finally{clearTimeout(t)}}
function n(v:any){const x=Number(String(v??'').replace(/,/g,''));return Number.isFinite(x)?x:0}
function firstNumber(row:any,keys:string[]){for(const key of keys){const value=n(row?.[key]);if(value)return value}return 0}
function snapshot(source:MarketSource,symbols:string[],quotes:Record<string,Quote>):MarketSnapshot{return {source,status:'LIVE',asOf:new Date().toISOString(),quotes,requested:symbols.length,received:Object.keys(quotes).length,valid:Object.values(quotes).filter((q:Quote)=>q.price>0&&q.prevClose>0).length}}

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
  await Promise.all(symbols.map(async (symbol:string)=>{try{
    const r=await get(`${YAHOO}/v8/finance/chart/${encodeURIComponent(symbol+'.NS')}?range=5d&interval=5m`,3500);if(!r.ok)return;
    const j=await r.json();const result=j?.chart?.result?.[0];const raw=result?.indicators?.quote?.[0]||{};const timestamps:Array<any>=Array.isArray(result?.timestamp)?result.timestamp:[];
    const closes:Array<any>=Array.isArray(raw.close)?raw.close:[],opens:Array<any>=Array.isArray(raw.open)?raw.open:[],highs:Array<any>=Array.isArray(raw.high)?raw.high:[],lows:Array<any>=Array.isArray(raw.low)?raw.low:[],volumes:Array<any>=Array.isArray(raw.volume)?raw.volume:[];
    const bars:Bar[]=timestamps.map((t:any,i:number)=>({t:n(t),c:n(closes[i]),o:n(opens[i]),h:n(highs[i]),l:n(lows[i]),v:n(volumes[i])})).filter((b:Bar)=>b.t>0&&b.c>0&&b.h>0&&b.l>0);
    if(bars.length<2)return;
    const m=result?.meta||{};const price=n(m.regularMarketPrice)||bars[bars.length-1].c;const prevClose=n(m.previousClose)||n(m.chartPreviousClose);if(!price||!prevClose)return;
    const days=Array.from(new Set(bars.map((b:Bar)=>Math.floor(b.t/86400))));const currentDay=days[days.length-1];const previousDay=days.length>1?days[days.length-2]:0;
    const dayBars=bars.filter((b:Bar)=>Math.floor(b.t/86400)===currentDay);const prevBars=bars.filter((b:Bar)=>Math.floor(b.t/86400)===previousDay);
    const activity=dayBars.reduce((sum:number,b:Bar)=>sum+b.v,0);const open=dayBars[0]?.o||price;const high=dayBars.reduce((m:number,b:Bar)=>Math.max(m,b.h),price);const low=dayBars.reduce((m:number,b:Bar)=>Math.min(m,b.l),price);const prevHigh=prevBars.reduce((m:number,b:Bar)=>Math.max(m,b.h),0);const prevLow=prevBars.reduce((m:number,b:Bar)=>Math.min(m,b.l),Infinity);
    quotes[symbol]={price,prevClose,gapPct:((price-prevClose)/prevClose)*100,activity,open,high,low,prevHigh:prevHigh||undefined,prevLow:Number.isFinite(prevLow)?prevLow:undefined};
  }catch{}}));
  if(Object.keys(quotes).length<Math.min(5,symbols.length))throw new Error(`Yahoo chart returned ${Object.keys(quotes).length} quotes`);
  return snapshot('YAHOO_CHART_PUBLIC',symbols,quotes);
}

async function enrichPreviousSession(snapshotIn:MarketSnapshot):Promise<MarketSnapshot>{
  const needs=Object.entries(snapshotIn.quotes).filter((entry:[string,Quote])=>!entry[1].prevHigh||!entry[1].prevLow).filter((entry:[string,Quote])=>Math.abs(entry[1].gapPct)>=1&&entry[1].activity>=500_000).map((entry:[string,Quote])=>entry[0]);
  if(!needs.length)return snapshotIn;
  const enriched=await Promise.all(needs.map(async (symbol:string)=>{try{
    const r=await get(`${YAHOO}/v8/finance/chart/${encodeURIComponent(symbol+'.NS')}?range=5d&interval=1d`,3500);if(!r.ok)return null;
    const j=await r.json();const result=j?.chart?.result?.[0];const quote=result?.indicators?.quote?.[0]||{};const timestamps:Array<any>=Array.isArray(result?.timestamp)?result.timestamp:[];const closes:Array<any>=Array.isArray(quote.close)?quote.close:[],highs:Array<any>=Array.isArray(quote.high)?quote.high:[],lows:Array<any>=Array.isArray(quote.low)?quote.low:[];
    const rows:Bar[]=timestamps.map((t:any,i:number)=>({t:n(t),c:n(closes[i]),o:0,h:n(highs[i]),l:n(lows[i]),v:0})).filter((b:Bar)=>b.t&&b.c&&b.h&&b.l);if(rows.length<2)return null;const prev=rows[rows.length-2];return {symbol,prevHigh:prev.h,prevLow:prev.l};
  }catch{return null}}));
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
