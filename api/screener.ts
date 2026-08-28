import {UNIVERSE} from '../src/universe.js';
import {rankScreener} from '../src/screener.js';
import {nsePublicAdapter} from '../src/dataAdapter.js';

function cprWidthPct(q:{price:number;prevHigh?:number;prevLow?:number}){
  if(!q.prevHigh||!q.prevLow||!q.price)return null;
  const pp=(q.prevHigh+q.prevLow+((q as any).prevClose||0))/3;
  const bc=(q.prevHigh+q.prevLow)/2;
  const tc=2*pp-bc;
  return Number((Math.abs(tc-bc)/q.price*100).toFixed(3));
}

export default async function handler(req:any,res:any){
  try{
    const symbols=UNIVERSE.map(s=>s.symbol);
    const snapshot=await nsePublicAdapter.getSnapshot(symbols);
    const quotes=Object.entries(snapshot.quotes).map(([symbol,q])=>({symbol,...q,cprWidthPct:cprWidthPct(q)}));
    const cprReady=quotes.filter(q=>q.cprWidthPct!==null).length;
    const gapPassed=quotes.filter(q=>Math.abs(q.gapPct)>=1).length;
    const activityPassed=quotes.filter(q=>q.activity>=500_000).length;
    const candidates=rankScreener(quotes.filter(q=>q.cprWidthPct!==null) as any).map(c=>{const q=(quotes as any[]).find(x=>x.symbol===c.symbol);return {...c,price:q?.price??null,prevClose:q?.prevClose??null}});
    res.status(200).json({source:snapshot.source,status:snapshot.status,asOf:snapshot.asOf,coverage:{requested:snapshot.requested,received:snapshot.received,valid:snapshot.valid,gapPassed,activityPassed,cprReady},candidates});
  }catch(error:any){
    console.error('NSE screener error',error?.message||error);
    res.status(503).json({error:'market_data_unavailable',source:'NSE_PUBLIC',status:'DISCONNECTED'});
  }
}
