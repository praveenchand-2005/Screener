export default function handler(req:any,res:any){res.status(200).json({ok:true,service:'screener-api',mode:'paper-live',realMoneyExecution:false,serverTime:new Date().toISOString()});}
