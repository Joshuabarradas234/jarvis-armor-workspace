/** A camera belongs only to its visible capture view, including late permission replies. */
export class StudioCamera{
 constructor(devices){this.devices=devices;this.generation=0;this.stream=null;}
 stop(){this.generation++;this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;}
 async start(video){this.stop();const generation=this.generation,stream=await this.devices.getUserMedia({video:{width:{ideal:1280},height:{ideal:720}},audio:false});if(generation!==this.generation||!video.isConnected){stream.getTracks().forEach(t=>t.stop());return false;}this.stream=stream;video.srcObject=stream;try{await video.play();return generation===this.generation;}catch(e){this.stop();throw e;}}
}
