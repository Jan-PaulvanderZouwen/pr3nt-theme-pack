import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const serverPath = path.resolve('src/server.js');
let source = await readFile(serverPath, 'utf8');

const importLine = "import { registerStatusMailRoutes } from './statusmails.js';";
if (!source.includes(importLine)) {
  source = source.replace(
    "import { registerPortalDomFixRoutes } from './portaldomfix.js';",
    "import { registerPortalDomFixRoutes } from './portaldomfix.js';\n" + importLine
  );
}

const registerLine = 'registerStatusMailRoutes(app);';
if (!source.includes(registerLine)) {
  source = source.replace(
    'registerAdminRoutes(app);',
    'registerAdminRoutes(app);\n' + registerLine
  );
}

await writeFile(serverPath, source);
console.log('Statusmail middleware enabled in src/server.js');
