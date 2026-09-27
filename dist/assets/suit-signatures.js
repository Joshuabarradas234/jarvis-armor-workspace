/* Family-specific light cues, independent of the static model's geometry. */
const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
export function signatureFrame(theme,seconds,quiet=false){
  const power=quiet?0:smooth((seconds-.65)/.75)*(.55+.45*(1-smooth((seconds-1.65)/.85)));
  const ringProgress=clamp((seconds-.92)/1.45),ring=quiet||ringProgress===0||ringProgress===1?0:Math.sin(ringProgress*Math.PI)**2;
  const reveal=quiet?0:smooth((seconds-.45)/.65)*(1-smooth((seconds-2)/.7));
  return {eye:theme==='ironman'?.9+.1*power:.92,halo:theme==='ironman'?.4+1.1*power:.4,reactor:theme==='ironman'?.45+1.05*power:0,ring:theme==='ironman'?ring:0,ringProgress,projection:theme==='batcave'?.5*reveal:theme==='spiderman'?.42*reveal:0,sweep:smooth((seconds-.45)/1.35)};
}
export function addEyeHalos(T,eye,theme){
  eye.userData.halos=[1.10,1.22].map((scale,i)=>{const halo=new T.Mesh(eye.geometry,new T.MeshBasicMaterial({color:'#89ddff',transparent:true,opacity:0,depthTest:true,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false,side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}));halo.scale.setScalar(scale);halo.renderOrder=4-i;eye.add(halo);return halo;});
  if(theme==='ironman'){
    const canvas=document.createElement('canvas');canvas.width=canvas.height=64;const c=canvas.getContext('2d'),g=c.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,'rgba(210,250,255,.9)');g.addColorStop(.3,'rgba(85,215,255,.5)');g.addColorStop(1,'rgba(45,185,255,0)');c.fillStyle=g;c.fillRect(0,0,64,64);
    const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;const flare=new T.Sprite(new T.SpriteMaterial({map,transparent:true,opacity:0,depthTest:true,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false}));
    const size=eye.geometry.boundingBox.getSize(new T.Vector3());flare.scale.set(size.x*2.2,Math.max(size.y*3.6,size.x*.8),1);flare.position.z=.007;flare.renderOrder=5;eye.add(flare);eye.userData.flare=flare;
  }
}
export function lightEyes(eye,on,frame,detail){
  eye.visible=on>.001;eye.material.opacity=on*frame.eye;
  if(eye.userData.flare)eye.userData.flare.material.opacity=on*frame.halo*.85;
  for(const [i,halo]of (eye.userData.halos||[]).entries()){halo.visible=i===0||detail;halo.material.opacity=on*frame.halo*(i===0?.22:.075);}
}
export function makeSignature(T,theme){
  if(!['batcave','spiderman'].includes(theme))return null;
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;const c=canvas.getContext('2d');
  c.strokeStyle=theme==='batcave'?'#f5d97c':'#bfeaff';c.fillStyle='#f5d97c';c.lineWidth=3;c.lineJoin='round';
  if(theme==='batcave'){
    c.beginPath();c.moveTo(256,310);c.bezierCurveTo(230,277,209,263,192,285);c.bezierCurveTo(169,240,134,246,117,266);c.bezierCurveTo(111,225,76,211,35,239);c.bezierCurveTo(75,188,90,142,101,113);c.bezierCurveTo(143,175,185,184,226,173);c.lineTo(239,139);c.lineTo(244,177);c.lineTo(268,177);c.lineTo(273,139);c.lineTo(286,173);c.bezierCurveTo(327,184,369,175,411,113);c.bezierCurveTo(422,142,437,188,477,239);c.bezierCurveTo(436,211,401,225,395,266);c.bezierCurveTo(378,246,343,240,320,285);c.bezierCurveTo(303,263,282,277,256,310);c.fill();
  }else{
    const spokes=12,point=(r,a)=>[256+Math.cos(a)*r,256+Math.sin(a)*r];
    for(let j=0;j<spokes;j++){const a=j/spokes*Math.PI*2;c.beginPath();c.moveTo(256,256);c.lineTo(...point(250,a));c.stroke();}
    for(const r of [38,76,118,164,212,250]){c.beginPath();c.moveTo(...point(r,0));for(let j=0;j<spokes;j++){const a=j/spokes*Math.PI*2,b=(j+1)/spokes*Math.PI*2;c.quadraticCurveTo(...point(r*.78,(a+b)/2),...point(r,b));}c.stroke();}
  }
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
  const material=new T.ShaderMaterial({transparent:true,depthTest:true,depthWrite:false,uniforms:{map:{value:texture},opacity:{value:0},sweep:{value:1}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'uniform sampler2D map;uniform float opacity;uniform float sweep;varying vec2 vUv;void main(){vec4 c=texture2D(map,vUv);float reveal=smoothstep(1.0-sweep-.08,1.0-sweep,vUv.y);gl_FragColor=vec4(c.rgb,c.a*opacity*reveal);}',toneMapped:false});
  // Expose the texture to the shared disposal walker as well as the shader uniform.
  material.map=texture;const mesh=new T.Mesh(new T.PlaneGeometry(1,1),material);mesh.visible=false;mesh.renderOrder=2;return mesh;
}

export function makeReactorRing(T){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const c=canvas.getContext('2d');c.strokeStyle='#b7f5ff';c.lineWidth=2;c.shadowColor='#28cbff';c.shadowBlur=7;c.beginPath();c.arc(64,64,45,0,Math.PI*2);c.stroke();c.lineWidth=1;c.beginPath();c.arc(64,64,50,0,Math.PI*2);c.stroke();
  const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;const ring=new T.Sprite(new T.SpriteMaterial({map,transparent:true,opacity:0,depthTest:true,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false}));ring.visible=false;ring.renderOrder=5;return ring;
}
