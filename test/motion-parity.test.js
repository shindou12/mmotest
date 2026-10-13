import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { poseHashes,skillTraces } from './motion-parity-utils.js';
const baseline=JSON.parse(fs.readFileSync(new URL('./fixtures/motion-parity.json',import.meta.url),'utf8'));
test('refactored motion preserves all six weapons, four styles, and every sampled pose',()=>{
 const actual=poseHashes();for(const [key,hash] of Object.entries(baseline.poses))assert.equal(actual[key],hash,key);
});
test('refactored skill timing preserves damage, effects, dashes and every scheduled event',()=>{
 assert.deepEqual(skillTraces(),baseline.skills);
});
