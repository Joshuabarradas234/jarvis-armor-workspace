import {WebContentsView,BrowserWindow,screen,shell} from 'electron';
const MAX_TABS=12;
const allowed=url=>{try{const u=new URL(url);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password;}catch{return false;}};
/** Sandboxed browser tabs rendered inside the main workspace window (below the JARVIS tab strip). */
export class TabManager{
  constructor({window,onChange,log}){this.window=window;this.onChange=onChange;this.log=log;this.tabs=[];this.active=null;this.layout={x:0,y:0,width:0,height:0};this.shown=true;}
  list(){return this.tabs.map(t=>({id:t.id,title:t.view.webContents.getTitle()||t.url,url:t.view.webContents.getURL()||t.url,active:t.id===this.active,loading:t.view.webContents.isLoading(),popped:!!t.popped}));}
  win(){const w=this.window();return w&&!w.isDestroyed()?w:null;}
  open(url,activate=true){
    if(!allowed(url))throw Error('Only HTTP and HTTPS pages can open in a tab.');
    if(this.tabs.length>=MAX_TABS)throw Error(`Up to ${MAX_TABS} tabs can stay open.`);
    const win=this.win();if(!win)throw Error('Workspace window unavailable.');
    const view=new WebContentsView({webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,partition:'persist:jarvis-tabs'}});
    const id=crypto.randomUUID();const tab={id,url,view};this.tabs.push(tab);
    const wc=view.webContents;
    wc.setWindowOpenHandler(({url:target})=>{if(allowed(target)){try{this.open(target,true);}catch(e){this.log('tabs',e.message);}}else this.log('tabs','Blocked popup: '+target);return {action:'deny'};});
    wc.on('will-navigate',(e,target)=>{if(!allowed(target))e.preventDefault();});
    wc.on('will-redirect',(e,target)=>{if(!allowed(target))e.preventDefault();});
    for(const ev of ['page-title-updated','did-navigate','did-navigate-in-page','did-start-loading','did-stop-loading'])wc.on(ev,()=>this.onChange(this.list()));
    wc.on('render-process-gone',(_e,d)=>{this.log('tabs',`${url}: ${d.reason}`);this.close(id);});
    wc.on('did-fail-load',(_e,code,desc,failed,isMain)=>{if(isMain&&code!==-3)this.log('tabs',`${failed}: ${desc}`);});
    wc.setAudioMuted(false);
    win.contentView.addChildView(view);view.setBounds({x:0,y:0,width:0,height:0});
    wc.loadURL(url).catch(e=>this.log('tabs',e.message));
    if(activate||!this.active)this.activate(id);else this.apply();
    this.onChange(this.list());return id;
  }
  activate(id){const tt=this.tabs.find(t=>t.id===id);if(!tt)return false;if(tt.popped&&!tt.popped.isDestroyed()){if(tt.popped.isMinimized())tt.popped.restore();tt.popped.focus();return true;}this.active=id;this.apply();this.onChange(this.list());return true;}
  close(id){const i=this.tabs.findIndex(t=>t.id===id);if(i<0)return false;const [tab]=this.tabs.splice(i,1);if(tab.popped&&!tab.popped.isDestroyed()){const pw=tab.popped;tab.popped=null;tab.closing=true;try{pw.contentView.removeChildView(tab.view);}catch{}pw.destroy();}const win=this.win();try{win?.contentView.removeChildView(tab.view);}catch{}try{tab.view.webContents.close();}catch{}if(this.active===id)this.active=this.tabs[Math.min(i,this.tabs.length-1)]?.id||null;this.apply();this.onChange(this.list());return true;}
  closeAll(){for(const t of [...this.tabs])this.close(t.id);}
  navigate(id,command){const tab=this.tabs.find(t=>t.id===id);if(!tab)return false;const wc=tab.view.webContents;if(command==='back'&&wc.navigationHistory.canGoBack())wc.navigationHistory.goBack();else if(command==='forward'&&wc.navigationHistory.canGoForward())wc.navigationHistory.goForward();else if(command==='reload')wc.reload();else if(command==='external')shell.openExternal(wc.getURL()).catch(e=>this.log('tabs',e.message));return true;}
  setLayout(rect){const r={x:Math.max(0,Math.round(rect.x||0)),y:Math.max(0,Math.round(rect.y||0)),width:Math.max(0,Math.round(rect.width||0)),height:Math.max(0,Math.round(rect.height||0))};this.layout=r;this.apply();}
  show(shown){this.shown=shown;this.apply();}
  apply(){for(const t of this.tabs){if(t.popped)continue;const on=this.shown&&t.id===this.active&&this.layout.width>0;t.view.setVisible(on);t.view.setBounds(on?this.layout:{x:0,y:0,width:0,height:0});}}
  /** Screens in reading order: left to right, then top to bottom. Numbered from 1 as the user sees them. */
  displays(){const primary=screen.getPrimaryDisplay().id;return screen.getAllDisplays().slice().sort((a,b)=>a.bounds.x-b.bounds.x||a.bounds.y-b.bounds.y).map((d,i)=>({index:i+1,id:d.id,label:`Screen ${i+1}`,primary:d.id===primary,width:d.size.width,height:d.size.height}));}
  /**
   * Take a tab out of the suit into a window of its own. It fills the chosen screen (or the one
   * under the mouse where the tab was dropped) and can then be dragged anywhere. Closing that
   * window puts the tab back in the suit rather than losing it.
   */
  popOut(id,{display,x,y}={}){
    const tab=this.tabs.find(t=>t.id===id);if(!tab)return false;
    const all=screen.getAllDisplays().slice().sort((a,b)=>a.bounds.x-b.bounds.x||a.bounds.y-b.bounds.y);
    let d=null;
    if(Number.isInteger(display)&&all[display-1])d=all[display-1];
    else if(Number.isFinite(x)&&Number.isFinite(y))d=screen.getDisplayNearestPoint({x:Math.round(x),y:Math.round(y)});
    d=d||screen.getPrimaryDisplay();
    const wa=d.workArea;
    if(tab.popped&&!tab.popped.isDestroyed()){const w=tab.popped;if(w.isMaximized())w.unmaximize();w.setBounds(wa);w.maximize();w.focus();this.onChange(this.list());return true;}
    const main=this.win();try{main?.contentView.removeChildView(tab.view);}catch{}
    const w=new BrowserWindow({x:wa.x,y:wa.y,width:wa.width,height:wa.height,show:false,autoHideMenuBar:true,backgroundColor:'#0b1219',title:tab.view.webContents.getTitle()||tab.url});
    tab.popped=w;
    w.contentView.addChildView(tab.view);tab.view.setVisible(true);
    const fit=()=>{if(w.isDestroyed())return;const [cw,ch]=w.getContentSize();tab.view.setBounds({x:0,y:0,width:cw,height:ch});};
    w.on('resize',fit);w.on('maximize',fit);w.on('unmaximize',fit);w.on('enter-full-screen',fit);w.on('leave-full-screen',fit);
    tab.view.webContents.on('page-title-updated',(_e,t)=>{if(!w.isDestroyed())w.setTitle(t);});
    w.on('close',()=>{if(tab.closing)return;try{w.contentView.removeChildView(tab.view);}catch{}tab.popped=null;const m=this.win();if(m&&this.tabs.includes(tab)){try{m.contentView.addChildView(tab.view);}catch{}this.active=tab.id;this.apply();}this.onChange(this.list());});
    w.once('ready-to-show',()=>{});w.maximize();w.show();fit();
    if(this.active===id){const other=this.tabs.find(t=>t.id!==id&&!t.popped);this.active=other?other.id:id;}
    this.apply();this.onChange(this.list());return true;
  }
  /** Hand-swipe scrolling for the page in the active tab. */
  /** Scroll the visible tab; at the hand cursor when a window point is given, else the middle. */
  scroll(dy,at){const t=this.tabs.find(x=>x.id===this.active&&!x.popped);if(!t)return false;const b=t.view.getBounds();
    const inside=at&&at.x>=b.x&&at.y>=b.y&&at.x<b.x+b.width&&at.y<b.y+b.height;
    t.view.webContents.sendInputEvent({type:'mouseWheel',x:inside?Math.round(at.x-b.x):Math.round(b.width/2),y:inside?Math.round(at.y-b.y):Math.round(b.height/2),deltaX:0,deltaY:-dy});return true;}
  /** Hand control: move / press / release inside the visible tab, from a point in the window. */
  pointer(type,x,y){
    const t=this.tabs.find(v=>v.id===this.active&&!v.popped);if(!t||t.view.webContents.isDestroyed())return false;
    const b=t.view.getBounds();if(!(x>=b.x&&y>=b.y&&x<b.x+b.width&&y<b.y+b.height))return false;
    const ev={x:Math.round(x-b.x),y:Math.round(y-b.y)};const wc=t.view.webContents;
    if(type==='move')wc.sendInputEvent({type:'mouseMove',...ev});
    else if(type==='down'){wc.focus();wc.sendInputEvent({type:'mouseDown',...ev,button:'left',clickCount:1});}
    else if(type==='up')wc.sendInputEvent({type:'mouseUp',...ev,button:'left',clickCount:1});
    else return false;
    return true;
  }
  /** Hand a tab's live page over to another screen (the deck): it leaves the tab strip but keeps its place in the page. */
  release(id){
    const i=this.tabs.findIndex(t=>t.id===id);if(i<0)return null;const tab=this.tabs[i];
    if(tab.popped&&!tab.popped.isDestroyed()){tab.closing=true;try{tab.popped.contentView.removeChildView(tab.view);}catch{}tab.popped.destroy();tab.popped=null;}
    this.tabs.splice(i,1);try{this.win()?.contentView.removeChildView(tab.view);}catch{}
    if(this.active===id)this.active=this.tabs.find(t=>!t.popped)?.id||null;
    this.apply();this.onChange(this.list());
    const wc=tab.view.webContents;return {view:tab.view,url:wc.getURL()||tab.url,title:wc.getTitle()||''};
  }
  /** Take a live page back into the suit as a tab (thrown up from the deck). */
  adopt({view,url}){
    const win=this.win();if(!win)throw Error('Workspace window unavailable.');
    if(this.tabs.length>=MAX_TABS)throw Error(`Up to ${MAX_TABS} tabs can stay open.`);
    const id=crypto.randomUUID();const tab={id,url,view};this.tabs.push(tab);
    const wc=view.webContents;
    for(const ev of ['page-title-updated','did-navigate','did-navigate-in-page','did-start-loading','did-stop-loading'])wc.on(ev,()=>{if(this.tabs.includes(tab))this.onChange(this.list());});
    win.contentView.addChildView(view);view.setBounds({x:0,y:0,width:0,height:0});
    this.activate(id);this.onChange(this.list());return id;
  }
  dock(id){const tab=this.tabs.find(t=>t.id===id);if(!tab?.popped||tab.popped.isDestroyed())return false;tab.popped.close();return true;}
  dispose(){this.closeAll();}
}
