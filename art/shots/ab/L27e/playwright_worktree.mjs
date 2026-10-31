import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import * as playwright from 'file:///C:/Users/shind/AppData/Local/Programs/node22/node_modules/playwright/index.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, '../../../..');
const PUBLIC = path.join(ROOT, 'public');
const THREE = 'C:/Users/shind/mmotest/node_modules/three';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.glb': 'model/gltf-binary' };

const chromium = new Proxy(playwright.chromium, {
  get(target, property) {
    if (property !== 'launch') return Reflect.get(target, property, target);
    return async (...args) => {
      const browser = await target.launch(...args);
      const newPage = browser.newPage.bind(browser);
      browser.newPage = async (...pageArgs) => {
        const page = await newPage(...pageArgs);
        await page.route('http://localhost:8091/**', async (route) => {
          const url = new URL(route.request().url());
          const vendor = url.pathname.startsWith('/vendor/three/');
          const base = path.resolve(vendor ? THREE : PUBLIC);
          const relative = vendor ? url.pathname.slice('/vendor/three/'.length) : decodeURIComponent(url.pathname.slice(1));
          const file = path.resolve(base, relative);
          if (file !== base && !file.startsWith(base + path.sep)) {
            console.log('ROUTE ESCAPE', url.href, file);
            return route.fulfill({ status: 404, body: 'not found' });
          }
          try {
            return route.fulfill({ status: 200, contentType: TYPES[path.extname(file)] || 'application/octet-stream', body: await readFile(file) });
          } catch (error) {
            console.log('ROUTE MISS', url.href, file, String(error));
            return route.fulfill({ status: 404, body: 'not found' });
          }
        });
        page.on('response', (response) => { if (response.status() >= 400) console.log('HTTP ERROR', response.status(), response.url()); });
        page.on('console', (message) => { if (message.type() === 'error') console.log('BROWSER ERROR', message.text()); });
        return page;
      };
      return browser;
    };
  },
});

export { chromium };
