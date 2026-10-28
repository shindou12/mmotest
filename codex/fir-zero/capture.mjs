import { chromium } from 'file:///C:/Users/shind/AppData/Local/Programs/node22/node_modules/playwright/index.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
const port = process.argv[2] || '8172';
const out = `codex/fir-zero/shots/${port}`; mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true}), errors=[];
try {
  const page=await browser.newPage({viewport:{width:1680,height:1080}});
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()}: ${r.url()}`)});
  page.on('requestfailed',r=>errors.push(`${r.failure()?.errorText}: ${r.url()}`));
  await page.goto(`http://127.0.0.1:${port}/codex/fir-zero/`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.__firZeroReady);
  await page.evaluate(()=>window.__firZeroPause=true);
  const canvas=page.locator('#stage canvas');
  const shot=async n=>{await page.evaluate(()=>window.__firZero.renderer.render(window.__firZero.scene,window.__firZero.camera));await canvas.screenshot({path:`${out}/${n}.png`})};
  await shot('front'); await page.screenshot({path:`${out}/comparison.png`,fullPage:true});
  const box=await canvas.boundingBox();
  for(const n of ['right','back','left']){
    await page.mouse.move(box.x+70,box.y+box.height/2);await page.mouse.down();
    await page.mouse.move(box.x+327,box.y+box.height/2,{steps:20});await page.mouse.up();await shot(n);
  }
  await page.getByRole('button',{name:'真上',exact:true}).click();await shot('top');
  await page.getByRole('button',{name:'横',exact:true}).click();await shot('low');
  const tris=await page.evaluate(()=>window.__firZero.tris);
  writeFileSync(`${out}/log.json`,JSON.stringify({tris,errors,views:6},null,2));
  console.log(`FIR_ZERO_CHECK views=6; triangles=${tris}; PAGE_ERRORS=${JSON.stringify(errors)}`);
  if(errors.length)throw new Error('読み込みエラーがあります');
} finally {await browser.close()}
