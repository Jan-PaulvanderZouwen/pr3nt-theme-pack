import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '..');
const dataDir = path.resolve(appRoot, process.env.DATA_DIR || 'data');
const quotesFilePath = path.join(dataDir, 'quotes.json');

function e(value = '') {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

async function readQuotes() {
  try {
    const quotes = JSON.parse(await readFile(quotesFilePath, 'utf8'));
    return Array.isArray(quotes) ? quotes : [];
  } catch {
    return [];
  }
}

function findQuote(quotes, token) {
  return quotes.find((quote) => !quote.archivedAt && (quote.portalToken === token || quote.id === token));
}

function quoteFiles(quote) {
  if (Array.isArray(quote.files) && quote.files.length) return quote.files;
  if (quote.fileUrl) return [{ url: quote.fileUrl, originalName: quote.fileOriginalName || 'model.stl' }];
  return [];
}

function fileName(file) {
  return String(file.originalName || file.safeOriginalName || file.storedName || 'Bestand');
}

function fileExt(file) {
  const match = fileName(file).match(/\.([a-z0-9]+)$/i);
  return match ? match[1].toUpperCase() : 'FILE';
}

function isPreviewable(file) {
  return /\.(stl|obj)$/i.test(fileName(file));
}

function css() {
  return `<style id="pr3nt-file-carousel-css">
    .pr3nt-file-carousel{margin-top:14px;display:flex;gap:10px;overflow-x:auto;padding:4px 2px 8px;scroll-snap-type:x proximity}
    .pr3nt-file-tile{flex:0 0 112px;scroll-snap-align:start;border:1px solid #e5e7eb;background:#fff;border-radius:18px;padding:10px;color:#101820;text-decoration:none;display:grid;gap:8px;cursor:pointer;box-shadow:0 10px 28px rgba(16,24,32,.05);transition:transform .15s ease,border-color .15s ease,background .15s ease}
    .pr3nt-file-tile:hover{transform:translateY(-1px);border-color:rgba(0,208,132,.65)}
    .pr3nt-file-tile.is-active{border-color:#00d084;background:#effdf6;outline:2px solid rgba(0,208,132,.18)}
    .pr3nt-file-thumb{height:74px;border-radius:14px;background:linear-gradient(145deg,#101820,#243442);display:grid;place-items:center;position:relative;overflow:hidden;color:#00d084;font-weight:950;font-size:13px;letter-spacing:.08em}
    .pr3nt-file-thumb:before{content:'';position:absolute;inset:auto 16px 18px;height:8px;border-radius:999px;background:rgba(255,255,255,.22)}
    .pr3nt-file-thumb:after{content:'';position:absolute;width:36px;height:24px;left:38px;bottom:26px;border-radius:10px 10px 4px 4px;background:rgba(0,208,132,.9)}
    .pr3nt-file-thumb span{position:relative;z-index:1;background:rgba(16,24,32,.78);border:1px solid rgba(255,255,255,.14);border-radius:999px;padding:4px 7px}
    .pr3nt-file-title{font-size:12px;line-height:1.25;font-weight:850;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .pr3nt-file-meta{font-size:11px;line-height:1.2;color:#667085;font-weight:800}
    .pr3nt-viewer-placeholder{display:grid;place-items:center;text-align:center;gap:8px;padding:24px;color:#667085}
    .pr3nt-viewer-placeholder strong{display:block;color:#101820;font-size:18px;line-height:1.2}
    @media(max-width:640px){.pr3nt-file-tile{flex-basis:98px}.pr3nt-file-thumb{height:64px}.pr3nt-file-title{font-size:11.5px}}
  </style>`;
}

function script(files) {
  const safeFiles = files.map((file, index) => ({
    index,
    name: fileName(file),
    url: file.url || '',
    ext: fileExt(file),
    previewable: isPreviewable(file),
  })).filter((file) => file.url);
  if (!safeFiles.length) return '';

  return `<script id="pr3nt-file-carousel-js" type="module">
    import * as THREE from 'three';
    import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
    const files=${JSON.stringify(safeFiles)};
    let activeRenderer=null;
    let activeAnimation=null;
    function esc(value){return String(value||'').replace(/[&<>\"]/g,function(match){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[match];});}
    function findPreviewCard(){return Array.from(document.querySelectorAll('.card')).find(function(card){return /3D model preview|3d model preview|model preview/i.test(card.textContent||'');});}
    function clearViewer(mount){if(activeAnimation)cancelAnimationFrame(activeAnimation);activeAnimation=null;if(activeRenderer){try{activeRenderer.dispose();}catch(error){}activeRenderer=null;}mount.innerHTML='';}
    async function loadModel(file){
      const mount=document.getElementById('viewer');
      if(!mount)return;
      document.querySelectorAll('.pr3nt-file-tile').forEach(function(tile){tile.classList.toggle('is-active',Number(tile.dataset.index)===file.index);});
      if(!file.previewable){clearViewer(mount);mount.innerHTML='<div class="pr3nt-viewer-placeholder"><strong>Preview niet beschikbaar</strong><span>Dit bestandstype kun je downloaden, maar nog niet in 3D bekijken.</span><a class="btn btn-light" href="'+esc(file.url)+'">Bestand downloaden</a></div>';return;}
      clearViewer(mount);
      mount.innerHTML='<div class="pr3nt-viewer-placeholder"><strong>Model wordt geladen...</strong><span>'+esc(file.name)+'</span></div>';
      try{
        const isObj=/\.obj$/i.test(file.name);
        const loaderMod=await import(isObj?'three/addons/loaders/OBJLoader.js':'three/addons/loaders/STLLoader.js');
        const scene=new THREE.Scene();scene.background=new THREE.Color(0xf6f6f5);
        const width=Math.max(mount.clientWidth,320),height=Math.max(mount.clientHeight,320);
        const camera=new THREE.PerspectiveCamera(45,width/height,0.1,5000);camera.position.set(140,120,170);
        const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(width,height);clearViewer(mount);mount.appendChild(renderer.domElement);activeRenderer=renderer;
        scene.add(new THREE.HemisphereLight(0xffffff,0x888888,2));const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(120,200,120);scene.add(light);
        const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;
        const loader=isObj?new loaderMod.OBJLoader():new loaderMod.STLLoader();
        loader.load(file.url,function(loaded){
          let object;if(isObj){object=loaded}else{object=new THREE.Mesh(loaded,new THREE.MeshStandardMaterial({color:0xd8d8d8,roughness:.55}))}
          const box=new THREE.Box3().setFromObject(object);const center=box.getCenter(new THREE.Vector3());object.position.sub(center);const size=Math.max(box.getSize(new THREE.Vector3()).length(),1);object.scale.multiplyScalar(135/size);scene.add(object);
          function animate(){activeAnimation=requestAnimationFrame(animate);controls.update();renderer.render(scene,camera)}animate();
        },undefined,function(){mount.innerHTML='<div class="pr3nt-viewer-placeholder"><strong>Preview kon niet worden geladen</strong><a class="btn btn-light" href="'+esc(file.url)+'">Bestand downloaden</a></div>';});
      }catch(error){mount.innerHTML='<div class="pr3nt-viewer-placeholder"><strong>3D preview is tijdelijk niet beschikbaar</strong><a class="btn btn-light" href="'+esc(file.url)+'">Bestand downloaden</a></div>';console.error(error);}
    }
    function addCarousel(){
      const card=findPreviewCard();const viewer=document.getElementById('viewer');
      if(!card||!viewer||card.querySelector('.pr3nt-file-carousel'))return;
      const carousel=document.createElement('div');carousel.className='pr3nt-file-carousel';
      carousel.innerHTML=files.map(function(file){const label=file.previewable?'Klik voor preview':'Downloadbaar';return '<button type="button" class="pr3nt-file-tile '+(file.index===0?'is-active':'')+'" data-index="'+file.index+'" title="'+esc(file.name)+'"><span class="pr3nt-file-thumb"><span>'+esc(file.ext)+'</span></span><span class="pr3nt-file-title">'+esc(file.name)+'</span><span class="pr3nt-file-meta">'+label+'</span></button>';}).join('');
      viewer.insertAdjacentElement('afterend',carousel);
      carousel.addEventListener('click',function(event){const tile=event.target.closest('.pr3nt-file-tile');if(!tile)return;const file=files.find(function(item){return item.index===Number(tile.dataset.index);});if(file)loadModel(file);});
    }
    addCarousel();
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',addCarousel);
    setTimeout(addCarousel,250);
    setTimeout(addCarousel,750);
  </script>`;
}

export function registerPortalFileCarouselRoutes(app) {
  app.use('/portal/:token', async (req, res, next) => {
    if (req.method !== 'GET') return next();
    const originalSend = res.send.bind(res);
    res.send = (body) => {
      Promise.resolve().then(async () => {
        const quote = findQuote(await readQuotes(), req.params.token);
        const files = quote ? quoteFiles(quote) : [];
        if (!quote || !files.length || typeof body !== 'string') return originalSend(body);
        let html = body;
        html = html.replace(/<style id="pr3nt-file-carousel-css">[\s\S]*?<\/style>/g, '');
        html = html.replace(/<script id="pr3nt-file-carousel-js"[\s\S]*?<\/script>/g, '');
        html = html.replace('</head>', `${css()}</head>`);
        html = html.replace('</body>', `${script(files)}</body>`);
        return originalSend(html);
      }).catch(() => originalSend(body));
      return res;
    };
    next();
  });
}
