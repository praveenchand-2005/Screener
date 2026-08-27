export type Stock={symbol:string;name:string;segment:'NIFTY50'|'NEXT50'};
export const NIFTY50:Stock[]=['RELIANCE','HDFCBANK','BHARTIARTL','TCS','ICICIBANK','SBIN','INFY','LICI','ITC','HINDUNILVR','LT','BAJFINANCE','HCLTECH','MARUTI','KOTAKBANK','AXISBANK','SUNPHARMA','M&M','ULTRACEMCO','TITAN'].map(symbol=>({symbol,name:symbol,segment:'NIFTY50'}));
export const NEXT50:Stock[]=['ADANIPORTS','BEL','TRENT','HAL','ZOMATO','JIOFIN','INDIGO','VBL','IOC','DLF','IRCTC','VEDL','PIDILITIND','SIEMENS','ABB','GODREJCP','BANKBARODA','PNB','CANBK','TVSMOTOR'].map(symbol=>({symbol,name:symbol,segment:'NEXT50'}));
export const UNIVERSE=[...NIFTY50,...NEXT50];
