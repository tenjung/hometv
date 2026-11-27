// Export reviewed source snapshots without publishing private deployment history.
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const git=(args)=>execFileSync('git',args,{encoding:'utf8',windowsHide:true}).trim();
const destination='https://github.com/tenjung/hometv.git';
if(git(['remote','get-url','origin'])!==destination)throw new Error('The origin remote must point to tenjung/hometv.');
if(git(['status','--porcelain']))throw new Error('Commit the source changes before syncing GitHub.');
const localConfig=JSON.parse(readFileSync('.openai/hosting.json','utf8'));
const tree=git(['rev-parse','HEAD^{tree}']);
const remote=git(['ls-remote','--heads','origin','refs/heads/main']);
let parent;
if(remote){
  git(['fetch','--no-tags','origin','refs/heads/main']);
  parent=git(['rev-parse','FETCH_HEAD']);
  const remoteConfig=JSON.parse(git(['show',parent+':.openai/hosting.json']));
  if(remoteConfig.project_id!==localConfig.project_id)throw new Error('The GitHub repository contains a different project; no history was replaced.');
  if(git(['rev-parse',parent+'^{tree}'])===tree){console.log('GitHub already matches the source.');process.exit(0);}
}
const commit=git(['commit-tree',tree,...(parent?['-p',parent]:[]),'-m',parent?'Update HomeTV source':'Initial HomeTV source']);
git(['push','origin',commit+':refs/heads/main']);
git(['update-ref','refs/heads/github-main',commit]);
git(['update-ref','refs/remotes/origin/main',commit]);
git(['branch','--set-upstream-to=origin/main','github-main']);
console.log('GitHub main synchronized: '+commit);
