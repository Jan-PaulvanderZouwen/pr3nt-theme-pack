import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const filePath = path.resolve('src/portaldomfix.js');
let source = await readFile(filePath, 'utf8');

const marker = '/* pr3nt equal grid spacing */';
const spacingCss = String.raw`
    /* pr3nt equal grid spacing */
    :root{--pr3nt-grid-gap:20px}
    .grid,
    .project-info-grid,
    .self-grid.pr3nt-managed-selfservice,
    .preview-messages-grid{
      gap:var(--pr3nt-grid-gap)!important;
      column-gap:var(--pr3nt-grid-gap)!important;
      row-gap:var(--pr3nt-grid-gap)!important;
    }
    .project-info-grid,
    .preview-messages-grid{
      margin-top:var(--pr3nt-grid-gap)!important;
    }
    .self-grid.pr3nt-managed-selfservice{
      margin-top:var(--pr3nt-grid-gap)!important;
      margin-bottom:var(--pr3nt-grid-gap)!important;
    }
    @media(max-width:850px){
      :root{--pr3nt-grid-gap:16px}
    }
`;

if (!source.includes(marker)) {
  const needle = '  </style>`;';
  if (!source.includes(needle)) {
    throw new Error('Kon het einde van de portal CSS niet vinden in src/portaldomfix.js');
  }
  source = source.replace(needle, `${spacingCss}\n  </style>\`;`);
}

await writeFile(filePath, source);
console.log('Portal grid spacing normalized.');
