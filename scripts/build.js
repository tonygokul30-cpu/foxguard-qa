import {mkdir,copyFile} from 'node:fs/promises';
// Only public assets enter the static output; never copy env files or lead data.
await mkdir('dist',{recursive:true});
for(const file of ['index.html','app.js','config.js','style.css','polish.css','preview.js','fox.svg','terms.html','privacy.html','shipping.html','contact.html','cancellation-refunds.html'])await copyFile(file,`dist/${file}`);
