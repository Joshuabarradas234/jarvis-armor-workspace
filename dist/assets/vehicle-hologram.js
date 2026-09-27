import {renderBudget,concealedHall} from './render-budget.js';
import {disposeObject,reducedMotion} from './scene-quality.js';

// Fixed fit for the complete rotation: never resize the vehicle as it turns.
export function vehicleFraming(size,aspect,elevation=.40){
  const radius=Math.hypot(size.x,size.z)/2;
  const height=(size.y*Math.cos(elevation)+radius*2*Math.sin(elevation))/ .88;
  return {span:Math.max(height,radius*2/Math.max(.25,aspect)/.88),targetY:size.y*.5};
}
export function vehicleActive({theme,state,hidden,covered}){return theme==='batcave'&&!hidden&&!covered&&['ARMOR_HALL','SUIT_HOVER'].includes(state);}

if(typeof window!=='undefined'&&window.jarvis&&(new URLSearchParams(location.search).get('view')||'main')==='main'){
  const J=window.jarvis,S={generation:0,theme:null,ready:false,settings:{},status:{},angle:-.65,frames:0};window.__jarvisVehicle=S;
  let libs=null,interval=0,raf=0,last=0,dirty=true,disposed=false,failed=false;
  const loadLibraries=()=>libs||(libs=Promise.all([import('../vendor/three/three.module.min.js'),import('../vendor/three/GLTFLoader.js'),import('../vendor/three/meshopt_decoder.module.js')]));
  function release(){S.generation++;S.ready=false;S.host?.classList.remove('has-vehicle-hologram');if(S.scene)disposeObject(S.scene);S.renderer?.dispose();S.renderer?.forceContextLoss();S.canvas?.remove();Object.assign(S,{scene:null,renderer:null,canvas:null,host:null,model:null,pivot:null,camera:null,dimensions:null});}
  function surface(T,map){
    const mat=new T.ShaderMaterial({transparent:true,depthWrite:true,side:T.FrontSide,uniforms:{map:{value:map||null},hasMap:{value:!!map},time:{value:0}},
      vertexShader:'varying vec2 vUv;varying vec3 vN;varying vec3 vV;varying vec3 vWorld;void main(){vUv=uv;vec4 p=modelViewMatrix*vec4(position,1.);vN=normalize(normalMatrix*normal);vV=normalize(-p.xyz);vWorld=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*p;}',
      fragmentShader:'uniform sampler2D map;uniform bool hasMap;uniform float time;varying vec2 vUv;varying vec3 vN;varying vec3 vV;varying vec3 vWorld;void main(){float detail=hasMap?dot(texture2D(map,vUv).rgb,vec3(.2126,.7152,.0722)):.5;float rim=pow(1.-abs(dot(normalize(vN),normalize(vV))),2.);float stripe=.5+.5*sin(vWorld.y*360.-time*2.);float scan=pow(.5+.5*sin(vWorld.y*9.-time*.8),28.);vec3 colour=vec3(.055,.57,.86)*(.65+detail*.7)+vec3(.42,.8,1.)*(rim*.75+scan*.35);gl_FragColor=vec4(colour,clamp(.36+rim*.42+stripe*.08,.0,.88));}',toneMapped:false});
    mat.map=map;return mat;
  }
  async function start(host){
    const ticket=S.generation;S.host=host;failed=false;
    try{
      const [T,{GLTFLoader},{MeshoptDecoder}]=await loadLibraries();if(disposed||ticket!==S.generation)return;
      const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync('jarvis://asset/vehicles/batmobile.glb');
      if(disposed||ticket!==S.generation){disposeObject(gltf.scene);return;}
      const model=gltf.scene,bounds=new T.Box3().setFromObject(model,true),size=bounds.getSize(new T.Vector3()),centre=bounds.getCenter(new T.Vector3()),scale=1/Math.max(size.x,size.z,.001);
      model.scale.setScalar(scale);model.position.set(-centre.x*scale,-bounds.min.y*scale,-centre.z*scale);S.size=size.multiplyScalar(scale);S.model=model;
      const old=new Set(),retained=new Set();model.traverse(m=>{if(!m.isMesh)return;const mats=[].concat(m.material);const converted=mats.map(mat=>{old.add(mat);if(mat.map)retained.add(mat.map);return surface(T,mat.map);});m.material=Array.isArray(m.material)?converted:converted[0];});
      const released=new Set();for(const mat of old){for(const v of Object.values(mat))if(v?.isTexture&&!retained.has(v)&&!released.has(v)){v.dispose();released.add(v);}mat.dispose();}
      S.scene=new T.Scene();S.pivot=new T.Group();S.pivot.add(model);S.scene.add(S.pivot);S.camera=new T.OrthographicCamera(-1,1,1,-1,.01,20);
      S.renderer=new T.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});S.renderer.outputColorSpace=T.SRGBColorSpace;S.renderer.setClearColor(0,0);S.canvas=S.renderer.domElement;S.canvas.className='vehicle-hologram';S.canvas.setAttribute('aria-label','Rotating Batmobile hologram');S.canvas.setAttribute('role','img');host.append(S.canvas);host.classList.add('has-vehicle-hologram');host.querySelector('video')?.pause();S.ready=true;dirty=true;
    }catch(error){if(ticket===S.generation){release();failed=true;console.warn('[vehicle hologram]',error.message);}}
  }
  function sync(){
    if(disposed)return;const theme=document.body.dataset.theme,host=theme==='batcave'?document.querySelector('.hall-overlay'):null;
    if(theme!==S.theme||S.host&&!S.host.isConnected){release();S.theme=theme;failed=false;}
    if(host&&!S.host&&!failed)start(host);
    const progressPaused=renderBudget(S.settings,S.status,{reduced:reducedMotion()}).quiet||document.hidden||concealedHall(document);
    document.body.classList.toggle('mission-motion-off',progressPaused);
  }
  function frame(now){
    raf=requestAnimationFrame(frame);if(!S.ready)return;const budget=renderBudget(S.settings,S.status,{reduced:reducedMotion(),dpr:devicePixelRatio||1});S.budget=budget;
    if(now-last<1000/budget.fps)return;const dt=Math.min(.12,(now-last)/1000);last=now;
    const root=S.host.closest('.image-hall'),active=vehicleActive({theme:S.theme,state:root?.dataset.state,hidden:document.hidden,covered:concealedHall(document)});S.active=active;if(!active)return;
    const w=S.host.clientWidth,h=S.host.clientHeight;if(!w||!h)return;const key=[w,h,budget.dpr,budget.quality,budget.quiet].join(':');
    if(key!==S.dimensions){S.dimensions=key;const dpr=Math.min(budget.dpr,Math.sqrt(2200000/(w*h)));S.renderer.setPixelRatio(dpr);S.renderer.setSize(w,h,false);const {span,targetY}=vehicleFraming(S.size,w/h),camera=S.camera;camera.left=-span*w/h/2;camera.right=span*w/h/2;camera.top=span/2;camera.bottom=-span/2;camera.position.set(0,targetY+Math.sin(.40)*3,Math.cos(.40)*3);camera.lookAt(0,targetY,0);camera.updateProjectionMatrix();dirty=true;}
    if(!budget.quiet){S.angle+=dt*Math.PI*2/20;dirty=true;}
    if(!dirty)return;S.pivot.rotation.y=S.angle;S.model.traverse(m=>{for(const mat of [].concat(m.material||[])){if(mat.uniforms)mat.uniforms.time.value=budget.quiet?0:now/1000;if(mat.map)mat.map.anisotropy=Math.min(budget.anisotropy,S.renderer.capabilities.getMaxAnisotropy());}});S.renderer.render(S.scene,S.camera);S.frames++;dirty=false;
  }
  const off=[J.on('settings',v=>{S.settings=v;dirty=true;sync();}),J.on('status',v=>{S.status=v;}),J.on('theme',()=>setTimeout(sync,0))];
  J.call('bootstrap').then(b=>{S.settings=b.settings||{};S.status=b.status||{};sync();}).catch(()=>{});
  interval=setInterval(sync,350);raf=requestAnimationFrame(frame);
  const visible=()=>{dirty=true;sync();};document.addEventListener('visibilitychange',visible);
  addEventListener('pagehide',()=>{disposed=true;clearInterval(interval);cancelAnimationFrame(raf);off.forEach(f=>f?.());document.removeEventListener('visibilitychange',visible);release();});
}
