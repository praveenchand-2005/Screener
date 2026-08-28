import {Bar, Setup, analyzeLong} from './setupEngine';

export type BacktestConfig={
  minGapPct?:number;
  minActivity?:number;
  maxCprPct?:number;
  maxRisk?:number;
  capital?:number;
  minRR?:number;
  entryStart?:string;
  entryEnd?:string;
  forceExit?:string;
};
export type BacktestTrade={symbol:string;date:string;triggerTime:string;entry:number;stop:number;target1:number;target2:number;riskPerShare:number;qty:number;risk:number;result:'T2'|'T1'|'SL'|'EOD';pnl:number;rr:number;zone:'FVG'|'ORDER BLOCK';};
export type BacktestResult={trades:BacktestTrade[];stats:{trades:number;wins:number;losses:number;winRate:number;grossProfit:number;grossLoss:number;netPnl:number;profitFactor:number;expectancyR:number;maxDrawdown:number;maxConsecutiveLosses:number;};rejected:{gap:number;activity:number;cpr:number;alignment:number;trigger:number;risk:number} };

const dayKey=(t:number)=>new Date(t*1000).toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'});
const hhmm=(t:number)=>new Date(t*1000).toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',hour12:false});
const inWindow=(t:number,start:string,end:string)=>{const x=hhmm(t);return x>=start&&x<=end};
const bullish=(b:Bar)=>b.close>b.open;
const body=(b:Bar)=>Math.abs(b.close-b.open);
const range=(b:Bar)=>b.high-b.low;

function aggregate(bars:Bar[],minutes:number):Bar[]{
 const out:Bar[]=[];let bucket=-1;let cur:Bar|undefined;
 for(const b of bars){const d=new Date(b.t*1000);const mins=d.getUTCHours()*60+d.getUTCMinutes();const key=Math.floor(mins/minutes)+Math.floor(b.t/86400)*100000;
  if(key!==bucket){if(cur)out.push(cur);bucket=key;cur={...b}} else if(cur){cur.high=Math.max(cur.high,b.high);cur.low=Math.min(cur.low,b.low);cur.close=b.close;cur.volume+=b.volume;cur.t=b.t}
 }
 if(cur)out.push(cur);return out;
}

function previousSessions(bars:Bar[]):Map<string,Bar>{
 const sessions=new Map<string,Bar>();
 for(const b of bars){const k=dayKey(b.t);const x=sessions.get(k);if(x){x.high=Math.max(x.high,b.high);x.low=Math.min(x.low,b.low);x.close=b.close}else sessions.set(k,{...b})}
 return sessions;
}

function cprWidth(prev:Bar){const p=(prev.high+prev.low+prev.close)/3;const bc=(prev.high+prev.low)/2;const tc=2*p-bc;return {pivot:p,low:Math.min(bc,tc),high:Math.max(bc,tc),widthPct:(Math.max(bc,tc)-Math.min(bc,tc))/p*100}}

function bullish15Aligned(bars15:Bar[],price:number){const r=bars15.slice(-4);if(r.length<3)return false;const closes=r.map(x=>x.close);return bullish(r[r.length-1])&&closes[closes.length-1]>closes[closes.length-2]&&price>=r[r.length-1].open}

function zoneAndConfirmation(bars5:Bar[]):Setup|null{
 if(bars5.length<10)return null;
 const last=bars5[bars5.length-1];
 for(let i=Math.max(0,bars5.length-20);i<bars5.length-2;i++){
  const a=bars5[i],b=bars5[i+1],c=bars5[i+2];
  const displacement=bullish(b)&&range(b)>0&&body(b)>=range(b)*0.55;
  if(c.low>a.high&&displacement&&last.low<=c.low&&last.high>=a.high&&bullish(last)&&body(last)>=range(last)*0.55&&last.close>Math.max(c.low,a.high)){
    const stop=a.high-(c.low-a.high)*0.25;return {status:'CONFIRMED LONG',symbol:'',timeframe:'5m/15m',price:last.close,entryLow:a.high,entryHigh:c.low,stop,target1:0,target2:0,rr:0,fvg:{low:a.high,high:c.low},confirmation:{time:new Date(last.t*1000).toISOString(),close:last.close},reasons:['Bullish 3-candle FVG retraced and confirmed.']};
  }
 }
 for(let i=Math.max(0,bars5.length-20);i<bars5.length-4;i++){
  const ob=bars5[i];if(bullish(ob))continue;
  const d=bars5[i+1];if(!bullish(d)||range(d)<=0||body(d)<range(d)*0.55||d.close<=ob.high)continue;
  if(last.low<=ob.high&&last.high>=ob.low&&bullish(last)&&body(last)>=range(last)*0.55&&last.close>ob.high){
   return {status:'CONFIRMED LONG',symbol:'',timeframe:'5m/15m',price:last.close,entryLow:ob.low,entryHigh:ob.high,stop:ob.low-(ob.high-ob.low)*0.25,target1:0,target2:0,rr:0,orderBlock:{low:ob.low,high:ob.high},confirmation:{time:new Date(last.t*1000).toISOString(),close:last.close},reasons:['Bullish Order Block retraced and confirmed.']};
  }
 }
 return null;
}

