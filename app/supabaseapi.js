'use strict';
/* InvestigaApp · Capa 2 en la nube (Supabase).
   Mantiene las mismas rutas que usaba la app (register, login, state, projects/{id}/…)
   y delega las reglas en funciones del servidor con seguridad por fila (RLS). */
(function(){
const cfg=window.INVESTIGA_CONFIG;
const sb=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:'investigaapp-auth'}});
const STYLES=['APA','IEEE','Vancouver'];

function fail(m){throw new Error(m)}
function clean(msg){
  msg=String(msg||'No se pudo realizar la operación');
  if(/Invalid login credentials/i.test(msg))return 'Credenciales incorrectas.';
  if(/Email not confirmed/i.test(msg))return 'Tu correo aún no está confirmado. Revisa tu bandeja de entrada (y la carpeta de spam).';
  if(/User already registered/i.test(msg))return 'El correo ya está registrado. Ingresa con tu contraseña.';
  if(/rate limit/i.test(msg))return 'Demasiados intentos seguidos. Espera unos minutos y vuelve a intentarlo.';
  if(/Failed to fetch|NetworkError|Load failed/i.test(msg))return 'No hay conexión con el servidor. Conserva tu borrador y vuelve a intentarlo.';
  if(/JWT expired|invalid JWT/i.test(msg))return 'Inicia sesión para continuar.';
  return msg.replace(/^CONFLICTO:\s*/,'');
}
async function q(p){const {data,error}=await p;if(error)fail(clean(error.message));return data}
async function rpc(fn,args){return q(sb.rpc(fn,args))}
async function uid(){const {data}=await sb.auth.getSession();const id=data.session?.user?.id;if(!id)fail('Inicia sesión para continuar.');return id}

function citation(s,style){
  if(!['author','year','title','venue'].every(k=>String(s[k]??'').trim()))fail('Completa autor, año, título y revista o editorial.');
  if(!STYLES.includes(style))fail('Estilo desconocido.');
  const {author:a,year:y,title:t,venue:v}=s,l=s.url||'';
  if(style==='APA')return `${a} (${y}). ${t}. ${v}. ${l}`.trim();
  if(style==='IEEE')return `${a}, “${t},” ${v}, ${y}. ${l}`.trim();
  return `${a}. ${t}. ${v}. ${y}. ${l}`.trim();
}
/* ZIP mínimo para .docx */
const CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
function crc32(b){let c=0xFFFFFFFF;for(let i=0;i<b.length;i++)c=CRC[(c^b[i])&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0}
function zip(files){const enc=new TextEncoder(),parts=[],central=[];let off=0;
  for(const [name,content] of files){const n=enc.encode(name),d=enc.encode(content),crc=crc32(d);
    const h=new DataView(new ArrayBuffer(30));h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x0800,true);h.setUint32(14,crc,true);h.setUint32(18,d.length,true);h.setUint32(22,d.length,true);h.setUint16(26,n.length,true);parts.push(new Uint8Array(h.buffer),n,d);
    const c=new DataView(new ArrayBuffer(46));c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x0800,true);c.setUint32(16,crc,true);c.setUint32(20,d.length,true);c.setUint32(24,d.length,true);c.setUint16(28,n.length,true);c.setUint32(42,off,true);central.push(new Uint8Array(c.buffer),n);off+=30+n.length+d.length}
  const size=central.reduce((s,p)=>s+p.length,0),e=new DataView(new ArrayBuffer(22));e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,size,true);e.setUint32(16,off,true);
  return new Blob([...parts,...central,new Uint8Array(e.buffer)])}
