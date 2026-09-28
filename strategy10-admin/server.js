const http=require('http'),fs=require('fs'),path=require('path');
const PORT=process.env.PORT||10000;
const root=path.join(__dirname);
const config={startingCapital:100000,lotSize:15,allocationPct:65,minRange:300,rangeUpper:500,basePremium:65,autoExecute:true,synthetic:true};
const state={account:{startingCapital:config.startingCapital,cash:config.startingCapital,totalPnl:0,trades:0,wins:0},position:null,trades:[],events:[],eventsTotal:0,cycle:0,lastScan:'--',market:{open:56205.45,high:56610.2,low:56120.15,close:56482.35,history:[]},signal:{status:'WAITING',side:'-',message:'Waiting for strategy conditions.'},engine:{startedAt:new Date().toISOString(),lastTickAt:null},session:{active:false,reason:'Waiting for session evaluation.'}};
for(let i=0;i<60;i++)state.market.history.push(state.market.close+(Math.random()-.5)*180);
function istNow(){return new Date(new Date().toLocaleString('en-US',{timeZone:'Asia/Kolkata'}))}
function time(){return istNow().toLocaleTimeString('en-IN',{hour12:false})}
function event(title,detail){state.events.unshift({time:time(),title,detail});state.events=state.events.slice(0,25);state.eventsTotal++}
function nextWeeklyExpiry(){const d=istNow();const day=d.getDay();const add=(3-day+7)%7||7;const x=new Date(d);x.setDate(d.getDate()+add);return x.toISOString().slice(0,10)}
function tick(){
 state.cycle++;state.engine.lastTickAt=new Date().toISOString();
 const m=state.market;
 const delta=(Math.random()-.44)*95;
 m.close=Math.max(55000,Math.min(58000,m.close+delta));
 m.high=Math.max(m.high,m.close);m.low=Math.min(m.low,m.close);
 const range=m.high-m.low,dir=m.close>=m.open?'UP':'DOWN';
 const wed=istNow().getDay()===3;
 const active=config.synthetic?true:wed;
 state.lastScan=time();
 state.session={active,reason:config.synthetic?'Synthetic demo mode bypasses weekday restriction for testing.':(wed?'Wednesday session is eligible.':'Strategy is Wednesday-only.')};
 if(!active){state.signal={status:'INACTIVE',side:'-',message:'Strategy inactive: Wednesday session required.'};event('Session inactive','Today is not Wednesday.');return}
 if(range<config.minRange){state.signal={status:'WAITING',side:'-',message:'Daily range below '+config.minRange+'. Scanner remains active.'};if(state.cycle%5===0)event('Range filter','Range '+range.toFixed(2)+' < '+config.minRange+' · no trade');return}
 const side=range<=config.rangeUpper?(dir==='UP'?'BUY CE':'BUY PE'):(dir==='UP'?'BUY PE':'BUY CE');
 if(!state.position&&config.autoExecute){
   const strike=Math.round(m.close/100)*100,premium=config.basePremium;
   const qty=Math.max(config.lotSize,Math.floor((state.account.cash*config.allocationPct/100)/(premium*config.lotSize))*config.lotSize);
   const cost=qty*premium;
   if(cost<=state.account.cash){
     state.account.cash-=cost;
     state.position={side,strike,expiry:nextWeeklyExpiry(),entry:premium,current:premium,qty,entryTime:time(),ticks:0};
     state.signal={status:'EXECUTED',side,message:'SIMULATED entry executed using configured demo parameters.'};
     event('Demo trade executed',side+' · ATM '+strike+' · Qty '+qty+' · Premium ₹'+premium);
   } else state.signal={status:'READY',side,message:'Signal valid, but demo cash is insufficient.'};
 }else if(state.position){
   state.position.ticks++;
   const move=(Math.random()-.38)*12;
   state.position.current=Math.max(1,state.position.current+move);
   const pnl=(state.position.current-state.position.entry)*state.position.qty;
   state.signal={status:'EXECUTED',side:state.position.side,message:'Position active · unrealized P&L ₹'+pnl.toFixed(2)};
   if(state.position.ticks>18||state.position.current>=state.position.entry*1.3){
     const p=state.position.current,pnlClose=(p-state.position.entry)*state.position.qty;
     state.account.cash+=p*state.position.qty;state.account.totalPnl+=pnlClose;state.account.trades++;if(pnlClose>0)state.account.wins++;
     state.trades.unshift({time:time(),side:state.position.side,strike:state.position.strike,expiry:state.position.expiry,entry:state.position.entry.toFixed(2),exit:p.toFixed(2),qty:state.position.qty,pnl:pnlClose,result:pnlClose>=0?'WIN':'LOSS'});
     event('Demo trade closed',(pnlClose>=0?'WIN':'LOSS')+' · P&L ₹'+pnlClose.toFixed(2));
     state.position=null;state.signal={status:'WAITING',side:'-',message:'Trade closed. Scanner continues.'};
   }
 }else{state.signal={status:'READY',side,message:'Signal valid. Demo execution is configured.'};if(state.cycle%5===0)event('Signal detected',side+' · Range '+range.toFixed(2)+' · '+dir)}
}
setInterval(tick,1200);
function payload(){const m=state.market;return {...state,market:{...m,range:m.high-m.low,direction:m.close>=m.open?'UP':'DOWN',changePct:((m.close-m.open)/m.open)*100},config}}
function send(res,status,type,data){res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','Access-Control-Allow-Origin':'*'});res.end(data)}
function readBody(req){return new Promise((resolve,reject)=>{let b='';req.on('data',c=>{b+=c;if(b.length>100000)reject(new Error('body too large'))});req.on('end',()=>{try{resolve(b?JSON.parse(b):{})}catch(e){reject(e)}});req.on('error',reject)})}
const server=http.createServer(async(req,res)=>{
 const u=new URL(req.url,'http://localhost');
 if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type'});return res.end()}
 if(u.pathname==='/api/health')return send(res,200,'application/json',JSON.stringify({ok:true,service:'strategy10-admin',engine:'running',cycle:state.cycle,synthetic:config.synthetic}));
 if(u.pathname==='/api/state')return send(res,200,'application/json',JSON.stringify(payload()));
 if(u.pathname==='/api/reset'&&req.method==='POST'){state.account={startingCapital:config.startingCapital,cash:config.startingCapital,totalPnl:0,trades:0,wins:0};state.position=null;state.trades=[];state.events=[];state.eventsTotal=0;state.signal={status:'WAITING',side:'-',message:'Demo reset. Waiting for strategy conditions.'};event('Demo reset','Account returned to configured starting capital.');return send(res,200,'application/json',JSON.stringify(payload()))}
 if(u.pathname==='/api/config'&&req.method==='GET')return send(res,200,'application/json',JSON.stringify(config));
 if(u.pathname==='/api/config'&&req.method==='POST'){
   try{
     const b=await readBody(req);
     const keys=['startingCapital','lotSize','allocationPct','minRange','rangeUpper','basePremium'];
     for(const k of keys)if(b[k]!==undefined&&Number.isFinite(Number(b[k])))config[k]=Number(b[k]);
     if(typeof b.autoExecute==='boolean')config.autoExecute=b.autoExecute;
     if(state.trades.length===0&&!state.position){state.account.startingCapital=config.startingCapital;state.account.cash=config.startingCapital}
     event('Configuration updated','Paper engine configuration applied from admin panel.');
     return send(res,200,'application/json',JSON.stringify(payload()));
   }catch(e){return send(res,400,'application/json',JSON.stringify({error:e.message}))}
 }
 let file=u.pathname==='/'?'index.html':u.pathname.replace(/^\//,'');if(file.includes('..'))return send(res,403,'text/plain','Forbidden');
 const full=path.join(root,file);if(!fs.existsSync(full))return send(res,404,'text/plain','Not found');
 const ext=path.extname(full);const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};send(res,200,types[ext]||'text/plain',fs.readFileSync(full));
});
server.listen(PORT,()=>event('Engine started','Strategy 10.1 backend scanner online · DEMO mode'));