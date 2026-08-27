export const TEST_MODE={capital:3500,maxRiskPerTrade:700,execution:'PAPER',realMoneyExecution:false,marketData:'FREE_SOURCE_REQUIRED',staleAfterSeconds:60};

export type FeedState='LIVE'|'STALE'|'DEMO'|'UNAVAILABLE';
export function classifyFeed(asOf:string|undefined,source:string|undefined):FeedState{
  if(!source||source==='UNKNOWN') return 'UNAVAILABLE';
  if(source==='DEMO') return 'DEMO';
  if(!asOf) return 'STALE';
  const age=(Date.now()-new Date(asOf).getTime())/1000;
  return age<=TEST_MODE.staleAfterSeconds?'LIVE':'STALE';
}
