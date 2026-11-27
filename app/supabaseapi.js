'use strict';
/* InvestigaApp · Capa 2 en la nube (Supabase).
   Ofrece las mismas rutas que backend/server.py y web/localapi.js (register, login, state, projects/{id}/…)
   sobre Supabase. Las reglas (rúbrica v2, Mentor v2, permisos, panel docente) se aplican en el servidor,
   en funciones SQL con seguridad por fila: supabase/migrations/*_06_rubrica_mentor_v2_gestion.sql.
   Requiere, antes que este archivo: supabase.min.js, config.js y documentos.js. */
(function(){
const cfg=window.INVESTIGA_CONFIG;
/* El enlace de recuperación llega con #…type=recovery; se lee antes de que el cliente limpie la URL. */
const RECOVERY_LINK=/(^|[#&?])type=recovery(&|$)/.test(location.hash+'&'+location.search.slice(1));
const sb=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:'investigaapp-auth'}});
const api={recovery:RECOVERY_LINK};
sb.auth.onAuthStateChange(ev=>{if(ev==='PASSWORD_RECOVERY')api.recovery=true});
const STYLES=['APA','IEEE','Vancouver'];
const here=()=>location.origin+location.pathname;

function fail(m){throw new Error(m)}
function clean(msg){
  msg=String(msg||'No se pudo realizar la operación');
  if(/Invalid login credentials/i.test(msg))return 'Credenciales incorrectas.';
  if(/Email not confirmed/i.test(msg))return 'Tu correo aún no está confirmado. Abre el enlace que te enviamos (revisa también la carpeta de spam).';
  if(/User already registered/i.test(msg))return 'El correo ya está registrado. Ingresa con tu contraseña.';
  if(/should be different from the old password/i.test(msg))return 'La nueva contraseña debe ser distinta de la actual.';
  if(/Password should be at least/i.test(msg))return 'La contraseña debe tener al menos 10 caracteres.';
  if(/rate limit|too many requests|security purposes/i.test(msg))return 'Demasiados intentos seguidos. Espera unos minutos y vuelve a intentarlo.';
  if(/Error sending (confirmation|recovery) email/i.test(msg))return 'El servidor no pudo enviar el correo. Avisa a quien administra la plataforma.';
  if(/Failed to fetch|NetworkError|Load failed/i.test(msg))return 'No hay conexión con el servidor. Conserva tu borrador y vuelve a intentarlo.';
  if(/JWT expired|invalid JWT|Auth session missing/i.test(msg))return 'Inicia sesión para continuar.';
  if(/Could not find the function/i.test(msg))return 'La base de datos aún no tiene la versión 2 de InvestigaApp. Avisa a quien administra la plataforma.';
  return msg.replace(/^CONFLICTO:\s*/,'');
}
async function q(p){const {data,error}=await p;if(error)fail(clean(error.message));return data}
async function rpc(fn,args){return q(sb.rpc(fn,args))}
async function session(){const {data}=await sb.auth.getSession();const s=data.session;if(!s?.user)fail('Inicia sesión para continuar.');return s.user}
const email=v=>{const e=String(v??'').trim().toLowerCase();if(e.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))fail('Introduce un correo válido.');return e};
const newPassword=p=>{if(typeof p!=='string'||p.length<10)fail('La contraseña debe tener al menos 10 caracteres.');if(p.length>72)fail('La contraseña no puede superar 72 caracteres.');return p};
const docs=()=>window.InvestigaDocs||fail('Falta documentos.js en la página.');
let ACTIVITIES=null;
async function activities(){if(!ACTIVITIES)ACTIVITIES=await q(sb.from('activities').select('id,title,icon,guide,example,fields').order('position'));return ACTIVITIES}

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
    versions:versions.map(({created_at,...v})=>({...v,created:created_at})),
    sources:sources.map(s=>({...s,url:s.url||''})),
    readings:Object.fromEntries(readings.map(r=>[r.source_id,r.data])),
    rewards,messages:messages.map(({created_at,...m})=>({...m,created:created_at})),
    comments:comments.map(({created_at,profiles,...c})=>({...c,created:created_at,name:profiles?.name||'Docente'})),
    members:members.map(m=>({email:m.profiles?.email||'',name:m.profiles?.name||''}))};
}

