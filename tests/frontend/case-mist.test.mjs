import test from 'node:test';import assert from 'node:assert/strict';
import {mistFrame,mistLayers} from '../../dist/assets/case-mist.js';
import {createEntryMotion} from '../../dist/assets/suit-entry.js';
import {renderBudget} from '../../dist/assets/render-budget.js';

test('pressure release follows the opening seal and clears before the suit presentation',()=>{
 for(let i=0;i<6;i++){for(const t of [-1,0,.12,.16,1.25,3,100,NaN])assert.equal(mistFrame(t,i),null);assert.ok(mistFrame(.5,i).opacity>.1);}
 for(let t=0;t<1.3;t+=.01)for(let i=0;i<6;i++){const p=mistFrame(t,i);if(!p)continue;assert.ok(p.opacity>=0&&p.opacity<=.38);assert.ok(p.y+p.height/2<0,'Vapour stays below the upper half of the case');}
});
test('mist has a small battery/low-quality version and is off for reduced motion',()=>{
 for(const quality of ['low','medium','high','ultra']){const b=renderBudget({quality,animations:true},{onBattery:false});assert.equal(mistLayers(b),{low:2,medium:4,high:6,ultra:6}[quality]);assert.equal(mistLayers({...b,quiet:true}),0);}
 assert.equal(mistLayers(renderBudget({quality:'ultra'},{onBattery:true})),2);
 assert.equal(mistLayers(renderBudget({},{},{reduced:true})),0);
});
test('returning, late model loads and workstation entry never replay the pressure burst',()=>{
 const m=createEntryMotion('batcave','bc1');const select={state:'SUIT_SELECTED',selected:'bc1'};
 m.update(select,0);assert.ok(mistFrame(m.update(select,500).seconds));assert.equal(mistFrame(m.update({state:'RETURNING',selected:'bc1'},600).seconds),null);
 const late=createEntryMotion('ironman','im1');assert.equal(mistFrame(late.update({state:'SUIT_SELECTED',selected:'im1'},0,false,1900).seconds),null);
 const module=createEntryMotion('spiderman','sm1');assert.equal(mistFrame(module.update({state:'MODULE',selected:'sm1'},0).seconds),null);
});
