import test from 'node:test';
import assert from 'node:assert/strict';
import {shouldPauseAmbient} from '../../dist/assets/interface-quality.js';

test('ambient holograms play only in the hall overview and hover states',()=>{
  for(const state of ['ARMOR_HALL','SUIT_HOVER'])assert.equal(shouldPauseAmbient({state}),false);
  for(const state of ['IDLE','WAKE','HELMET_OPENING','SUIT_SELECTED','MODULE','RETURNING','SHUTDOWN'])assert.equal(shouldPauseAmbient({state}),true);
});
test('hidden, covered, still and reduced-motion halls stop their decorative video',()=>{
  for(const key of ['hidden','covered','still','reduced'])for(const state of ['ARMOR_HALL','SUIT_HOVER'])assert.equal(shouldPauseAmbient({state,[key]:true}),true);
});
test('returning to a visible animated overview resumes ambient playback eligibility',()=>{
  const view={state:'ARMOR_HALL',hidden:true,covered:true,still:false,reduced:false};
  assert.equal(shouldPauseAmbient(view),true);view.hidden=false;assert.equal(shouldPauseAmbient(view),true);view.covered=false;assert.equal(shouldPauseAmbient(view),false);
});
