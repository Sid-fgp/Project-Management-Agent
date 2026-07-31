// 工作事务进度追踪台账 —— 后端服务（Node 内置模块，无第三方依赖）
// 提供：账号注册(待审核)/登录/登出、创始账号审核、按账号隔离的事务同步 API
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const PUBLIC_DIR = ROOT;
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const SEED_FILE = path.join(ROOT, 'seed_tasks.json');

const FOUNDER = 'sidfeng@summit-pines.com';
const FOUNDER_PWD = '123456';
const PORT = process.env.PORT || 3000;

const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8',
  '.svg':'image/svg+xml', '.ico':'image/x-icon' };

// ---------- 工具 ----------
function hashPwd(p){ return crypto.createHash('sha256').update('wl_salt_'+p).digest('hex').slice(0,16); }
function newToken(){ return crypto.randomBytes(18).toString('hex'); }
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }

// ---------- 数据库（支持 Postgres 持久化 / 本地文件降级） ----------
const DATABASE_URL = process.env.DATABASE_URL || '';
let pgClient = null, usePg = false;

async function initStore(){
  if(!DATABASE_URL){ console.log('ℹ️ 未设置 DATABASE_URL，使用本地文件存储（data/db.json，重部署会重置）'); return; }
  let pg;
  try{ pg = require('pg'); }
  catch(e){ console.warn('⚠️ 未安装 pg 模块，回退本地文件存储'); return; }
  try{
    pgClient = new pg.Client({ connectionString: DATABASE_URL, ssl: DATABASE_URL.includes('sslmode=require')||DATABASE_URL.startsWith('postgres://')?{rejectUnauthorized:false}:undefined });
    await pgClient.connect();
    await pgClient.query('CREATE TABLE IF NOT EXISTS ledger_state(key text primary key, data jsonb, updated_at timestamptz default now())');
    usePg = true;
    console.log('✅ 已连接 Postgres 持久化数据库（重部署数据不丢失）');
  }catch(e){
    console.error('❌ Postgres 连接失败，回退本地文件存储：', e.message);
    usePg = false;
  }
}
async function pgLoad(){
  const r = await pgClient.query('SELECT data FROM ledger_state WHERE key=$1',['main']);
  return r.rows.length ? r.rows[0].data : null;
}
async function pgSave(d){
  await pgClient.query(
    'INSERT INTO ledger_state(key,data,updated_at) VALUES($1,$2::jsonb,now()) ON CONFLICT(key) DO UPDATE SET data=EXCLUDED.data, updated_at=now()',
    ['main', JSON.stringify(d)]
  );
}

async function loadDB(){
  let db=null;
  if(usePg){
    try{ db = await pgLoad(); }catch(e){ console.error('读库失败',e.message); db=null; }
  }else{
    if(!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR,{recursive:true});
    if(fs.existsSync(DB_FILE)){ try{ db=JSON.parse(fs.readFileSync(DB_FILE,'utf8')); }catch(e){ db=null; } }
  }
  if(!db||typeof db!=='object') db={accounts:{},tokens:{},tasks:{},founder:FOUNDER};
  db.accounts=db.accounts||{}; db.tokens=db.tokens||{}; db.tasks=db.tasks||{}; db.founder=FOUNDER;
  // 确保创始账号存在且已批准
  if(!db.accounts[FOUNDER]){
    db.accounts[FOUNDER]={pwd:hashPwd(FOUNDER_PWD),status:'approved',role:'founder',createdAt:new Date().toISOString()};
  }else{
    db.accounts[FOUNDER].status='approved'; db.accounts[FOUNDER].role='founder';
  }
  // 创始账号首次载入种子事项
  if(!db.tasks[FOUNDER]){
    try{ db.tasks[FOUNDER]=JSON.parse(fs.readFileSync(SEED_FILE,'utf8')); }
    catch(e){ db.tasks[FOUNDER]=[]; }
  }
  await saveDB(db);
  return db;
}
let db = null;
async function saveDB(d){
  if(usePg){ try{ await pgSave(d); }catch(e){ console.error('写库失败',e.message); } return; }
  if(!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR,{recursive:true});
  fs.writeFileSync(DB_FILE, JSON.stringify(d,null,2));
}

