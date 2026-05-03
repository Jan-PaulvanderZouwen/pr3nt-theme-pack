import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const serverPath = path.resolve('src/server.js');
let source = await readFile(serverPath, 'utf8');

const removals = [
  "import { registerPortalFixRoutes } from './portalfixes.js';\n",
  "import { registerPortalUxLiteRoutes } from './portalux-lite.js';\n",
  'registerPortalFixRoutes(app);\n',
  'registerPortalUxLiteRoutes(app);\n',
];

for (const item of removals) {
  source = source.replaceAll(item, '');
}

if (!source.includes("import { registerStatusMailRoutes } from './statusmails.js';")) {
  source = source.replace(
    "import { registerPortalDomFixRoutes } from './portaldomfix.js';\n",
    "import { registerPortalDomFixRoutes } from './portaldomfix.js';\nimport { registerStatusMailRoutes } from './statusmails.js';\n"
  );
}

if (!source.includes('registerStatusMailRoutes(app);')) {
  source = source.replace('registerAdminRoutes(app);', 'registerStatusMailRoutes(app);\nregisterAdminRoutes(app);');
}

const correctOrder = [
  'registerStatusMailRoutes(app);',
  'registerAdminRoutes(app);',
  'registerPortalDomFixRoutes(app);',
  'registerSelfServiceRoutes(app);',
  'registerPortalRoutes(app);',
];

for (const line of correctOrder) {
  source = source.replaceAll(line + '\n', '');
  source = source.replaceAll(line, '');
}

source = source.replace(
  "app.get('/files/:quoteId/:fileName'",
  correctOrder.join('\n') + "\n\napp.get('/files/:quoteId/:fileName'"
);

await writeFile(serverPath, source);
console.log('Portal middleware cleanup complete. Active order:');
for (const line of correctOrder) console.log(' - ' + line);
