import {describe,expect,it} from 'vitest';
import {cpr,positionSize,rr,bullishFvg,bearishFvg} from './strategy';
const p={open:100,high:110,low:90,close:105,volume:1000};
describe('strategy engine',()=>{
it('calculates CPR',()=>{const x=cpr(p);expect(x.pivot).toBeCloseTo(101.6667);expect(x.bc).toBe(100);expect(x.tc).toBeCloseTo(103.3333);});
it('caps quantity by risk and capital',()=>expect(positionSize(3500,700,250,246)).toBe(14));
it('calculates reward risk',()=>expect(rr(250,246,258)).toBe(2));
it('detects bullish FVG',()=>expect(bullishFvg({open:100,high:102,low:99,close:101,volume:1},{open:102,high:106,low:101,close:105,volume:1},{open:105,high:108,low:103,close:107,volume:1})).toEqual({low:102,high:103}));
it('detects bearish FVG',()=>expect(bearishFvg({open:106,high:108,low:104,close:105,volume:1},{open:105,high:106,low:101,close:102,volume:1},{open:102,high:103,low:99,close:100,volume:1})).toEqual({low:103,high:104}));
});
