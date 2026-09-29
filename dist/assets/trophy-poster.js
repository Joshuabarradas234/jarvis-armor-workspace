import {disposeObject} from './scene-quality.js';
import {renderBudget} from './render-budget.js';
/** Still portraits share one temporary GPU context and are disposed before the next suit. */
export async function trophyPoster(bridge,trophy,img){
  const urls=await bridge.call('suit-models',{theme:trophy.theme}),url=urls?.[trophy.suitId];if(!url||!img.isConnected)return;
  const [T,{GLTFLoader},{MeshoptDecoder},{RoomEnvironment},boot]=await Promise.all([import('../vendor/three/three.module.min.js'),import('../vendor/three/GLTFLoader.js'),import('../vendor/three/meshopt_decoder.module.js'),import('../vendor/three/RoomEnvironment.js'),bridge.call('bootstrap')]);if(!img.isConnected)return;
  const g=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url);if(!img.isConnected){disposeObject(g.scene);return;}let renderer,target;
  try{const b=renderBudget(boot.settings,boot.status,{dpr:1}),canvas=document.createElement('canvas');renderer=new T.WebGLRenderer({canvas,alpha:true,antialias:b.quality!=='low',preserveDrawingBuffer:true});renderer.setSize(b.quality==='low'?180:280,b.quality==='low'?250:390);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;
    const room=new RoomEnvironment(),pm=new T.PMREMGenerator(renderer);try{target=pm.fromScene(room,.04);}finally{room.dispose();pm.dispose();}
    const scene=new T.Scene();scene.environment=target.texture;scene.add(new T.HemisphereLight('#edf6ff','#152032',2));const light=new T.DirectionalLight('#fff4db',3);light.position.set(2,4,5);scene.add(light,g.scene);
    const box=new T.Box3().setFromObject(g.scene,true),size=box.getSize(new T.Vector3()),c=box.getCenter(new T.Vector3()),scale=1/Math.max(.01,size.y);g.scene.scale.setScalar(scale);g.scene.position.set(-c.x*scale,-box.min.y*scale,-c.z*scale);
    const half=Math.max(.40,size.x*scale/2*1.08),camera=new T.OrthographicCamera(-half,half,half*390/280,-half*390/280,.01,100);camera.position.set(0,.52,5);camera.lookAt(0,.52,0);renderer.render(scene,camera);if(img.isConnected){img.src=canvas.toDataURL('image/png');img.classList.add('ready');}
  }finally{disposeObject(g.scene);target?.dispose();renderer?.dispose();renderer?.forceContextLoss();}
}