export function backtestLong(symbol:string,input:Bar[],cfg:BacktestConfig={}):BacktestResult{
 const c={minGapPct:1,minActivity:500000,maxCprPct:.5,maxRisk:700,capital:3500,minRR:1.5,entryStart:'09:35',entryEnd:'14:45',forceExit:'15:14',...cfg};
 const bars=[...input].sort((a,b)=>a.t-b.t);const sessions=previousSessions(bars);const days=[...new Set(bars.map(b=>dayKey(b.t)))];const trades:BacktestTrade[]=[];const rejected={gap:0,activity:0,cpr:0,alignment:0,trigger:0,risk:0};
 for(let di=1;di<days.length;di++){
  const date=days[di],prevDate=days[di-1];const dayBars=bars.filter(b=>dayKey(b.t)===date);const prev=sessions.get(prevDate);if(!prev||!dayBars.length)continue;
  const day5=aggregate(dayBars,5),day15=aggregate(dayBars,15);const gap=((dayBars[0].open-prev.close)/prev.close)*100;const cp=cprWidth(prev);
  if(gap<c.minGapPct){rejected.gap++;continue} if(cp.widthPct>c.maxCprPct){rejected.cpr++;continue}
  let traded=false;
  for(let i=0;i<day5.length&&!traded;i++){
   const b=day5[i];if(!inWindow(b.t,c.entryStart,c.entryEnd))continue;const upto5=day5.slice(0,i+1);const activity=upto5.reduce((s,x)=>s+x.volume,0);if(activity<c.minActivity){continue}
   const price=b.close;const cpNow=cp;if(price<cpNow.high){rejected.alignment++;continue}
   const upto15=day15.filter(x=>x.t<=b.t);if(!bullish15Aligned(upto15,price)){continue}
   const setup=zoneAndConfirmation(upto5);if(!setup){continue}
   const entry=price;const stop=setup.stop!;const riskPer=Math.max(0,entry-stop);if(riskPer<=0){rejected.risk++;continue}
   const qty=Math.floor(Math.min(c.maxRisk/riskPer,c.capital/entry));if(qty<1){rejected.risk++;continue}
   const highs=upto5.slice(0,-1).map(x=>x.high);const t1Candidates=[prev.high,...highs].filter(x=>x>entry).sort((a,b)=>a-b);const t1=t1Candidates[0];const t2=t1Candidates.find(x=>x>t1);
   if(!t1||!t2||(t1-entry)/riskPer<c.minRR){rejected.trigger++;continue}
   let result:'T2'|'T1'|'SL'|'EOD'='EOD',exit=dayBars[dayBars.length-1].close;
   for(const f of day5.slice(i+1)){
    if(f.low<=stop){result='SL';exit=stop;break}
    if(f.high>=t2){result='T2';exit=t2;break}
    if(f.high>=t1){result='T1';exit=t1;break}
    if(hhmm(f.t)>=c.forceExit){exit=f.close;break}
   }
   const pnl=(exit-entry)*qty;trades.push({symbol,date,triggerTime:new Date(b.t*1000).toISOString(),entry,stop,target1:t1,target2:t2,riskPerShare:riskPer,qty,risk:riskPer*qty,result,pnl,rr:(t1-entry)/riskPer,zone:setup.fvg?'FVG':'ORDER BLOCK'});traded=true;
  }
 }
 let equity=0,peak=0,maxDD=0,wins=0,losses=0,gp=0,gl=0,con=0,maxCon=0;for(const t of trades){equity+=t.pnl;peak=Math.max(peak,equity);maxDD=Math.max(maxDD,peak-equity);if(t.pnl>0){wins++;gp+=t.pnl;con=0}else if(t.pnl<0){losses++;gl+=Math.abs(t.pnl);con++;maxCon=Math.max(maxCon,con)}}
 const n=trades.length,net=gp-gl;return {trades,stats:{trades:n,wins,losses,winRate:n?wins/n*100:0,grossProfit:gp,grossLoss:gl,netPnl:net,profitFactor:gl?gp/gl:gp?Infinity:0,expectancyR:n?trades.reduce((s,t)=>s+(t.pnl/(t.risk||1)),0)/n:0,maxDrawdown:maxDD,maxConsecutiveLosses:maxCon},rejected};
}

export function parseCsv(text:string):Bar[]{
 const rows=text.trim().split(/\r?\n/).filter(Boolean);if(rows.length<2)return[];const header=rows[0].split(',').map(x=>x.trim().toLowerCase());const idx=(names:string[])=>names.map(n=>header.indexOf(n)).find(i=>i>=0)??-1;const ti=idx(['timestamp','time','datetime','date']);const oi=idx(['open']);const hi=idx(['high']);const li=idx(['low']);const ci=idx(['close','ltp']);const vi=idx(['volume','vol']);if([ti,oi,hi,li,ci].some(i=>i<0))throw new Error('CSV requires timestamp, open, high, low and close columns');
 return rows.slice(1).map(line=>{const p=line.split(',');const raw=p[ti];const t=/^\d+$/.test(raw)?Number(raw):Math.floor(new Date(raw).getTime()/1000);return {t,open:Number(p[oi]),high:Number(p[hi]),low:Number(p[li]),close:Number(p[ci]),volume:vi>=0?Number(p[vi])||0:0}}).filter(b=>Number.isFinite(b.t)&&b.t>0&&b.close>0);
}
