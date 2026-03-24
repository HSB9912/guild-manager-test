/** Lazy-load OCR worker that uses OpenCV.js WASM from /public/ocr/ */

let worker: Worker | null = null

export interface OcrRecord {
  name: string
  culv: number
  week?: number
  flag?: number
}

export async function initOcr(): Promise<void> {
  if (worker) return

  return new Promise((resolve, reject) => {
    // BASE_URL is /guild-manager/ on GitHub Pages, / on localhost
    const base = import.meta.env.BASE_URL || '/'
    const BASE = window.location.origin + base + 'ocr/'
    const workerCode = buildWorkerCode(BASE)
    const blob = new Blob([workerCode], { type: 'application/javascript' })
    worker = new Worker(URL.createObjectURL(blob))

    const timeout = setTimeout(() => {
      reject(new Error('OCR worker initialization timed out'))
    }, 30000)

    worker.onmessage = (e) => {
      if (e.data.type === 'READY') {
        clearTimeout(timeout)
        resolve()
      }
    }
    worker.onerror = (err) => {
      clearTimeout(timeout)
      console.error('[OCR] Worker error:', err)
      console.error('[OCR] BASE URL was:', BASE)
      reject(err)
    }
  })
}

export function processImage(bitmap: ImageBitmap): Promise<OcrRecord[]> {
  return new Promise((resolve) => {
    if (!worker) { resolve([]); return }
    const handler = (e: MessageEvent) => {
      if (e.data.type === 'RESULT') {
        worker!.removeEventListener('message', handler)
        resolve(e.data.payload || [])
      }
    }
    worker.addEventListener('message', handler)
    worker.postMessage({ type: 'PROCESS_IMAGE', payload: bitmap, source: 'UPLOAD' }, [bitmap])
  })
}

export function terminateOcr() {
  if (worker) { worker.terminate(); worker = null }
}

/**
 * Build the inline worker source code with the given base URL for assets.
 * This is the EXACT OCR logic from the original index.html, ported verbatim.
 */