const xmlEsc=s=>s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'');
function wordDocument(text){const body=text.split(/\r?\n/).map(l=>'<w:p><w:r><w:t xml:space="preserve">'+xmlEsc(l)+'</w:t></w:r></w:p>').join('');
  return zip([['[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'],
  ['_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
  ['word/document.xml','<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+body+'<w:sectPr/></w:body></w:document>']])}
const file=(blob,name)=>new Response(blob,{headers:{'Content-Disposition':`attachment; filename="${name}"`}});

async function loadProject(pid,me){
  const p=await q(sb.from('projects').select('id,owner_id,title,created_at').eq('id',pid).maybeSingle());
  if(!p)fail('Proyecto no encontrado');
  const owner=p.owner_id===me;
  const [versions,sources,readings,rewards,messages,comments,members]=await Promise.all([
    q(sb.from('versions').select('id,activity,revision,data,status,feedback,reflection,created_at').eq('project_id',pid).order('id',{ascending:false})),
    q(sb.from('sources').select('id,author,year,title,venue,url').eq('project_id',pid).order('created_at')),
    q(sb.from('readings').select('source_id,data').eq('project_id',pid)),
    q(sb.from('rewards').select('activity,xp').eq('project_id',pid)),
    owner?q(sb.from('mentor_messages').select('question,answer,created_at').eq('project_id',pid).order('id')):[],
    q(sb.from('comments').select('id,activity,revision,text,created_at,user_id,profiles(name)').eq('project_id',pid).order('id',{ascending:false})),
    owner?q(sb.from('project_members').select('user_id,profiles(email,name)').eq('project_id',pid)):[]
  ]);
  return {project:{id:p.id,title:p.title,created:p.created_at,user_id:p.owner_id},owner,
    versions:versions.map(v=>({...v,created:v.created_at})),
    sources:sources.map(s=>({...s,url:s.url||''})),
    readings:Object.fromEntries(readings.map(r=>[r.source_id,r.data])),
    rewards,messages:messages.map(m=>({...m,created:m.created_at})),
    comments:comments.map(c=>({...c,created:c.created_at,name:c.profiles?.name||'Docente'})),
    members:members.map(m=>({email:m.profiles?.email||'',name:m.profiles?.name||''}))};
}

async function handle(path,data){
  const isPost=data!==undefined;data=data||{};
  if(path==='register'||path==='login'){
    const email=String(data.email??'').trim().toLowerCase(),password=String(data.password??'');
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail('Introduce un correo válido.');
    if(path==='register'){
      if(password.length<10)fail('La contraseña debe tener al menos 10 caracteres.');
      const name=String(data.name??'').trim();if(!name||name.length>120)fail('Escribe un nombre de hasta 120 caracteres.');
      const res=await q(sb.auth.signUp({email,password,options:{data:{name},emailRedirectTo:location.origin+location.pathname}}));
      if(!res.session)fail('Cuenta creada. Te enviamos un correo de confirmación: ábrelo y luego ingresa con tu contraseña.');
      if(res.user&&Array.isArray(res.user.identities)&&res.user.identities.length===0)fail('El correo ya está registrado. Ingresa con tu contraseña.');
    }else{
      await q(sb.auth.signInWithPassword({email,password}));
    }
    rpc('log_event',{p_action:'inicio_sesion'}).catch(()=>{});
    return {ok:true};
  }
  const me=await uid();
  if(path==='logout'){await rpc('log_event',{p_action:'cierre_sesion'}).catch(()=>{});await sb.auth.signOut();return {ok:true}}
  if(path==='state'){
    const [profile,acts,contents,own,shared,questions,rfields]=await Promise.all([
      q(sb.from('profiles').select('*').eq('id',me).single()),
      q(sb.from('activities').select('*').order('position')),
      q(sb.from('contents').select('id,activity,guide,example').order('id',{ascending:false})),
      q(sb.from('projects').select('id,title,created_at').eq('owner_id',me).order('created_at')),
      q(sb.from('project_members').select('projects(id,title,created_at)').eq('user_id',me)),
      q(sb.from('diagnosis_questions').select('text,options').order('position')),
      q(sb.from('reading_fields').select('name').order('position'))
    ]);
    const activities=acts.map(a=>{const c=contents.find(c=>c.activity===a.id);const o={id:a.id,title:a.title,icon:a.icon,guide:a.guide,example:a.example,fields:a.fields};return c?{...o,guide:c.guide,example:c.example,contentVersion:c.id}:o});
    const projects=[...own,...shared.map(s=>s.projects).filter(Boolean)].map(p=>({id:p.id,title:p.title,created:p.created_at}));
    return {user:{id:me,name:profile.name||profile.email,email:profile.email,role:profile.role,
      profile:{'Institución':profile.institution||'','Área de estudio':profile.area||'','Meta de investigación':profile.research_goal||'',reminders:profile.reminders},
      diagnosis:profile.diagnosis},projects,activities,questions,readingFields:rfields.map(r=>r.name)};
  }
  if(path==='profile'){
    await q(sb.from('profiles').update({institution:data['Institución']||null,area:data['Área de estudio']||null,research_goal:data['Meta de investigación']||null,reminders:!!data.reminders}).eq('id',me));
    return {ok:true};
  }
  if(path==='role')return rpc('admin_set_role',{p_email:data.email,p_role:data.role}).then(()=>({ok:true}));
  if(path==='diagnosis')return rpc('submit_diagnosis',{p_answers:data.answers});
  if(path==='contents'){await rpc('publish_content',{p_activity:data.activity,p_guide:data.guide,p_example:data.example});return {ok:true}}
  if(path==='projects'){
    const title=String(data.title??'').trim();if(!title||title.length>200)fail('El título debe tener entre 1 y 200 caracteres.');
    const r=await q(sb.from('projects').insert({title,owner_id:me}).select('id').single());return {id:r.id};
  }
  const parts=path.split('/');
  if(parts[0]!=='projects'||!parts[1])fail('Ruta desconocida');
  const pid=parts[1],action=parts[2]||'';
  if(!action&&!isPost)return loadProject(pid,me);
  switch(action){
    case 'evidence':return rpc('save_evidence',{p_project:pid,p_activity:data.activity,p_fields:data.fields,p_base:data.baseRevision??0,p_review:!!data.review});
    case 'complete':return rpc('complete_mission',{p_project:pid,p_activity:data.activity,p_reflection:data.reflection});
    case 'sources':return {id:await rpc('add_source',{p_project:pid,p_author:data.author,p_year:String(data.year||''),p_title:data.title,p_venue:data.venue,p_url:data.url||null})};
    case 'reading':await rpc('save_reading',{p_source:data.sourceId,p_fields:data.fields});return {ok:true};
    case 'mentor':return {answer:await rpc('ask_mentor',{p_project:pid,p_question:data.question})};
    case 'members':await rpc('set_member',{p_project:pid,p_email:data.email,p_revoke:!!data.revoke});return {ok:true};
    case 'comments':await rpc('add_comment',{p_project:pid,p_activity:data.activity,p_revision:data.revision,p_text:data.text});return {ok:true};
    case 'export':{
      const P=await loadProject(pid,me);if(!P.owner)fail('El docente puede comentar; solo el propietario edita y exporta.');
      const fmt=data.format||'md',style=data.style||'APA';
      const versions=[...P.versions].sort((a,b)=>a.activity.localeCompare(b.activity)||b.revision-a.revision);
      if(!versions.length)fail('Guarda al menos una evidencia antes de exportar.');
      const prof=await q(sb.from('profiles').select('name').eq('id',me).single());
      let text=`# ${P.project.title}\nInvestigaApp · ${prof.name}\nExportado: ${new Date().toISOString()}\nEstilo: ${style} (formato básico para artículos; verificar manualmente)\n`;
      const seen=new Set();
      for(const v of versions){if(seen.has(v.activity))continue;seen.add(v.activity);text+=`\n## ${v.activity} · v${v.revision} · ${v.status}\n`;for(const [k,val] of Object.entries(v.data))text+=`\n### ${k}\n${val}\n`;text+='\nRevisión: '+v.reflection+'\n'}
      text+='\n## Referencias\n';for(const s of P.sources)text+=citation(s,style)+'\n\n';
      text+='\n## Historial y retroalimentaciones\n';for(const v of versions)text+=`\n${v.activity} v${v.revision} · ${v.created} · ${v.status}\n`+JSON.stringify(v.feedback)+'\n';
      text+='\n## Fichas críticas\n';for(const s of P.sources)if(P.readings[s.id])text+=s.title+'\n'+JSON.stringify(P.readings[s.id])+'\n';
      rpc('log_event',{p_action:'exportacion',p_project:pid,p_detail:{format:fmt,style}}).catch(()=>{});
      if(fmt==='docx')return file(wordDocument(text),'portafolio.docx');
      if(fmt==='md')return file(new Blob([text],{type:'text/markdown;charset=utf-8'}),'portafolio.md');
      if(fmt==='json')return file(new Blob([JSON.stringify({project:P.project,versions,exported:new Date().toISOString()},null,2)],{type:'application/json'}),'historial.json');
      fail('Formato no disponible.');
    }
  }
  fail('Operación desconocida');
}

/* Descarga de todos mis datos (proyectos propios) */
async function backup(){
  const me=await uid();
  const profile=await q(sb.from('profiles').select('email,name,role,institution,area,research_goal,diagnosis,created_at').eq('id',me).single());
  const own=await q(sb.from('projects').select('id').eq('owner_id',me));
  const projects=[];for(const p of own)projects.push(await loadProject(p.id,me));
  const attempts=await q(sb.from('diagnosis_attempts').select('score,total,route,created_at').eq('user_id',me));
  rpc('log_event',{p_action:'respaldo'}).catch(()=>{});
  return new Blob([JSON.stringify({app:'InvestigaApp',kind:'mis-datos',exported:new Date().toISOString(),profile,diagnosisAttempts:attempts,projects},null,2)],{type:'application/json'});
}
window.InvestigaAPI={request:(path,data)=>handle(path,data===undefined?undefined:JSON.parse(JSON.stringify(data))).catch(e=>{throw new Error(clean(e.message))}),backup,client:sb,mode:'nube'};
})();
