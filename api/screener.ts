import {UNIVERSE} from '../src/universe';
import {rankScreener} from '../src/screener';
import {demoAdapter} from '../src/dataAdapter';

export default async function handler(req:any,res:any){
  try{
    const snapshot=await demoAdapter.getSnapshot(UNIVERSE.map(s=>s.symbol));
    const quotes=Object.entries(snapshot.quotes).map(([symbol,q])=>({symbol,...q,cprWidthPct:0.08+(UNIVERSE.findIndex(s=>s.symbol===symbol)*0.015)}));
    const candidates=rankScreener(quotes).map(c=>{const q=(quotes as any[]).find(x=>x.symbol===c.symbol);return {...c,price:q?.price??null,prevClose:q?.prevClose??null}});
    res.status(200).json({source:snapshot.source,status:snapshot.status,asOf:snapshot.asOf,candidates});
  }catch(error){res.status(500).json({error:'screener_unavailable'});}
}
