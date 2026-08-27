export type Candle={open:number;high:number;low:number;close:number;volume:number};
export type CPR={pivot:number;bc:number;tc:number;widthPct:number};
export function cpr(prev:Candle):CPR{const pivot=(prev.high+prev.low+prev.close)/3;const bc=(prev.high+prev.low)/2;const tc=2*pivot-bc;return {pivot,bc:Math.min(bc,tc),tc:Math.max(bc,tc),widthPct:((Math.max(bc,tc)-Math.min(bc,tc))/pivot)*100};}
export function positionSize(capital:number,risk:number,entry:number,stop:number){const perShare=Math.abs(entry-stop);if(perShare<=0)return 0;return Math.max(0,Math.min(Math.floor(risk/perShare),Math.floor(capital/entry)));}
export function rr(entry:number,stop:number,target:number){const risk=Math.abs(entry-stop);return risk?Math.abs(target-entry)/risk:0;}
export function bullishFvg(a:Candle,b:Candle,c:Candle){return c.low>a.high&&b.close>b.open?{low:a.high,high:c.low}:null;}
export function bearishFvg(a:Candle,b:Candle,c:Candle){return c.high<a.low&&b.close<b.open?{low:c.high,high:a.low}:null;}
export function rejectionBull(c:Candle,zoneLow:number,zoneHigh:number){const body=Math.abs(c.close-c.open);const lower=Math.min(c.open,c.close)-c.low;return c.low<=zoneHigh&&c.low>=zoneLow&&c.close>c.open&&lower>=body;}
export function rejectionBear(c:Candle,zoneLow:number,zoneHigh:number){const body=Math.abs(c.close-c.open);const upper=c.high-Math.max(c.open,c.close);return c.high>=zoneLow&&c.high<=zoneHigh&&c.close<c.open&&upper>=body;}
