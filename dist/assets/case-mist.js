/* Brief cold vapour from the lower door seals, using the existing entry clock and renderer. */
const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
export function mistFrame(seconds,index=0){
  const layer=Math.floor(index/2),side=index%2?1:-1,age=(seconds-.16-layer*.065)/.95;
  if(!Number.isFinite(age)||age<=0||age>=1)return null;
  const drift=1-(1-age)*(1-age);
  return {opacity:.38*smooth(age/.16)*(1-smooth((age-.25)/.75)),x:side*(.34+.18*drift),y:-.37+.12*drift+layer*.025,width:.28+.25*drift,height:.13+.14*drift,rotation:side*(.12+age*.23),age};
}
export function mistLayers(budget){return budget.quiet?0:budget.quality==='low'?2:budget.quality==='medium'?4:6;}
export function makeCaseMist(T){
  const root=new T.Group(),clouds=[];root.visible=false;
  const geometry=new T.PlaneGeometry(1,1);
  for(let i=0;i<6;i++){
    const material=new T.ShaderMaterial({transparent:true,depthWrite:false,depthTest:true,toneMapped:false,side:T.DoubleSide,
      uniforms:{opacity:{value:0},age:{value:0},seed:{value:i*4.7}},
      vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:'uniform float opacity;uniform float age;uniform float seed;varying vec2 vUv;float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}void main(){vec2 p=(vUv-.5)*2.;float feather=1.-smoothstep(.2,1.,length(p));vec2 q=vUv*4.+vec2(seed+age*.7,-age*.9);float cloud=noise(q)*.7+noise(q*2.1)*.3;float a=feather*smoothstep(.15,.72,cloud)*opacity;gl_FragColor=vec4(.76,.88,.94,a);}' });
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
