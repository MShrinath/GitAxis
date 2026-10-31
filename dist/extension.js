"use strict";var at=Object.create;var ee=Object.defineProperty;var nt=Object.getOwnPropertyDescriptor;var ct=Object.getOwnPropertyNames;var lt=Object.getPrototypeOf,dt=Object.prototype.hasOwnProperty;var mt=(d,e)=>{for(var t in e)ee(d,t,{get:e[t],enumerable:!0})},Ue=(d,e,t,i)=>{if(e&&typeof e=="object"||typeof e=="function")for(let r of ct(e))!dt.call(d,r)&&r!==t&&ee(d,r,{get:()=>e[r],enumerable:!(i=nt(e,r))||i.enumerable});return d};var k=(d,e,t)=>(t=d!=null?at(lt(d)):{},Ue(e||!d||!d.__esModule?ee(t,"default",{value:d,enumerable:!0}):t,d)),ut=d=>Ue(ee({},"__esModule",{value:!0}),d);var vt={};mt(vt,{activate:()=>bt,deactivate:()=>yt});module.exports=ut(vt);var $=k(require("vscode"));var $e=class{storeMap=new Map;async get(e){return this.storeMap.get(e)}async store(e,t){this.storeMap.set(e,t)}async delete(e){this.storeMap.delete(e)}},te=class{storage;constructor(e){this.storage=e??new $e}setStorage(e){this.storage=e}getSecretKey(e,t){return`gitaxis.profile.${e}.${t}`}async getSecret(e,t){let i=this.getSecretKey(e,t);return this.storage.get(i)}async setSecret(e,t,i){let r=this.getSecretKey(e,t);await this.storage.store(r,i)}async deleteSecret(e,t){let i=this.getSecretKey(e,t);await this.storage.delete(i)}async deleteAllForProfile(e){let t=["github-token","oauth-access-token","oauth-refresh-token","ssh-passphrase"];for(let i of t)await this.deleteSecret(e,i)}};var Fe=k(require("crypto"));var oe=k(require("os")),De=k(require("path")),G=class{static isWindows(){return oe.platform()==="win32"}static isMacOS(){return oe.platform()==="darwin"}static isLinux(){return oe.platform()==="linux"}static normalizePath(e){return De.normalize(e).replace(/\\/g,"/")}};var Re=class{map=new Map;get(e,t){return this.map.has(e)?this.map.get(e):t}async update(e,t){t===void 0?this.map.delete(e):this.map.set(e,t)}},ie=class d{static PROFILES_KEY="gitaxis.profiles";static ACTIVE_PROFILE_KEY="gitaxis.activeProfileId";static ASSOCIATIONS_KEY="gitaxis.repoAssociations";memento;constructor(e){this.memento=e??new Re}setMemento(e){this.memento=e}generateId(){return`profile_${Fe.randomUUID().replace(/-/g,"").slice(0,10)}`}async list(){let e=this.memento.get(d.PROFILES_KEY,[]);return Array.isArray(e)?e:[]}async get(e){return(await this.list()).find(i=>i.id===e)}async getByName(e){return(await this.list()).find(i=>i.name.toLowerCase()===e.toLowerCase())}async create(e){let t=await this.list();if(t.find(n=>n.name.toLowerCase()===e.name.toLowerCase()))throw new Error(`Profile with name "${e.name}" already exists`);let r=new Date().toISOString(),o=e.id??this.generateId(),s={id:o,name:e.name.trim(),git:{name:e.git.name.trim(),email:e.git.email.trim(),scope:e.git.scope??"local"},github:e.github?{host:e.github.host?.trim()||"github.com",username:e.github.username.trim()}:void 0,authentication:{type:e.authentication.type,source:e.authentication.source,sshKeyPath:e.authentication.sshKeyPath?.trim()||void 0,secretRef:e.authentication.type==="pat"?{provider:"vscode-secret-storage",key:`gitaxis.profile.${o}.github-token`}:void 0},metadata:{source:e.source??"manual",imported:e.imported??!1,description:e.description},createdAt:r,updatedAt:r};return t.push(s),await this.memento.update(d.PROFILES_KEY,t),await this.getActive()||await this.setActive(o),s}async update(e,t){let i=await this.list(),r=i.findIndex(a=>a.id===e);if(r===-1)throw new Error(`Profile with ID "${e}" not found`);let o=i[r];if(t.name&&t.name.toLowerCase()!==o.name.toLowerCase()&&i.find(n=>n.id!==e&&n.name.toLowerCase()===t.name?.toLowerCase()))throw new Error(`Profile with name "${t.name}" already exists`);let s={...o,name:t.name?t.name.trim():o.name,git:{...o.git,...t.git?.name?{name:t.git.name.trim()}:{},...t.git?.email?{email:t.git.email.trim()}:{},...t.git?.scope?{scope:t.git.scope}:{}},github:t.github!==void 0?t.github.username!==void 0&&!t.github.username.trim()?void 0:{host:t.github.host?.trim()||o.github?.host||"github.com",username:t.github.username?t.github.username.trim():o.github?.username||""}:o.github,authentication:{...o.authentication,...t.authentication?.type?{type:t.authentication.type}:{},...t.authentication?.source?{source:t.authentication.source}:{},...t.authentication?.sshKeyPath!==void 0?{sshKeyPath:t.authentication.sshKeyPath.trim()||void 0}:{}},metadata:{...o.metadata,...t.description!==void 0?{description:t.description}:{}},updatedAt:new Date().toISOString()};return i[r]=s,await this.memento.update(d.PROFILES_KEY,i),s}async delete(e){let t=await this.list();if(!t.some(a=>a.id===e))return;t=t.filter(a=>a.id!==e),await this.memento.update(d.PROFILES_KEY,t);let r=await this.getActive();if(r&&r.id===e){let a=t[0]?.id;await this.memento.update(d.ACTIVE_PROFILE_KEY,a)}let o=await this.getAllAssociations(),s=!1;for(let a of Object.keys(o))o[a]===e&&(delete o[a],s=!0);s&&await this.memento.update(d.ASSOCIATIONS_KEY,o)}async setActive(e){if(!await this.get(e))throw new Error(`Cannot activate non-existent profile "${e}"`);await this.memento.update(d.ACTIVE_PROFILE_KEY,e);let i=await this.list(),r=i.findIndex(o=>o.id===e);r!==-1&&(i[r].metadata.lastUsedAt=new Date().toISOString(),await this.memento.update(d.PROFILES_KEY,i))}async getActive(){let e=this.memento.get(d.ACTIVE_PROFILE_KEY);return e?this.get(e):(await this.list())[0]}async getAssociation(e){let t=G.normalizePath(e);return(await this.getAllAssociations())[t]}async setAssociation(e,t){let i=G.normalizePath(e),r=await this.getAllAssociations();r[i]=t,await this.memento.update(d.ASSOCIATIONS_KEY,r)}async removeAssociation(e){let t=G.normalizePath(e),i=await this.getAllAssociations();delete i[t],await this.memento.update(d.ASSOCIATIONS_KEY,i)}async getAllAssociations(){let e=this.memento.get(d.ASSOCIATIONS_KEY,{});return typeof e=="object"&&e!==null?{...e}:{}}};var Le=require("child_process"),Ne=require("util");var q=class{static parse(e,t,i){let r=t||i||"",o=this.parseUrl(r);return{name:e,fetchUrl:t,pushUrl:i,host:o?.host,owner:o?.owner,repository:o?.repository}}static parseUrl(e){if(!e)return;let t=e.trim(),i=/^git@([^:]+):([^\/]+)\/(.+?)(?:\.git)?$/i.exec(t);if(i)return{host:i[1],owner:i[2],repository:i[3]};try{let r=new URL(t.includes("://")?t:`https://${t}`),s=r.pathname.replace(/^\//,"").replace(/\.git$/,"").split("/");if(s.length>=2)return{host:r.hostname,owner:s[0],repository:s.slice(1).join("/")}}catch{}}};var W=class{static parseStatus(e){let t=0,i=0,r=0,o=0,s=0,a=0,n=e.split(`
`);for(let l of n){let m=l.trimEnd();if(m){if(m.startsWith("#")){if(m.startsWith("# branch.ab ")){let p=/\+(\d+)\s+-(\d+)/.exec(m);p&&(s=parseInt(p[1],10),a=parseInt(p[2],10))}continue}if(m.startsWith("? "))r++;else if(m.startsWith("u ")||m.startsWith("1 U")||m.startsWith("2 U"))o++;else if(m.startsWith("1 ")||m.startsWith("2 ")){let g=m.split(" ")[1];g&&g.length>=2&&(g[0]!=="."&&t++,g[1]!=="."&&i++)}else if(m.length>=2){let p=m[0],g=m[1];p==="?"&&g==="?"?r++:p==="U"||g==="U"||p==="A"&&g==="A"||p==="D"&&g==="D"?o++:(p!==" "&&p!=="?"&&t++,g!==" "&&g!=="?"&&i++)}}}return{clean:t===0&&i===0&&r===0&&o===0,staged:t,modified:i,untracked:r,conflicted:o,ahead:s,behind:a}}static parseRemotes(e){let t=new Map,i=e.split(`
`);for(let o of i){let s=o.trim();if(!s)continue;let a=s.split(/\s+/);if(a.length>=3){let n=a[0],c=a[1],l=a[2],m=t.get(n)||{};l.includes("fetch")?m.fetchUrl=c:l.includes("push")&&(m.pushUrl=c),t.set(n,m)}}let r=[];for(let[o,s]of t.entries())r.push(q.parse(o,s.fetchUrl,s.pushUrl));return r}};var re=class{static parseBranchList(e){let t=e.split(`
`),i=[];for(let r of t){let o=r.trim();if(!o)continue;let s=o.startsWith("*"),a=o.replace(/^\*\s*/,"").trim();i.push({name:a,isCurrent:s})}return i}};var se=class{static parseLog(e){let t=[],i=e.split("").filter(r=>r.trim().length>0);for(let r of i){let o=r.trim().split("");o.length>=5&&t.push({hash:o[0].trim(),shortHash:o[0].trim().slice(0,7),author:o[1].trim(),email:o[2].trim(),date:o[3].trim(),message:o[4].trim()})}return t}};var ae=class{static parseStashList(e){let t=e.split(`
`),i=[];for(let r of t){let o=r.trim();if(!o)continue;let s=/^stash@\{(\d+)\}:\s*(.+)$/.exec(o);s&&i.push({index:parseInt(s[1],10),ref:`stash@{${s[1]}}`,message:s[2].trim()})}return i}};var ne=class{static parseTagList(e){return e.split(`
`).map(t=>t.trim()).filter(t=>t.length>0).map(t=>({name:t}))}};var Me=class d{static instance;prefix="[GitAxis]";static getInstance(){return d.instance||(d.instance=new d),d.instance}sanitize(e){return e.replace(/ghp_[A-Za-z0-9_]{36,}/g,"ghp_***[REDACTED]").replace(/github_pat_[A-Za-z0-9_]{40,}/g,"github_pat_***[REDACTED]").replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi,"Bearer ***[REDACTED]").replace(/password[:=]\s*[^\s,]+/gi,"password=***[REDACTED]")}info(e,...t){console.log(`${this.prefix} ${this.sanitize(e)}`,...t)}warn(e,...t){console.warn(`${this.prefix} [WARN] ${this.sanitize(e)}`,...t)}error(e,t){console.error(`${this.prefix} [ERROR] ${this.sanitize(e)}`,t)}debug(e,...t){console.debug(`${this.prefix} [DEBUG] ${this.sanitize(e)}`,...t)}},P=Me.getInstance();var pt=(0,Ne.promisify)(Le.execFile),ce=class{constructor(e="git"){this.gitPath=e}async exec(e,t={}){try{let i=await pt(this.gitPath,e,{cwd:t.cwd,timeout:t.timeout??3e4,env:{...process.env,...t.env||{},LANG:"C",LC_ALL:"C"}});return{stdout:i.stdout.trim(),stderr:i.stderr.trim()}}catch(i){let r=i,o=r.stdout?.trim()||"",s=r.stderr?.trim()||r.message||"";throw P.error(`Git command failed: ${this.gitPath} ${e.join(" ")}: ${s}`),new Error(s||o||`Git process exited with code ${r.code}`)}}async isGitAvailable(){try{return await this.exec(["--version"],{timeout:3e3}),!0}catch{return!1}}async getVersion(){let{stdout:e}=await this.exec(["--version"]);return e}async isRepository(e){try{let{stdout:t}=await this.exec(["rev-parse","--is-inside-work-tree"],{cwd:e});return t==="true"}catch{return!1}}async getRoot(e){let{stdout:t}=await this.exec(["rev-parse","--show-toplevel"],{cwd:e});return t}async getCurrentBranch(e){try{let{stdout:t}=await this.exec(["branch","--show-current"],{cwd:e});if(t)return t}catch{}try{let{stdout:t}=await this.exec(["rev-parse","--abbrev-ref","HEAD"],{cwd:e});return t}catch{return"HEAD"}}async status(e){try{let{stdout:t}=await this.exec(["status","--porcelain=v2","--branch"],{cwd:e});return W.parseStatus(t)}catch{let{stdout:t}=await this.exec(["status","--porcelain"],{cwd:e});return W.parseStatus(t)}}async diff(e,t,i){let r=["diff"];t&&r.push("--staged"),i&&r.push("--",i);let{stdout:o}=await this.exec(r,{cwd:e});return o}async add(e,t,i){let r=["add"];i?r.push("-A"):t.length>0?r.push("--",...t):r.push("."),await this.exec(r,{cwd:e})}async restore(e,t,i){let r=["restore"];i&&r.push("--staged"),r.push("--",...t),await this.exec(r,{cwd:e})}async commit(e,t,i,r){let o=["commit","-m",t];i&&o.push("--amend"),r&&o.push("--signoff");let{stdout:s}=await this.exec(o,{cwd:e});return s}async amend(e,t,i){let r=["commit","--amend"];i?r.push("--no-edit"):t&&r.push("-m",t);let{stdout:o}=await this.exec(r,{cwd:e});return o}async getBranches(e){let{stdout:t}=await this.exec(["branch","--list"],{cwd:e});return re.parseBranchList(t)}async createBranch(e,t,i,r){if(r){let o=["checkout","-b",t];i&&o.push(i),await this.exec(o,{cwd:e})}else{let o=["branch",t];i&&o.push(i),await this.exec(o,{cwd:e})}}async deleteBranch(e,t,i){let r=["branch",i?"-D":"-d",t];await this.exec(r,{cwd:e})}async renameBranch(e,t,i){await this.exec(["branch","-m",t,i],{cwd:e})}async checkout(e,t,i){let r=["checkout"];i&&r.push("-b"),r.push(t),await this.exec(r,{cwd:e})}async switchBranch(e,t,i){let r=["switch"];i&&r.push("-c"),r.push(t),await this.exec(r,{cwd:e})}async merge(e,t,i,r){let o=["merge"];i&&o.push("--no-ff"),r&&o.push("--squash"),o.push(t);let{stdout:s}=await this.exec(o,{cwd:e});return s}async rebase(e,t){let i=["rebase",t],{stdout:r}=await this.exec(i,{cwd:e});return r}async fetch(e,t="origin",i,r){let o=["fetch",t];i&&o.push("--prune"),r&&o.push("--tags");let{stdout:s,stderr:a}=await this.exec(o,{cwd:e});return s||a}async pull(e,t,i,r){let o=["pull"];r&&o.push("--rebase"),t&&o.push(t),i&&o.push(i);let{stdout:s,stderr:a}=await this.exec(o,{cwd:e});return s||a}async push(e,t="origin",i,r,o,s,a){let n=["push"];r&&n.push("-u"),o?n.push("--force"):s&&n.push("--force-with-lease"),a&&n.push("--tags"),n.push(t),i&&n.push(i);let{stdout:c,stderr:l}=await this.exec(n,{cwd:e});return c||l}async stash(e,t,i){let r=["stash","push"];i&&r.push("-u"),t&&r.push("-m",t);let{stdout:o}=await this.exec(r,{cwd:e});return o}async stashApply(e,t="stash@{0}"){let{stdout:i}=await this.exec(["stash","apply",t],{cwd:e});return i}async stashPop(e,t="stash@{0}"){let{stdout:i}=await this.exec(["stash","pop",t],{cwd:e});return i}async stashDrop(e,t="stash@{0}"){let{stdout:i}=await this.exec(["stash","drop",t],{cwd:e});return i}async getStashList(e){let{stdout:t}=await this.exec(["stash","list"],{cwd:e});return ae.parseStashList(t)}async createTag(e,t,i,r){let o=["tag"];r?o.push("-a",t,"-m",r):o.push(t),i&&o.push(i),await this.exec(o,{cwd:e})}async deleteTag(e,t){await this.exec(["tag","-d",t],{cwd:e})}async getTags(e){let{stdout:t}=await this.exec(["tag","-l"],{cwd:e});return ne.parseTagList(t)}async getRemotes(e){let{stdout:t}=await this.exec(["remote","-v"],{cwd:e});return W.parseRemotes(t)}async addRemote(e,t,i){await this.exec(["remote","add",t,i],{cwd:e})}async removeRemote(e,t){await this.exec(["remote","remove",t],{cwd:e})}async setRemoteUrl(e,t,i,r){let o=["remote","set-url"];r&&o.push("--push"),o.push(t,i),await this.exec(o,{cwd:e})}async log(e,t=20,i,r){let o=["log",`-n${t}`,"--format=%H%x1f%an%x1f%ae%x1f%aI%x1f%s%x1e"];i&&o.push(i),r&&o.push("--",r);let{stdout:s}=await this.exec(o,{cwd:e});return se.parseLog(s)}async blame(e,t,i,r){let o=["blame"];i&&r&&o.push(`-L${i},${r}`),o.push("--",t);let{stdout:s}=await this.exec(o,{cwd:e});return s}async reset(e,t,i){let r=["reset",`--${i}`,t];await this.exec(r,{cwd:e})}async clone(e,t,i,r){let o=["clone"];i&&o.push("-b",i),r&&o.push("--depth",r.toString()),o.push(e,t),await this.exec(o)}async init(e,t){let i=["init"];t&&i.push("--bare"),i.push(e),await this.exec(i)}async getLocalConfig(e,t){try{let{stdout:i}=await this.exec(["config","--local","--get",t],{cwd:e});return i||void 0}catch{return}}async setLocalConfig(e,t,i){await this.exec(["config","--local",t,i],{cwd:e})}async unsetLocalConfig(e,t){try{await this.exec(["config","--local","--unset-all",t],{cwd:e})}catch{}}async getGlobalConfig(e){try{let{stdout:t}=await this.exec(["config","--global","--get",e]);return t||void 0}catch{return}}async setGlobalConfig(e,t){await this.exec(["config","--global",e,t])}async unsetGlobalConfig(e){try{await this.exec(["config","--global","--unset-all",e])}catch{}}};var le=class{constructor(e){this.secretStore=e}async getToken(e){return this.secretStore.getSecret(e,"github-token")}async setToken(e,t){await this.secretStore.setSecret(e,"github-token",t.trim())}async deleteToken(e){await this.secretStore.deleteSecret(e,"github-token")}};var He=require("child_process"),qe=require("util"),Te=(0,qe.promisify)(He.execFile),de=class{async isAvailable(){try{return await Te("gh",["--version"],{timeout:3e3}),!0}catch{return!1}}async getToken(e){try{let t=["auth","token"];e&&t.push("--hostname",e);let{stdout:i}=await Te("gh",t,{timeout:5e3}),r=i.trim();return r.length>0?r:void 0}catch{return}}async getStatus(){try{let{stdout:e,stderr:t}=await Te("gh",["auth","status"],{timeout:5e3}),i=`${e}
${t}`;return{loggedIn:i.includes("Logged in to"),rawOutput:i}}catch(e){let t=String(e.stderr||e.stdout||"");return{loggedIn:t.includes("Logged in to"),rawOutput:t}}}};var We=require("child_process"),ze=require("util"),gt=(0,ze.promisify)(We.execFile),me=class{async isConfigured(){try{let{stdout:e}=await gt("git",["config","--global","--get-all","credential.helper"],{timeout:3e3}),t=e.toLowerCase();return t.includes("manager")||t.includes("gcm")}catch{return!1}}};var ue=class{constructor(e,t,i,r){this.secretStore=e;this.patAuth=t??new le(this.secretStore),this.ghCliAuth=i??new de,this.credManagerAuth=r??new me}patAuth;ghCliAuth;credManagerAuth;getSecretStore(){return this.secretStore}getPatAuth(){return this.patAuth}getGhCliAuth(){return this.ghCliAuth}async resolveAuthentication(e){let t=e.authentication.type,i=e.github?.username||e.git.name,r=e.github?.host||"github.com";switch(t){case"pat":{let o=await this.patAuth.getToken(e.id);return o||P.warn(`No Personal Access Token found in secret store for profile ${e.id}`),{type:"pat",username:i,credential:o}}case"github-cli":{let o=await this.ghCliAuth.getToken(r);return{type:"github-cli",username:i,credential:o}}case"credential-manager":return{type:"credential-manager",username:i};case"ssh":return{type:"ssh",username:i};case"oauth":{let o=await this.secretStore.getSecret(e.id,"oauth-access-token");return{type:"oauth",username:i,credential:o}}case"none":default:return{type:"none",username:i}}}async saveTokenForProfile(e,t){await this.patAuth.setToken(e,t)}async clearAuthForProfile(e){await this.secretStore.deleteAllForProfile(e)}};var _e=k(require("os")),Ve=k(require("path"));var pe=class{constructor(e){this.profileStore=e}async match(e){let t=await this.profileStore.list();if(t.length===0)return{matches:[],confidence:"none",reasons:["no-match"]};if(e.repositoryPath){let s=await this.profileStore.getAssociation(e.repositoryPath);if(s){let a=t.find(n=>n.id===s);if(a){let n={profileId:a.id,score:100,reasons:["repository-association"]};return{recommendedProfileId:a.id,matches:[n],confidence:"exact",reasons:["repository-association"]}}}}let i=[];for(let s of t){let a=0,n=[];if(e.remotes&&e.remotes.length>0)for(let c of e.remotes)s.github?.host&&c.host&&s.github.host.toLowerCase()===c.host.toLowerCase()&&(a+=20,n.includes("github-host")||n.push("github-host")),s.github?.username&&c.owner&&s.github.username.toLowerCase()===c.owner.toLowerCase()&&(a+=45,n.includes("remote-owner")||n.push("remote-owner"));e.localGitEmail&&s.git.email&&e.localGitEmail.toLowerCase()===s.git.email.toLowerCase()&&(a+=25,n.push("git-email")),e.localGitName&&s.git.name&&e.localGitName.toLowerCase()===s.git.name.toLowerCase()&&(a+=10,n.push("git-name")),a>0&&i.push({profileId:s.id,score:Math.min(a,99),reasons:n})}if(i.sort((s,a)=>a.score-s.score),i.length===0)return{matches:[],confidence:"none",reasons:["no-match"]};let r=i[0],o="low";return r.score>=65?o="high":r.score>=35&&(o="medium"),{recommendedProfileId:r.profileId,matches:i,confidence:o,reasons:r.reasons}}};var ge=class{constructor(e,t,i,r){this.store=e;this.authManager=t;this.gitClient=i;this.matcher=r??new pe(this.store)}matcher;getStore(){return this.store}getMatcher(){return this.matcher}async getProfiles(){return this.store.list()}async getActiveProfile(){return this.store.getActive()}async getProfile(e){return this.store.get(e)}async createProfile(e,t){let i=await this.store.create(e);return t&&e.authentication.type==="pat"&&await this.authManager.saveTokenForProfile(i.id,t),P.info(`Profile created: ${i.name} (${i.id})`),i}async updateProfile(e,t,i){let r=await this.store.update(e,t);return i&&(t.authentication?.type==="pat"||r.authentication.type==="pat")&&await this.authManager.saveTokenForProfile(e,i),P.info(`Profile updated: ${r.name} (${e})`),r}async deleteProfile(e){await this.authManager.clearAuthForProfile(e),await this.store.delete(e),P.info(`Profile deleted: ${e}`)}getAuthManager(){return this.authManager}async switchProfile(e,t,i){let r=await this.store.get(e);if(!r)throw new Error(`Profile with id "${e}" does not exist`);return await this.store.setActive(e),(t||r.git.scope==="global")&&await this.applyIdentityToRepository(r,t,i),P.info(`Switched active profile to ${r.name}`),r}async applyIdentityToRepository(e,t,i){try{let r=!1,o=t;if(t)try{r=await this.gitClient.isRepository(t),r&&(o=await this.gitClient.getRoot(t))}catch{r=!1}if(e.git.scope==="global"){if(i&&!await i()){P.warn(`User cancelled global Git identity update for profile "${e.name}".`);return}await this.gitClient.setGlobalConfig("user.name",e.git.name),await this.gitClient.setGlobalConfig("user.email",e.git.email),P.info(`Applied global Git identity for profile ${e.name}`)}else r&&o&&(await this.gitClient.setLocalConfig(o,"user.name",e.git.name),await this.gitClient.setLocalConfig(o,"user.email",e.git.email),P.info(`Applied local Git identity to ${o} for profile ${e.name}`));let a=(e.github?.host?.trim()||"github.com").replace(/^https?:\/\//i,"").replace(/\/+$/,"")||"github.com",n=e.github?.username?.trim(),c=`credential.https://${a}.username`;if(n?(r&&o&&await this.gitClient.setLocalConfig(o,c,n),e.git.scope==="global"&&await this.gitClient.setGlobalConfig(c,n)):(r&&o&&(await this.gitClient.unsetLocalConfig(o,c),a.toLowerCase()!=="github.com"&&await this.gitClient.unsetLocalConfig(o,"credential.https://github.com.username")),e.git.scope==="global"&&(await this.gitClient.unsetGlobalConfig(c),a.toLowerCase()!=="github.com"&&await this.gitClient.unsetGlobalConfig("credential.https://github.com.username"))),r&&o){let m=`http.https://${a}/.extraheader`,p;if(e.authentication.type==="pat"&&(p=await this.authManager.getPatAuth().getToken(e.id)),p){let g=n||e.git.name?.trim()||"",u=g?`${g}:${p}`:`:${p}`,f=`AUTHORIZATION: basic ${Buffer.from(u).toString("base64")}`;await this.gitClient.setLocalConfig(o,m,f),P.info(`Configured PAT extraheader for ${a} on ${o}`)}else await this.gitClient.unsetLocalConfig(o,m),a.toLowerCase()!=="github.com"&&await this.gitClient.unsetLocalConfig(o,"http.https://github.com/.extraheader"),await this.gitClient.unsetLocalConfig(o,"http.extraheader"),P.info(`Unset PAT extraheader on ${o}`)}let l=e.authentication?.sshKeyPath?.trim();if(e.authentication.type==="ssh"&&l){let m=l;m.startsWith("~")&&(m=Ve.join(_e.homedir(),m.slice(1)));let p=G.normalizePath(m),g=l.startsWith("ssh ")?l:`ssh -i "${p}"`;r&&o&&await this.gitClient.setLocalConfig(o,"core.sshCommand",g),e.git.scope==="global"&&await this.gitClient.setGlobalConfig("core.sshCommand",g),P.info(`Configured core.sshCommand for profile ${e.name}`)}else r&&o&&await this.gitClient.unsetLocalConfig(o,"core.sshCommand"),e.git.scope==="global"&&await this.gitClient.unsetGlobalConfig("core.sshCommand"),P.info(`Unset core.sshCommand for non-SSH profile ${e.name}`);if(r&&o&&n){let m=await this.gitClient.getRemotes(o),p=a.toLowerCase(),g=p.split(":")[0];for(let u of m){let v=u.host?.toLowerCase(),f=v?v.split(":")[0]:void 0;if(v===p||f&&f===g){let x=!!u.fetchUrl&&(u.fetchUrl.startsWith("https://")||u.fetchUrl.startsWith("http://")),M=!!u.pushUrl&&(u.pushUrl.startsWith("https://")||u.pushUrl.startsWith("http://"));if(x||M){let U=u.fetchUrl||u.pushUrl||"",D=q.parseUrl(U),F=u.owner||D?.owner,_=u.repository||D?.repository,X=_?_.replace(/\.git$/,""):void 0,I=a;try{let E=new URL(U.includes("://")?U:`https://${U}`);E.port&&!a.includes(":")&&(I=`${E.hostname}:${E.port}`)}catch{}if(F&&X){let E=`https://${n}@${I}/${F}/${X}.git`;if(x&&u.fetchUrl!==E&&(await this.gitClient.setRemoteUrl(o,u.name,E),P.info(`Updated fetch remote URL for "${u.name}" to ${E}`)),M){let Ae=await this.gitClient.getLocalConfig(o,`remote.${u.name}.pushurl`);Ae&&Ae!==E?(await this.gitClient.setRemoteUrl(o,u.name,E,!0),P.info(`Updated push remote URL for "${u.name}" to ${E}`)):u.pushUrl&&u.pushUrl!==u.fetchUrl&&u.pushUrl!==E&&(await this.gitClient.setRemoteUrl(o,u.name,E,!0),P.info(`Updated push remote URL for "${u.name}" to ${E}`))}}}}}}}catch(r){throw P.error(`Failed to apply git identity to repository: ${String(r)}`),r}}async matchProfile(e){return this.matcher.match(e)}async associateRepository(e,t){await this.store.setAssociation(e,t)}async disassociateRepository(e){await this.store.removeAssociation(e)}async getAssociation(e){return this.store.getAssociation(e)}};var Ke=k(require("path"));var fe=class{constructor(e){this.gitClient=e}async detectRepository(e){if(!await this.gitClient.isRepository(e))return;let i=await this.gitClient.getRoot(e),r=G.normalizePath(i),o=Ke.basename(r),s=await this.gitClient.getCurrentBranch(r),a=await this.gitClient.getRemotes(r),n=await this.gitClient.status(r);return{id:`repo_${Buffer.from(r).toString("base64url").slice(0,12)}`,path:r,name:o,currentBranch:s,remotes:a,status:n}}};var he=class{constructor(e){this.gitClient=e}async detectInstallation(){return await this.gitClient.isGitAvailable()?{found:!0,version:await this.gitClient.getVersion(),path:"git"}:{found:!1}}async detectGlobalConfig(){let e=await this.gitClient.getGlobalConfig("user.name"),t=await this.gitClient.getGlobalConfig("user.email"),i=await this.gitClient.getGlobalConfig("init.defaultBranch"),r=[];try{let{stdout:o}=await this.gitClient.exec(["config","--global","--get-all","credential.helper"]);r=o.split(`
`).map(s=>s.trim()).filter(s=>s.length>0)}catch{}return{userName:e,userEmail:t,defaultBranch:i,credentialHelpers:r}}};var je=require("child_process"),Qe=require("util"),Ye=(0,Qe.promisify)(je.execFile),we=class{async detect(){try{let{stdout:e}=await Ye("gh",["--version"],{timeout:3e3}),t=e.split(`
`)[0]?.trim(),i=await this.detectAccounts();return{found:!0,version:t,accounts:i}}catch{return{found:!1,accounts:[]}}}async detectAccounts(){let e=[];try{let{stdout:t,stderr:i}=await Ye("gh",["auth","status"],{timeout:5e3}),o=`${t}
${i}`.split(`
`),s="github.com";for(let a of o){let n=a.trim(),c=/Logged in to ([a-zA-Z0-9\.\-]+)/i.exec(n);c&&(s=c[1]);let l=/account ([a-zA-Z0-9\-_]+)/i.exec(n);if(l){let m=l[1],p=n.includes("Active account: true")||n.includes("\u2713");e.push({host:s,username:m,active:p,authStatusOk:!0})}}}catch(t){let i=String(t.stderr||t.stdout||""),r=/account ([a-zA-Z0-9\-_]+)/i.exec(i);r&&e.push({host:"github.com",username:r[1],active:!0,authStatusOk:!0})}return e}};var be=class{constructor(e){this.gitClient=e}async detect(){let e=[];try{let{stdout:i}=await this.gitClient.exec(["config","--global","--get-all","credential.helper"]);for(let r of i.split(`
`)){let o=r.trim();o&&!e.includes(o)&&e.push(o)}}catch{}let t=e.some(i=>{let r=i.toLowerCase();return r.includes("manager")||r.includes("gcm")});return{helpers:e,hasGCM:t}}};var ye=class{gitDiscovery;ghCliDiscovery;credHelperDiscovery;constructor(e){this.gitDiscovery=new he(e),this.ghCliDiscovery=new we,this.credHelperDiscovery=new be(e)}async scan(){P.info("Starting non-invasive system configuration scan...");let[e,t,i,r]=await Promise.all([this.gitDiscovery.detectInstallation(),this.gitDiscovery.detectGlobalConfig(),this.ghCliDiscovery.detect(),this.credHelperDiscovery.detect()]),o={git:e,gitConfig:t,githubCli:i,credentialHelper:r,timestamp:new Date().toISOString()};return P.info("System configuration scan completed safely."),o}suggestProfiles(e){let t=[];if(e.githubCli.found&&e.githubCli.accounts.length>0)for(let i of e.githubCli.accounts)t.push({name:i.username,git:{name:e.gitConfig.userName||i.username,email:e.gitConfig.userEmail||`${i.username}@users.noreply.github.com`,scope:"local"},github:{host:i.host,username:i.username},authentication:{type:"github-cli",source:"github-cli"},source:"github-cli",imported:!0,description:`Discovered from GitHub CLI (${i.host})`});return e.gitConfig.userName&&e.gitConfig.userEmail&&(t.some(r=>r.git.email.toLowerCase()===e.gitConfig.userEmail?.toLowerCase())||t.push({name:"default",git:{name:e.gitConfig.userName,email:e.gitConfig.userEmail,scope:"local"},authentication:{type:e.credentialHelper.hasGCM?"credential-manager":"none",source:e.credentialHelper.hasGCM?"git-credential-manager":"system"},source:"system-discovery",imported:!0,description:"Discovered from global Git configuration"})),t}};var V=class{static assessSafety(e){let t=e.type,i=e.input;return t==="git.push"&&i.force?{safety:"destructive",confirmation:{required:!0,reason:"Force push can overwrite remote history.",warning:"Remote commits may be permanently lost."}}:t==="git.reset"&&i.mode==="hard"?{safety:"destructive",confirmation:{required:!0,reason:`git reset --hard ${i.ref}`,warning:"All uncommitted changes will be permanently discarded."}}:t==="git.branch.delete"&&i.force?{safety:"destructive",confirmation:{required:!0,reason:`Force delete branch "${i.name}"`,warning:"Unmerged commits on this branch will be lost."}}:t==="git.stash.drop"?{safety:"destructive",confirmation:{required:!0,reason:`Drop stash ${i.stash||"stash@{0}"}`,warning:"The stashed changes cannot be recovered."}}:t==="github.repository.delete"?{safety:"destructive",confirmation:{required:!0,reason:`Permanently delete GitHub repository "${i.owner}/${i.repository}"`,warning:"This action is irreversible."}}:["git.status","git.diff","git.log","git.blame","github.account.get","github.repository.get","github.repository.list","github.issue.list","github.pull-request.list","github.actions.list","github.release.list"].includes(t)?{safety:"read-only",confirmation:{required:!1}}:{safety:"mutating",confirmation:{required:!1}}}};var ve=class{promptFn;constructor(e){this.promptFn=e??(async(t,i)=>!0)}setPromptFn(e){this.promptFn=e}async requestConfirmation(e,t){let i=`\u26A0\uFE0F Destructive Operation: ${e}`;return this.promptFn(i,t)}};var Be=require("child_process"),Je=require("util");var Po=(0,Je.promisify)(Be.execFile),Pe=class{host;auth;constructor(e={}){this.host=e.host||"github.com",this.auth=e.auth}getBaseUrl(){return this.host==="github.com"?"https://api.github.com":`https://${this.host}/api/v3`}async request(e,t="GET",i){let r=`${this.getBaseUrl()}${e}`,o={Accept:"application/vnd.github.v3+json","User-Agent":"GitAxis-VSCode-Extension"};if(this.auth?.credential&&(o.Authorization=`token ${this.auth.credential}`),this.auth?.credential)try{let s=await fetch(r,{method:t,headers:o,body:i?JSON.stringify(i):void 0});if(!s.ok){let a=await s.text();throw new Error(`GitHub API error (${s.status}): ${a}`)}return await s.json()}catch(s){P.warn(`Direct fetch failed, checking fallback to gh CLI: ${String(s)}`)}try{let s=["api",e,"-X",t];this.host!=="github.com"&&s.push("--hostname",this.host),i&&s.push("--input","-");let a=(0,Be.execFile)("gh",s,{timeout:15e3,shell:process.platform==="win32"},()=>{});i&&a.stdin&&(a.stdin.write(JSON.stringify(i)),a.stdin.end());let{stdout:n}=await new Promise((c,l)=>{let m="",p="";a.stdout?.on("data",g=>m+=g),a.stderr?.on("data",g=>p+=g),a.on("error",g=>l(g)),a.on("close",g=>{g===0?c({stdout:m,stderr:p}):l(new Error(p||`gh api failed with code ${g}`))})});return JSON.parse(n)}catch(s){throw new Error(`GitHub request failed for ${e}: ${String(s)}`)}}async getCurrentUser(){return this.request("/user")}async listRepositories(e){let t=e?`/users/${e}/repos?per_page=100`:"/user/repos?per_page=100";return(await this.request(t)).map(r=>({id:r.id,name:r.name,fullName:r.full_name,private:r.private,htmlUrl:r.html_url,description:r.description,defaultBranch:r.default_branch}))}async getRepository(e,t){let i=await this.request(`/repos/${e}/${t}`);return{id:i.id,name:i.name,fullName:i.full_name,private:i.private,htmlUrl:i.html_url,description:i.description,defaultBranch:i.default_branch}}async createRepository(e,t,i=!1){let r=await this.request("/user/repos","POST",{name:e,description:t,private:i,auto_init:!0});return{id:r.id,name:r.name,fullName:r.full_name,private:r.private,htmlUrl:r.html_url,description:r.description,defaultBranch:r.default_branch}}async forkRepository(e,t){let i=await this.request(`/repos/${e}/${t}/forks`,"POST");return{id:i.id,name:i.name,fullName:i.full_name,private:i.private,htmlUrl:i.html_url,description:i.description,defaultBranch:i.default_branch}}async deleteRepository(e,t){await this.request(`/repos/${e}/${t}`,"DELETE")}async listIssues(e,t,i="open"){return(await this.request(`/repos/${e}/${t}/issues?state=${i}&per_page=50`)).filter(o=>!o.pull_request).map(o=>({id:o.id,number:o.number,title:o.title,state:o.state,htmlUrl:o.html_url,user:o.user?.login||"unknown",createdAt:o.created_at}))}async createIssue(e,t,i,r,o){let s=await this.request(`/repos/${e}/${t}/issues`,"POST",{title:i,body:r,labels:o});return{id:s.id,number:s.number,title:s.title,state:s.state,htmlUrl:s.html_url,user:s.user?.login||"unknown",createdAt:s.created_at}}async closeIssue(e,t,i){await this.request(`/repos/${e}/${t}/issues/${i}`,"PATCH",{state:"closed"})}async listPullRequests(e,t,i="open"){return(await this.request(`/repos/${e}/${t}/pulls?state=${i}&per_page=50`)).map(o=>({id:o.id,number:o.number,title:o.title,state:o.state,htmlUrl:o.html_url,user:o.user?.login||"unknown",headRef:o.head?.ref||"",baseRef:o.base?.ref||"",createdAt:o.created_at}))}async createPullRequest(e,t,i,r,o,s,a=!1){let n=await this.request(`/repos/${e}/${t}/pulls`,"POST",{title:i,head:r,base:o,body:s,draft:a});return{id:n.id,number:n.number,title:n.title,state:n.state,htmlUrl:n.html_url,user:n.user?.login||"unknown",headRef:n.head?.ref||"",baseRef:n.base?.ref||"",createdAt:n.created_at}}async mergePullRequest(e,t,i,r="merge",o){await this.request(`/repos/${e}/${t}/pulls/${i}/merge`,"PUT",{merge_method:r,commit_message:o})}async listActions(e,t){return((await this.request(`/repos/${e}/${t}/actions/runs?per_page=20`)).workflow_runs||[]).map(o=>({id:o.id,name:o.name||"Workflow Run",status:o.status,conclusion:o.conclusion,htmlUrl:o.html_url,headBranch:o.head_branch}))}async listReleases(e,t){return(await this.request(`/repos/${e}/${t}/releases?per_page=20`)).map(r=>({id:r.id,tagName:r.tag_name,name:r.name,htmlUrl:r.html_url,publishedAt:r.published_at}))}async createRelease(e,t,i,r,o,s=!1,a=!1){let n=await this.request(`/repos/${e}/${t}/releases`,"POST",{tag_name:i,name:r,body:o,draft:s,prerelease:a});return{id:n.id,tagName:n.tag_name,name:n.name,htmlUrl:n.html_url,publishedAt:n.published_at}}};var xe=class{constructor(e,t,i){this.profileManager=e;this.gitClient=t;this.confirmationHandler=i??new ve}history=[];confirmationHandler;profileMismatchPrompt;setProfileMismatchPrompt(e){this.profileMismatchPrompt=e}getConfirmationHandler(){return this.confirmationHandler}getHistoryRecords(){return[...this.history]}getHistory(){return this.history.map(e=>e.operation)}async validate(e){let t=[],i=[];(e.target.kind==="local-repository"||e.target.kind==="remote")&&(e.input.repositoryPath||t.push({code:"INVALID_INPUT",message:"Repository path is required for local git operations"}));let r=V.assessSafety(e),o=r.confirmation.required,s=r.confirmation.required?r.confirmation.reason:void 0,a=r.confirmation.required?r.confirmation.warning:void 0;return{valid:t.length===0,errors:t,warnings:i,confirmationRequired:o,confirmationReason:s,confirmationWarning:a}}async cancel(e){let t=this.history.find(i=>i.operation.id===e);t&&t.state==="executing"&&(t.state="cancelled")}async execute(e){let t=new Date().toISOString(),i=Date.now(),r=[],o={operation:e,state:"validating"};this.history.unshift(o);try{let s=await this.validate(e);if(!s.valid){let g=s.errors.map(u=>u.message).join("; ");return this.createErrorResult(e.id,"INVALID_INPUT",g,"Operation input validation failed",t,o)}let a;if(e.profileId&&(a=await this.profileManager.getProfile(e.profileId)),a||(a=await this.profileManager.getActiveProfile()),a&&a.github?.username&&e.target.kind==="remote"){let g=e.input.repositoryPath;if(g)try{let u=await this.gitClient.getRemotes(g),v=u.find(f=>f.name===e.target.remoteName);if(v&&v.owner&&v.owner.toLowerCase()!==a.github.username.toLowerCase()){let f=await this.profileManager.matchProfile({repositoryPath:g,remotes:u}),x=f.recommendedProfileId?await this.profileManager.getProfile(f.recommendedProfileId):void 0;if(this.profileMismatchPrompt){let M=await this.profileMismatchPrompt(a,v.owner,x);if(M==="cancel")return o.state="cancelled",this.createErrorResult(e.id,"OPERATION_CANCELLED","User cancelled operation due to profile mismatch","Operation was cancelled due to profile mismatch",t,o);M==="switch"&&x&&(await this.profileManager.switchProfile(x.id,g),a=x)}r.push({code:"PROFILE_MISMATCH",message:`Active profile "${a.name}" (${a.github?.username||"no user"}) does not match remote owner "${v.owner}".`})}}catch{}}let n=V.assessSafety(e);if(e.safety=n.safety,e.confirmation=n.confirmation,e.type==="git.push"&&e.input.force&&n.confirmation.required){let u=(e.input.repositoryPath||"workspace").split(/[/\\]/).filter(Boolean).pop()||"repository",v=e.input.branch||"main",f=a?a.name:"Unknown";n.confirmation.warning=`Profile: ${f}
Repository: ${u}
Branch: ${v}

This may overwrite remote history.`}if(n.confirmation.required&&(o.state="waiting-for-confirmation",!await this.confirmationHandler.requestConfirmation(n.confirmation.reason,n.confirmation.warning)))return o.state="cancelled",this.createErrorResult(e.id,"OPERATION_CANCELLED","User cancelled destructive operation","Operation was cancelled",t,o);let c;if(a){let g=this.profileManager.getAuthManager();g&&(c=await g.resolveAuthentication(a))}o.state="executing";let l=await this.dispatchExecution(e,c);c&&(c.credential=void 0);let m=new Date().toISOString(),p={operationId:e.id,success:!0,data:l,warnings:r.length>0?r:void 0,startedAt:t,completedAt:m};return o.state="succeeded",o.result=p,o.durationMs=Date.now()-i,p}catch(s){let a=new Date().toISOString(),n=String(s.message||s);P.error(`Operation ${e.type} failed: ${n}`);let c="UNKNOWN";n.includes("not a git repository")?c="NOT_A_REPOSITORY":n.includes("Authentication failed")||n.includes("auth")?c="AUTHENTICATION_FAILED":n.includes("Merge conflict")||n.includes("conflict")?c="MERGE_CONFLICT":n.includes("remote rejected")?c="REMOTE_REJECTED":n.includes("nothing to commit")&&(c="NOTHING_TO_COMMIT");let l={operationId:e.id,success:!1,error:{code:c,message:n,userMessage:`Failed to execute ${e.type}: ${n}`,retryable:!0},warnings:r.length>0?r:void 0,startedAt:t,completedAt:a};return o.state="failed",o.result=l,o.durationMs=Date.now()-i,l}}async dispatchExecution(e,t){let i=e.input;if(e.type.startsWith("git."))return this.dispatchGitOperation(e.type,i);if(e.type.startsWith("github.")){let r=new Pe({host:i.host,auth:t});return this.dispatchGitHubOperation(e.type,i,r)}throw new Error(`Unknown operation type: ${e.type}`)}async dispatchGitOperation(e,t){switch(e){case"git.status":return await this.gitClient.status(t.repositoryPath);case"git.diff":return await this.gitClient.diff(t.repositoryPath,t.staged,t.path);case"git.add":return await this.gitClient.add(t.repositoryPath,t.paths||[],t.all),!0;case"git.restore":return await this.gitClient.restore(t.repositoryPath,t.paths,t.staged),!0;case"git.commit":return await this.gitClient.commit(t.repositoryPath,t.message,t.amend,t.signoff);case"git.amend":return await this.gitClient.amend(t.repositoryPath,t.message,t.noEdit);case"git.reset":return await this.gitClient.reset(t.repositoryPath,t.ref,t.mode),!0;case"git.branch.create":return await this.gitClient.createBranch(t.repositoryPath,t.name,t.startPoint,t.checkout),!0;case"git.branch.delete":return await this.gitClient.deleteBranch(t.repositoryPath,t.name,t.force),!0;case"git.branch.rename":return await this.gitClient.renameBranch(t.repositoryPath,t.oldName,t.newName),!0;case"git.checkout":return await this.gitClient.checkout(t.repositoryPath,t.ref,t.createBranch),!0;case"git.switch":return await this.gitClient.switchBranch(t.repositoryPath,t.branch,t.create),!0;case"git.merge":return await this.gitClient.merge(t.repositoryPath,t.branch,t.noFastForward,t.squash);case"git.rebase":return await this.gitClient.rebase(t.repositoryPath,t.onto);case"git.fetch":return await this.gitClient.fetch(t.repositoryPath,t.remote,t.prune,t.tags);case"git.pull":return await this.gitClient.pull(t.repositoryPath,t.remote,t.branch,t.rebase);case"git.push":return await this.gitClient.push(t.repositoryPath,t.remote,t.branch,t.setUpstream,t.force,t.forceWithLease,t.tags);case"git.clone":return await this.gitClient.clone(t.url,t.destinationPath,t.branch,t.depth),!0;case"git.init":return await this.gitClient.init(t.repositoryPath,t.bare),!0;case"git.stash.create":return await this.gitClient.stash(t.repositoryPath,t.message,t.includeUntracked);case"git.stash.apply":return await this.gitClient.stashApply(t.repositoryPath,t.stash);case"git.stash.pop":return await this.gitClient.stashPop(t.repositoryPath,t.stash);case"git.stash.drop":return await this.gitClient.stashDrop(t.repositoryPath,t.stash);case"git.tag.create":return await this.gitClient.createTag(t.repositoryPath,t.name,t.target,t.message),!0;case"git.tag.delete":return await this.gitClient.deleteTag(t.repositoryPath,t.name),!0;case"git.remote.add":return await this.gitClient.addRemote(t.repositoryPath,t.name,t.url),!0;case"git.remote.remove":return await this.gitClient.removeRemote(t.repositoryPath,t.name),!0;case"git.remote.set-url":return await this.gitClient.setRemoteUrl(t.repositoryPath,t.name,t.url,t.push),!0;case"git.log":return await this.gitClient.log(t.repositoryPath,t.maxCount,t.branch,t.path);case"git.blame":return await this.gitClient.blame(t.repositoryPath,t.path,t.startLine,t.endLine);default:throw new Error(`Unhandled Git operation: ${e}`)}}async dispatchGitHubOperation(e,t,i){switch(e){case"github.account.get":return await i.getCurrentUser();case"github.repository.get":return await i.getRepository(t.owner,t.repository);case"github.repository.list":return await i.listRepositories(t.owner);case"github.repository.create":return await i.createRepository(t.name,t.description,t.private);case"github.repository.delete":return await i.deleteRepository(t.owner,t.repository),!0;case"github.repository.fork":return await i.forkRepository(t.owner,t.repository);case"github.issue.create":return await i.createIssue(t.owner,t.repository,t.title,t.body,t.labels);case"github.issue.list":return await i.listIssues(t.owner,t.repository,t.state);case"github.issue.close":return await i.closeIssue(t.owner,t.repository,t.number),!0;case"github.pull-request.create":return await i.createPullRequest(t.owner,t.repository,t.title,t.head,t.base,t.body,t.draft);case"github.pull-request.list":return await i.listPullRequests(t.owner,t.repository,t.state);case"github.pull-request.merge":return await i.mergePullRequest(t.owner,t.repository,t.number,t.method,t.commitMessage),!0;case"github.actions.list":return await i.listActions(t.owner,t.repository);case"github.release.create":return await i.createRelease(t.owner,t.repository,t.tag,t.name,t.body,t.draft,t.prerelease);case"github.release.list":return await i.listReleases(t.owner,t.repository);default:throw new Error(`Unhandled GitHub operation: ${e}`)}}createErrorResult(e,t,i,r,o,s){let a=new Date().toISOString(),n={operationId:e,success:!1,error:{code:t,message:i,userMessage:r,retryable:!1},startedAt:o,completedAt:a};return s.result=n,n}};var y=k(require("vscode"));function R(d){return d?String(d).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"):""}function Ie(d){return d?String(d).replace(/\\/g,"\\\\").replace(/'/g,"\\'").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;"):""}var O={refresh:'<svg class="icon" viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path d="M13.65 2.35A7.958 7.958 0 0 0 8 0a8 8 0 1 0 8 8h-2a6 6 0 1 1-1.76-4.24l-2.24 2.24h6V0l-2.35 2.35z"/></svg>',user:'<svg class="icon icon-muted" viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm2-3a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm4 8c0-2.21-3.58-4-8-4s-8 1.79-8 4v1h16v-1zM2.14 13c.6-1.34 3.02-2 5.86-2 2.84 0 5.26.66 5.86 2H2.14z"/></svg>',github:'<svg class="icon icon-muted" viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path fill-rule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>',repo:'<svg class="icon icon-muted" viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path fill-rule="evenodd" d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5v-9zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8V1.5z"/></svg>',search:'<svg class="icon" viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path fill-rule="evenodd" d="M11.5 7a4.499 4.499 0 1 1-8.998 0A4.499 4.499 0 0 1 11.5 7zm-.82 4.74a6 6 0 1 1 1.06-1.06l3.04 3.04a.75.75 0 1 1-1.06 1.06l-3.04-3.04z"/></svg>',externalLink:'<svg class="icon" viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path fill-rule="evenodd" d="M10.75 1a.75.75 0 0 0 0 1.5h2.44L6.97 8.72a.75.75 0 1 0 1.06 1.06L14.25 3.56v2.44a.75.75 0 0 0 1.5 0V1.75A.75.75 0 0 0 15 1h-4.25zm-8 2A1.75 1.75 0 0 0 1 4.75v9.5c0 .966.784 1.75 1.75 1.75h9.5A1.75 1.75 0 0 0 14 14.25v-4.5a.75.75 0 0 0-1.5 0v4.5a.25.25 0 0 1-.25.25h-9.5a.25.25 0 0 1-.25-.25v-9.5a.25.25 0 0 1 .25-.25h4.5a.75.75 0 0 0 0-1.5h-4.5z"/></svg>',link:'<svg class="icon icon-muted" viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path fill-rule="evenodd" d="M7.775 3.275a.75.75 0 0 0 1.06 1.06l1.25-1.25a2 2 0 1 1 2.83 2.83l-2.5 2.5a2 2 0 0 1-2.83 0 .75.75 0 0 0-1.06 1.06 3.5 3.5 0 0 0 4.95 0l2.5-2.5a3.5 3.5 0 0 0-4.95-4.95l-1.25 1.25zm-.69 9.45a.75.75 0 0 0-1.06-1.06l-1.25 1.25a2 2 0 0 1-2.83-2.83l2.5-2.5a2 2 0 0 1 2.83 0 .75.75 0 0 0 1.06-1.06 3.5 3.5 0 0 0-4.95 0l-2.5 2.5a3.5 3.5 0 0 0 4.95 4.95l1.25-1.25z"/></svg>',branch:'<svg class="icon icon-muted" viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path fill-rule="evenodd" d="M11.75 2.5a1.75 1.75 0 1 0-3.5 0 1.75 1.75 0 0 0 3.5 0zm-6 4a1.75 1.75 0 1 0-3.5 0 1.75 1.75 0 0 0 3.5 0zM8 4.25a2.25 2.25 0 0 1-2.25 2.25v3a2.25 2.25 0 1 1-1.5 0v-3A3.75 3.75 0 0 1 8 2.75v1.5zm3.75 5.5a1.75 1.75 0 1 0-3.5 0 1.75 1.75 0 0 0 3.5 0z"/></svg>',check:'<svg class="icon" viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path fill-rule="evenodd" d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/></svg>',alert:'<svg class="icon" viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path fill-rule="evenodd" d="M8.22 1.754a.75.75 0 0 0-1.44 0L.37 13.5a.75.75 0 0 0 .65 1.1h13.96a.75.75 0 0 0 .65-1.1L8.22 1.754zM8 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 5zm0 7a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"/></svg>',plus:'<svg class="icon" viewBox="0 0 16 16" width="11" height="11" fill="currentColor"><path d="M8 2a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 8 2z"/></svg>',eye:'<svg class="icon" viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path fill-rule="evenodd" d="M8 2c-4 0-7 4-7 6s3 6 7 6 7-4 7-6-3-6-7-6zm0 10a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm0-6.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z"/></svg>',eyeOff:'<svg class="icon" viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path fill-rule="evenodd" d="M2.22 2.22a.75.75 0 0 1 1.06 0l10.5 10.5a.75.75 0 1 1-1.06 1.06L11.5 10.57A6.974 6.974 0 0 1 8 12c-4 0-7-4-7-6a7.7 7.7 0 0 1 2.37-3.69L2.22 3.28a.75.75 0 0 1 0-1.06zM8 3.5c1.47 0 2.81.47 3.93 1.28l-1.45 1.45A3.977 3.977 0 0 0 8 5.5a2.5 2.5 0 0 0-2.5 2.5c0 .36.08.71.22 1.02L4.2 10.54A7.77 7.77 0 0 1 1 6c0-1.5 2.5-4.5 7-4.5zm0 4a1.5 1.5 0 0 1 1.5 1.5l-2.03-.53c.12-.55.5-1 1-1.07l-.47.1z"/></svg>'},Ce=class{static render(e,t){let i=e.profile,r=e.repository,o=e.matchResult,s=e.profiles||[],a=e.discoveredAccounts||[],n=e.linkedProfileId,c=e.repoUrl,m=`${t||"'self'"} 'unsafe-inline'`,p=!!i?.github?.username,g=i?R(i.name):"No Active Profile",u=i?R(i.git.email):"Select or create a profile to get started",v=i?R(i.git.name):"",f=p?`@${R(i.github.username)}`:"None",x=i?.github?.host||"github.com",M=r?R(r.name):"No Repository Opened",U=r?.currentBranch?R(r.currentBranch):"\u2014",F=o&&o.confidence!=="none"&&o.recommendedProfileId===i?.id?`<span class="badge badge-success">${O.check} Matches remote</span>`:o&&o.confidence!=="none"&&o.recommendedProfileId!==i?.id?`<span class="badge badge-warning">${O.alert} Mismatch (Suggested: ${R(s.find(I=>I.id===o.recommendedProfileId)?.name||"other")})</span>`:'<span class="badge badge-muted">No remote match detected</span>',_=JSON.stringify(s).replace(/</g,"\\u003c"),X=JSON.stringify(a).replace(/</g,"\\u003c");return`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src ${m}; style-src ${m}; script-src ${m};">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GitAxis Control Center</title>
  <style>
    :root {
      --bg: var(--vscode-sideBar-background, #181818);
      --fg: var(--vscode-sideBar-foreground, #cccccc);
      --card-bg: var(--vscode-editor-background, #1f1f1f);
      --card-border: var(--vscode-widget-border, rgba(255, 255, 255, 0.08));
      --btn-bg: var(--vscode-button-background, #0078d4);
      --btn-fg: var(--vscode-button-foreground, #ffffff);
      --btn-hover: var(--vscode-button-hoverBackground, #026ec1);
      --btn-sec-bg: var(--vscode-button-secondaryBackground, rgba(255, 255, 255, 0.08));
      --btn-sec-fg: var(--vscode-button-secondaryForeground, #cccccc);
      --btn-sec-hover: var(--vscode-button-secondaryHoverBackground, rgba(255, 255, 255, 0.14));
      --input-bg: var(--vscode-input-background, #2a2a2a);
      --input-fg: var(--vscode-input-foreground, #cccccc);
      --input-border: var(--vscode-input-border, rgba(255, 255, 255, 0.12));
      --focus-border: var(--vscode-focusBorder, #0078d4);
      --badge-success-bg: rgba(46, 164, 79, 0.2);
      --badge-success-fg: var(--vscode-gitDecoration-addedResourceForeground, #4ec9b0);
      --badge-warning-bg: rgba(210, 153, 34, 0.2);
      --badge-warning-fg: var(--vscode-gitDecoration-modifiedResourceForeground, #cca700);
      --badge-info-bg: rgba(56, 139, 253, 0.18);
      --badge-info-fg: var(--vscode-textLink-foreground, #4daafc);
      --badge-muted-bg: rgba(255, 255, 255, 0.06);
      --badge-muted-fg: var(--vscode-descriptionForeground, #888888);
      --error-fg: var(--vscode-errorForeground, #f48771);
      --subtext: var(--vscode-descriptionForeground, #999999);
    }
    * {
      box-sizing: border-box;
    }
    body {
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
      font-size: var(--vscode-font-size, 12px);
      color: var(--fg);
      background-color: var(--bg);
      margin: 0;
      padding: 10px 12px 24px;
      line-height: 1.45;
    }
    .header-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--card-border);
    }
    .brand-title {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.8px;
      text-transform: uppercase;
      color: var(--fg);
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .brand-pill {
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.3px;
      padding: 1px 5px;
      border-radius: 10px;
      background: var(--badge-info-bg);
      color: var(--badge-info-fg);
      text-transform: uppercase;
    }
    .icon-btn-ghost {
      background: transparent;
      border: 1px solid transparent;
      color: var(--subtext);
      border-radius: 4px;
      cursor: pointer;
      padding: 3px 6px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s ease;
    }
    .icon-btn-ghost:hover {
      background: var(--btn-sec-bg);
      color: var(--fg);
    }
    .section {
      margin-bottom: 14px;
    }
    .section-title-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    }
    .section-title {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.7px;
      color: var(--subtext);
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 6px;
      padding: 10px;
      margin-bottom: 8px;
      transition: border-color 0.15s ease;
    }
    .card-active-identity {
      border-left: 3px solid var(--badge-success-fg);
    }
    .card-header-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 6px;
    }
    .card-title-group {
      display: flex;
      align-items: center;
      gap: 6px;
      font-weight: 600;
      font-size: 12px;
      color: var(--fg);
    }
    .status-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      display: inline-block;
      flex-shrink: 0;
    }
    .dot-active {
      background: #2ea44f;
      box-shadow: 0 0 0 2px rgba(46, 164, 79, 0.25);
    }
    .dot-inactive {
      background: rgba(255, 255, 255, 0.25);
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 1px 6px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 500;
      line-height: 1.3;
    }
    .badge-success {
      background: var(--badge-success-bg);
      color: var(--badge-success-fg);
      border: 1px solid rgba(78, 201, 176, 0.25);
    }
    .badge-warning {
      background: var(--badge-warning-bg);
      color: var(--badge-warning-fg);
      border: 1px solid rgba(204, 167, 0, 0.25);
    }
    .badge-info {
      background: var(--badge-info-bg);
      color: var(--badge-info-fg);
      border: 1px solid rgba(77, 170, 252, 0.25);
    }
    .badge-muted {
      background: var(--badge-muted-bg);
      color: var(--badge-muted-fg);
      border: 1px solid rgba(255, 255, 255, 0.08);
    }
    .meta-list {
      margin-top: 8px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 11px;
    }
    .meta-item {
      display: flex;
      align-items: center;
      gap: 6px;
      color: var(--fg);
      word-break: break-all;
    }
    .meta-item .sub {
      color: var(--subtext);
    }
    .icon {
      display: inline-block;
      vertical-align: middle;
      flex-shrink: 0;
    }
    .icon-muted {
      color: var(--subtext);
    }
    .repo-box {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 6px;
      padding: 8px 10px;
      margin-top: 6px;
    }
    .repo-main-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 6px;
    }
    .repo-title-wrapper {
      display: flex;
      align-items: center;
      gap: 6px;
      font-weight: 600;
      font-size: 11px;
    }
    .btn-link-action {
      background: transparent;
      border: none;
      color: var(--badge-info-fg);
      cursor: pointer;
      font-size: 11px;
      padding: 2px 4px;
      border-radius: 3px;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      text-decoration: none;
    }
    .btn-link-action:hover {
      background: var(--btn-sec-bg);
      text-decoration: underline;
    }
    .branch-row {
      margin-top: 4px;
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 11px;
      color: var(--subtext);
    }
    .btn {
      background: var(--btn-bg);
      color: var(--btn-fg);
      border: none;
      padding: 4px 10px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 11px;
      font-weight: 500;
      text-align: center;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      transition: background-color 0.12s ease;
      line-height: 1.4;
    }
    .btn:hover {
      background: var(--btn-hover);
    }
    .btn-secondary {
      background: var(--btn-sec-bg);
      color: var(--btn-sec-fg);
      border: 1px solid var(--card-border);
    }
    .btn-secondary:hover {
      background: var(--btn-sec-hover);
      color: var(--fg);
    }
    .btn-danger {
      background: transparent;
      color: var(--error-fg);
      border: 1px solid rgba(244, 135, 113, 0.3);
    }
    .btn-danger:hover {
      background: rgba(244, 135, 113, 0.15);
      border-color: var(--error-fg);
    }
    .btn-sm {
      padding: 3px 8px;
      font-size: 11px;
      border-radius: 3px;
    }
    .btn-xs {
      background: var(--btn-sec-bg);
      color: var(--btn-sec-fg);
      border: 1px solid var(--card-border);
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 10px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .btn-xs:hover {
      background: var(--btn-sec-hover);
      color: var(--fg);
    }
    .btn-scan-bar {
      width: 100%;
      background: var(--btn-sec-bg);
      color: var(--btn-sec-fg);
      border: 1px solid var(--card-border);
      padding: 6px 10px;
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: all 0.12s ease;
    }
    .btn-scan-bar:hover {
      background: var(--btn-sec-hover);
      color: var(--fg);
      border-color: rgba(255, 255, 255, 0.2);
    }
    .btn-group {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-top: 8px;
    }
    .hint-text {
      font-size: 11px;
      color: var(--subtext);
      margin-top: 4px;
      line-height: 1.35;
    }
    .discovered-item {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-left: 3px solid var(--focus-border);
      border-radius: 4px;
      padding: 8px;
      margin-top: 6px;
    }
    .discovered-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      font-weight: 600;
    }
    .source-tag {
      font-size: 9px;
      padding: 1px 4px;
      border-radius: 3px;
      background: rgba(255, 255, 255, 0.08);
      color: var(--subtext);
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .form-box {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 6px;
      padding: 10px;
      margin-top: 6px;
    }
    .form-group {
      margin-bottom: 8px;
    }
    .form-label {
      display: block;
      font-size: 11px;
      font-weight: 500;
      margin-bottom: 3px;
      color: var(--fg);
    }
    .form-label .req {
      color: var(--error-fg);
    }
    .form-label .opt {
      color: var(--subtext);
      font-weight: 400;
      font-size: 10px;
    }
    .input-text {
      width: 100%;
      background: var(--input-bg);
      color: var(--input-fg);
      border: 1px solid var(--input-border);
      border-radius: 3px;
      padding: 4px 7px;
      font-size: 12px;
      outline: none;
      transition: border-color 0.12s ease;
    }
    .input-text:focus {
      border-color: var(--focus-border);
    }
    .pat-row {
      display: flex;
      gap: 4px;
    }
    .radio-deck {
      display: flex;
      gap: 12px;
      margin-top: 3px;
    }
    .radio-item {
      font-size: 11px;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      cursor: pointer;
      color: var(--fg);
    }
    .form-actions-row {
      display: flex;
      gap: 6px;
      margin-top: 10px;
    }
    .form-actions-row .btn {
      flex: 1;
    }
    .banner-error {
      background: rgba(244, 135, 113, 0.12);
      border: 1px solid rgba(244, 135, 113, 0.4);
      color: var(--error-fg);
      font-size: 11px;
      padding: 6px 8px;
      border-radius: 3px;
      margin-bottom: 8px;
    }
  </style>
</head>
<body>
  <!-- HEADER -->
  <div class="header-bar">
    <div class="brand-title">
      <span>GitAxis Control Center</span>
      <span class="brand-pill">v0.3.0</span>
    </div>
    <button type="button" class="icon-btn-ghost" title="Refresh state" onclick="sendCmd('refresh')">
      ${O.refresh}
    </button>
  </div>

  <!-- ACTIVE IDENTITY & REPO -->
  <div class="section">
    <div class="section-title">ACTIVE IDENTITY</div>
    <div class="card card-active-identity">
      <div class="card-header-row">
        <div class="card-title-group">
          <span class="status-dot ${i?"dot-active":"dot-inactive"}"></span>
          <span>${g}</span>
        </div>
        ${i?'<span class="badge badge-success">Active</span>':""}
      </div>
      <div class="meta-list">
        <div class="meta-item">
          ${O.user}
          <span>${v?`${v} <span class="sub">&lt;${u}&gt;</span>`:u}</span>
        </div>
        <div class="meta-item">
          ${O.github}
          <span>GitHub: <strong>${f}</strong> ${p?`<span class="sub">(${R(x)})</span>`:""}</span>
        </div>
      </div>
    </div>

    <!-- CURRENT REPOSITORY STATUS -->
    <div class="repo-box">
      <div class="repo-main-row">
        <div class="repo-title-wrapper">
          ${O.repo}
          <span>CURRENT REPO: <strong>${M}</strong></span>
        </div>
        ${c?`<button type="button" class="btn-link-action" title="Open repository on GitHub" onclick="openRepoInBrowser('${Ie(c)}')">
                <span>Open on GitHub</span>
                ${O.externalLink}
              </button>`:""}
      </div>
      <div class="branch-row">
        ${O.branch}
        <span>Branch: <strong>${U}</strong></span>
      </div>
      <div style="margin-top: 6px;">${F}</div>
      ${o&&o.confidence!=="none"&&o.recommendedProfileId!==i?.id?`<button type="button" class="btn btn-secondary btn-sm" style="margin-top: 6px; width: 100%;" onclick="sendCmd('useRecommended')">Switch to Suggested Profile</button>`:""}
    </div>
  </div>

  <!-- SYSTEM ACCOUNT SCANNER -->
  <div class="section">
    <div class="section-title-row">
      <span class="section-title">SYSTEM ACCOUNT SCANNER</span>
    </div>
    <button type="button" class="btn-scan-bar" onclick="scanAccounts()">
      ${O.search}
      <span>Scan Local Git &amp; GitHub CLI Accounts</span>
    </button>
    ${a.length>0?`<div style="display: flex; flex-direction: column; gap: 6px; margin-top: 6px;">
            ${a.map((I,E)=>`
              <div class="discovered-item">
                <div class="discovered-header">
                  <span>${R(I.github?.username?"@"+I.github.username:I.name)}</span>
                  <span class="source-tag">${R(I.source||"detected")}</span>
                </div>
                <div class="hint-text">${R(I.git.name)} &lt;${R(I.git.email)}&gt;</div>
                ${I.github?`<div class="hint-text">Host: ${R(I.github.host)}</div>`:""}
                <div class="btn-group">
                  <button type="button" class="btn btn-sm" onclick="importDiscoveredAccount(${E})">+ Import as Profile</button>
                  <button type="button" class="btn btn-sm btn-secondary" onclick="fillFormWithAccount(${E})">Fill Form</button>
                </div>
              </div>`).join("")}
          </div>`:e.scanPerformed?'<div class="hint-text">Scan completed. All discovered accounts are already in profiles or none were found.</div>':'<div class="hint-text">1-click scan local Git configurations and GitHub CLI to import accounts seamlessly.</div>'}
  </div>

  <!-- PROFILES LIST -->
  <div class="section">
    <div class="section-title-row">
      <span class="section-title">PROFILES (${s.length})</span>
      <button type="button" class="btn-xs" onclick="startNewProfile()">
        ${O.plus} Add Profile
      </button>
    </div>
    ${s.length===0?'<div class="hint-text">No profiles created yet. Use the form below or scan accounts above.</div>':s.map(I=>{let E=i?.id===I.id,Ae=n===I.id,Pt=!!r;return`
      <div class="card" style="${E?"border-left: 3px solid var(--badge-success-fg);":""}">
        <div class="card-header-row">
          <div class="card-title-group">
            <span class="status-dot ${E?"dot-active":"dot-inactive"}"></span>
            <span>${R(I.name)}</span>
          </div>
          <div>
            ${E?'<span class="badge badge-success">Active</span>':""}
          </div>
        </div>
        <div class="meta-list">
          <div class="meta-item">
            ${O.user}
            <span>${R(I.git.name)} <span class="sub">&lt;${R(I.git.email)}&gt;</span></span>
          </div>
          <div class="meta-item">
            ${O.github}
            <span>GitHub: <strong>${I.github?.username?"@"+R(I.github.username):"None"}</strong> ${I.github?.username?`<span class="sub">(${R(I.github?.host||"github.com")})</span>`:""}</span>
          </div>
          <div class="meta-item">
            ${O.link}
            <span class="sub">Scope: ${R(I.git.scope||"local")} \xB7 Auth: ${R(I.authentication.type)}</span>
          </div>
        </div>
        <div class="btn-group">
          ${E?"":`<button type="button" class="btn btn-sm" onclick="switchProfile('${Ie(I.id)}')">Switch</button>`}
          <button type="button" class="btn btn-sm btn-secondary" onclick="editProfile('${Ie(I.id)}')">Edit</button>
          <button type="button" class="btn btn-sm btn-danger" onclick="deleteProfile('${Ie(I.id)}')">Delete</button>
        </div>
      </div>`}).join("")}
  </div>

  <!-- IN-SIDEBAR PERSISTENT PROFILE FORM -->
  <div class="section" id="profile-form-section" style="border-bottom: none;">
    <div class="section-title-row">
      <span class="section-title" id="form-title">CREATE / EDIT PROFILE</span>
    </div>
    <div class="form-box">
      <div id="form-error-msg" class="banner-error" style="display: none;"></div>
      <input type="hidden" id="form-profile-id" value="" />
      
      <div class="form-group">
        <label class="form-label" for="form-name">Profile Name <span class="req">*</span></label>
        <input type="text" id="form-name" class="input-text" placeholder="e.g. work, personal, opensource" autocomplete="off" />
      </div>

      <div class="form-group">
        <label class="form-label" for="form-git-name">Git Author Name <span class="req">*</span></label>
        <input type="text" id="form-git-name" class="input-text" placeholder="e.g. John Doe" autocomplete="off" />
      </div>

      <div class="form-group">
        <label class="form-label" for="form-git-email">Git Email <span class="req">*</span></label>
        <input type="email" id="form-git-email" class="input-text" placeholder="e.g. john@company.com" autocomplete="off" />
      </div>

      <div class="form-group">
        <label class="form-label" for="form-gh-user">GitHub Username <span class="opt">(optional)</span></label>
        <input type="text" id="form-gh-user" class="input-text" placeholder="e.g. john-work" autocomplete="off" />
      </div>

      <div class="form-group">
        <label class="form-label" for="form-host">GitHub Host</label>
        <input type="text" id="form-host" class="input-text" value="github.com" placeholder="github.com" autocomplete="off" />
      </div>

      <div class="form-group">
        <label class="form-label" for="form-pat">Personal Access Token (PAT) <span class="opt">(optional)</span></label>
        <div class="pat-row">
          <input type="password" id="form-pat" class="input-text" placeholder="ghp_xxxxxxxxxxxx" autocomplete="off" />
          <button type="button" id="btn-toggle-pat" class="btn btn-secondary btn-sm" onclick="togglePatVisibility()">Show</button>
        </div>
        <div class="hint-text" style="font-size: 10px; margin-top: 3px;">Stored securely in VS Code SecretStorage. Inputs are persistent across tab switches.</div>
      </div>

      <div class="form-group">
        <label class="form-label">Identity Scope</label>
        <div class="radio-deck">
          <label class="radio-item">
            <input type="radio" name="form-scope" value="local" checked />
            <span>Current Repo (local)</span>
          </label>
          <label class="radio-item">
            <input type="radio" name="form-scope" value="global" />
            <span>Global</span>
          </label>
        </div>
      </div>

      <div class="form-actions-row">
        <button type="button" class="btn" id="form-submit-btn" onclick="saveProfileForm()">Save Profile</button>
        <button type="button" class="btn btn-secondary" onclick="cancelProfileForm()">Cancel</button>
      </div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const profilesData = ${_};
    const discoveredData = ${X};

    function sendCmd(cmd, payload) {
      vscode.postMessage({ command: cmd, ...(payload || {}) });
    }

    function showFormError(msg) {
      const errEl = document.getElementById('form-error-msg');
      if (errEl) {
        errEl.innerText = msg;
        errEl.style.display = 'block';
      }
    }

    function hideFormError() {
      const errEl = document.getElementById('form-error-msg');
      if (errEl) {
        errEl.style.display = 'none';
      }
    }

    function saveCurrentFormToState() {
      try {
        const currentState = vscode.getState() || {};
        const scopeEl = document.querySelector('input[name="form-scope"]:checked');
        const formState = {
          id: document.getElementById('form-profile-id')?.value || '',
          name: document.getElementById('form-name')?.value || '',
          gitName: document.getElementById('form-git-name')?.value || '',
          gitEmail: document.getElementById('form-git-email')?.value || '',
          githubUsername: document.getElementById('form-gh-user')?.value || '',
          host: document.getElementById('form-host')?.value || 'github.com',
          pat: document.getElementById('form-pat')?.value || '',
          scope: scopeEl ? scopeEl.value : 'local',
          title: document.getElementById('form-title')?.innerText || 'CREATE / EDIT PROFILE',
          submitBtnText: document.getElementById('form-submit-btn')?.innerText || 'Save Profile',
        };
        vscode.setState({ ...currentState, form: formState });
      } catch (e) {
        console.error('Failed to save form state:', e);
      }
    }

    function restoreFormFromState() {
      try {
        const state = vscode.getState();
        if (!state || !state.form) return;
        const f = state.form;
        if (f.name || f.gitName || f.gitEmail || f.githubUsername || f.pat || f.id) {
          if (document.getElementById('form-profile-id')) document.getElementById('form-profile-id').value = f.id || '';
          if (document.getElementById('form-name')) document.getElementById('form-name').value = f.name || '';
          if (document.getElementById('form-git-name')) document.getElementById('form-git-name').value = f.gitName || '';
          if (document.getElementById('form-git-email')) document.getElementById('form-git-email').value = f.gitEmail || '';
          if (document.getElementById('form-gh-user')) document.getElementById('form-gh-user').value = f.githubUsername || '';
          if (document.getElementById('form-host')) document.getElementById('form-host').value = f.host || 'github.com';
          if (document.getElementById('form-pat')) document.getElementById('form-pat').value = f.pat || '';
          if (f.scope) {
            const radio = document.querySelector('input[name="form-scope"][value="' + f.scope + '"]');
            if (radio) radio.checked = true;
          }
          if (f.title && document.getElementById('form-title')) {
            document.getElementById('form-title').innerText = f.title;
          }
          if (f.submitBtnText && document.getElementById('form-submit-btn')) {
            document.getElementById('form-submit-btn').innerText = f.submitBtnText;
          }
        }
      } catch (e) {
        console.error('Failed to restore form state:', e);
      }
    }

    // Attach listeners for persistent input caching
    ['form-name', 'form-git-name', 'form-git-email', 'form-gh-user', 'form-host', 'form-pat'].forEach(function(id) {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', saveCurrentFormToState);
      }
    });
    document.querySelectorAll('input[name="form-scope"]').forEach(function(el) {
      el.addEventListener('change', saveCurrentFormToState);
    });

    function saveProfileForm() {
      hideFormError();
      const id = (document.getElementById('form-profile-id')?.value || '').trim();
      const name = (document.getElementById('form-name')?.value || '').trim();
      const gitName = (document.getElementById('form-git-name')?.value || '').trim();
      const gitEmail = (document.getElementById('form-git-email')?.value || '').trim();
      const githubUsername = (document.getElementById('form-gh-user')?.value || '').trim();
      const host = (document.getElementById('form-host')?.value || '').trim() || 'github.com';
      const pat = (document.getElementById('form-pat')?.value || '').trim();
      const scopeEl = document.querySelector('input[name="form-scope"]:checked');
      const scope = scopeEl ? scopeEl.value : 'local';

      if (!name) {
        showFormError('Profile Name is required.');
        return;
      }
      if (!gitName) {
        showFormError('Git Author Name is required.');
        return;
      }
      if (!gitEmail || !gitEmail.includes('@')) {
        showFormError('A valid Git Email is required.');
        return;
      }

      const submitBtn = document.getElementById('form-submit-btn');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerText = 'Saving...';
      }

      saveCurrentFormToState();

      if (id) {
        vscode.postMessage({
          command: 'updateProfileFromForm',
          data: { id, name, gitName, gitEmail, githubUsername, host, pat, scope }
        });
      } else {
        vscode.postMessage({
          command: 'createProfileFromForm',
          data: { name, gitName, gitEmail, githubUsername, host, pat, scope }
        });
      }
    }

    function cancelProfileForm() {
      hideFormError();
      if (document.getElementById('form-profile-id')) document.getElementById('form-profile-id').value = '';
      if (document.getElementById('form-name')) document.getElementById('form-name').value = '';
      if (document.getElementById('form-git-name')) document.getElementById('form-git-name').value = '';
      if (document.getElementById('form-git-email')) document.getElementById('form-git-email').value = '';
      if (document.getElementById('form-gh-user')) document.getElementById('form-gh-user').value = '';
      if (document.getElementById('form-host')) document.getElementById('form-host').value = 'github.com';
      if (document.getElementById('form-pat')) document.getElementById('form-pat').value = '';
      const radio = document.querySelector('input[name="form-scope"][value="local"]');
      if (radio) radio.checked = true;
      if (document.getElementById('form-title')) document.getElementById('form-title').innerText = 'CREATE / EDIT PROFILE';
      const submitBtn = document.getElementById('form-submit-btn');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerText = 'Save Profile';
      }
      const currentState = vscode.getState() || {};
      vscode.setState({ ...currentState, form: null });
    }

    function editProfile(id) {
      hideFormError();
      const p = profilesData.find(item => item.id === id);
      if (!p) return;
      if (document.getElementById('form-profile-id')) document.getElementById('form-profile-id').value = p.id;
      if (document.getElementById('form-name')) document.getElementById('form-name').value = p.name;
      if (document.getElementById('form-git-name')) document.getElementById('form-git-name').value = p.git.name;
      if (document.getElementById('form-git-email')) document.getElementById('form-git-email').value = p.git.email;
      if (document.getElementById('form-gh-user')) document.getElementById('form-gh-user').value = p.github?.username || '';
      if (document.getElementById('form-host')) document.getElementById('form-host').value = p.github?.host || 'github.com';
      if (document.getElementById('form-pat')) document.getElementById('form-pat').value = '';
      const scopeVal = p.git.scope || 'local';
      const radio = document.querySelector('input[name="form-scope"][value="' + scopeVal + '"]');
      if (radio) radio.checked = true;

      if (document.getElementById('form-title')) {
        document.getElementById('form-title').innerText = 'EDIT PROFILE: ' + p.name;
      }
      if (document.getElementById('form-submit-btn')) {
        document.getElementById('form-submit-btn').innerText = 'Update Profile';
      }
      saveCurrentFormToState();
      const formEl = document.getElementById('profile-form-section');
      if (formEl) formEl.scrollIntoView({ behavior: 'smooth' });
    }

    function fillFormWithAccount(index) {
      hideFormError();
      const acc = discoveredData[index];
      if (!acc) return;
      if (document.getElementById('form-profile-id')) document.getElementById('form-profile-id').value = '';
      if (document.getElementById('form-name')) document.getElementById('form-name').value = acc.name || '';
      if (document.getElementById('form-git-name')) document.getElementById('form-git-name').value = acc.git?.name || '';
      if (document.getElementById('form-git-email')) document.getElementById('form-git-email').value = acc.git?.email || '';
      if (document.getElementById('form-gh-user')) document.getElementById('form-gh-user').value = acc.github?.username || '';
      if (document.getElementById('form-host')) document.getElementById('form-host').value = acc.github?.host || 'github.com';
      if (document.getElementById('form-pat')) document.getElementById('form-pat').value = '';
      const radio = document.querySelector('input[name="form-scope"][value="local"]');
      if (radio) radio.checked = true;

      if (document.getElementById('form-title')) {
        document.getElementById('form-title').innerText = 'IMPORT PROFILE: ' + (acc.name || 'Account');
      }
      if (document.getElementById('form-submit-btn')) {
        document.getElementById('form-submit-btn').innerText = 'Save Profile';
      }
      saveCurrentFormToState();
      const formEl = document.getElementById('profile-form-section');
      if (formEl) formEl.scrollIntoView({ behavior: 'smooth' });
    }

    function startNewProfile() {
      cancelProfileForm();
      const formEl = document.getElementById('profile-form-section');
      if (formEl) formEl.scrollIntoView({ behavior: 'smooth' });
      const nameInput = document.getElementById('form-name');
      if (nameInput) nameInput.focus();
    }

    function togglePatVisibility() {
      const input = document.getElementById('form-pat');
      const btn = document.getElementById('btn-toggle-pat');
      if (!input || !btn) return;
      if (input.type === 'password') {
        input.type = 'text';
        btn.innerText = 'Hide';
      } else {
        input.type = 'password';
        btn.innerText = 'Show';
      }
    }

    function switchProfile(id) {
      vscode.postMessage({ command: 'switchProfile', profileId: id });
    }

    function deleteProfile(id, name) {
      const p = profilesData.find(item => item.id === id);
      const profileName = p ? p.name : (name || '');
      vscode.postMessage({ command: 'deleteProfile', profileId: id, name: profileName });
    }

    function scanAccounts() {
      vscode.postMessage({ command: 'scanAccounts' });
    }

    function importDiscoveredAccount(index) {
      vscode.postMessage({ command: 'importDiscoveredAccount', index: index });
    }

    function openRepoInBrowser(url) {
      if (url) {
        vscode.postMessage({ command: 'openInBrowser', url: url });
      } else {
        vscode.postMessage({ command: 'openGitHubRepo' });
      }
    }

    // Message listener for extension backend responses
    window.addEventListener('message', function(event) {
      const msg = event.data;
      if (!msg) return;
      if (msg.command === 'saveSuccess') {
        cancelProfileForm();
      } else if (msg.command === 'saveError') {
        const submitBtn = document.getElementById('form-submit-btn');
        if (submitBtn) {
          submitBtn.disabled = false;
          const id = document.getElementById('form-profile-id')?.value;
          submitBtn.innerText = id ? 'Update Profile' : 'Save Profile';
        }
        showFormError(msg.error || 'Failed to save profile.');
      } else if (msg.command === 'profileDeleted') {
        const currentId = document.getElementById('form-profile-id')?.value;
        if (currentId === msg.profileId) {
          cancelProfileForm();
        }
      }
    });

    // Restore any previously typed form fields
    restoreFormFromState();
  </script>
</body>
</html>`}};var T=class{static isValidEmail(e){return!e||typeof e!="string"?!1:/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())}static isValidProfileName(e){if(!e||typeof e!="string")return!1;let t=e.trim();return t.length>=1&&t.length<=64&&/^[a-zA-Z0-9_\-\. ]+$/.test(t)}static isValidBranchName(e){if(!e||typeof e!="string")return!1;let t=e.trim();return t.startsWith("/")||t.endsWith("/")||t.endsWith(".lock")||t.includes("..")||t.includes("@{")||t.includes("\\")?!1:/^[a-zA-Z0-9_\-\./]+$/.test(t)}static sanitizeUrl(e){return e.replace(/:(\/\/[^@:]+):[^@]+@/,"$1:***@")}};var K=class{constructor(e,t,i,r,o){this.extensionUri=e;this.profileManager=t;this.repoDiscovery=i;this.systemDiscovery=r;this.onProfileChanged=o}static viewType="gitaxis.sidebarView";view;discoveredAccounts=[];scanPerformed=!1;resolveWebviewView(e,t,i){this.view=e,e.webview.options={enableScripts:!0,localResourceRoots:[this.extensionUri]},e.webview.onDidReceiveMessage(async r=>{try{switch(r.command){case"refresh":await this.refresh();break;case"switchProfile":{if(r.profileId){let o=async()=>{let l="Continue";return await y.window.showWarningMessage("You're about to change your global Git identity.",{modal:!0,detail:"This affects repositories that don't override their local Git identity."},l)===l},s=y.window.activeTextEditor?.document.uri,a=s?y.workspace.getWorkspaceFolder(s)?.uri.fsPath:y.workspace.workspaceFolders?.[0]?.uri.fsPath,n;a&&(n=(await this.repoDiscovery.detectRepository(a))?.path);let c=await this.profileManager.switchProfile(r.profileId,n,o);y.window.showInformationMessage(`Active profile switched to "${c.name}".`),this.onProfileChanged?.(),await this.refresh()}else await y.commands.executeCommand("gitaxis.switchProfile");break}case"createProfileFromForm":{let o=r.data;if(!o||!o.name||!o.gitName||!o.gitEmail){let c="Profile Name, Git Author Name, and Git Email are required.";this.view?.webview.postMessage({command:"saveError",error:c}),y.window.showErrorMessage(c);break}if(!T.isValidProfileName(o.name)){let c="Please enter a valid profile name (alphanumeric, dash, underscore, 1-64 chars).";this.view?.webview.postMessage({command:"saveError",error:c}),y.window.showErrorMessage(c);break}if(!T.isValidEmail(o.gitEmail)){let c="Please enter a valid Git email address.";this.view?.webview.postMessage({command:"saveError",error:c}),y.window.showErrorMessage(c);break}let s={name:o.name.trim(),git:{name:o.gitName.trim(),email:o.gitEmail.trim(),scope:o.scope==="global"?"global":"local"},github:o.githubUsername?.trim()?{host:o.host?.trim()||"github.com",username:o.githubUsername.trim()}:void 0,authentication:{type:o.pat?.trim()?"pat":"none",source:o.pat?.trim()?"vs-code-secret-storage":"user-input"},source:"manual",imported:!1},a=await this.profileManager.createProfile(s,o.pat?.trim()||void 0);if((await this.profileManager.getActiveProfile())?.id===a.id){let c=y.window.activeTextEditor?.document.uri,l=c?y.workspace.getWorkspaceFolder(c)?.uri.fsPath:y.workspace.workspaceFolders?.[0]?.uri.fsPath;if(l){let m=await this.repoDiscovery.detectRepository(l);m&&await this.profileManager.applyIdentityToRepository(a,m.path)}}this.view?.webview.postMessage({command:"saveSuccess",profileId:a.id}),y.window.showInformationMessage(`Profile "${a.name}" created successfully!`),this.onProfileChanged?.(),await this.refresh();break}case"updateProfileFromForm":{let o=r.data;if(!o||!o.id||!o.name||!o.gitName||!o.gitEmail){let c="Profile ID, name, Git author name, and email are required.";this.view?.webview.postMessage({command:"saveError",error:c}),y.window.showErrorMessage(c);break}if(!T.isValidProfileName(o.name)){let c="Please enter a valid profile name (alphanumeric, dash, underscore, 1-64 chars).";this.view?.webview.postMessage({command:"saveError",error:c}),y.window.showErrorMessage(c);break}if(!T.isValidEmail(o.gitEmail)){let c="Please enter a valid Git email address.";this.view?.webview.postMessage({command:"saveError",error:c}),y.window.showErrorMessage(c);break}let s={name:o.name.trim(),git:{name:o.gitName.trim(),email:o.gitEmail.trim(),scope:o.scope==="global"?"global":"local"},github:o.githubUsername?.trim()?{host:o.host?.trim()||"github.com",username:o.githubUsername.trim()}:{username:"",host:o.host?.trim()||"github.com"}};o.pat&&o.pat.trim().length>0&&(s.authentication={type:"pat",source:"vs-code-secret-storage"});let a=await this.profileManager.updateProfile(o.id,s,o.pat?.trim()||void 0);if((await this.profileManager.getActiveProfile())?.id===a.id){let c=y.window.activeTextEditor?.document.uri,l=c?y.workspace.getWorkspaceFolder(c)?.uri.fsPath:y.workspace.workspaceFolders?.[0]?.uri.fsPath;if(l){let m=await this.repoDiscovery.detectRepository(l);m&&await this.profileManager.applyIdentityToRepository(a,m.path)}}this.view?.webview.postMessage({command:"saveSuccess",profileId:a.id}),y.window.showInformationMessage(`Profile "${a.name}" updated successfully!`),this.onProfileChanged?.(),await this.refresh();break}case"deleteProfile":{if(!r.profileId)break;let s=(await this.profileManager.getProfile(r.profileId))?.name||r.name||"this profile";await y.window.showWarningMessage(`Are you sure you want to delete profile "${s}"?`,{modal:!0},"Delete")==="Delete"&&(await this.profileManager.deleteProfile(r.profileId),this.view?.webview.postMessage({command:"profileDeleted",profileId:r.profileId}),y.window.showInformationMessage(`Profile "${s}" deleted.`),this.onProfileChanged?.(),await this.refresh());break}case"scanAccounts":{this.systemDiscovery&&await y.window.withProgress({location:y.ProgressLocation.Notification,title:"GitAxis: Scanning local Git and GitHub CLI accounts..."},async()=>{let o=await this.systemDiscovery.scan(),s=this.systemDiscovery.suggestProfiles(o),a=await this.profileManager.getProfiles();this.discoveredAccounts=s.filter(n=>!a.some(c=>c.name.toLowerCase()===n.name.toLowerCase()||c.git.email.toLowerCase()===n.git.email.toLowerCase())),this.scanPerformed=!0,await this.refresh(),this.discoveredAccounts.length===0?y.window.showInformationMessage("Scan completed. No new accounts detected."):y.window.showInformationMessage(`Scan completed. Found ${this.discoveredAccounts.length} account suggestion(s).`)});break}case"importDiscoveredAccount":{let o=r.account;if(!o&&typeof r.index=="number"&&this.discoveredAccounts[r.index]){let s=this.discoveredAccounts[r.index];o={name:s.name,git:{name:s.git.name,email:s.git.email,scope:s.git.scope||"local"},github:s.github?{host:s.github.host||"github.com",username:s.github.username}:void 0,authentication:s.authentication||{type:s.source==="github-cli"?"github-cli":"none",source:s.source==="github-cli"?"github-cli":"system"},source:s.source||"system-discovery",imported:!0,description:s.description}}if(o){let s=await this.profileManager.createProfile(o);typeof r.index=="number"&&r.index>=0&&r.index<this.discoveredAccounts.length?this.discoveredAccounts.splice(r.index,1):this.discoveredAccounts=this.discoveredAccounts.filter(a=>a.name.toLowerCase()!==o.name.toLowerCase()),y.window.showInformationMessage(`Profile "${s.name}" imported successfully!`),this.onProfileChanged?.(),await this.refresh()}break}case"openInBrowser":{r.url&&typeof r.url=="string"&&(r.url.startsWith("https://")||r.url.startsWith("http://")?await y.env.openExternal(y.Uri.parse(r.url)):y.window.showWarningMessage(`Invalid URL protocol: ${r.url}`));break}case"openGitHubRepo":{await y.commands.executeCommand("gitaxis.openGitHubRepo");break}case"linkToRepo":{let o=y.workspace.workspaceFolders?.[0]?.uri.fsPath;if(!o){y.window.showWarningMessage("No repository workspace open to link.");break}let a=(await this.repoDiscovery.detectRepository(o))?.path||G.normalizePath(o);if(r.profileId){await this.profileManager.associateRepository(a,r.profileId);let n=await this.profileManager.getProfile(r.profileId);y.window.showInformationMessage(`Linked repository to profile "${n?.name||r.profileId}".`),this.onProfileChanged?.(),await this.refresh()}break}case"unlinkRepo":{let o=y.workspace.workspaceFolders?.[0]?.uri.fsPath;if(o){let a=(await this.repoDiscovery.detectRepository(o))?.path||G.normalizePath(o);await this.profileManager.disassociateRepository(a),y.window.showInformationMessage("Removed profile link for current repository."),this.onProfileChanged?.(),await this.refresh()}break}case"useRecommended":{let o=await this.getCurrentState();if(o.matchResult?.recommendedProfileId){let s=async()=>{let l="Continue";return await y.window.showWarningMessage("You're about to change your global Git identity.",{modal:!0,detail:"This affects repositories that don't override their local Git identity."},l)===l},a=y.window.activeTextEditor?.document.uri,n=a?y.workspace.getWorkspaceFolder(a)?.uri.fsPath:y.workspace.workspaceFolders?.[0]?.uri.fsPath,c;n&&(c=(await this.repoDiscovery.detectRepository(n))?.path),await this.profileManager.switchProfile(o.matchResult.recommendedProfileId,c,s),this.onProfileChanged?.(),await this.refresh()}break}}}catch(o){P.error(`Error handling webview message: ${String(o)}`);let s=o instanceof Error?o.message:String(o);this.view?.webview.postMessage({command:"saveError",error:s}),y.window.showErrorMessage(`GitAxis Error: ${s}`)}}),this.refresh()}async refresh(){if(!this.view)return;let e=await this.getCurrentState();this.view.webview.html=Ce.render(e,this.view.webview.cspSource)}async getCurrentState(){let e=await this.profileManager.getProfiles(),t=await this.profileManager.getActiveProfile(),i,r,o,s,a=y.workspace.workspaceFolders;if(a&&a.length>0){let n=a[0].uri.fsPath;if(i=await this.repoDiscovery.detectRepository(n),i){s=await this.profileManager.getAssociation(i.path),r=await this.profileManager.matchProfile({repositoryPath:i.path,remotes:i.remotes});let c=i.remotes.find(l=>l.name==="origin")||i.remotes[0];c&&c.owner&&c.repository&&(o=`https://${c.host||"github.com"}/${c.owner}/${c.repository}`)}}return{profile:t,repository:i,matchResult:r,profiles:e,repoUrl:o,linkedProfileId:s,discoveredAccounts:this.discoveredAccounts,scanPerformed:this.scanPerformed}}};var w=k(require("vscode"));function Ze(d,e,t,i,r){d.subscriptions.push(w.commands.registerCommand("gitaxis.switchProfile",async o=>{let s=await e.getProfiles();if(s.length===0){let m="Create Profile";await w.window.showInformationMessage("No profiles found. Would you like to create one?",m)===m&&await w.commands.executeCommand("gitaxis.createProfile");return}let a=o;if(!a){let m=await e.getActiveProfile(),p=s.map(u=>({label:`${u.id===m?.id?"$(check) ":""}${u.name}`,description:`${u.git.name} <${u.git.email}>`,detail:`GitHub: ${u.github?.username||"None"} \xB7 Auth: ${u.authentication.type} \xB7 Scope: ${u.git.scope}`,profileId:u.id})),g=await w.window.showQuickPick(p,{placeHolder:"Select a Git/GitHub Profile"});if(!g)return;a=g.profileId}let n=async()=>{let m="Continue";return await w.window.showWarningMessage("You're about to change your global Git identity.",{modal:!0,detail:"This affects repositories that don't override their local Git identity."},m)===m},c=w.window.activeTextEditor?.document.uri,l=c?w.workspace.getWorkspaceFolder(c)?.uri.fsPath:w.workspace.workspaceFolders?.[0]?.uri.fsPath;if(await e.switchProfile(a,l,n),l&&await e.getAssociation(l)!==a){let p=await e.getProfile(a),g="Remember for this folder";w.window.showInformationMessage(`Switched to profile "${p?.name}". Remember this profile for this repository?`,g).then(u=>{u===g&&e.associateRepository(l,a)})}w.window.showInformationMessage("Active profile switched."),r?.()})),d.subscriptions.push(w.commands.registerCommand("gitaxis.createProfile",async()=>{let o=await w.window.showInputBox({title:"Create Profile (1/6)",prompt:"Enter a profile name (e.g. work, personal, opensource)",validateInput:f=>{if(!T.isValidProfileName(f))return"Please enter a valid profile name (alphanumeric, dash, underscore, 1-64 chars)"}});if(!o)return;let s=await w.window.showInputBox({title:"Create Profile (2/6)",prompt:"Enter Git commit author name (e.g. John Doe)",validateInput:f=>f.trim().length>0?void 0:"Git name cannot be empty"});if(!s)return;let a=await w.window.showInputBox({title:"Create Profile (3/6)",prompt:"Enter Git commit email (e.g. john@company.com)",validateInput:f=>T.isValidEmail(f)?void 0:"Please enter a valid email address"});if(!a)return;let n=await w.window.showQuickPick([{label:"Repository (Recommended)",description:"Applies identity locally to the opened repository",scope:"local"},{label:"Global",description:"Sets global Git identity (will prompt before overwriting)",scope:"global"}],{title:"Create Profile (4/6): Identity Scope"});if(!n)return;if(n.scope==="global"){let f="Continue";if(await w.window.showWarningMessage("You're about to change your global Git identity.",{modal:!0,detail:"This affects repositories that don't override their local Git identity."},f)!==f)return}let c=await w.window.showInputBox({title:"Create Profile (5/6)",prompt:"Enter GitHub username (optional, press Enter to skip)"}),l="github.com";if(c){let f=await w.window.showInputBox({title:"GitHub Host",prompt:"Enter GitHub host (default: github.com)",value:"github.com"});f&&(l=f.trim())}let m=[{label:"GitHub CLI",detail:"Use credentials from gh CLI",type:"github-cli"},{label:"Git Credential Manager",detail:"Delegate auth to system credential helper",type:"credential-manager"},{label:"Personal Access Token (PAT)",detail:"Securely saved in VS Code SecretStorage",type:"pat"},{label:"SSH",detail:"Use existing SSH keys",type:"ssh"},{label:"None",detail:"No remote authentication",type:"none"}],p=await w.window.showQuickPick(m,{title:"Create Profile (6/6): Authentication Method"});if(!p)return;let g,u;if(p.type==="pat"){if(g=await w.window.showInputBox({title:"GitHub Personal Access Token",prompt:"Enter Personal Access Token (stored encrypted in VS Code Secrets)",password:!0,validateInput:f=>f.trim().length>0?void 0:"Token cannot be empty"}),!g)return}else p.type==="ssh"&&(u=await w.window.showInputBox({title:"SSH Key Path (Optional)",prompt:"Enter path to SSH private key (e.g. ~/.ssh/id_ed25519), or leave empty for default agent/keys"}));let v={name:o.trim(),git:{name:s.trim(),email:a.trim(),scope:n.scope},github:c?{host:l,username:c.trim()}:void 0,authentication:{type:p.type,source:p.type==="pat"?"vs-code-secret-storage":"user-input",sshKeyPath:u?.trim()||void 0}};try{let f=await e.createProfile(v,g);w.window.showInformationMessage(`Profile "${f.name}" created successfully!`),r?.()}catch(f){w.window.showErrorMessage(`Failed to create profile: ${String(f)}`)}})),d.subscriptions.push(w.commands.registerCommand("gitaxis.manageProfiles",async()=>{let o=await e.getProfiles();if(o.length===0){w.window.showInformationMessage("No profiles to manage. Create one first.");return}let s=o.map(l=>({label:l.name,description:`${l.git.name} <${l.git.email}>`,detail:`ID: ${l.id} \xB7 Auth: ${l.authentication.type}`,profileId:l.id})),a=await w.window.showQuickPick(s,{placeHolder:"Select a profile to manage"});if(!a)return;let n=[{label:"Set as Active",action:"active"},{label:"Rename Profile",action:"rename"},{label:"Edit Git Identity",action:"edit"},{label:"Delete Profile",action:"delete"}],c=await w.window.showQuickPick(n,{placeHolder:`Action for profile "${a.label}"`});if(c)if(c.action==="active")await w.commands.executeCommand("gitaxis.switchProfile",a.profileId);else if(c.action==="rename"){let l=await w.window.showInputBox({title:"Rename Profile",prompt:"Enter new profile name",value:a.label,validateInput:m=>T.isValidProfileName(m)?void 0:"Invalid profile name"});if(!l||l.trim()===a.label)return;try{await e.updateProfile(a.profileId,{name:l.trim()}),w.window.showInformationMessage(`Profile renamed to "${l.trim()}".`),r?.()}catch(m){w.window.showErrorMessage(`Failed to rename profile: ${String(m)}`)}}else if(c.action==="edit"){let l=await e.getProfile(a.profileId);if(!l)return;let m=await w.window.showInputBox({title:"Edit Git Name",prompt:"Enter commit author name",value:l.git.name});if(!m)return;let p=await w.window.showInputBox({title:"Edit Git Email",prompt:"Enter commit email",value:l.git.email,validateInput:g=>T.isValidEmail(g)?void 0:"Please enter a valid email"});if(!p)return;try{let g=await e.updateProfile(a.profileId,{git:{name:m.trim(),email:p.trim()}});if((await e.getActiveProfile())?.id===a.profileId){let v=w.window.activeTextEditor?.document.uri,f=v?w.workspace.getWorkspaceFolder(v)?.uri.fsPath:w.workspace.workspaceFolders?.[0]?.uri.fsPath;f&&await e.applyIdentityToRepository(g,f)}w.window.showInformationMessage(`Profile "${l.name}" updated.`),r?.()}catch(g){w.window.showErrorMessage(`Failed to update profile: ${String(g)}`)}}else c.action==="delete"&&await w.window.showWarningMessage(`Are you sure you want to delete profile "${a.label}"?`,{modal:!0},"Delete")==="Delete"&&(await e.deleteProfile(a.profileId),w.window.showInformationMessage(`Profile "${a.label}" deleted.`),r?.())})),d.subscriptions.push(w.commands.registerCommand("gitaxis.scanAccounts",async()=>{w.window.withProgress({location:w.ProgressLocation.Notification,title:"GitAxis: Scanning system Git and GitHub configuration (read-only)..."},async()=>{let o=await t.scan(),s=t.suggestProfiles(o);if(s.length===0){w.window.showInformationMessage("Scan completed. No new accounts detected.");return}let a=await e.getProfiles(),n=s.filter(m=>!a.some(p=>p.name.toLowerCase()===m.name.toLowerCase()));if(n.length===0){w.window.showInformationMessage("Scan completed. Detected accounts already exist in GitAxis profiles.");return}let c=n.map(m=>({label:`Import "${m.name}"`,description:`${m.git.name} <${m.git.email}>`,detail:m.description,suggestion:m})),l=await w.window.showQuickPick(c,{placeHolder:"Select an account to import as a GitAxis profile"});if(l)try{let m=await e.createProfile(l.suggestion);w.window.showInformationMessage(`Profile "${m.name}" imported successfully!`),r?.()}catch(m){w.window.showErrorMessage(`Failed to import profile: ${String(m)}`)}})}))}var L=k(require("crypto")),h=k(require("vscode"));function Y(){return h.workspace.workspaceFolders?.[0]?.uri.fsPath}function Xe(d,e,t,i){d.subscriptions.push(h.commands.registerCommand("gitaxis.status",async()=>{let o=Y();if(!o){h.window.showErrorMessage("No workspace folder open.");return}let s={id:L.randomUUID(),type:"git.status",input:{repositoryPath:o},target:{kind:"local-repository",path:o},safety:"read-only",confirmation:{required:!1},createdAt:new Date().toISOString(),initiatedBy:"command-palette"},a=await e.execute(s);a.success&&a.data?h.window.showInformationMessage(`Status: ${a.data.clean?"Clean":`${a.data.modified} modified, ${a.data.staged} staged, ${a.data.untracked} untracked`}`):h.window.showErrorMessage(a.error?.userMessage||"Failed to get status"),i?.()})),d.subscriptions.push(h.commands.registerCommand("gitaxis.reset",async()=>{let o=Y();if(!o)return;let s=await h.window.showQuickPick([{label:"mixed (Default)",mode:"mixed",description:"Resets index but keeps working tree changes"},{label:"soft",mode:"soft",description:"Keeps all changes staged"},{label:"hard \u26A0\uFE0F",mode:"hard",description:"DISCARDS all uncommitted changes"}],{title:"Select Reset Mode"});if(!s)return;let a=await h.window.showInputBox({title:"Git Reset",prompt:"Enter commit or ref to reset to",value:"HEAD"});if(!a)return;let n={id:L.randomUUID(),type:"git.reset",input:{repositoryPath:o,ref:a,mode:s.mode},target:{kind:"local-repository",path:o},safety:s.mode==="hard"?"destructive":"mutating",confirmation:s.mode==="hard"?{required:!0,reason:`git reset --hard ${a}`,warning:"All uncommitted changes will be discarded."}:{required:!1},createdAt:new Date().toISOString(),initiatedBy:"command-palette"},c=await e.execute(n);c.success?h.window.showInformationMessage(`Reset to ${a} (${s.mode}) succeeded.`):h.window.showErrorMessage(c.error?.userMessage||"Reset failed"),i?.()})),d.subscriptions.push(h.commands.registerCommand("gitaxis.manageRemote",async()=>{let o=Y();if(!o)return;let s=await h.window.showQuickPick([{label:"Add Remote",action:"add"},{label:"Change Remote URL",action:"setUrl"},{label:"Remove Remote",action:"remove"}],{title:"Remote Management"});if(s){if(s.action==="add"){let a=await h.window.showInputBox({prompt:"Remote name",value:"origin"});if(!a)return;let n=await h.window.showInputBox({prompt:"Remote URL"});if(!n)return;let c={id:L.randomUUID(),type:"git.remote.add",input:{repositoryPath:o,name:a,url:n},target:{kind:"local-repository",path:o},safety:"mutating",confirmation:{required:!1},createdAt:new Date().toISOString(),initiatedBy:"command-palette"},l=await e.execute(c);l.success?h.window.showInformationMessage(`Remote "${a}" added.`):h.window.showErrorMessage(l.error?.userMessage||"Failed to add remote")}else if(s.action==="setUrl"){let a=await h.window.showInputBox({prompt:"Remote name",value:"origin"});if(!a)return;let n=await h.window.showInputBox({prompt:"New Remote URL"});if(!n)return;let c={id:L.randomUUID(),type:"git.remote.set-url",input:{repositoryPath:o,name:a,url:n},target:{kind:"local-repository",path:o},safety:"mutating",confirmation:{required:!1},createdAt:new Date().toISOString(),initiatedBy:"command-palette"},l=await e.execute(c);l.success?h.window.showInformationMessage(`Remote "${a}" URL updated.`):h.window.showErrorMessage(l.error?.userMessage||"Failed to update remote URL")}else if(s.action==="remove"){let a=await h.window.showInputBox({prompt:"Remote name to remove"});if(!a)return;let n={id:L.randomUUID(),type:"git.remote.remove",input:{repositoryPath:o,name:a},target:{kind:"local-repository",path:o},safety:"mutating",confirmation:{required:!1},createdAt:new Date().toISOString(),initiatedBy:"command-palette"},c=await e.execute(n);c.success?h.window.showInformationMessage(`Remote "${a}" removed.`):h.window.showErrorMessage(c.error?.userMessage||"Failed to remove remote")}i?.()}}));let r;d.subscriptions.push(h.commands.registerCommand("gitaxis.diff",async()=>{let o=Y();if(!o){h.window.showErrorMessage("No workspace folder open.");return}let s=await h.window.showQuickPick([{label:"Working Tree Diff",staged:!1,description:"Unstaged changes"},{label:"Staged Changes Diff",staged:!0,description:"Staged changes (--staged)"}],{title:"Git Diff"});if(!s)return;let a={id:L.randomUUID(),type:"git.diff",input:{repositoryPath:o,staged:s.staged},target:{kind:"local-repository",path:o},safety:"read-only",confirmation:{required:!1},createdAt:new Date().toISOString(),initiatedBy:"command-palette"},n=await e.execute(a);if(n.success){let c=n.data?.trim();c?(r||(r=h.window.createOutputChannel("GitAxis: Diff")),r.clear(),r.appendLine(c),r.show()):h.window.showInformationMessage(`No ${s.staged?"staged":"unstaged"} changes detected.`)}else h.window.showErrorMessage(n.error?.userMessage||"Failed to get diff")})),d.subscriptions.push(h.commands.registerCommand("gitaxis.history",async()=>{let o=Y();if(!o){h.window.showErrorMessage("No workspace folder open.");return}let s={id:L.randomUUID(),type:"git.log",input:{repositoryPath:o,maxCount:30},target:{kind:"local-repository",path:o},safety:"read-only",confirmation:{required:!1},createdAt:new Date().toISOString(),initiatedBy:"command-palette"},a=await e.execute(s);if(a.success&&a.data){if(a.data.length===0){h.window.showInformationMessage("No commit history found.");return}let n=a.data.map(l=>({label:l.subject,description:`${l.authorName} \xB7 ${l.hash.slice(0,7)}`,detail:`${l.authorDate} (${l.authorEmail})`,commit:l})),c=await h.window.showQuickPick(n,{title:`Commit History (${a.data.length} recent commits)`,placeHolder:"Select a commit to view details"});if(c){let l="Copy Commit Hash";await h.window.showInformationMessage(`Commit ${c.commit.hash}

Author: ${c.commit.authorName} <${c.commit.authorEmail}>
Date: ${c.commit.authorDate}

${c.commit.subject}`,l)===l&&(await h.env.clipboard.writeText(c.commit.hash),h.window.showInformationMessage("Commit hash copied to clipboard."))}}else h.window.showErrorMessage(a.error?.userMessage||"Failed to load history")})),d.subscriptions.push(h.commands.registerCommand("gitaxis.clone",async()=>{let o=await t.getProfiles(),s;if(o.length>0){let u=await t.getActiveProfile(),v=o.map(x=>({label:`${x.id===u?.id?"$(check) ":""}${x.name}`,description:`${x.git.name} <${x.git.email}>`,profileId:x.id})),f=await h.window.showQuickPick(v,{title:"Clone Repository (1/3): Select Profile"});if(!f)return;s=f.profileId}let a=await h.window.showInputBox({title:"Clone Repository (2/3)",prompt:"Enter Git repository URL to clone (HTTPS or SSH)",validateInput:u=>u.trim().length>0?void 0:"Repository URL is required"});if(!a)return;let n=await h.window.showOpenDialog({title:"Clone Repository (3/3): Select Destination Directory",canSelectFiles:!1,canSelectFolders:!0,canSelectMany:!1,openLabel:"Select Clone Location"});if(!n||n.length===0)return;let c=n[0].fsPath,l=/\/([^/]+?)(?:\.git)?$/.exec(a.trim()),m=l?l[1]:"repository",p=`${c}/${m}`.replace(/\\/g,"/"),g={id:L.randomUUID(),type:"git.clone",input:{url:a.trim(),destinationPath:p},target:{kind:"none"},safety:"mutating",confirmation:{required:!1},createdAt:new Date().toISOString(),initiatedBy:"command-palette"};h.window.withProgress({location:h.ProgressLocation.Notification,title:`GitAxis: Cloning ${a.trim()}...`},async()=>{let u=await e.execute(g);if(u.success){if(s){await t.associateRepository(p,s);let x=await t.getProfile(s);x&&await t.applyIdentityToRepository(x,p)}let v="Open in New Window";await h.window.showInformationMessage(`Cloned successfully into ${p}`,v)===v&&await h.commands.executeCommand("vscode.openFolder",h.Uri.file(p),!0),i?.()}else h.window.showErrorMessage(u.error?.userMessage||"Clone failed")})}))}var j=k(require("crypto")),A=k(require("vscode"));function ke(){return A.workspace.workspaceFolders?.[0]?.uri.fsPath}function et(d,e,t){d.subscriptions.push(A.commands.registerCommand("gitaxis.createBranch",async()=>{let i=ke();if(!i)return;let r=await A.window.showInputBox({title:"Create Branch",prompt:"Enter new branch name",validateInput:n=>T.isValidBranchName(n)?void 0:"Invalid branch name"});if(!r)return;let o=await A.window.showQuickPick([{label:"Yes",value:!0,description:"Switch to new branch immediately"},{label:"No",value:!1,description:"Stay on current branch"}],{title:"Checkout new branch?"});if(!o)return;let s={id:j.randomUUID(),type:"git.branch.create",input:{repositoryPath:i,name:r.trim(),checkout:o.value},target:{kind:"local-repository",path:i},safety:"mutating",confirmation:{required:!1},createdAt:new Date().toISOString(),initiatedBy:"command-palette"},a=await e.execute(s);a.success?A.window.showInformationMessage(`Branch "${r}" created.`):A.window.showErrorMessage(a.error?.userMessage||"Failed to create branch"),t?.()})),d.subscriptions.push(A.commands.registerCommand("gitaxis.checkoutBranch",async()=>{let i=ke();if(!i)return;let r=await A.window.showInputBox({title:"Checkout Ref",prompt:"Enter branch name or commit ref to checkout"});if(!r)return;let o={id:j.randomUUID(),type:"git.checkout",input:{repositoryPath:i,ref:r.trim()},target:{kind:"local-repository",path:i},safety:"mutating",confirmation:{required:!1},createdAt:new Date().toISOString(),initiatedBy:"command-palette"},s=await e.execute(o);s.success?A.window.showInformationMessage(`Checked out "${r}".`):A.window.showErrorMessage(s.error?.userMessage||"Checkout failed"),t?.()})),d.subscriptions.push(A.commands.registerCommand("gitaxis.merge",async()=>{let i=ke();if(!i)return;let r=await A.window.showInputBox({title:"Git Merge",prompt:"Enter branch name to merge into current branch"});if(!r)return;let o={id:j.randomUUID(),type:"git.merge",input:{repositoryPath:i,branch:r.trim()},target:{kind:"local-repository",path:i},safety:"mutating",confirmation:{required:!1},createdAt:new Date().toISOString(),initiatedBy:"command-palette"},s=await e.execute(o);s.success?A.window.showInformationMessage(`Merged "${r}" successfully.`):A.window.showErrorMessage(s.error?.userMessage||"Merge failed"),t?.()})),d.subscriptions.push(A.commands.registerCommand("gitaxis.rebase",async()=>{let i=ke();if(!i)return;let r=await A.window.showInputBox({title:"Git Rebase",prompt:"Enter upstream branch to rebase onto (e.g. main, origin/main)"});if(!r)return;let o={id:j.randomUUID(),type:"git.rebase",input:{repositoryPath:i,onto:r.trim()},target:{kind:"local-repository",path:i},safety:"mutating",confirmation:{required:!1},createdAt:new Date().toISOString(),initiatedBy:"command-palette"},s=await e.execute(o);s.success?A.window.showInformationMessage(`Rebased onto "${r}" successfully.`):A.window.showErrorMessage(s.error?.userMessage||"Rebase failed"),t?.()}))}var Ge=k(require("crypto")),N=k(require("vscode"));function ft(){return N.workspace.workspaceFolders?.[0]?.uri.fsPath}function tt(d,e,t){d.subscriptions.push(N.commands.registerCommand("gitaxis.commit",async()=>{let i=ft();if(!i)return;let r=await N.window.showInputBox({title:"Git Commit",prompt:"Enter commit message",validateInput:n=>n.trim().length>0?void 0:"Commit message cannot be empty"});if(!r)return;let o=await N.window.showQuickPick([{label:"Stage All and Commit",stageAll:!0},{label:"Commit Staged Changes Only",stageAll:!1}],{title:"Staging options"});if(!o)return;if(o.stageAll){let n={id:Ge.randomUUID(),type:"git.add",input:{repositoryPath:i,paths:[],all:!0},target:{kind:"local-repository",path:i},safety:"mutating",confirmation:{required:!1},createdAt:new Date().toISOString(),initiatedBy:"command-palette"};await e.execute(n)}let s={id:Ge.randomUUID(),type:"git.commit",input:{repositoryPath:i,message:r.trim()},target:{kind:"local-repository",path:i},safety:"mutating",confirmation:{required:!1},createdAt:new Date().toISOString(),initiatedBy:"command-palette"},a=await e.execute(s);a.success?N.window.showInformationMessage(`Committed: "${r}"`):N.window.showErrorMessage(a.error?.userMessage||"Commit failed"),t?.()}))}var Se=k(require("crypto")),S=k(require("vscode"));function Oe(){return S.workspace.workspaceFolders?.[0]?.uri.fsPath}function ot(d,e,t){d.subscriptions.push(S.commands.registerCommand("gitaxis.push",async()=>{let i=Oe();if(!i)return;let r=await S.window.showQuickPick([{label:"Normal Push",force:!1,forceWithLease:!1},{label:"Force with Lease (Safer)",force:!1,forceWithLease:!0,description:"Only overwrites if remote matches expected ref"},{label:"Force Push \u26A0\uFE0F",force:!0,forceWithLease:!1,description:"May overwrite remote commits"}],{title:"Git Push Options"});if(!r)return;let o={id:Se.randomUUID(),type:"git.push",input:{repositoryPath:i,remote:"origin",force:r.force,forceWithLease:r.forceWithLease},target:{kind:"remote",remoteName:"origin"},safety:r.force?"destructive":"mutating",confirmation:r.force?{required:!0,reason:"Force push can overwrite remote history.",warning:"Remote commits may be permanently lost."}:{required:!1},createdAt:new Date().toISOString(),initiatedBy:"command-palette"};S.window.withProgress({location:S.ProgressLocation.Notification,title:"GitAxis: Pushing to remote..."},async()=>{let s=await e.execute(o);if(s.success?S.window.showInformationMessage("Push succeeded."):S.window.showErrorMessage(s.error?.userMessage||"Push failed"),s.warnings&&s.warnings.length>0)for(let a of s.warnings)S.window.showWarningMessage(`Warning: ${a.message}`);t?.()})})),d.subscriptions.push(S.commands.registerCommand("gitaxis.pull",async()=>{let i=Oe();if(!i)return;let r={id:Se.randomUUID(),type:"git.pull",input:{repositoryPath:i,remote:"origin"},target:{kind:"remote",remoteName:"origin"},safety:"mutating",confirmation:{required:!1},createdAt:new Date().toISOString(),initiatedBy:"command-palette"};S.window.withProgress({location:S.ProgressLocation.Notification,title:"GitAxis: Pulling from remote..."},async()=>{let o=await e.execute(r);o.success?S.window.showInformationMessage("Pull succeeded."):S.window.showErrorMessage(o.error?.userMessage||"Pull failed"),t?.()})})),d.subscriptions.push(S.commands.registerCommand("gitaxis.fetch",async()=>{let i=Oe();if(!i)return;let r={id:Se.randomUUID(),type:"git.fetch",input:{repositoryPath:i,remote:"origin",prune:!0},target:{kind:"remote",remoteName:"origin"},safety:"mutating",confirmation:{required:!1},createdAt:new Date().toISOString(),initiatedBy:"command-palette"};S.window.withProgress({location:S.ProgressLocation.Notification,title:"GitAxis: Fetching remotes..."},async()=>{let o=await e.execute(r);o.success?S.window.showInformationMessage("Fetch completed."):S.window.showErrorMessage(o.error?.userMessage||"Fetch failed"),t?.()})}))}var Q=k(require("crypto")),B=k(require("vscode"));function ht(){return B.workspace.workspaceFolders?.[0]?.uri.fsPath}function it(d,e,t){d.subscriptions.push(B.commands.registerCommand("gitaxis.stash",async()=>{let i=ht();if(!i)return;let r=await B.window.showQuickPick([{label:"Stash changes (push)",action:"create"},{label:"Pop stash (stash@{0})",action:"pop"},{label:"Apply stash",action:"apply"},{label:"Drop stash \u26A0\uFE0F",action:"drop"}],{title:"Git Stash Options"});if(r){if(r.action==="create"){let o=await B.window.showInputBox({prompt:"Optional stash message"}),s={id:Q.randomUUID(),type:"git.stash.create",input:{repositoryPath:i,message:o,includeUntracked:!0},target:{kind:"local-repository",path:i},safety:"mutating",confirmation:{required:!1},createdAt:new Date().toISOString(),initiatedBy:"command-palette"},a=await e.execute(s);a.success?B.window.showInformationMessage("Stashed successfully."):B.window.showErrorMessage(a.error?.userMessage||"Stash failed")}else if(r.action==="pop"){let o={id:Q.randomUUID(),type:"git.stash.pop",input:{repositoryPath:i,stash:"stash@{0}"},target:{kind:"local-repository",path:i},safety:"mutating",confirmation:{required:!1},createdAt:new Date().toISOString(),initiatedBy:"command-palette"},s=await e.execute(o);s.success?B.window.showInformationMessage("Stash popped successfully."):B.window.showErrorMessage(s.error?.userMessage||"Stash pop failed")}else if(r.action==="apply"){let o={id:Q.randomUUID(),type:"git.stash.apply",input:{repositoryPath:i,stash:"stash@{0}"},target:{kind:"local-repository",path:i},safety:"mutating",confirmation:{required:!1},createdAt:new Date().toISOString(),initiatedBy:"command-palette"},s=await e.execute(o);s.success?B.window.showInformationMessage("Stash applied successfully."):B.window.showErrorMessage(s.error?.userMessage||"Stash apply failed")}else if(r.action==="drop"){let o={id:Q.randomUUID(),type:"git.stash.drop",input:{repositoryPath:i,stash:"stash@{0}"},target:{kind:"local-repository",path:i},safety:"destructive",confirmation:{required:!0,reason:"Drop stash@{0}",warning:"Stashed changes will be permanently discarded."},createdAt:new Date().toISOString(),initiatedBy:"command-palette"},s=await e.execute(o);s.success?B.window.showInformationMessage("Stash dropped."):B.window.showErrorMessage(s.error?.userMessage||"Stash drop failed")}t?.()}}))}var Ee=k(require("crypto")),C=k(require("vscode"));function wt(){return C.workspace.workspaceFolders?.[0]?.uri.fsPath}function rt(d,e,t){d.subscriptions.push(C.commands.registerCommand("gitaxis.tag",async()=>{let i=wt();if(!i){C.window.showErrorMessage("No workspace folder open.");return}let r=await C.window.showQuickPick([{label:"Create Tag",action:"create",description:"Create a lightweight or annotated tag"},{label:"List Tags",action:"list",description:"View tags in this repository"},{label:"Push Tags",action:"push",description:"Push tags to remote origin"},{label:"Delete Tag",action:"delete",description:"Delete a local tag"}],{title:"Git Tag Management"});if(r){if(r.action==="create"){let o=await C.window.showInputBox({title:"Create Tag",prompt:"Enter tag name (e.g. v1.0.0)",validateInput:l=>T.isValidBranchName(l)?void 0:"Invalid tag name"});if(!o)return;let s=await C.window.showInputBox({title:"Tag Message",prompt:"Optional annotation message (leave blank for lightweight tag)"}),a=await C.window.showInputBox({title:"Target Commit",prompt:"Optional commit ref/hash (default: HEAD)"}),n={id:Ee.randomUUID(),type:"git.tag.create",input:{repositoryPath:i,name:o.trim(),message:s?.trim()||void 0,target:a?.trim()||void 0},target:{kind:"local-repository",path:i},safety:"mutating",confirmation:{required:!1},createdAt:new Date().toISOString(),initiatedBy:"command-palette"},c=await e.execute(n);c.success?C.window.showInformationMessage(`Tag "${o}" created.`):C.window.showErrorMessage(c.error?.userMessage||"Failed to create tag"),t?.()}else if(r.action==="list")try{let s=await e.gitClient.getTags(i);if(s.length===0){C.window.showInformationMessage("No tags found in repository.");return}let a=s.map(n=>({label:n.name}));await C.window.showQuickPick(a,{title:`Repository Tags (${s.length})`})}catch(o){C.window.showErrorMessage(`Failed to list tags: ${String(o)}`)}else if(r.action==="delete")try{let s=await e.gitClient.getTags(i);if(s.length===0){C.window.showInformationMessage("No tags to delete.");return}let a=s.map(m=>({label:m.name})),n=await C.window.showQuickPick(a,{title:"Select Tag to Delete"});if(!n)return;let c={id:Ee.randomUUID(),type:"git.tag.delete",input:{repositoryPath:i,name:n.label},target:{kind:"local-repository",path:i},safety:"mutating",confirmation:{required:!1},createdAt:new Date().toISOString(),initiatedBy:"command-palette"},l=await e.execute(c);l.success?C.window.showInformationMessage(`Tag "${n.label}" deleted.`):C.window.showErrorMessage(l.error?.userMessage||"Failed to delete tag"),t?.()}catch(o){C.window.showErrorMessage(`Failed to delete tag: ${String(o)}`)}else if(r.action==="push"){let o={id:Ee.randomUUID(),type:"git.push",input:{repositoryPath:i,remote:"origin",tags:!0},target:{kind:"remote",remoteName:"origin"},safety:"mutating",confirmation:{required:!1},createdAt:new Date().toISOString(),initiatedBy:"command-palette"};C.window.withProgress({location:C.ProgressLocation.Notification,title:"GitAxis: Pushing tags to remote..."},async()=>{let s=await e.execute(o);s.success?C.window.showInformationMessage("Tags pushed to remote."):C.window.showErrorMessage(s.error?.userMessage||"Failed to push tags"),t?.()})}}}))}var Z=k(require("crypto")),b=k(require("vscode"));function J(){return b.workspace.workspaceFolders?.[0]?.uri.fsPath}function st(d,e,t){d.subscriptions.push(b.commands.registerCommand("gitaxis.openGitHubRepo",async()=>{let i=J();if(!i)return;let r=await t.detectRepository(i),o=r?.remotes.find(n=>n.name==="origin")||r?.remotes[0];if(!o||!o.owner||!o.repository){b.window.showWarningMessage("No GitHub remote found for this repository.");return}let a=`https://${o.host||"github.com"}/${o.owner}/${o.repository}`;await b.env.openExternal(b.Uri.parse(a))})),d.subscriptions.push(b.commands.registerCommand("gitaxis.createIssue",async()=>{let i=J();if(!i)return;let r=await t.detectRepository(i),o=r?.remotes.find(c=>c.name==="origin")||r?.remotes[0];if(!o||!o.owner||!o.repository){b.window.showWarningMessage("No GitHub remote configured.");return}let s=await b.window.showInputBox({title:"Create GitHub Issue",prompt:"Enter issue title",validateInput:c=>c.trim().length>0?void 0:"Title cannot be empty"});if(!s)return;let a=await b.window.showInputBox({title:"Create GitHub Issue",prompt:"Enter issue description (optional)"}),n={id:Z.randomUUID(),type:"github.issue.create",input:{host:o.host,owner:o.owner,repository:o.repository,title:s.trim(),body:a?.trim()},target:{kind:"github-repository",host:o.host||"github.com",owner:o.owner,repository:o.repository},safety:"mutating",confirmation:{required:!1},createdAt:new Date().toISOString(),initiatedBy:"command-palette"};b.window.withProgress({location:b.ProgressLocation.Notification,title:"GitAxis: Creating GitHub issue..."},async()=>{let c=await e.execute(n);if(c.success&&c.data){let l="Open Issue";await b.window.showInformationMessage(`Issue #${c.data.number} created: ${c.data.title}`,l)===l&&c.data.htmlUrl&&await b.env.openExternal(b.Uri.parse(c.data.htmlUrl))}else b.window.showErrorMessage(c.error?.userMessage||"Failed to create issue")})})),d.subscriptions.push(b.commands.registerCommand("gitaxis.createPullRequest",async()=>{let i=J();if(!i)return;let r=await t.detectRepository(i),o=r?.remotes.find(m=>m.name==="origin")||r?.remotes[0];if(!o||!o.owner||!o.repository){b.window.showWarningMessage("No GitHub remote configured.");return}let s=r?.currentBranch||"main",a=await b.window.showInputBox({title:"Create Pull Request",prompt:"Enter Pull Request title",value:`Update from ${s}`,validateInput:m=>m.trim().length>0?void 0:"Title cannot be empty"});if(!a)return;let n=await b.window.showInputBox({title:"Target Branch (Base)",prompt:"Enter base branch",value:"main"});if(!n)return;let c=await b.window.showInputBox({title:"Pull Request Description",prompt:"Enter description (optional)"}),l={id:Z.randomUUID(),type:"github.pull-request.create",input:{host:o.host,owner:o.owner,repository:o.repository,title:a.trim(),head:s,base:n.trim(),body:c?.trim()},target:{kind:"github-repository",host:o.host||"github.com",owner:o.owner,repository:o.repository},safety:"mutating",confirmation:{required:!1},createdAt:new Date().toISOString(),initiatedBy:"command-palette"};b.window.withProgress({location:b.ProgressLocation.Notification,title:"GitAxis: Creating Pull Request..."},async()=>{let m=await e.execute(l);if(m.success&&m.data){let p="Open PR";await b.window.showInformationMessage(`Pull Request #${m.data.number} created!`,p)===p&&m.data.htmlUrl&&await b.env.openExternal(b.Uri.parse(m.data.htmlUrl))}else b.window.showErrorMessage(m.error?.userMessage||"Failed to create pull request")})})),d.subscriptions.push(b.commands.registerCommand("gitaxis.actions",async()=>{let i=J();if(!i)return;let r=await t.detectRepository(i),o=r?.remotes.find(a=>a.name==="origin")||r?.remotes[0];if(!o||!o.owner||!o.repository){b.window.showWarningMessage("No GitHub remote configured.");return}let s={id:Z.randomUUID(),type:"github.actions.list",input:{host:o.host,owner:o.owner,repository:o.repository},target:{kind:"github-repository",host:o.host||"github.com",owner:o.owner,repository:o.repository},safety:"read-only",confirmation:{required:!1},createdAt:new Date().toISOString(),initiatedBy:"command-palette"};b.window.withProgress({location:b.ProgressLocation.Notification,title:"GitAxis: Fetching GitHub Actions..."},async()=>{let a=await e.execute(s);if(a.success&&a.data){if(a.data.length===0){b.window.showInformationMessage("No workflow runs found.");return}let n=a.data.map(l=>({label:`${l.status==="completed"&&l.conclusion==="success"?"\u2713":"\u25CF"} ${l.name}`,description:`Status: ${l.status} \xB7 Conclusion: ${l.conclusion||"pending"}`,detail:`Branch: ${l.headBranch||"\u2014"}`,htmlUrl:l.htmlUrl})),c=await b.window.showQuickPick(n,{title:`GitHub Actions Runs (${a.data.length})`,placeHolder:"Select a workflow run to view in browser"});c?.htmlUrl&&await b.env.openExternal(b.Uri.parse(c.htmlUrl))}else b.window.showErrorMessage(a.error?.userMessage||"Failed to list actions")})})),d.subscriptions.push(b.commands.registerCommand("gitaxis.releases",async()=>{let i=J();if(!i)return;let r=await t.detectRepository(i),o=r?.remotes.find(a=>a.name==="origin")||r?.remotes[0];if(!o||!o.owner||!o.repository){b.window.showWarningMessage("No GitHub remote configured.");return}let s={id:Z.randomUUID(),type:"github.release.list",input:{host:o.host,owner:o.owner,repository:o.repository},target:{kind:"github-repository",host:o.host||"github.com",owner:o.owner,repository:o.repository},safety:"read-only",confirmation:{required:!1},createdAt:new Date().toISOString(),initiatedBy:"command-palette"};b.window.withProgress({location:b.ProgressLocation.Notification,title:"GitAxis: Fetching GitHub Releases..."},async()=>{let a=await e.execute(s);if(a.success&&a.data){if(a.data.length===0){b.window.showInformationMessage("No releases found.");return}let n=a.data.map(l=>({label:l.name||l.tagName,description:`Tag: ${l.tagName}`,detail:`Published: ${l.publishedAt||"draft"}`,htmlUrl:l.htmlUrl})),c=await b.window.showQuickPick(n,{title:`GitHub Releases (${a.data.length})`,placeHolder:"Select a release to view in browser"});c?.htmlUrl&&await b.env.openExternal(b.Uri.parse(c.htmlUrl))}else b.window.showErrorMessage(a.error?.userMessage||"Failed to list releases")})}))}var H;async function bt(d){P.info("Activating GitAxis extension...");let e=new te(d.secrets),t=new ie(d.globalState),i=new ce("git"),r=new ue(e),o=new ge(t,r,i),s=new fe(i),a=new ye(i),n=new xe(o,i);n.getConfirmationHandler().setPromptFn(async(u,v)=>{if(!$.workspace.getConfiguration("gitaxis").get("confirmDestructiveOperations",!0))return!0;let M="Continue",U=v?`${v}

Do you want to proceed?`:"Do you want to proceed?";return await $.window.showWarningMessage(u,{modal:!0,detail:U},M)===M}),n.setProfileMismatchPrompt(async(u,v,f)=>{let x=f?`Switch to ${f.name}`:void 0,M="Continue",U=x?[x,M]:[M],D=`Profile Mismatch: Active profile "${u.name}" (${u.github?.username||"no user"}) does not match remote owner "${v}".`,F=await $.window.showWarningMessage(D,{modal:!0},...U);return F===x?"switch":F===M?"continue":"cancel"}),H=$.window.createStatusBarItem($.StatusBarAlignment.Left,100),H.command="gitaxis.switchProfile",H.tooltip="Click to switch GitAxis Profile",d.subscriptions.push(H);let c=async()=>{let u=await o.getActiveProfile(),v,f=$.workspace.workspaceFolders;if(f&&f.length>0)try{let x=await s.detectRepository(f[0].uri.fsPath);x?.currentBranch&&(v=x.currentBranch)}catch{}u?(H.text=v?`$(github) ${u.name} $(git-branch) ${v}`:`$(github) ${u.name}`,H.show()):(H.text="$(github) No Profile",H.show())};await c();let l,m=async()=>{await c(),l&&await l.refresh();try{await $.commands.executeCommand("git.refresh")}catch{}};l=new K(d.extensionUri,o,s,a,m),d.subscriptions.push($.window.registerWebviewViewProvider(K.viewType,l)),d.subscriptions.push($.commands.registerCommand("gitaxis.open",async()=>{await $.commands.executeCommand("gitaxis.sidebarView.focus")})),Ze(d,o,a,i,m),Xe(d,n,o,m),et(d,n,m),tt(d,n,m),ot(d,n,m),it(d,n,m),rt(d,n,m),st(d,n,s);let p=async()=>{let u=$.workspace.workspaceFolders;if(!u||u.length===0)return;let v=u[0].uri.fsPath,f=await s.detectRepository(v);if(!f||!$.workspace.getConfiguration("gitaxis").get("autoDetectProfile",!0))return;let M=await o.matchProfile({repositoryPath:f.path,remotes:f.remotes}),U=await o.getActiveProfile();if(M.recommendedProfileId&&M.recommendedProfileId!==U?.id){let D=await o.getProfile(M.recommendedProfileId);if(D){let F=`Use ${D.name}`;await $.window.showInformationMessage(`GitAxis detected repository "${f.name}". Recommended profile: "${D.name}"`,F,"Ignore")===F&&(await o.switchProfile(D.id,f.path),await m())}}};if((await o.getProfiles()).length===0){if($.workspace.getConfiguration("gitaxis").get("promptScanOnFirstLaunch",!0)){let v="Scan";$.window.showInformationMessage("Welcome to GitAxis! Would you like to check your existing Git/GitHub configuration?",v,"Skip").then(async f=>{f===v&&await $.commands.executeCommand("gitaxis.scanAccounts")})}}else setTimeout(()=>{p().catch(u=>P.error(`Workspace check error: ${String(u)}`))},1e3);d.subscriptions.push($.workspace.onDidChangeWorkspaceFolders(()=>{p().catch(u=>P.error(`Workspace change check error: ${String(u)}`)),m()})),P.info("GitAxis extension activated successfully.")}function yt(){P.info("Deactivating GitAxis extension...")}0&&(module.exports={activate,deactivate});
