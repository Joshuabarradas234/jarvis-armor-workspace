import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createContext,SourceTextModule,SyntheticModule} from 'node:vm';
async function fixture(){
 const displays=[{id:10,bounds:{x:0,y:0,width:1600,height:900},workArea:{x:0,y:0,width:1600,height:860},size:{width:1600,height:900}},{id:20,bounds:{x:-1920,y:0,width:1920,height:1080},workArea:{x:-1920,y:0,width:1920,height:1040},size:{width:1920,height:1080}}];
 class Window{constructor(opts={}){this.bounds=opts;this.events={};this.views=[];this.contentView={addChildView:v=>this.views.push(v),removeChildView:v=>{this.views=this.views.filter(x=>x!==v);}};}isDestroyed(){return false;}getBounds(){return this.bounds;}getContentSize(){return [this.bounds.width,this.bounds.height];}setBounds(r){this.bounds=r;}isMaximized(){return !!this.max;}unmaximize(){this.max=false;}maximize(){this.max=true;}focus(){}show(){}on(ev,cb){this.events[ev]=cb;}once(){}setTitle(){}close(){this.events.close?.();}}
 const context=createContext({URL,setTimeout,clearTimeout,crypto:{randomUUID:()=> 'tab'}}),main=new Window(displays[0].bounds),screen={getAllDisplays:()=>displays,getPrimaryDisplay:()=>displays[0],getDisplayMatching:()=>displays[0],getDisplayNearestPoint:()=>displays[0]};
 const electron=new SyntheticModule(['BrowserWindow','WebContentsView','screen','shell'],function(){this.setExport('BrowserWindow',Window);this.setExport('WebContentsView',class{});this.setExport('screen',screen);this.setExport('shell',{});},{context});
 const mod=new SourceTextModule(fs.readFileSync(new URL('../../src/main/tabs.js',import.meta.url),'utf8'),{context});await mod.link(async spec=>{if(spec==='electron')return electron;const exports=await import(spec.includes('workspace-keys')?'../../src/main/workspace-keys.js':spec.includes('page-excerpt')?'../../src/main/page-excerpt.js':'../../dist/assets/window-snap.js');return new SyntheticModule(Object.keys(exports),function(){for(const [k,v] of Object.entries(exports))this.setExport(k,v);},{context});});await mod.evaluate();
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

test('quarter-screen placement uses the work area and preserves the live view',async()=>{
 const {manager,view}=await fixture();manager.popOut('tab',{displayId:20,area:'bottom-right'});const win=manager.tabs[0].popped;
 assert.equal(win.bounds.x,-960);assert.equal(win.bounds.y,520);assert.equal(win.bounds.width,960);assert.equal(win.bounds.height,520);assert.equal(win.isMaximized(),false);assert.equal(win.views[0],view);
 manager.popOut('tab',{displayId:10,area:'left'});assert.equal(win.bounds.width,800);assert.equal(win.bounds.height,860);assert.equal(win.isMaximized(),false);
 assert.throws(()=>manager.popOut('tab',{displayId:10,area:'unknown'}),/layout/);
});
test('page capture is bounded, rejects navigation races, and does not revive closed tabs',async()=>{
 const {manager,view}=await fixture();const wc=view.webContents;
 wc.executeJavaScript=async()=>({url:'https://example.com',title:'Brief',text:'a'.repeat(13000)});
 assert.equal((await manager.excerpt('tab')).text.length,12000);
 wc.executeJavaScript=async()=>{wc.getURL=()=> 'https://example.com/changed';return {url:'https://example.com',text:'old'};};
 await assert.rejects(()=>manager.excerpt('tab'),/changed during capture/);
 wc.isDestroyed=()=>true;await assert.rejects(()=>manager.excerpt('tab'),/closed/);assert.equal(manager.popOut('tab'),false);
});

test('closing and reopening keeps the page address, while suit exit clears closed-tab history',async()=>{const {manager,view}=await fixture();manager.close('tab');assert.equal(manager.closed[0],'https://example.com');let opened;manager.open=url=>{opened=url;return 'reopened';};assert.equal(manager.reopen(),'reopened');assert.equal(opened,'https://example.com');assert.equal(manager.closed.length,0);manager.tabs.push({id:'second',url:'https://example.com',view});manager.active='second';manager.closeAll();assert.equal(manager.closed.length,0);assert.equal(manager.tabs.length,0);});
test('reopening failure retains the closed page and typed navigation rejects credentials and file URLs',async()=>{const {manager}=await fixture();manager.close('tab');manager.open=()=>{throw Error('Tab limit');};assert.throws(()=>manager.reopen(),/Tab limit/);assert.equal(manager.closed.length,1);assert.throws(()=>manager.address('tab','file:///C:/secret.txt'),/HTTP/);assert.throws(()=>manager.address('tab','https://user:password@example.com'),/passwords/);});

test('loading callbacks cannot uncover native pages over a modal and closing it restores visibility',async()=>{const {manager,view}=await fixture();manager.show(true);assert.equal(view.visible,true);manager.cover(true);manager.show(true);manager.setLayout({x:0,y:20,width:800,height:600});assert.equal(view.visible,false);manager.cover(false);assert.equal(view.visible,true);assert.equal(view.bounds.height,600);manager.show(false);manager.cover(true);manager.cover(false);assert.equal(view.visible,false);});
test('explicit tab activation asks the launchpad to reveal the page even when the active ID is unchanged',async()=>{const {manager}=await fixture();let list;manager.onChange=l=>list=l;manager.activate('tab');assert.equal(list[0].reveal,true);assert.equal(manager.list()[0].reveal,undefined);});
