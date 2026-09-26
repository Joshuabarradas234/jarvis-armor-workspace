import {WebContentsView,shell} from 'electron';
import crypto from 'node:crypto';
/**
 * Floating web panels ("holo panels"): real web pages that sit in glass frames the app draws,
 * in the hall or the Ideas room, and can be dragged and resized anywhere on the screen.
 * The frame (title bar, handles) is drawn by the page; this only owns the web view inside it.
 */
const allowed=u=>{try{return ['https:','http:'].includes(new URL(u).protocol);}catch{return false;}};
const MAX=12;
export class PanelManager{
  constructor({window,onChange,log}){this.window=window;this.onChange=onChange||(()=>{});this.log=log||(()=>{});this.panels=new Map();}
  win(){const w=this.window();return w&&!w.isDestroyed()?w:null;}
  list(){return [...this.panels.values()].map(p=>({id:p.id,url:p.view.webContents.isDestroyed()?p.url:(p.view.webContents.getURL()||p.url),title:p.title||'',visible:p.visible}));}
  changed(){try{this.onChange(this.list());}catch{}}
  open({id,url,rect}={}){
    if(!allowed(url))throw Error('Only web pages can open in a panel.');
    const win=this.win();if(!win)throw Error('JARVIS window unavailable.');
    const have=id&&this.panels.get(id);
    if(have){if(have.view.webContents.getURL()!==url)have.view.webContents.loadURL(url).catch(e=>this.log('panels',e.message));this.place(have.id,rect);this.front(have.id);return have.id;}
    if(this.panels.size>=MAX)throw Error(`Up to ${MAX} panels can be open.`);
    const pid=typeof id==='string'&&/^[\w-]{1,64}$/.test(id)?id:crypto.randomUUID();
    const view=new WebContentsView({webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,partition:'persist:jarvis-tabs'}});
    view.setBackgroundColor('#0b1219');
    const p={id:pid,url,view,title:'',visible:true};this.panels.set(pid,p);
    const wc=view.webContents;
    wc.setWindowOpenHandler(({url:u})=>{if(allowed(u))wc.loadURL(u).catch(()=>{});return {action:'deny'};});   // sign-in pop-ups stay in the panel
    wc.on('will-navigate',(e,u)=>{if(!allowed(u))e.preventDefault();});
    wc.on('page-title-updated',(_e,t)=>{p.title=t;this.changed();});
    wc.on('did-navigate',()=>this.changed());
    wc.on('did-fail-load',(_e,code,desc,u,main)=>{if(main&&code!==-3)this.log('panels',`${u}: ${desc}`);});
    win.contentView.addChildView(view);
    this.place(pid,rect);
    wc.loadURL(url).catch(e=>this.log('panels',e.message));
    this.changed();return pid;
  }
  /** Take in a live page from elsewhere (a tab thrown to this screen), keeping everything it has loaded. */
  adopt({view,url,title='',rect}){
    const win=this.win();if(!win)throw Error('That screen is not available.');
    if(this.panels.size>=MAX)throw Error(`Up to ${MAX} panels can be open.`);
    const pid=crypto.randomUUID();const p={id:pid,url,view,title,visible:true};this.panels.set(pid,p);
    const wc=view.webContents;
    wc.on('page-title-updated',(_e,t)=>{if(this.panels.get(pid)===p){p.title=t;this.changed();}});
    wc.on('did-navigate',()=>{if(this.panels.get(pid)===p)this.changed();});
    win.contentView.addChildView(view);view.setVisible(true);
    this.place(pid,rect||{x:0,y:0,width:10,height:10});
    this.changed();return pid;
  }
  /** Let a page go to another screen without closing it. */
  release(id){
    const p=this.panels.get(id);if(!p)return null;this.panels.delete(id);
    try{this.win()?.contentView.removeChildView(p.view);}catch{}
    this.changed();
    const wc=p.view.webContents;return {view:p.view,url:wc.isDestroyed()?p.url:(wc.getURL()||p.url),title:p.title||(wc.isDestroyed()?'':wc.getTitle())};
  }
  place(id,rect){
    const p=this.panels.get(id);if(!p||!rect)return false;
    const r={x:Math.round(Number(rect.x)||0),y:Math.round(Number(rect.y)||0),width:Math.max(120,Math.round(Number(rect.width)||0)),height:Math.max(80,Math.round(Number(rect.height)||0))};
    p.view.setBounds(r);return true;
  }
  show(id,visible){const ids=id?[id]:[...this.panels.keys()];for(const k of ids){const p=this.panels.get(k);if(!p)continue;p.visible=!!visible;p.view.setVisible(!!visible);}return true;}
  front(id){const p=this.panels.get(id),win=this.win();if(!p||!win)return false;win.contentView.addChildView(p.view);return true;}
  close(id){
    const p=this.panels.get(id);if(!p)return false;this.panels.delete(id);
    try{this.win()?.contentView.removeChildView(p.view);}catch{}
    try{p.view.webContents.close();}catch{}
    this.changed();return true;
  }
  closeAll(){for(const id of [...this.panels.keys()])this.close(id);}
  navigate(id,command){
    const p=this.panels.get(id);if(!p)return false;const wc=p.view.webContents;
    if(command==='back'&&wc.navigationHistory.canGoBack())wc.navigationHistory.goBack();
    else if(command==='forward'&&wc.navigationHistory.canGoForward())wc.navigationHistory.goForward();
    else if(command==='reload')wc.reload();
    else if(command==='external'){const u=wc.getURL();if(allowed(u))shell.openExternal(u);}
    return true;
  }
  /** Hand control: the top panel under a window point, if any. */
  at(x,y,only){
    const ids=only?[only]:[...this.panels.keys()];
    const win=this.win();const order=win?win.contentView.children:[];
    let best=null,bestZ=-1;
    for(const id of ids){const p=this.panels.get(id);if(!p||!p.visible)continue;const b=p.view.getBounds();
      if(x>=b.x&&y>=b.y&&x<b.x+b.width&&y<b.y+b.height){const z=order.indexOf(p.view);if(z>bestZ){bestZ=z;best=p;}}}
    return best;
  }
  pointer(type,x,y,id){
    const p=this.at(x,y,id);if(!p||p.view.webContents.isDestroyed())return false;
    const b=p.view.getBounds();const ev={x:Math.round(x-b.x),y:Math.round(y-b.y)};const wc=p.view.webContents;
    if(type==='move')wc.sendInputEvent({type:'mouseMove',...ev});
    else if(type==='down'){wc.focus();wc.sendInputEvent({type:'mouseDown',...ev,button:'left',clickCount:1});}
    else if(type==='up')wc.sendInputEvent({type:'mouseUp',...ev,button:'left',clickCount:1});
    else return false;
    return p.id;
  }
  scroll(x,y,dy){const p=this.at(x,y);if(!p)return false;const b=p.view.getBounds();p.view.webContents.sendInputEvent({type:'mouseWheel',x:Math.round(x-b.x),y:Math.round(y-b.y),deltaX:0,deltaY:-dy});return true;}
}
