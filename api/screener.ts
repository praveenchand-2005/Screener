import {UNIVERSE} from '../src/universe.js';
import {rankScreener} from '../src/screener.js';
import {nsePublicAdapter} from '../src/dataAdapter.js';

function cprWidthPct(q:{price:number;open:number;high:number;low:number}){
  if(!q.high||!q.low||!q.price)return 0;
  const pp=(q.high+q.low+q.price)/3;
  const bc=(q.high+q.low)/2;
  const tc=2*pp-bc;
  return Number((Math.abs(tc-bc)/q.price*100).toFixed(3));
}

export default async function handler(req:any,res:any){
  try{
    const snapshot=await nsePublicAdapter.getSnapshot(UNIVERSE.map(s=>s.symbol));
    const quotes=Object.entries(snapshot.quotes).map(([symbol,q])=>({symbol,...q,cprWidthPct:cprWidthPct(q)}));
    const candidates=rankScreener(quotes).map(c=>{const q=(quotes as any[]).find(x=>x.symbol===c.symbol);return {...c,price:q?.price??null,prevClose:q?.prevClose??null}});
    res.status(200).json({source:snapshot.source,status:snapshot.status,asOf:snapshot.asOf,candidates});
  }catch(error:any){
    console.error('NSE screener error',error?.message||error);
    res.status(503).json({error:'market_data_unavailable',source:'NSE_PUBLIC',status:'DISCONNECTED'});
  }
}
