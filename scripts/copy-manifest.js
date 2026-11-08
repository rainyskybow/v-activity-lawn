import fs from 'fs';
import path from 'path';

const srcManifest = path.resolve('public/manifest.json');
const destManifest = path.resolve('dist/manifest.json');

if (fs.existsSync(srcManifest)) {
  fs.copyFileSync(srcManifest, destManifest);
  console.log('[v-activity-lawn] manifest.json successfully placed in dist/.');
}
