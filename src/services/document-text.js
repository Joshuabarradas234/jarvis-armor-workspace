import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {parentPort, workerData} from 'node:worker_threads';

const MAX = 4 * 1024 * 1024;
const entities = s => s.replace(/&#(x[\da-f]+|\d+);/gi, (_, n) => {const v=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return v>0&&v<=0x10ffff?String.fromCodePoint(v):'';}).replace(/&(lt|gt|amp|quot|apos);/g,(_,n)=>({lt:'<',gt:'>',amp:'&',quot:'"',apos:"'"}[n]));
export function docxParagraphs(bytes) {
  let end=-1;for(let p=bytes.length-22;p>=Math.max(0,bytes.length-65557);p--)if(bytes.readUInt32LE(p)===0x06054b50){end=p;break;}
  if(end<0)throw Error('Unreadable Word document.');let p=bytes.readUInt32LE(end+16);const count=bytes.readUInt16LE(end+10);if(count>10000)throw Error('Word document is too complex.');
  for(let i=0;i<count;i++){
    if(p+46>bytes.length||bytes.readUInt32LE(p)!==0x02014b50)throw Error('Invalid Word archive.');
    const n=bytes.readUInt16LE(p+28),extra=bytes.readUInt16LE(p+30),comment=bytes.readUInt16LE(p+32),name=bytes.toString('utf8',p+46,p+46+n),size=bytes.readUInt32LE(p+20),unpacked=bytes.readUInt32LE(p+24),local=bytes.readUInt32LE(p+42),method=bytes.readUInt16LE(p+10),flags=bytes.readUInt16LE(p+8);p+=46+n+extra+comment;
    if(name!=='word/document.xml')continue;
    if(flags&1||unpacked>MAX||size>MAX||local+30>bytes.length)throw Error('Word document is encrypted or too large.');
    if(bytes.readUInt32LE(local)!==0x04034b50)throw Error('Invalid Word content.');const start=local+30+bytes.readUInt16LE(local+26)+bytes.readUInt16LE(local+28);if(start+size>bytes.length)throw Error('Incomplete Word document.');
    const raw=bytes.subarray(start,start+size),xml=(method===0?raw:method===8?zlib.inflateRawSync(raw,{maxOutputLength:MAX}):null)?.toString('utf8');if(!xml)throw Error('Unsupported Word compression.');
    return [...xml.matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)].map((m,i)=>({location:`paragraph ${i+1}`,text:entities(m[0].replace(/<w:(?:tab|br)\b[^>]*\/?\s*>/g,' ').replace(/<[^>]*>/g,''))})).filter(p=>p.text.trim());
  }throw Error('No readable text in this Word document.');
}
export async function extractDocument(file, assets) {
  const stat=fs.statSync(file);if(stat.size>16*1024*1024)throw Error('File exceeds the 16 MB reading limit.');const b=fs.readFileSync(file),ext=path.extname(file).toLowerCase();
  if(ext==='.pdf'){
    const pdf=await import(pathToFileURL(path.join(assets,'libraries/pdfjs/pdf.min.mjs')).href);pdf.GlobalWorkerOptions.workerSrc=pathToFileURL(path.join(assets,'libraries/pdfjs/pdf.worker.min.mjs')).href;
    const task=pdf.getDocument({data:new Uint8Array(b),isEvalSupported:false,disableFontFace:true,useSystemFonts:false,useWorkerFetch:false,verbosity:0});let doc;
    try{doc=await task.promise;if(doc.numPages>150)throw Error('PDF exceeds 150 pages; split it into sections.');const pages=[];let size=0;for(let n=1;n<=doc.numPages;n++){const page=await doc.getPage(n),items=(await page.getTextContent()).items,text=items.map(i=>i.str+(i.hasEOL?'\n':' ')).join('');size+=text.length;if(size>MAX)throw Error('Extracted document text is too large.');pages.push({location:`page ${n}`,text});}if(!pages.some(p=>p.text.trim()))throw Error('This PDF is scanned or has no readable text. Export an OCR text copy first.');return pages;}finally{await task.destroy();}
  }
  if(ext==='.docx')return docxParagraphs(b);
  if(!['.txt','.md','.csv'].includes(ext))throw Error('Use PDF, DOCX, TXT, Markdown or CSV.');
  if(b.includes(0))throw Error('This text file uses an unsupported encoding. Save it as UTF-8.');
  return b.toString('utf8').split(/\r?\n/).map((text,i)=>({location:`line ${i+1}`,text}));
}
if(parentPort&&workerData?.kind==='document-text')extractDocument(workerData.file,workerData.assets).then(p=>parentPort.postMessage({pages:p}),e=>parentPort.postMessage({error:e.message}));
