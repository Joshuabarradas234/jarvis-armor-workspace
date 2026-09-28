import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createContext,SourceTextModule,SyntheticModule} from 'node:vm';
async function fixture(){
 const displays=[{id:10,bounds:{x:0,y:0,width:1600,height:900},workArea:{x:0,y:0,width:1600,height:860},size:{width:1600,height:900}},{id:20,bounds:{x:-1920,y:0,width:1920,height:1080},workArea:{x:-1920,y:0,width:1920,height:1040},size:{width:1920,height:1080}}];
 class Window{constructor(opts={}){this.bounds=opts;this.events={};this.views=[];this.contentView={addChildView:v=>this.views.push(v),removeChildView:v=>{this.views=this.views.filter(x=>x!==v);}};}isDestroyed(){return false;}getBounds(){return this.bounds;}getContentSize(){return [this.bounds.width,this.bounds.height];}setBounds(r){this.bounds=r;}isMaximized(){return !!this.max;}unmaximize(){this.max=false;}maximize(){this.max=true;}focus(){}show(){}on(ev,cb){this.events[ev]=cb;}once(){}setTitle(){}close(){this.events.close?.();}}
 const context=createContext({crypto:{randomUUID:()=> 'tab'}}),main=new Window(displays[0].bounds),screen={getAllDisplays:()=>displays,getPrimaryDisplay:()=>displays[0],getDisplayMatching:()=>displays[0],getDisplayNearestPoint:()=>displays[0]};
 const electron=new SyntheticModule(['BrowserWindow','WebContentsView','screen','shell'],function(){this.setExport('BrowserWindow',Window);this.setExport('WebContentsView',class{});this.setExport('screen',screen);this.setExport('shell',{});},{context});
 const mod=new SourceTextModule(fs.readFileSync(new URL('../../src/main/tabs.js',import.meta.url),'utf8'),{context});await mod.link(()=>electron);await mod.evaluate();
 const manager=new mod.namespace.TabManager({window:()=>main,onChange:()=>{},log:()=>{}}),view={webContents:{isDestroyed:()=>false,getTitle:()=> 'Draft',getURL:()=> 'https://example.com',isLoading:()=>false,on:()=>{}},setVisible(v){this.visible=v;},setBounds(b){this.bounds=b;}};
 manager.tabs.push({id:'tab',url:'https://example.com',view});manager.active='tab';main.contentView.addChildView(view);manager.layout={x:10,y:30,width:600,height:500};return {manager,main,view,displays};
}
test('explicit screen move preserves the live page, respects work area and returns on close',async()=>{
 const {manager,main,view}=await fixture();assert.equal(manager.popOut('tab',{displayId:20}),true);const pop=manager.tabs[0].popped;
 assert.equal(pop.bounds.x,-1920);assert.equal(pop.bounds.height,1040);assert.equal(pop.views[0],view);assert.equal(main.views.length,0);assert.equal(view.bounds.height,1040);
 manager.dock('tab');assert.equal(main.views[0],view);assert.equal(manager.tabs[0].popped,null);assert.equal(view.bounds.height,500);
});
test('stable display IDs survive numbering changes; unplugged targets fail without moving anything',async()=>{
 const {manager,main,view,displays}=await fixture();assert.equal(manager.displays().find(x=>x.current).id,10);
 displays.splice(1,1);assert.throws(()=>manager.popOut('tab',{display:1,displayId:20}),/disconnected/);assert.equal(main.views[0],view);assert.equal(manager.tabs[0].popped,undefined);
 assert.throws(()=>manager.popOut('tab',{display:9}),/no longer connected/);
});
test('moving an already detached tab reuses its window',async()=>{const {manager,view}=await fixture();manager.popOut('tab',{displayId:20});const win=manager.tabs[0].popped;manager.popOut('tab',{displayId:10});assert.equal(manager.tabs[0].popped,win);assert.equal(win.bounds.x,0);assert.equal(win.views[0],view);});
