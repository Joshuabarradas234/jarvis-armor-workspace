/* A pressure burst fills the open case, then thins to reveal the suit before entry finishes. */
const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
export function mistFrame(seconds,index=0){
  if(!Number.isInteger(index)||index<0||index>=8)return null;
  const layer=Math.floor(index/2),side=index%2?1:-1,t=seconds-.14-layer*.035;
  if(!Number.isFinite(t)||t<=0||seconds>=2.25)return null;
  const fill=smooth(t/.48),clear=smooth((seconds-1)/1.25),age=t/2.11,body=index<4;
  return {opacity:(body?.84:.5)*smooth(t/.13)*(1-clear),
    x:side*(.34-.25*fill+.24*clear),y:-.36+(.40+layer*.025)*fill+.11*clear,
    width:(body?.32:.25)+(body?1.10:.85)*fill+.18*clear,
    height:.18+(body?1.20:.96)*fill+.12*clear,rotation:side*(.04+age*.1),age};
}
export function mistLayers(budget){return budget.quiet?0:budget.quality==='low'?4:budget.quality==='medium'?6:8;}
export function makeCaseMist(T){
  const root=new T.Group(),clouds=[];root.visible=false;
  const geometry=new T.PlaneGeometry(1,1);
  for(let i=0;i<8;i++){
    const material=new T.ShaderMaterial({transparent:true,depthWrite:false,depthTest:false,toneMapped:false,side:T.DoubleSide,
      uniforms:{opacity:{value:0},age:{value:0},seed:{value:i*4.7}},
      vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:'uniform float opacity;uniform float age;uniform float seed;varying vec2 vUv;float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}void main(){vec2 p=(vUv-.5)*2.;vec2 q=vUv*3.6+vec2(seed+age*.5,-age*1.25);float curl=noise(q+noise(q*1.7)*.6);float detail=noise(q*2.2);float feather=1.-smoothstep(.36,1.,length(p)+(curl-.5)*.16);float density=.58+.42*smoothstep(.12,.8,curl*.75+detail*.25);float a=feather*density*opacity;vec3 colour=mix(vec3(.52,.66,.74),vec3(.89,.95,.98),.35+.65*curl);gl_FragColor=vec4(colour,a);}' });
    const cloud=new T.Mesh(geometry,material);cloud.renderOrder=13;cloud.visible=false;root.add(cloud);clouds.push(cloud);
  }
  return {root,clouds};
}
export function updateCaseMist(mist,seconds,budget){
  const count=mistLayers(budget);let active=false;
  for(const [i,cloud]of mist.clouds.entries()){
    const frame=i<count?mistFrame(seconds,i):null;cloud.visible=!!frame;
    if(!frame)continue;active=true;
    cloud.position.set(frame.x,frame.y,.025+i*.001);cloud.scale.set(frame.width,frame.height,1);cloud.rotation.z=frame.rotation;
    cloud.material.uniforms.opacity.value=frame.opacity;cloud.material.uniforms.age.value=frame.age;
  }
  mist.root.visible=active;
}