function buildWorkerCode(base: string): string {
  return `(function(){"use strict";
const BASE = ${JSON.stringify(base)};
try{self.importScripts(BASE + "opencv.js")}catch(err){console.error("[OCR Worker] Failed to load opencv.js from:",BASE+"opencv.js",err);return;}
let I=!1,g={},p=null,y=null,x=null,s=null,h=null,v=null,O=null,b=null;
const N=180;let R=null;
cv.onRuntimeInitialized=async()=>{
s=new cv.Mat;h=new cv.Mat;x=new cv.Mat;v=new cv.Mat;
O=cv.matFromArray(3,3,cv.CV_32FC1,[-.25,-1,-.25,-1,6,-1,-.25,-1,-.25]);
const c=1.5;b=new cv.Mat(1,256,cv.CV_8UC1);
const e=new Uint8Array(256);
for(let t=0;t<256;t++)e[t]=Math.round(Math.min(255,Math.pow(t/255,c)*255));
b.data.set(e);
const u=await(await fetch(BASE+"ocr.json")).text();
R=JSON.parse(u,(t,o)=>{if(t==="next"){const n=new Map;for(const r in o)n.set(parseInt(r),o[r]);return n}return o});
try{const o=await(await fetch(BASE+"anchor.png")).blob(),n=await createImageBitmap(o),a=new OffscreenCanvas(n.width,n.height).getContext("2d",{willReadFrequently:!0});a.drawImage(n,0,0);let f=cv.matFromImageData(a.getImageData(0,0,n.width,n.height));p=new cv.Mat;cv.cvtColor(f,p,cv.COLOR_RGBA2GRAY);f.delete();n.close()}catch(t){console.error("anchor load fail:",t)}
try{const o=await(await fetch(BASE+"except.png")).blob(),n=await createImageBitmap(o),a=new OffscreenCanvas(n.width,n.height).getContext("2d",{willReadFrequently:!0});a.drawImage(n,0,0);let f=cv.matFromImageData(a.getImageData(0,0,n.width,n.height));y=new cv.Mat;cv.cvtColor(f,y,cv.COLOR_RGBA2GRAY);f.delete();n.close()}catch(t){console.error("except load fail:",t)}
for(const t of["1366x768","1920x1080","1920x1200","2560x1440","2560x1600","2732x1536","3840x2160"])
try{const n=await(await fetch(BASE+t+".png")).blob(),r=await createImageBitmap(n),f=new OffscreenCanvas(r.width,r.height).getContext("2d",{willReadFrequently:!0});f.drawImage(r,0,0);let d=cv.matFromImageData(f.getImageData(0,0,r.width,r.height));g[t]=new cv.Mat;cv.cvtColor(d,g[t],cv.COLOR_RGBA2GRAY);d.delete();r.close()}catch(o){console.error("tmpl load fail:",o)}
I=!0;self.postMessage({type:"READY"})};
self.onmessage=function(c){const{type:e,payload:l,source:u}=c.data;if(!I){l&&typeof l.close=="function"&&l.close();return}if(e==="PROCESS_IMAGE"){const w=$(l);self.postMessage({type:"RESULT",payload:w,source:u})}};
function Y(c,e){const u=[{w:3840,h:2160},{w:2732,h:1536},{w:2560,h:1600},{w:2560,h:1440},{w:1920,h:1200},{w:1920,h:1080},{w:1366,h:768}].filter(w=>w.w<=c&&w.h<=e);return u.length===0?null:u[0]}
function i(c,e){if(!(e in g))return!1;let l=null;try{return l=new cv.Mat,cv.matchTemplate(c,g[e],l,cv.TM_CCOEFF_NORMED),cv.minMaxLoc(l).maxVal>.8}finally{l&&l.delete()}}
function $(c){const e=Y(c.width,c.height);if(!e)return[];const l=(c.width-e.w)/2,u=c.height-e.h-l,t=new OffscreenCanvas(e.w,e.h).getContext("2d",{willReadFrequently:!0});t.drawImage(c,l,u,e.w,e.h,0,0,e.w,e.h);const o=t.getImageData(0,0,e.w,e.h);let n=cv.matFromImageData(o),r=null;try{if(!p||p.empty())return[];cv.cvtColor(n,s,cv.COLOR_RGBA2GRAY);let a=null;if(e.h===768){if(i(s,"1366x768"))a=new cv.Size(1366,768);else return[]}else if(e.h===1080){if(i(s,"1920x1080"))a=new cv.Size(1366,768);else if(i(s,"1366x768"))a=new cv.Size(1920,1080);else return[]}else if(e.h===1200){if(i(s,"1920x1200"))a=new cv.Size(1230,768);else if(i(s,"1366x768"))a=new cv.Size(1920,1200);else return[]}else if(e.h===1440){if(i(s,"2560x1440"))a=new cv.Size(1366,768);else if(i(s,"2732x1536"))a=new cv.Size(1280,720);else return[]}else if(e.h===1536){if(i(s,"2732x1536"))a=new cv.Size(1366,768);else return[]}else if(e.h===1600){if(i(s,"2560x1600"))a=new cv.Size(1230,768);else if(i(s,"2732x1536"))a=new cv.Size(1280,800);else return[]}else if(e.h===2160){if(i(s,"3840x2160"))a=new cv.Size(1366,768);else if(i(s,"2732x1536"))a=new cv.Size(1920,1080);else return[]}else return[];if(!a)return[];cv.resize(s,h,a,0,0,cv.INTER_AREA);cv.matchTemplate(h,p,x,cv.TM_CCOEFF_NORMED);let f=cv.minMaxLoc(x),d=f.maxLoc;if(f.maxVal<.9)return[];let S={x:d.x,y:d.y},m=new cv.Rect(S.x,S.y,480,450);if(m.x+m.width>h.cols||m.y+m.height>h.rows)return[];if(r=h.roi(m),cv.matchTemplate(r,y,x,cv.TM_CCOEFF_NORMED),cv.minMaxLoc(x).maxVal>.9)return[];cv.filter2D(r,s,cv.CV_8U,O);cv.LUT(s,b,h);cv.threshold(h,v,N,255,cv.THRESH_BINARY);const A=[];for(let _=0;_<17;_++){const C=_*24+43;let z=v.roi(new cv.Rect(39,C,65,12)),F=M(z),D=v.roi(new cv.Rect(299,C,20,12)),E=M(D),T=v.roi(new cv.Rect(340,C,70,12)),V=M(T),L=v.roi(new cv.Rect(434,C,35,12)),G=M(L);z.delete();D.delete();T.delete();L.delete();F&&E&&V&&G&&A.push({name:F,week:parseInt(E.replaceAll(",","")),culv:parseInt(V.replaceAll(",","")),flag:parseInt(G.replaceAll(",",""))})}return A}finally{n!==null&&n.delete();r!==null&&r.delete();c&&typeof c.close=="function"&&c.close()}}
function M(c){const e=c.channels();let l=R,u="",w=[];for(let t=0;t<12;t++)w.push(c.ptr(t));for(let t=0;t<c.cols*e;t+=e){let o=0;for(let n=0;n<12;n++){const r=w[n][t]===255?1:0;o|=r<<n}if(l.next.has(o))l=l.next.get(o);else if(o===0){if(l.output)u+=l.output;else if(l!==R)return null;l=R}else return null}return u}
})();`
}