// ---------- HTTP 辅助 ----------
function sendJSON(res, code, obj){
  const body=JSON.stringify(obj);
  res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Content-Length':Buffer.byteLength(body)});
  res.end(body);
}
function readBody(req){
  return new Promise((resolve,reject)=>{
    let buf=''; req.on('data',c=>{buf+=c; if(buf.length>5e6)req.destroy();});
    req.on('end',()=>{ try{ resolve(buf?JSON.parse(buf):{}); }catch(e){ reject(new Error('请求体不是合法JSON')); } });
    req.on('error',reject);
  });
}
function getUser(req){
  const auth=req.headers['authorization']||'';
  const m=auth.match(/^Bearer\s+(.+)$/i);
  if(!m) return null;
  const email=db.tokens[m[1]];
  if(!email) return null;
  const acc=db.accounts[email];
  if(!acc) return null;
  if(acc.status!=='approved') return null;   // 被停用/待审核的账号，已签发的会话立即失效
  return email;
}
// 吊销某账号名下全部登录令牌
function revokeTokens(target){
  Object.keys(db.tokens).forEach(t=>{ if(db.tokens[t]===target) delete db.tokens[t]; });
}

// ---------- 静态文件（仅放行首页，避免源码/数据外泄） ----------
function serveStatic(req,res){
  let p=(decodeURIComponent(req.url.split('?')[0])||'/').replace(/\\/g,'/');
  if(p==='/'||p==='') p='/index.html';
  if(p!=='/index.html'){ res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'}); res.end('404 Not Found'); return; }
  fs.readFile(path.join(PUBLIC_DIR,'index.html'),(err,data)=>{
    if(err){ res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'}); res.end('404 Not Found'); return; }
    res.writeHead(200,{'Content-Type':MIME['.html']});
    res.end(data);
  });
}

// ---------- API 路由 ----------
async function handleApi(req,res,pathname){
  // 健康检查 / 存储模式自检（无需登录）
  if(req.method==='GET'&&pathname==='/api/health'){
    return sendJSON(res,200,{
      ok:true,
      store: usePg ? 'postgres' : 'file',
      persistent: usePg,
      note: usePg ? '已连接 Postgres，重部署数据不丢失' : '本地文件模式，重部署数据会重置',
      accounts: Object.keys(db.accounts||{}).length,
      time: new Date().toISOString()
    });
  }
  // 注册
  if(req.method==='POST'&&pathname==='/api/register'){
    let b; try{ b=await readBody(req); }catch(e){ return sendJSON(res,400,{error:e.message}); }
    const email=(b.email||'').trim().toLowerCase();
    const password=b.password||'';
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return sendJSON(res,400,{error:'账号须为有效邮箱'});
    if(!/^\d{6,}$/.test(password)) return sendJSON(res,400,{error:'密码须为 6 位或以上数字'});
    if(db.accounts[email]) return sendJSON(res,409,{error:'该账号已注册，请直接登录'});
    const isFounder=(email===FOUNDER);
    db.accounts[email]={pwd:hashPwd(password),status:isFounder?'approved':'pending',role:isFounder?'founder':'user',createdAt:new Date().toISOString()};
    if(isFounder && !db.tasks[email]){
      try{ db.tasks[email]=JSON.parse(fs.readFileSync(SEED_FILE,'utf8')); }catch(e){ db.tasks[email]=[]; }
    }
    await saveDB(db);
    if(isFounder) return sendJSON(res,200,{ok:true,token:await issueToken(email),email,role:'founder'});
    return sendJSON(res,200,{ok:true,pending:true,msg:'注册申请已提交，请等待创始账号 '+FOUNDER+' 审核通过后登录'});
  }
  // 登录
  if(req.method==='POST'&&pathname==='/api/login'){
    let b; try{ b=await readBody(req); }catch(e){ return sendJSON(res,400,{error:e.message}); }
    const email=(b.email||'').trim().toLowerCase();
    const password=b.password||'';
    const acc=db.accounts[email];
    if(!acc) return sendJSON(res,401,{error:'账号不存在，请先注册'});
    if(acc.pwd!==hashPwd(password)) return sendJSON(res,401,{error:'密码错误'});
    if(acc.status==='suspended') return sendJSON(res,403,{error:'该账号已被管理员停用，如需恢复请联系 '+FOUNDER});
    if(acc.status!=='approved') return sendJSON(res,403,{error:'账号待审核',pending:true,msg:'注册申请等待创始账号审核中，请稍后再试'});
    acc.lastLoginAt=new Date().toISOString();
    return sendJSON(res,200,{ok:true,token:await issueToken(email),email,role:acc.role});
  }
  // 以下接口需要登录
  const email=getUser(req);
  if(!email) return sendJSON(res,401,{error:'未登录或登录已失效'});

  if(req.method==='POST'&&pathname==='/api/logout'){
    const auth=(req.headers['authorization']||'').match(/^Bearer\s+(.+)$/i);
    if(auth) delete db.tokens[auth[1]];
    await saveDB(db); return sendJSON(res,200,{ok:true});
  }
  if(req.method==='GET'&&pathname==='/api/me'){
    const acc=db.accounts[email];
    return sendJSON(res,200,{ok:true,email,role:acc.role,status:acc.status});
  }
  if(req.method==='GET'&&pathname==='/api/tasks'){
    return sendJSON(res,200,{ok:true,tasks:db.tasks[email]||[]});
  }
  if(req.method==='PUT'&&pathname==='/api/tasks'){
    let b; try{ b=await readBody(req); }catch(e){ return sendJSON(res,400,{error:e.message}); }
    if(!Array.isArray(b)) return sendJSON(res,400,{error:'数据格式不正确'});
    db.tasks[email]=b; await saveDB(db);
    return sendJSON(res,200,{ok:true,count:b.length});
  }
  // 创始账号专属：审核
  const acc=db.accounts[email];
  if(acc.role!=='founder') return sendJSON(res,403,{error:'仅创始账号可操作'});

  if(req.method==='GET'&&pathname==='/api/pending'){
    const list=Object.keys(db.accounts).filter(e=>db.accounts[e].status==='pending')
      .map(e=>({email:e,createdAt:db.accounts[e].createdAt}));
    return sendJSON(res,200,{ok:true,pending:list});
  }
  if(req.method==='POST'&&(pathname==='/api/approve'||pathname==='/api/reject')){
    let b; try{ b=await readBody(req); }catch(e){ return sendJSON(res,400,{error:e.message}); }
    const target=(b.email||'').trim().toLowerCase();
    if(!db.accounts[target]) return sendJSON(res,404,{error:'账号不存在'});
    if(target===FOUNDER) return sendJSON(res,400,{error:'不能操作创始账号'});
    if(pathname==='/api/approve'){
      db.accounts[target].status='approved';
    }else{
      delete db.accounts[target]; revokeTokens(target); delete db.tasks[target];
    }
    await saveDB(db);
    return sendJSON(res,200,{ok:true});
  }

  // ===== 账号管理（创始账号专属）=====
  // 全部账号列表
  if(req.method==='GET'&&pathname==='/api/users'){
    const list=Object.keys(db.accounts).map(e=>{
      const a=db.accounts[e];
      return {
        email:e,
        role:a.role||'user',
        status:a.status||'pending',
        createdAt:a.createdAt||'',
        lastLoginAt:a.lastLoginAt||'',
        taskCount:(db.tasks[e]||[]).length,
        online:Object.values(db.tokens).includes(e)
      };
    }).sort((x,y)=>{
      if(x.role!==y.role) return x.role==='founder'?-1:1;
      return (x.createdAt||'').localeCompare(y.createdAt||'');
    });
    return sendJSON(res,200,{ok:true,users:list,founder:FOUNDER});
  }
  // 停用 / 启用 / 删除 / 重置密码 / 强制下线
  if(req.method==='POST'&&/^\/api\/user\/(suspend|enable|delete|resetpwd|kick)$/.test(pathname)){
    let b; try{ b=await readBody(req); }catch(e){ return sendJSON(res,400,{error:e.message}); }
    const action=pathname.split('/').pop();
    const target=(b.email||'').trim().toLowerCase();
    if(!db.accounts[target]) return sendJSON(res,404,{error:'账号不存在'});
    if(target===FOUNDER) return sendJSON(res,400,{error:'不能对创始账号执行此操作'});
    const t=db.accounts[target];
    if(action==='suspend'){
      if(t.status==='pending') return sendJSON(res,400,{error:'该账号尚未审核通过，请在「审核注册」中处理'});
      t.status='suspended'; revokeTokens(target);
    }else if(action==='enable'){
      t.status='approved';
    }else if(action==='kick'){
      revokeTokens(target);
    }else if(action==='delete'){
      delete db.accounts[target]; revokeTokens(target); delete db.tasks[target];
    }else if(action==='resetpwd'){
      const np=b.password||'';
      if(!/^\d{6,}$/.test(np)) return sendJSON(res,400,{error:'新密码须为 6 位或以上数字'});
      t.pwd=hashPwd(np); revokeTokens(target);
    }
    await saveDB(db);
    return sendJSON(res,200,{ok:true});
  }
  return sendJSON(res,404,{error:'接口不存在'});
}
async function issueToken(email){ const t=newToken(); db.tokens[t]=email; await saveDB(db); return t; }

// ---------- 启动 ----------
const server=http.createServer((req,res)=>{
  const pathname=req.url.split('?')[0];
  if(pathname.startsWith('/api/')){
    handleApi(req,res,pathname).catch(e=>sendJSON(res,500,{error:'服务器错误：'+(e.message||e)}));
  }else{
    serveStatic(req,res);
  }
});
(async()=>{
  await initStore();
  db = await loadDB();
  server.listen(PORT,'0.0.0.0',()=>{
    console.log('📋 工作事务台账服务已启动： http://0.0.0.0:'+PORT);
    console.log('   创始账号：'+FOUNDER+'  密码：'+FOUNDER_PWD);
  });
})();
