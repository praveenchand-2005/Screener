export type Bar={t:number;open:number;high:number;low:number;close:number;volume:number};
export type SetupStatus='CONFIRMED LONG'|'WAIT'|'LEAVE IT';
export type Setup={status:SetupStatus;symbol:string;timeframe:'5m/15m';price:number;entryLow?:number;entryHigh?:number;stop?:number;target1?:number;target2?:number;rr?:number;cpr?:{pivot:number;bc:number;tc:number;widthPct:number};fvg?:{low:number;high:number};orderBlock?:{low:number;high:number};confirmation?:{time:string;close:number};liquidity?:{priorHigh?:number;recentHigh?:number};reasons:string[]};
export function istDay(t:number){return Math.floor((t+19800)/86400)}
export function cpr(prev:Bar){const pivot=(prev.high+prev.low+prev.close)/3;const bc=(prev.high+prev.low)/2;const tc=2*pivot-bc;return {pivot,bc:Math.min(bc,tc),tc:Math.max(bc,tc),widthPct:((Math.max(bc,tc)-Math.min(bc,tc))/pivot)*100}}
function bullish(b:Bar){return b.close>b.open}
function body(b:Bar){return Math.abs(b.close-b.open)}
function bullishDisplacement(b:Bar,range:number){return bullish(b)&&body(b)>=range*0.55&&b.close>b.open+(range*0.5)}
function overlap(aLow:number,aHigh:number,bLow:number,bHigh:number){return Math.max(aLow,bLow)<=Math.min(aHigh,bHigh)}
export function analyzeLong(symbol:string,bars5:Bar[],bars15:Bar[],prev:Bar,now=Date.now()):Setup{
 const last5=bars5.length?bars5[bars5.length-1]:undefined;const base={symbol,timeframe:'5m/15m' as const,price:last5?.close||0,reasons:[] as string[]};
 if(!bars5.length||!bars15.length)return {...base,status:'LEAVE IT',reasons:['Insufficient 5m/15m candle data.']};
 const cp=cpr(prev),price=base.price,reasons:string[]=[];
 if(cp.widthPct>0.5)return {...base,status:'LEAVE IT',cpr:cp,reasons:['Daily CPR is not narrow enough.']};
 if(price<cp.tc)return {...base,status:'LEAVE IT',cpr:cp,reasons:['Price is below the bullish CPR band; bullish CPR alignment is absent.']};
 reasons.push('Price is above the previous-session CPR band.');
 const recent=bars5.slice(-30);let fvg:{low:number;high:number;idx:number}|undefined;
 for(let i=0;i<recent.length-2;i++){const a=recent[i],b=recent[i+1],c=recent[i+2];const r=a.high-a.low;if(c.low>a.high&&bullish(b)&&bullishDisplacement(b,r))fvg={low:a.high,high:c.low,idx:i+2}}
 let ob:{low:number;high:number;idx:number}|undefined;
 for(let i=0;i<recent.length-4;i++){const a=recent[i];if(!bullish(a)){for(let j=i+1;j<Math.min(i+5,recent.length);j++){const d=recent[j],range=d.high-d.low;if(bullishDisplacement(d,range)&&d.close>a.high){ob={low:a.low,high:a.high,idx:j};break}}}}
 const zones=[...(fvg?[{low:fvg.low,high:fvg.high,type:'FVG'}]:[]),...(ob?[{low:ob.low,high:ob.high,type:'ORDER BLOCK'}]:[])];
 if(!zones.length)return {...base,status:'WAIT',cpr:cp,reasons:[...reasons,'No valid bullish FVG or bullish Order Block has formed in the recent 5m structure.']};
 const last=recent[recent.length-1];let selected:any;
 for(const z of zones){if(overlap(last.low,last.high,z.low,z.high))selected=z}
 if(!selected)return {...base,status:'WAIT',cpr:cp,...(fvg?{fvg:{low:fvg.low,high:fvg.high}}:{}),...(ob?{orderBlock:{low:ob.low,high:ob.high}}:{}),reasons:[...reasons,'Bullish zone exists, but the latest 5m candle has not retraced into it.']};
 const rejection=bullish(last)&&last.close>selected.high&&((Math.min(last.open,last.close)-last.low)>=body(last));
 if(!rejection)return {...base,status:'WAIT',cpr:cp,...(fvg?{fvg:{low:fvg.low,high:fvg.high}}:{}),...(ob?{orderBlock:{low:ob.low,high:ob.high}}:{}),reasons:[...reasons,`${selected.type} retracement detected; waiting for a strong bullish rejection/confirmation candle.`]};
 const entryLow=selected.low,entryHigh=Math.min(selected.high,last.high),entry=last.close,stop=selected.low-(selected.high-selected.low)*0.25;
 const priorHigh=prev.high,swingHigh=Math.max(...recent.slice(0,-1).map(b=>b.high));const targets=[priorHigh,swingHigh].filter(x=>x>entry).sort((a,b)=>a-b);const t1=targets[0],t2=targets.find(x=>x>t1);
 if(!t1||!t2)return {...base,status:'WAIT',cpr:cp,...(fvg?{fvg:{low:fvg.low,high:fvg.high}}:{}),...(ob?{orderBlock:{low:ob.low,high:ob.high}}:{}),confirmation:{time:new Date(last.t*1000).toISOString(),close:last.close},reasons:[...reasons,`${selected.type} rejection confirmed, but two clean upside liquidity targets are not available.`]};
 const risk=entry-stop,rr1=(t1-entry)/risk;if(risk<=0||rr1<1.5)return {...base,status:'WAIT',cpr:cp,confirmation:{time:new Date(last.t*1000).toISOString(),close:last.close},reasons:[...reasons,'Confirmation exists, but risk/reward is below the minimum 1.5R threshold.']};
 return {...base,status:'CONFIRMED LONG',price,entryLow,entryHigh,stop,target1:t1,target2:t2,rr:Number(rr1.toFixed(2)),cpr:cp,...(fvg?{fvg:{low:fvg.low,high:fvg.high}}:{}),...(ob?{orderBlock:{low:ob.low,high:ob.high}}:{}),confirmation:{time:new Date(last.t*1000).toISOString(),close:last.close},liquidity:{priorHigh,recentHigh:swingHigh},reasons:[...reasons,`Bullish ${selected.type} retracement and strong rejection confirmed.`,`Upside liquidity targets: prior-session high and recent swing high.`]};
}
