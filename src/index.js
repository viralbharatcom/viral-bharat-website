const COOKIE = 'vb_session';
const SESSION_SECONDS = 60 * 60 * 12;
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
function cookies(request) { return Object.fromEntries((request.headers.get('Cookie') || '').split(';').map(x => x.trim()).filter(Boolean).map(x => { const i=x.indexOf('='); return [x.slice(0,i), decodeURIComponent(x.slice(i+1))]; })); }
function cookieHeader(token, maxAge) { return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax${maxAge ? `; Max-Age=${maxAge}` : ''}`; }
async function sha256(s) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join(''); }
function randomToken() { const a = new Uint8Array(32); crypto.getRandomValues(a); return [...a].map(x=>x.toString(16).padStart(2,'0')).join(''); }
function safeUrl(s) { try { const u = new URL(s); return ['https:','http:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } }
async function getSession(request, env) {
  const token = cookies(request)[COOKIE]; if (!token) return null;
  const hash = await sha256(token);
  const row = await env.DB.prepare('SELECT role, expires_at FROM sessions WHERE token_hash=?').bind(hash).first();
  if (!row || row.expires_at < Math.floor(Date.now()/1000)) { if(row) await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(hash).run(); return null; }
  return { role: row.role, hash };
}
async function requireRole(request, env, role) { const s = await getSession(request, env); return s && (s.role === role || s.role === 'admin') ? s : null; }
async function issueSession(env, role) { const token = randomToken(), hash = await sha256(token), exp = Math.floor(Date.now()/1000) + SESSION_SECONDS; await env.DB.prepare('INSERT INTO sessions(token_hash,role,expires_at) VALUES(?,?,?)').bind(hash, role, exp).run(); return token; }
async function handleApi(request, env) {
  const url = new URL(request.url), path = url.pathname, method = request.method;
  if (method === 'POST' && path === '/api/login') {
    const body = await request.json().catch(()=>({}));
    if (!env.VIEWER_PASSWORD || typeof body.password !== 'string' || body.password !== env.VIEWER_PASSWORD) return json({error:'Incorrect password.'}, 401);
    const token = await issueSession(env,'viewer'); return new Response(JSON.stringify({ok:true}), {headers:{'content-type':'application/json','cache-control':'no-store','set-cookie':cookieHeader(token,0)}});
  }
  if (method === 'POST' && path === '/api/admin/login') {
    const body = await request.json().catch(()=>({}));
    if (!env.ADMIN_USERNAME || !env.ADMIN_PASSWORD || body.username !== env.ADMIN_USERNAME || body.password !== env.ADMIN_PASSWORD) return json({error:'Admin login incorrect.'},401);
    const token = await issueSession(env,'admin'); return new Response(JSON.stringify({ok:true}), {headers:{'content-type':'application/json','cache-control':'no-store','set-cookie':cookieHeader(token,0)}});
  }
  if (method === 'POST' && path === '/api/logout') { const s=await getSession(request,env); if(s) await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(s.hash).run(); return new Response(JSON.stringify({ok:true}),{headers:{'content-type':'application/json','cache-control':'no-store','set-cookie':`${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`}}); }
  if (method === 'GET' && path === '/api/me') { const s=await getSession(request,env); return json({role:s?.role || null}); }
  if (method === 'GET' && path === '/api/pages') {
    const s=await getSession(request,env); if(!s) return json({error:'Login required.'},401);
    const pages=await env.DB.prepare('SELECT id,title,sort_order FROM pages ORDER BY sort_order,id').all();
    const videos=await env.DB.prepare('SELECT id,page_id,title,photo_url,watch_url,rating,badge,sort_order FROM videos ORDER BY sort_order,id').all();
    return json({pages:pages.results,videos:videos.results});
  }
  const admin = await requireRole(request,env,'admin');
  if (path.startsWith('/api/admin/')) {
    if(!admin) return json({error:'Admin login required.'},401);
    if(method==='POST' && path==='/api/admin/pages') { const b=await request.json().catch(()=>({})); const title=String(b.title||'').trim().slice(0,100); if(!title) return json({error:'Page title is required.'},400); const max=await env.DB.prepare('SELECT COALESCE(MAX(sort_order),0) AS n FROM pages').first(); const r=await env.DB.prepare('INSERT INTO pages(title,sort_order) VALUES(?,?)').bind(title,(max?.n||0)+1).run(); return json({ok:true,id:r.meta.last_row_id}); }
    if(method==='PUT' && /^\/api\/admin\/pages\/\d+$/.test(path)) { const id=+path.split('/').pop(), b=await request.json().catch(()=>({})), title=String(b.title||'').trim().slice(0,100); if(!title) return json({error:'Page title is required.'},400); await env.DB.prepare('UPDATE pages SET title=? WHERE id=?').bind(title,id).run(); return json({ok:true}); }
    if(method==='DELETE' && /^\/api\/admin\/pages\/\d+$/.test(path)) { const id=+path.split('/').pop(); await env.DB.prepare('DELETE FROM videos WHERE page_id=?').bind(id).run(); await env.DB.prepare('DELETE FROM pages WHERE id=?').bind(id).run(); return json({ok:true}); }
    if(method==='POST' && path==='/api/admin/videos') { const b=await request.json().catch(()=>({})); const pageId=Number(b.page_id), title=String(b.title||'').trim().slice(0,200), photo=safeUrl(String(b.photo_url||'')), watch=safeUrl(String(b.watch_url||'')), rating=String(b.rating||'').trim().slice(0,30), badge=String(b.badge||'').trim().slice(0,40); if(!pageId||!watch) return json({error:'Select a page and enter a valid http/https watch link.'},400); const p=await env.DB.prepare('SELECT id FROM pages WHERE id=?').bind(pageId).first(); if(!p) return json({error:'Page not found.'},404); const max=await env.DB.prepare('SELECT COALESCE(MAX(sort_order),0) AS n FROM videos WHERE page_id=?').bind(pageId).first(); const r=await env.DB.prepare('INSERT INTO videos(page_id,title,photo_url,watch_url,rating,badge,sort_order) VALUES(?,?,?,?,?,?,?)').bind(pageId,title,photo,watch,rating,badge,(max?.n||0)+1).run(); return json({ok:true,id:r.meta.last_row_id}); }
    if(method==='PUT' && /^\/api\/admin\/videos\/\d+$/.test(path)) { const id=+path.split('/').pop(), b=await request.json().catch(()=>({})), pageId=Number(b.page_id), title=String(b.title||'').trim().slice(0,200), photo=safeUrl(String(b.photo_url||'')), watch=safeUrl(String(b.watch_url||'')), rating=String(b.rating||'').trim().slice(0,30), badge=String(b.badge||'').trim().slice(0,40); if(!pageId||!watch) return json({error:'Select a page and enter a valid http/https watch link.'},400); await env.DB.prepare('UPDATE videos SET page_id=?,title=?,photo_url=?,watch_url=?,rating=?,badge=? WHERE id=?').bind(pageId,title,photo,watch,rating,badge,id).run(); return json({ok:true}); }
    if(method==='DELETE' && /^\/api\/admin\/videos\/\d+$/.test(path)) { await env.DB.prepare('DELETE FROM videos WHERE id=?').bind(+path.split('/').pop()).run(); return json({ok:true}); }
    return json({error:'Unknown admin endpoint.'},404);
  }
  return json({error:'Not found.'},404);
}
export default { async fetch(request, env) { const url=new URL(request.url); if(url.pathname.startsWith('/api/')) { try { return await handleApi(request,env); } catch(e) { return json({error:'Server setup incomplete. Check D1 database and secrets.'},500); } } if(url.pathname==='/admin') return Response.redirect(new URL('/admin.html',request.url),302); return env.ASSETS.fetch(request); } };
