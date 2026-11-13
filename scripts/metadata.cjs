'use strict';
const fs=require('node:fs'),path=require('node:path');
function render(root){const identity=JSON.parse(fs.readFileSync(path.join(root,'identity.json'),'utf8'));if(identity.id!=='scholarmarker@xino-rofi.github.io'||identity.host!=='10.0.8'||identity.os!=='WINNT'||identity.policyVersion!==1||identity.updateURL!=='https://scholarmarker.invalid/r2-no-updates.json'||identity.updates!=='DISABLED_INTERNAL_NO_CHANNEL')throw Error('UNAPPROVED_IDENTITY_OR_CHANNEL');if(!/^0\.9\.4beta[1-9]\d*$/.test(identity.version))throw Error('PUBLIC_BETA_VERSION_REQUIRED');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'templates/manifest.json'),'utf8'));manifest.version=identity.version;manifest.applications.zotero.id=identity.id;manifest.applications.gecko.id=identity.id;manifest.applications.zotero.update_url=identity.updateURL;
const bootstrap=fs.readFileSync(path.join(root,'templates/bootstrap.js.txt'),'utf8').replace('@@IDENTITY@@',JSON.stringify(identity));if(bootstrap.includes('@@IDENTITY@@'))throw Error('TEMPLATE_IDENTITY');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'templates/package.json'),'utf8'));pkg.version=identity.version;pkg.scholarmarker=identity;return {identity,files:{'addon/manifest.json':JSON.stringify(manifest,null,2)+'\n','addon/bootstrap.js':bootstrap,'package.json':JSON.stringify(pkg,null,2)+'\n'}};}
if(require.main===module){const root=path.resolve(__dirname,'..'),result=render(root);for(const [name,text]of Object.entries(result.files))fs.writeFileSync(path.join(root,name),text);}
module.exports={render};
