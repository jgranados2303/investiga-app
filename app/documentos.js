'use strict';
/* InvestigaApp · Documentos exportables (Markdown y Word) en el navegador.
   Compartido por la edición web (localapi.js) y la edición en la nube (supabaseapi.js).
   Equivale a export_markdown y word_document de backend/server.py. */
(function(){
const bad=m=>{throw new Error(m)};
const now=()=>new Date().toISOString();
function citation(s,style){
  if(!['author','year','title','venue'].every(k=>String(s[k]??'').trim()))bad('Completa autor, año, título y revista o editorial.');
  if(!['APA','IEEE','Vancouver'].includes(style))bad('Estilo desconocido.');
  const {author:a,year:y,title:t,venue:v}=s,l=s.url||'';
  if(style==='APA')return `${a} (${y}). ${t}. ${v}. ${l}`.trim();
  if(style==='IEEE')return `${a}, “${t},” ${v}, ${y}. ${l}`.trim();
  return `${a}. ${t}. ${v}. ${y}. ${l}`.trim();
}

/* ZIP mínimo (sin compresión) para generar .docx en el navegador */
const CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
function crc32(b){let c=0xFFFFFFFF;for(let i=0;i<b.length;i++)c=CRC[(c^b[i])&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0}
function zip(files){
  const enc=new TextEncoder(),parts=[],central=[];let offset=0;
  for(const [name,content] of files){
    const n=enc.encode(name),d=enc.encode(content),crc=crc32(d);
    const h=new DataView(new ArrayBuffer(30));h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x0800,true);h.setUint32(14,crc,true);h.setUint32(18,d.length,true);h.setUint32(22,d.length,true);h.setUint16(26,n.length,true);
    parts.push(new Uint8Array(h.buffer),n,d);
    const c=new DataView(new ArrayBuffer(46));c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x0800,true);c.setUint32(16,crc,true);c.setUint32(20,d.length,true);c.setUint32(24,d.length,true);c.setUint16(28,n.length,true);c.setUint32(42,offset,true);
    central.push(new Uint8Array(c.buffer),n);offset+=30+n.length+d.length;
  }
  const size=central.reduce((s,p)=>s+p.length,0),e=new DataView(new ArrayBuffer(22));
  e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,size,true);e.setUint32(16,offset,true);
  return new Blob([...parts,...central,new Uint8Array(e.buffer)]);
}
const xmlEsc=s=>s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'');
/* Equivale a export_markdown de server.py. versions: más recientes primero; sources: en orden de registro. */
function exportMarkdown(ACTIVITIES,title,author,style,versions,sources,readings){
  const out=[`# ${title}`,'',`**Autoría:** ${author}  `,`**Exportado:** ${now().slice(0,10)} desde InvestigaApp  `,`**Referencias:** ${style} (formato básico; verifícalas con el manual de estilo)`,''];
  const latest={};for(const v of versions)if(!(v.activity in latest))latest[v.activity]=v;
  ACTIVITIES.forEach((a,i)=>{const v=latest[a.id];if(!v)return;
    out.push(`## ${i+1}. ${a.title}`,'',`*Versión ${v.revision} · ${v.status} · ${v.created.slice(0,10)}*`,'');
    for(const [k,val] of Object.entries(v.data))if(String(val).trim())out.push(`### ${k}`,'',String(val).trim(),'');
    if(v.reflection)out.push(`**Mejora registrada:** ${v.reflection}`,'');});
  out.push('## Referencias','');
  if(!sources.length)out.push('Sin fuentes registradas.','');
  else if(style==='APA'){for(const s of [...sources].sort((x,y)=>x.author.toLowerCase()<y.author.toLowerCase()?-1:x.author.toLowerCase()>y.author.toLowerCase()?1:String(x.year)<String(y.year)?-1:String(x.year)>String(y.year)?1:0))out.push(citation(s,style),'')}
  else sources.forEach((s,n)=>out.push((style==='IEEE'?`[${n+1}] `:`${n+1}. `)+citation(s,style),''));
  const withReading=sources.filter(s=>Object.values(readings[s.id]||{}).some(x=>String(x).trim()));
  if(withReading.length){out.push('## Fichas de lectura crítica','');for(const s of withReading)out.push(`### ${s.title} (${s.year})`,'',...Object.entries(readings[s.id]).filter(([,v])=>String(v).trim()).map(([k,v])=>`- **${k}:** ${v}`),'')}
  out.push('## Historial de versiones y retroalimentación','');
  for(const a of ACTIVITIES)for(const v of versions.filter(v=>v.activity===a.id).sort((x,y)=>x.revision-y.revision)){const fb=v.feedback;
    out.push(`- **${a.title} · v${v.revision}** · ${v.created.slice(0,10)} · ${v.status}`+(fb?` · rúbrica ${fb.score}/100`:' · sin solicitud de feedback'));
    if(fb)out.push(...fb.suggestions.map(s=>`  - ${s}`));}
  return out.join('\n').trimEnd()+'\n';
}
/* Equivale a word_document de server.py: DOCX con estilos de título reales */
function wordDocument(markdown){
  const runs=t=>t.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map(p=>{const b=p.startsWith('**')&&p.endsWith('**')&&p.length>4;return '<w:r>'+(b?'<w:rPr><w:b/></w:rPr>':'')+'<w:t xml:space="preserve">'+xmlEsc(b?p.slice(2,-2):p)+'</w:t></w:r>'}).join('');
  const para=(t,style,italic,indent)=>{const ppr=(style?`<w:pStyle w:val="${style}"/>`:'')+(indent?`<w:ind w:left="${indent}"/>`:'');return '<w:p>'+(ppr?`<w:pPr>${ppr}</w:pPr>`:'')+(italic?'<w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">'+xmlEsc(t)+'</w:t></w:r>':runs(t))+'</w:p>'};
  let body='';
  for(let line of markdown.split(/\r?\n/)){line=line.trimEnd();if(!line)continue;
    if(line.startsWith('# '))body+=para(line.slice(2),'Title');
    else if(line.startsWith('## '))body+=para(line.slice(3),'Heading1');
    else if(line.startsWith('### '))body+=para(line.slice(4),'Heading2');
    else if(line.startsWith('  - '))body+=para('– '+line.slice(4),null,false,720);
    else if(line.startsWith('- '))body+=para('• '+line.slice(2),null,false,360);
    else if(line.startsWith('*')&&line.endsWith('*')&&!line.startsWith('**'))body+=para(line.slice(1,-1),null,true);
    else body+=para(line);}
  const ns='xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const style=(sid,name,size,color,outline,space=120)=>`<w:style w:type="paragraph" w:styleId="${sid}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="${space*2}" w:after="${space}"/>`+(outline!=null?`<w:outlineLvl w:val="${outline}"/>`:'')+`</w:pPr><w:rPr><w:b/><w:color w:val="${color}"/><w:sz w:val="${size}"/></w:rPr></w:style>`;
  const styles=`<?xml version="1.0" encoding="UTF-8"?><w:styles ${ns}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:lang w:val="es-EC"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>`+style('Title','Title',40,'0B3C5D',null,0)+style('Heading1','heading 1',30,'0B3C5D',0,160)+style('Heading2','heading 2',24,'182E42',1,100)+'</w:styles>';
  return zip([
    ['[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>'],
    ['_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
    ['word/_rels/document.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
    ['word/styles.xml',styles],
    ['word/document.xml',`<?xml version="1.0" encoding="UTF-8"?><w:document ${ns}><w:body>`+body+'<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>']
  ]);
}
const file=(blob,name)=>new Response(blob,{headers:{'Content-Disposition':`attachment; filename="${name}"`}});

window.InvestigaDocs={citation,exportMarkdown,wordDocument,file};
})();