async function handle(path,data){
  const isPost=data!==undefined;data=data||{};
  if(path==='register'){
    const e=email(data.email),password=newPassword(String(data.password??'')),name=String(data.name??'').trim();
    if(!name||name.length>120)fail('Escribe un nombre de hasta 120 caracteres.');
    const res=await q(sb.auth.signUp({email:e,password,options:{data:{name},emailRedirectTo:here()}}));
    if(res.user&&Array.isArray(res.user.identities)&&res.user.identities.length===0)fail('El correo ya está registrado. Ingresa con tu contraseña.');
    if(!res.session)return {ok:true,pendingConfirmation:true};
    rpc('log_event',{p_action:'inicio_sesion'}).catch(()=>{});
    return {ok:true};
  }
  if(path==='login'){
    await q(sb.auth.signInWithPassword({email:email(data.email),password:String(data.password??'')}));
    rpc('log_event',{p_action:'inicio_sesion'}).catch(()=>{});
    return {ok:true};
  }
  if(path==='reset'){
    /* No revela si la cuenta existe: Supabase responde igual en ambos casos. */
    await q(sb.auth.resetPasswordForEmail(email(data.email),{redirectTo:here()}));
    return {ok:true,emailSent:true};
  }
  const user=await session(),me=user.id;
  if(path==='reset-confirm'){
    await q(sb.auth.updateUser({password:newPassword(data.password)}));
    api.recovery=false;
    return {ok:true};
  }
  if(path==='password'){
    const current=String(data.current??''),pw=newPassword(data.password);
    if(pw===current)fail('La nueva contraseña debe ser distinta de la actual.');
    const check=await sb.auth.signInWithPassword({email:user.email,password:current});
    if(check.error)fail(/Invalid login credentials/i.test(check.error.message)?'La contraseña actual no es correcta.':clean(check.error.message));
    await q(sb.auth.updateUser({password:pw}));
    return {ok:true,closedSessions:0};
  }
  if(path==='recovery-code')fail('En la edición en la nube la contraseña se recupera por correo electrónico.');
  if(path==='logout'){await rpc('log_event',{p_action:'cierre_sesion'}).catch(()=>{});await sb.auth.signOut();return {ok:true}}
  if(path==='teacher')return rpc('teacher_overview');
  if(path==='state'){
    const [profile,acts,contents,own,shared,questions,rfields]=await Promise.all([
      q(sb.from('profiles').select('*').eq('id',me).single()),
      activities(),
      q(sb.from('contents').select('id,activity,guide,example').order('id',{ascending:false})),
      q(sb.from('projects').select('id,title,created_at').eq('owner_id',me).order('created_at')),
      q(sb.from('project_members').select('projects(id,title,created_at)').eq('user_id',me)),
      q(sb.from('diagnosis_questions').select('text,options').order('position')),
      q(sb.from('reading_fields').select('name').order('position'))
    ]);
    const list=acts.map(a=>{const c=contents.find(c=>c.activity===a.id);return c?{...a,guide:c.guide,example:c.example,contentVersion:c.id}:{...a}});
    const projects=[...own,...shared.map(s=>s.projects).filter(Boolean)].map(p=>({id:p.id,title:p.title,created:p.created_at}));
    return {user:{id:me,name:profile.name||profile.email,email:profile.email,role:profile.role,hasRecovery:true,
      profile:{'Institución':profile.institution||'','Área de estudio':profile.area||'','Meta de investigación':profile.research_goal||'',reminders:profile.reminders},
      diagnosis:profile.diagnosis},projects,activities:list,questions,readingFields:rfields.map(r=>r.name)};
  }
  if(path==='profile'){
    await q(sb.from('profiles').update({institution:data['Institución']||null,area:data['Área de estudio']||null,research_goal:data['Meta de investigación']||null,reminders:!!data.reminders}).eq('id',me));
    return {ok:true};
  }
  if(path==='role'){await rpc('admin_set_role',{p_email:String(data.email??''),p_role:String(data.role??'')});return {ok:true}}
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
  const src=()=>{if(!data.sourceId)fail('Selecciona una fuente del proyecto.');return data.sourceId};
  const sourceArgs=()=>({p_author:String(data.author??''),p_year:String(data.year??''),p_title:String(data.title??''),p_venue:String(data.venue??''),p_url:String(data.url??'')||null});
  switch(action){
    case 'evidence':return rpc('save_evidence',{p_project:pid,p_activity:data.activity,p_fields:data.fields,p_base:data.baseRevision??0,p_review:!!data.review});
    case 'complete':return rpc('complete_mission',{p_project:pid,p_activity:data.activity,p_reflection:data.reflection});
    case 'sources':return {id:await rpc('add_source',{p_project:pid,...sourceArgs()})};
    case 'source-update':await rpc('update_source',{p_source:src(),...sourceArgs()});return {ok:true};
    case 'source-delete':await rpc('delete_source',{p_source:src()});return {ok:true};
    case 'reading':await rpc('save_reading',{p_source:src(),p_fields:data.fields});return {ok:true};
    case 'reading-delete':await rpc('delete_reading',{p_source:src()});return {ok:true};
    case 'mentor':return rpc('mentor_ask',{p_project:pid,p_question:data.question,p_activity:data.activity||null});
    case 'members':await rpc('set_member',{p_project:pid,p_email:data.email,p_revoke:!!data.revoke});return {ok:true};
    case 'comments':await rpc('add_comment',{p_project:pid,p_activity:data.activity,p_revision:data.revision,p_text:data.text});return {ok:true};
    case 'rename':await rpc('rename_project',{p_project:pid,p_title:data.title});return {ok:true};
    case 'delete':await rpc('delete_project',{p_project:pid,p_confirm:data.confirm});return {ok:true};
    case 'export':{
      const P=await loadProject(pid,me);if(!P.owner)fail('El docente puede comentar; solo el propietario edita y exporta.');
      const fmt=data.format||'md',style=data.style||'APA';
      if(!STYLES.includes(style))fail('Estilo desconocido.');
      const versions=[...P.versions].sort((a,b)=>a.activity.localeCompare(b.activity)||b.revision-a.revision);
      if(!versions.length)fail('Guarda al menos una evidencia antes de exportar.');
      const prof=await q(sb.from('profiles').select('name,email').eq('id',me).single());
      const {exportMarkdown,wordDocument,file}=docs();
      const text=exportMarkdown(await activities(),P.project.title,prof.name||prof.email,style,versions,P.sources,P.readings);
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
  const me=(await session()).id;
  const profile=await q(sb.from('profiles').select('email,name,role,institution,area,research_goal,diagnosis,created_at').eq('id',me).single());
  const own=await q(sb.from('projects').select('id').eq('owner_id',me));
  const projects=[];for(const p of own)projects.push(await loadProject(p.id,me));
  const attempts=await q(sb.from('diagnosis_attempts').select('score,total,route,created_at').eq('user_id',me));
  rpc('log_event',{p_action:'respaldo'}).catch(()=>{});
  return new Blob([JSON.stringify({app:'InvestigaApp',kind:'mis-datos',exported:new Date().toISOString(),profile,diagnosisAttempts:attempts,projects},null,2)],{type:'application/json'});
}
api.request=(path,data)=>handle(path,data===undefined?undefined:JSON.parse(JSON.stringify(data))).catch(e=>{throw new Error(clean(e.message))});
api.backup=backup;
api.mode='nube';
window.InvestigaCloud=api;
})();
