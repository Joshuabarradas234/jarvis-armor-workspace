export async function weather(settings){
  if(!settings.enabled)return {status:'WEATHER SERVICE NOT CONFIGURED'};
  const url=new URL('https://api.open-meteo.com/v1/forecast');url.search=new URLSearchParams({latitude:settings.latitude,longitude:settings.longitude,current:'temperature_2m,weather_code,wind_speed_10m',timezone:'auto'});
  const res=await fetch(url,{signal:AbortSignal.timeout(10000)});if(!res.ok)throw Error(`Weather service returned ${res.status}.`);const data=await res.json();
  return {status:'CONNECTED',current:data.current,units:data.current_units,source:'Open-Meteo',updated:Date.now()};
}
export async function askAI(settings,key,messages){
  if(!settings.enabled||!settings.endpoint||!key)return {configured:false,text:'AI SERVICE NOT CONFIGURED. Local JARVIS commands remain available.'};
  const res=await fetch(settings.endpoint,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`},body:JSON.stringify({model:settings.model,messages:messages.slice(-20),max_tokens:1000}),signal:AbortSignal.timeout(30000),redirect:'error'});
  if(!res.ok)throw Error(`AI service returned ${res.status}.`);const data=await res.json();const text=data.choices?.[0]?.message?.content;if(typeof text!=='string')throw Error('Unsupported response. Use a chat-completions-compatible endpoint.');return {configured:true,text:text.slice(0,20000)};
}
