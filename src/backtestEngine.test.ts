import {describe,expect,it} from 'vitest';
import {backtestLong,parseCsv} from './backtestEngine';
import {Bar} from './setupEngine';

const epoch=(iso:string)=>Math.floor(new Date(iso).getTime()/1000);
const b=(iso:string,o:number,h:number,l:number,c:number,v=100000):Bar=>({t:epoch(iso),open:o,high:h,low:l,close:c,volume:v});

describe('CPR/FVG/OB backtest engine',()=>{
 it('rejects a day when the gap filter fails',()=>{
  const bars=[
   b('2026-08-25T09:15:00+05:30',100,101,99,100),b('2026-08-25T15:15:00+05:30',100,101,98,100),
   b('2026-08-26T09:15:00+05:30',100,101,99,100),b('2026-08-26T09:20:00+05:30',100,101,99,100)
  ];
  const r=backtestLong('TEST',bars);expect(r.trades).toHaveLength(0);expect(r.rejected.gap).toBe(1);
 });
 it('parses standard OHLCV CSV',()=>{
  const rows='timestamp,open,high,low,close,volume\n2026-08-26T09:15:00+05:30,100,101,99,100.5,120000';
  const out=parseCsv(rows);expect(out).toHaveLength(1);expect(out[0].close).toBe(100.5);expect(out[0].volume).toBe(120000);
 });
});
