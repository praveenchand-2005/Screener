import {UNIVERSE} from '../src/universe.js';
import {analyzeLong,Bar} from '../src/setupEngine.js';

const YAHOO='https://query1.finance.yahoo.com';
const headers={accept:'application/json,text/plain,*/*','user-agent':'Mozilla/5.0'};
async function get(url:string,timeoutMs=5000){const c=new AbortController();const t=setTimeout(()=>c.abort(),timeoutMs);try{return await fetch(url,{headers,signal:c.signal,cache:'no-store'})}finally{clearTimeout(t)}}
function n(v:any){const x=Number(v);return Number.isFinite(x)?x:0}
function barsFrom(result:any):Bar[]{const q=result?.indicators?.quote?.[0]||{};const ts:Array<any>=Array.isArray(result?.timestamp)?result.timestamp:[];return ts.map((t:any,i:number)=>({t:n(t),open:n(q.open?.[i]),high:n(q.high?.[i]),low:n(q.low?.[i]),close:n(q.close?.[i]),volume:n(q.volume?.[i])})).filter((b:Bar)=>b.t&&b.open&&b.high&&b.low&&b.close)}
function istDay(t:number){return Math.floor((t+19800)/86400)}
async function fetchBars(symbol:string,interval:'5m'|'15m'|'1d'){const range=interval==='1d'?'5d':'5d';const r=await get(`${YAHOO}/v8/finance/chart/${encodeURIComponent(symbol+'.NS')}?range=${range}&interval=${interval}`);if(!r.ok)throw new Error(`Yahoo ${interval} ${r.status}`);const j=await r.json();return {result:j?.chart?.result?.[0],bars:barsFrom(j?.chart?.result?.[0])}}
export default async function handler(req:any,res:any){
 try{
  const symbol=String(req.query?.symbol||'').toUpperCase();
  if(!UNIVERSE.some(x=>x.symbol===symbol))return res.status(400).json({error:'symbol_not_in_universe'});
  const [b5,b15,daily]=await Promise.all([fetchBars(symbol,'5m'),fetchBars(symbol,'15m'),fetchBars(symbol,'1d')]);
  const days=Array.from(new Set(daily.bars.map(b=>istDay(b.t))));if(days.length<2)return res.status(200).json({status:'LEAVE IT',symbol,reasons:['Insufficient previous-session daily data.']});
  const prevDay=days[days.length-2];const prev=daily.bars.filter(b=>istDay(b.t)===prevDay).at(-1);if(!prev)return res.status(200).json({status:'LEAVE IT',symbol,reasons:['Previous-session candle unavailable.']});
  const currentDay=istDay(Date.now()/1000);const bars5=b5.bars.filter(b=>istDay(b.t)===currentDay);const bars15=b15.bars.filter(b=>istDay(b.t)===currentDay);
  const setup=analyzeLong(symbol,bars5,bars15,prev);
  res.status(200).json({source:'YAHOO_CHART_PUBLIC',status:'LIVE',asOf:new Date().toISOString(),data:{bars5:bars5.length,bars15:bars15.length},setup});
 }catch(error:any){console.error('setup engine error',error?.message||error);res.status(503).json({error:'intraday_structure_unavailable',status:'DISCONNECTED'});}
}
