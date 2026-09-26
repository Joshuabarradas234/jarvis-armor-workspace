import fs from 'node:fs';
import path from 'node:path';
import {writeJson} from '../brain/util.js';
import {BAY_IDS,validateHallCalibration} from '../../dist/assets/hall-calibration-data.js';
export class HallCalibrationStore{
  constructor(dir){this.file=path.join(dir,'hall-calibration.json');this.data={version:1,themes:{}};
    try{const saved=JSON.parse(fs.readFileSync(this.file,'utf8'));if(saved.version===1)for(const t of Object.keys(BAY_IDS))if(saved.themes?.[t])try{this.data.themes[t]=validateHallCalibration(t,saved.themes[t]);}catch{}}catch{}
  }
  get(){return structuredClone(this.data);}
  save(theme,patch){const checked=validateHallCalibration(theme,patch),next=this.get();next.themes[theme]=checked;writeJson(this.file,next);this.data=next;return this.get();}
  reset(theme){if(!Object.hasOwn(BAY_IDS,theme))throw Error('Choose a hall.');const next=this.get();delete next.themes[theme];writeJson(this.file,next);this.data=next;return this.get();}
}
