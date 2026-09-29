import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
export async function check({win,js,call,sleep,until,out}){
 await call('action',{action:'debug-hall'});
 await until(()=>js('!!window.__jarvisGuide && !!window.__jarvisScreens && !!window.__jarvisTower'));
 await sleep(1000);assert.equal(await js("!!document.querySelector('[data-cal-open]')"),false);
 await js('window.__jarvisGuide.show()');await until(()=>js("document.querySelectorAll('.wt-catalogue article').length===24"));
 fs.writeFileSync(path.join(out,'feature-guide.png'),(await win.webContents.capturePage()).toPNG());
 await js("document.querySelector('.wt-guide input').value='workflows';document.querySelector('.wt-guide input').dispatchEvent(new Event('input'));true");
 assert.equal(await js("document.querySelectorAll('.wt-catalogue article').length"),1);await js('window.__jarvisGuide.close()');
 await js('window.__jarvisTower.show()');await until(()=>js("!!document.querySelector('[data-brief=audience]')"));
 const v=await call('tower-get');const floor=v.floors[0];
 const r=await call('tower-run',{floorId:floor.id,task:'Draft a project checklist'});assert.equal(r.status,'needs_brief');assert.equal(r.calls,0);
 await sleep(500);assert.equal(await js("document.querySelector('.tw-task').value"),'Draft a project checklist');
 fs.writeFileSync(path.join(out,'task-brief.png'),(await win.webContents.capturePage()).toPNG());
 await js("window.__jarvisTower.tab='results';window.__jarvisTower.renderFloor();true");assert.ok(await js("document.querySelector('.wt-results').textContent.includes('Accepted workflows')"));
 fs.writeFileSync(path.join(out,'results.png'),(await win.webContents.capturePage()).toPNG());await js('window.__jarvisTower.close()');
 await js('window.__jarvisIdeas.show()');await until(()=>js("!!document.querySelector('[data-suggest-control]')"));await js("document.querySelector('[data-suggest-control]').click();true");await until(async()=>!(await call('work-suggestions')).enabled);assert.equal((await call('work-suggestions')).enabled,false);await js('window.__jarvisIdeas.close()');
 await js('window.__jarvisScreens.show()');await until(()=>js("!!document.querySelector('.wt-screen-menu')"));assert.ok(await js("document.querySelector('.wt-screen-menu').textContent.includes('Open a suit')"));await js("document.querySelector('.wt-screen-menu header button').click();true");
 console.log('PRODUCTIVITY_UI_OK');
}
