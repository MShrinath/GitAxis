"use strict";var st=Object.create;var J=Object.defineProperty;var at=Object.getOwnPropertyDescriptor;var nt=Object.getOwnPropertyNames;var ct=Object.getPrototypeOf,dt=Object.prototype.hasOwnProperty;var lt=(d,t)=>{for(var e in t)J(d,e,{get:t[e],enumerable:!0})},Ge=(d,t,e,i)=>{if(t&&typeof t=="object"||typeof t=="function")for(let r of nt(t))!dt.call(d,r)&&r!==e&&J(d,r,{get:()=>t[r],enumerable:!(i=at(t,r))||i.enumerable});return d};var E=(d,t,e)=>(e=d!=null?st(ct(d)):{},Ge(t||!d||!d.__esModule?J(e,"default",{value:d,enumerable:!0}):e,d)),mt=d=>Ge(J({},"__esModule",{value:!0}),d);var bt={};lt(bt,{activate:()=>wt,deactivate:()=>yt});module.exports=mt(bt);var R=E(require("vscode"));var Se=class{storeMap=new Map;async get(t){return this.storeMap.get(t)}async store(t,e){this.storeMap.set(t,e)}async delete(t){this.storeMap.delete(t)}},Z=class{storage;constructor(t){this.storage=t??new Se}setStorage(t){this.storage=t}getSecretKey(t,e){return`gitaxis.profile.${t}.${e}`}async getSecret(t,e){let i=this.getSecretKey(t,e);return this.storage.get(i)}async setSecret(t,e,i){let r=this.getSecretKey(t,e);await this.storage.store(r,i)}async deleteSecret(t,e){let i=this.getSecretKey(t,e);await this.storage.delete(i)}async deleteAllForProfile(t){let e=["github-token","oauth-access-token","oauth-refresh-token","ssh-passphrase"];for(let i of e)await this.deleteSecret(t,i)}};var De=E(require("crypto"));var X=E(require("os")),Oe=E(require("path")),B=class{static isWindows(){return X.platform()==="win32"}static isMacOS(){return X.platform()==="darwin"}static isLinux(){return X.platform()==="linux"}static normalizePath(t){return Oe.normalize(t).replace(/\\/g,"/")}};var Ce=class{map=new Map;get(t,e){return this.map.has(t)?this.map.get(t):e}async update(t,e){e===void 0?this.map.delete(t):this.map.set(t,e)}},ee=class d{static PROFILES_KEY="gitaxis.profiles";static ACTIVE_PROFILE_KEY="gitaxis.activeProfileId";static ASSOCIATIONS_KEY="gitaxis.repoAssociations";memento;constructor(t){this.memento=t??new Ce}setMemento(t){this.memento=t}generateId(){return`profile_${De.randomUUID().replace(/-/g,"").slice(0,10)}`}async list(){let t=this.memento.get(d.PROFILES_KEY,[]);return Array.isArray(t)?t:[]}async get(t){return(await this.list()).find(i=>i.id===t)}async getByName(t){return(await this.list()).find(i=>i.name.toLowerCase()===t.toLowerCase())}async create(t){let e=await this.list();if(e.find(n=>n.name.toLowerCase()===t.name.toLowerCase()))throw new Error(`Profile with name "${t.name}" already exists`);let r=new Date().toISOString(),o=t.id??this.generateId(),s={id:o,name:t.name.trim(),git:{name:t.git.name.trim(),email:t.git.email.trim(),scope:t.git.scope??"local"},github:t.github?{host:t.github.host?.trim()||"github.com",username:t.github.username.trim()}:void 0,authentication:{type:t.authentication.type,source:t.authentication.source,secretRef:t.authentication.type==="pat"?{provider:"vscode-secret-storage",key:`gitaxis.profile.${o}.github-token`}:void 0},metadata:{source:t.source??"manual",imported:t.imported??!1,description:t.description},createdAt:r,updatedAt:r};return e.push(s),await this.memento.update(d.PROFILES_KEY,e),await this.getActive()||await this.setActive(o),s}async update(t,e){let i=await this.list(),r=i.findIndex(a=>a.id===t);if(r===-1)throw new Error(`Profile with ID "${t}" not found`);let o=i[r];if(e.name&&e.name.toLowerCase()!==o.name.toLowerCase()&&i.find(n=>n.id!==t&&n.name.toLowerCase()===e.name?.toLowerCase()))throw new Error(`Profile with name "${e.name}" already exists`);let s={...o,name:e.name?e.name.trim():o.name,git:{...o.git,...e.git?.name?{name:e.git.name.trim()}:{},...e.git?.email?{email:e.git.email.trim()}:{},...e.git?.scope?{scope:e.git.scope}:{}},github:e.github!==void 0?e.github.username!==void 0&&!e.github.username.trim()?void 0:{host:e.github.host?.trim()||o.github?.host||"github.com",username:e.github.username?e.github.username.trim():o.github?.username||""}:o.github,authentication:{...o.authentication,...e.authentication?.type?{type:e.authentication.type}:{},...e.authentication?.source?{source:e.authentication.source}:{}},metadata:{...o.metadata,...e.description!==void 0?{description:e.description}:{}},updatedAt:new Date().toISOString()};return i[r]=s,await this.memento.update(d.PROFILES_KEY,i),s}async delete(t){let e=await this.list();if(!e.some(a=>a.id===t))return;e=e.filter(a=>a.id!==t),await this.memento.update(d.PROFILES_KEY,e);let r=await this.getActive();if(r&&r.id===t){let a=e[0]?.id;await this.memento.update(d.ACTIVE_PROFILE_KEY,a)}let o=await this.getAllAssociations(),s=!1;for(let a of Object.keys(o))o[a]===t&&(delete o[a],s=!0);s&&await this.memento.update(d.ASSOCIATIONS_KEY,o)}async setActive(t){if(!await this.get(t))throw new Error(`Cannot activate non-existent profile "${t}"`);await this.memento.update(d.ACTIVE_PROFILE_KEY,t);let i=await this.list(),r=i.findIndex(o=>o.id===t);r!==-1&&(i[r].metadata.lastUsedAt=new Date().toISOString(),await this.memento.update(d.PROFILES_KEY,i))}async getActive(){let t=this.memento.get(d.ACTIVE_PROFILE_KEY);return t?this.get(t):(await this.list())[0]}async getAssociation(t){let e=B.normalizePath(t);return(await this.getAllAssociations())[e]}async setAssociation(t,e){let i=B.normalizePath(t),r=await this.getAllAssociations();r[i]=e,await this.memento.update(d.ASSOCIATIONS_KEY,r)}async removeAssociation(t){let e=B.normalizePath(t),i=await this.getAllAssociations();delete i[e],await this.memento.update(d.ASSOCIATIONS_KEY,i)}async getAllAssociations(){let t=this.memento.get(d.ASSOCIATIONS_KEY,{});return typeof t=="object"&&t!==null?{...t}:{}}};var Ue=require("child_process"),Fe=require("util");var te=class{static parse(t,e,i){let r=e||i||"",o=this.parseUrl(r);return{name:t,fetchUrl:e,pushUrl:i,host:o?.host,owner:o?.owner,repository:o?.repository}}static parseUrl(t){if(!t)return;let e=t.trim(),i=/^git@([^:]+):([^\/]+)\/(.+?)(?:\.git)?$/i.exec(e);if(i)return{host:i[1],owner:i[2],repository:i[3]};try{let r=new URL(e.includes("://")?e:`https://${e}`),s=r.pathname.replace(/^\//,"").replace(/\.git$/,"").split("/");if(s.length>=2)return{host:r.hostname,owner:s[0],repository:s.slice(1).join("/")}}catch{}}};var H=class{static parseStatus(t){let e=0,i=0,r=0,o=0,s=0,a=0,n=t.split(`
`);for(let l of n){let m=l.trimEnd();if(m){if(m.startsWith("#")){if(m.startsWith("# branch.ab ")){let g=/\+(\d+)\s+-(\d+)/.exec(m);g&&(s=parseInt(g[1],10),a=parseInt(g[2],10))}continue}if(m.startsWith("? "))r++;else if(m.startsWith("u ")||m.startsWith("1 U")||m.startsWith("2 U"))o++;else if(m.startsWith("1 ")||m.startsWith("2 ")){let u=m.split(" ")[1];u&&u.length>=2&&(u[0]!=="."&&e++,u[1]!=="."&&i++)}else if(m.length>=2){let g=m[0],u=m[1];g==="?"&&u==="?"?r++:g==="U"||u==="U"||g==="A"&&u==="A"||g==="D"&&u==="D"?o++:(g!==" "&&g!=="?"&&e++,u!==" "&&u!=="?"&&i++)}}}return{clean:e===0&&i===0&&r===0&&o===0,staged:e,modified:i,untracked:r,conflicted:o,ahead:s,behind:a}}static parseRemotes(t){let e=new Map,i=t.split(`
`);for(let o of i){let s=o.trim();if(!s)continue;let a=s.split(/\s+/);if(a.length>=3){let n=a[0],c=a[1],l=a[2],m=e.get(n)||{};l.includes("fetch")?m.fetchUrl=c:l.includes("push")&&(m.pushUrl=c),e.set(n,m)}}let r=[];for(let[o,s]of e.entries())r.push(te.parse(o,s.fetchUrl,s.pushUrl));return r}};var oe=class{static parseBranchList(t){let e=t.split(`
`),i=[];for(let r of e){let o=r.trim();if(!o)continue;let s=o.startsWith("*"),a=o.replace(/^\*\s*/,"").trim();i.push({name:a,isCurrent:s})}return i}};var ie=class{static parseLog(t){let e=[],i=t.split("").filter(r=>r.trim().length>0);for(let r of i){let o=r.trim().split("");o.length>=5&&e.push({hash:o[0].trim(),shortHash:o[0].trim().slice(0,7),author:o[1].trim(),email:o[2].trim(),date:o[3].trim(),message:o[4].trim()})}return e}};var re=class{static parseStashList(t){let e=t.split(`
`),i=[];for(let r of e){let o=r.trim();if(!o)continue;let s=/^stash@\{(\d+)\}:\s*(.+)$/.exec(o);s&&i.push({index:parseInt(s[1],10),ref:`stash@{${s[1]}}`,message:s[2].trim()})}return i}};var se=class{static parseTagList(t){return t.split(`
`).map(e=>e.trim()).filter(e=>e.length>0).map(e=>({name:e}))}};var Ee=class d{static instance;prefix="[GitAxis]";static getInstance(){return d.instance||(d.instance=new d),d.instance}sanitize(t){return t.replace(/ghp_[A-Za-z0-9_]{36,}/g,"ghp_***[REDACTED]").replace(/github_pat_[A-Za-z0-9_]{40,}/g,"github_pat_***[REDACTED]").replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi,"Bearer ***[REDACTED]").replace(/password[:=]\s*[^\s,]+/gi,"password=***[REDACTED]")}info(t,...e){console.log(`${this.prefix} ${this.sanitize(t)}`,...e)}warn(t,...e){console.warn(`${this.prefix} [WARN] ${this.sanitize(t)}`,...e)}error(t,e){console.error(`${this.prefix} [ERROR] ${this.sanitize(t)}`,e)}debug(t,...e){console.debug(`${this.prefix} [DEBUG] ${this.sanitize(t)}`,...e)}},I=Ee.getInstance();var ut=(0,Fe.promisify)(Ue.execFile),ae=class{constructor(t="git"){this.gitPath=t}async exec(t,e={}){try{let i=await ut(this.gitPath,t,{cwd:e.cwd,timeout:e.timeout??3e4,env:{...process.env,...e.env||{},LANG:"C",LC_ALL:"C"}});return{stdout:i.stdout.trim(),stderr:i.stderr.trim()}}catch(i){let r=i,o=r.stdout?.trim()||"",s=r.stderr?.trim()||r.message||"";throw I.error(`Git command failed: ${this.gitPath} ${t.join(" ")}: ${s}`),new Error(s||o||`Git process exited with code ${r.code}`)}}async isGitAvailable(){try{return await this.exec(["--version"],{timeout:3e3}),!0}catch{return!1}}async getVersion(){let{stdout:t}=await this.exec(["--version"]);return t}async isRepository(t){try{let{stdout:e}=await this.exec(["rev-parse","--is-inside-work-tree"],{cwd:t});return e==="true"}catch{return!1}}async getRoot(t){let{stdout:e}=await this.exec(["rev-parse","--show-toplevel"],{cwd:t});return e}async getCurrentBranch(t){try{let{stdout:e}=await this.exec(["branch","--show-current"],{cwd:t});if(e)return e}catch{}try{let{stdout:e}=await this.exec(["rev-parse","--abbrev-ref","HEAD"],{cwd:t});return e}catch{return"HEAD"}}async status(t){try{let{stdout:e}=await this.exec(["status","--porcelain=v2","--branch"],{cwd:t});return H.parseStatus(e)}catch{let{stdout:e}=await this.exec(["status","--porcelain"],{cwd:t});return H.parseStatus(e)}}async diff(t,e,i){let r=["diff"];e&&r.push("--staged"),i&&r.push("--",i);let{stdout:o}=await this.exec(r,{cwd:t});return o}async add(t,e,i){let r=["add"];i?r.push("-A"):e.length>0?r.push("--",...e):r.push("."),await this.exec(r,{cwd:t})}async restore(t,e,i){let r=["restore"];i&&r.push("--staged"),r.push("--",...e),await this.exec(r,{cwd:t})}async commit(t,e,i,r){let o=["commit","-m",e];i&&o.push("--amend"),r&&o.push("--signoff");let{stdout:s}=await this.exec(o,{cwd:t});return s}async amend(t,e,i){let r=["commit","--amend"];i?r.push("--no-edit"):e&&r.push("-m",e);let{stdout:o}=await this.exec(r,{cwd:t});return o}async getBranches(t){let{stdout:e}=await this.exec(["branch","--list"],{cwd:t});return oe.parseBranchList(e)}async createBranch(t,e,i,r){if(r){let o=["checkout","-b",e];i&&o.push(i),await this.exec(o,{cwd:t})}else{let o=["branch",e];i&&o.push(i),await this.exec(o,{cwd:t})}}async deleteBranch(t,e,i){let r=["branch",i?"-D":"-d",e];await this.exec(r,{cwd:t})}async renameBranch(t,e,i){await this.exec(["branch","-m",e,i],{cwd:t})}async checkout(t,e,i){let r=["checkout"];i&&r.push("-b"),r.push(e),await this.exec(r,{cwd:t})}async switchBranch(t,e,i){let r=["switch"];i&&r.push("-c"),r.push(e),await this.exec(r,{cwd:t})}async merge(t,e,i,r){let o=["merge"];i&&o.push("--no-ff"),r&&o.push("--squash"),o.push(e);let{stdout:s}=await this.exec(o,{cwd:t});return s}async rebase(t,e){let i=["rebase",e],{stdout:r}=await this.exec(i,{cwd:t});return r}async fetch(t,e="origin",i,r){let o=["fetch",e];i&&o.push("--prune"),r&&o.push("--tags");let{stdout:s,stderr:a}=await this.exec(o,{cwd:t});return s||a}async pull(t,e,i,r){let o=["pull"];r&&o.push("--rebase"),e&&o.push(e),i&&o.push(i);let{stdout:s,stderr:a}=await this.exec(o,{cwd:t});return s||a}async push(t,e="origin",i,r,o,s,a){let n=["push"];r&&n.push("-u"),o?n.push("--force"):s&&n.push("--force-with-lease"),a&&n.push("--tags"),n.push(e),i&&n.push(i);let{stdout:c,stderr:l}=await this.exec(n,{cwd:t});return c||l}async stash(t,e,i){let r=["stash","push"];i&&r.push("-u"),e&&r.push("-m",e);let{stdout:o}=await this.exec(r,{cwd:t});return o}async stashApply(t,e="stash@{0}"){let{stdout:i}=await this.exec(["stash","apply",e],{cwd:t});return i}async stashPop(t,e="stash@{0}"){let{stdout:i}=await this.exec(["stash","pop",e],{cwd:t});return i}async stashDrop(t,e="stash@{0}"){let{stdout:i}=await this.exec(["stash","drop",e],{cwd:t});return i}async getStashList(t){let{stdout:e}=await this.exec(["stash","list"],{cwd:t});return re.parseStashList(e)}async createTag(t,e,i,r){let o=["tag"];r?o.push("-a",e,"-m",r):o.push(e),i&&o.push(i),await this.exec(o,{cwd:t})}async deleteTag(t,e){await this.exec(["tag","-d",e],{cwd:t})}async getTags(t){let{stdout:e}=await this.exec(["tag","-l"],{cwd:t});return se.parseTagList(e)}async getRemotes(t){let{stdout:e}=await this.exec(["remote","-v"],{cwd:t});return H.parseRemotes(e)}async addRemote(t,e,i){await this.exec(["remote","add",e,i],{cwd:t})}async removeRemote(t,e){await this.exec(["remote","remove",e],{cwd:t})}async setRemoteUrl(t,e,i,r){let o=["remote","set-url"];r&&o.push("--push"),o.push(e,i),await this.exec(o,{cwd:t})}async log(t,e=20,i,r){let o=["log",`-n${e}`,"--format=%H%x1f%an%x1f%ae%x1f%aI%x1f%s%x1e"];i&&o.push(i),r&&o.push("--",r);let{stdout:s}=await this.exec(o,{cwd:t});return ie.parseLog(s)}async blame(t,e,i,r){let o=["blame"];i&&r&&o.push(`-L${i},${r}`),o.push("--",e);let{stdout:s}=await this.exec(o,{cwd:t});return s}async reset(t,e,i){let r=["reset",`--${i}`,e];await this.exec(r,{cwd:t})}async clone(t,e,i,r){let o=["clone"];i&&o.push("-b",i),r&&o.push("--depth",r.toString()),o.push(t,e),await this.exec(o)}async init(t,e){let i=["init"];e&&i.push("--bare"),i.push(t),await this.exec(i)}async getLocalConfig(t,e){try{let{stdout:i}=await this.exec(["config","--local","--get",e],{cwd:t});return i||void 0}catch{return}}async setLocalConfig(t,e,i){await this.exec(["config","--local",e,i],{cwd:t})}async getGlobalConfig(t){try{let{stdout:e}=await this.exec(["config","--global","--get",t]);return e||void 0}catch{return}}async setGlobalConfig(t,e){await this.exec(["config","--global",t,e])}};var ne=class{constructor(t){this.secretStore=t}async getToken(t){return this.secretStore.getSecret(t,"github-token")}async setToken(t,e){await this.secretStore.setSecret(t,"github-token",e.trim())}async deleteToken(t){await this.secretStore.deleteSecret(t,"github-token")}};var Ne=require("child_process"),Le=require("util"),Ae=(0,Le.promisify)(Ne.execFile),ce=class{async isAvailable(){try{return await Ae("gh",["--version"],{timeout:3e3}),!0}catch{return!1}}async getToken(t){try{let e=["auth","token"];t&&e.push("--hostname",t);let{stdout:i}=await Ae("gh",e,{timeout:5e3}),r=i.trim();return r.length>0?r:void 0}catch{return}}async getStatus(){try{let{stdout:t,stderr:e}=await Ae("gh",["auth","status"],{timeout:5e3}),i=`${t}
${e}`;return{loggedIn:i.includes("Logged in to"),rawOutput:i}}catch(t){let e=String(t.stderr||t.stdout||"");return{loggedIn:e.includes("Logged in to"),rawOutput:e}}}};var He=require("child_process"),qe=require("util"),pt=(0,qe.promisify)(He.execFile),de=class{async isConfigured(){try{let{stdout:t}=await pt("git",["config","--global","--get-all","credential.helper"],{timeout:3e3}),e=t.toLowerCase();return e.includes("manager")||e.includes("gcm")}catch{return!1}}};var le=class{constructor(t,e,i,r){this.secretStore=t;this.patAuth=e??new ne(this.secretStore),this.ghCliAuth=i??new ce,this.credManagerAuth=r??new de}patAuth;ghCliAuth;credManagerAuth;getSecretStore(){return this.secretStore}getPatAuth(){return this.patAuth}getGhCliAuth(){return this.ghCliAuth}async resolveAuthentication(t){let e=t.authentication.type,i=t.github?.username||t.git.name,r=t.github?.host||"github.com";switch(e){case"pat":{let o=await this.patAuth.getToken(t.id);return o||I.warn(`No Personal Access Token found in secret store for profile ${t.id}`),{type:"pat",username:i,credential:o}}case"github-cli":{let o=await this.ghCliAuth.getToken(r);return{type:"github-cli",username:i,credential:o}}case"credential-manager":return{type:"credential-manager",username:i};case"ssh":return{type:"ssh",username:i};case"oauth":{let o=await this.secretStore.getSecret(t.id,"oauth-access-token");return{type:"oauth",username:i,credential:o}}case"none":default:return{type:"none",username:i}}}async saveTokenForProfile(t,e){await this.patAuth.setToken(t,e)}async clearAuthForProfile(t){await this.secretStore.deleteAllForProfile(t)}};var me=class{constructor(t){this.profileStore=t}async match(t){let e=await this.profileStore.list();if(e.length===0)return{matches:[],confidence:"none",reasons:["no-match"]};if(t.repositoryPath){let s=await this.profileStore.getAssociation(t.repositoryPath);if(s){let a=e.find(n=>n.id===s);if(a){let n={profileId:a.id,score:100,reasons:["repository-association"]};return{recommendedProfileId:a.id,matches:[n],confidence:"exact",reasons:["repository-association"]}}}}let i=[];for(let s of e){let a=0,n=[];if(t.remotes&&t.remotes.length>0)for(let c of t.remotes)s.github?.host&&c.host&&s.github.host.toLowerCase()===c.host.toLowerCase()&&(a+=20,n.includes("github-host")||n.push("github-host")),s.github?.username&&c.owner&&s.github.username.toLowerCase()===c.owner.toLowerCase()&&(a+=45,n.includes("remote-owner")||n.push("remote-owner"));t.localGitEmail&&s.git.email&&t.localGitEmail.toLowerCase()===s.git.email.toLowerCase()&&(a+=25,n.push("git-email")),t.localGitName&&s.git.name&&t.localGitName.toLowerCase()===s.git.name.toLowerCase()&&(a+=10,n.push("git-name")),a>0&&i.push({profileId:s.id,score:Math.min(a,99),reasons:n})}if(i.sort((s,a)=>a.score-s.score),i.length===0)return{matches:[],confidence:"none",reasons:["no-match"]};let r=i[0],o="low";return r.score>=65?o="high":r.score>=35&&(o="medium"),{recommendedProfileId:r.profileId,matches:i,confidence:o,reasons:r.reasons}}};var ue=class{constructor(t,e,i,r){this.store=t;this.authManager=e;this.gitClient=i;this.matcher=r??new me(this.store)}matcher;getStore(){return this.store}getMatcher(){return this.matcher}async getProfiles(){return this.store.list()}async getActiveProfile(){return this.store.getActive()}async getProfile(t){return this.store.get(t)}async createProfile(t,e){let i=await this.store.create(t);return e&&t.authentication.type==="pat"&&await this.authManager.saveTokenForProfile(i.id,e),I.info(`Profile created: ${i.name} (${i.id})`),i}async updateProfile(t,e,i){let r=await this.store.update(t,e);return i&&(e.authentication?.type==="pat"||r.authentication.type==="pat")&&await this.authManager.saveTokenForProfile(t,i),I.info(`Profile updated: ${r.name} (${t})`),r}async deleteProfile(t){await this.authManager.clearAuthForProfile(t),await this.store.delete(t),I.info(`Profile deleted: ${t}`)}getAuthManager(){return this.authManager}async switchProfile(t,e,i){let r=await this.store.get(t);if(!r)throw new Error(`Profile with id "${t}" does not exist`);return await this.store.setActive(t),e&&await this.applyIdentityToRepository(r,e,i),I.info(`Switched active profile to ${r.name}`),r}async applyIdentityToRepository(t,e,i){try{if(t.git.scope==="global"){if(i&&!await i()){I.warn(`User cancelled global Git identity update for profile "${t.name}".`);return}await this.gitClient.setGlobalConfig("user.name",t.git.name),await this.gitClient.setGlobalConfig("user.email",t.git.email),I.info(`Applied global Git identity for profile ${t.name}`)}else await this.gitClient.setLocalConfig(e,"user.name",t.git.name),await this.gitClient.setLocalConfig(e,"user.email",t.git.email),I.info(`Applied local Git identity to ${e} for profile ${t.name}`)}catch(r){throw I.error(`Failed to apply git identity to repository: ${String(r)}`),r}}async matchProfile(t){return this.matcher.match(t)}async associateRepository(t,e){await this.store.setAssociation(t,e)}async disassociateRepository(t){await this.store.removeAssociation(t)}async getAssociation(t){return this.store.getAssociation(t)}};var We=E(require("path"));var pe=class{constructor(t){this.gitClient=t}async detectRepository(t){if(!await this.gitClient.isRepository(t))return;let i=await this.gitClient.getRoot(t),r=B.normalizePath(i),o=We.basename(r),s=await this.gitClient.getCurrentBranch(r),a=await this.gitClient.getRemotes(r),n=await this.gitClient.status(r);return{id:`repo_${Buffer.from(r).toString("base64url").slice(0,12)}`,path:r,name:o,currentBranch:s,remotes:a,status:n}}};var ge=class{constructor(t){this.gitClient=t}async detectInstallation(){return await this.gitClient.isGitAvailable()?{found:!0,version:await this.gitClient.getVersion(),path:"git"}:{found:!1}}async detectGlobalConfig(){let t=await this.gitClient.getGlobalConfig("user.name"),e=await this.gitClient.getGlobalConfig("user.email"),i=await this.gitClient.getGlobalConfig("init.defaultBranch"),r=[];try{let{stdout:o}=await this.gitClient.exec(["config","--global","--get-all","credential.helper"]);r=o.split(`
`).map(s=>s.trim()).filter(s=>s.length>0)}catch{}return{userName:t,userEmail:e,defaultBranch:i,credentialHelpers:r}}};var ze=require("child_process"),Ve=require("util"),_e=(0,Ve.promisify)(ze.execFile),fe=class{async detect(){try{let{stdout:t}=await _e("gh",["--version"],{timeout:3e3}),e=t.split(`
`)[0]?.trim(),i=await this.detectAccounts();return{found:!0,version:e,accounts:i}}catch{return{found:!1,accounts:[]}}}async detectAccounts(){let t=[];try{let{stdout:e,stderr:i}=await _e("gh",["auth","status"],{timeout:5e3}),o=`${e}
${i}`.split(`
`),s="github.com";for(let a of o){let n=a.trim(),c=/Logged in to ([a-zA-Z0-9\.\-]+)/i.exec(n);c&&(s=c[1]);let l=/account ([a-zA-Z0-9\-_]+)/i.exec(n);if(l){let m=l[1],g=n.includes("Active account: true")||n.includes("\u2713");t.push({host:s,username:m,active:g,authStatusOk:!0})}}}catch(e){let i=String(e.stderr||e.stdout||""),r=/account ([a-zA-Z0-9\-_]+)/i.exec(i);r&&t.push({host:"github.com",username:r[1],active:!0,authStatusOk:!0})}return t}};var he=class{constructor(t){this.gitClient=t}async detect(){let t=[];try{let{stdout:i}=await this.gitClient.exec(["config","--global","--get-all","credential.helper"]);for(let r of i.split(`
`)){let o=r.trim();o&&!t.includes(o)&&t.push(o)}}catch{}let e=t.some(i=>{let r=i.toLowerCase();return r.includes("manager")||r.includes("gcm")});return{helpers:t,hasGCM:e}}};var we=class{gitDiscovery;ghCliDiscovery;credHelperDiscovery;constructor(t){this.gitDiscovery=new ge(t),this.ghCliDiscovery=new fe,this.credHelperDiscovery=new he(t)}async scan(){I.info("Starting non-invasive system configuration scan...");let[t,e,i,r]=await Promise.all([this.gitDiscovery.detectInstallation(),this.gitDiscovery.detectGlobalConfig(),this.ghCliDiscovery.detect(),this.credHelperDiscovery.detect()]),o={git:t,gitConfig:e,githubCli:i,credentialHelper:r,timestamp:new Date().toISOString()};return I.info("System configuration scan completed safely."),o}suggestProfiles(t){let e=[];if(t.githubCli.found&&t.githubCli.accounts.length>0)for(let i of t.githubCli.accounts)e.push({name:i.username,git:{name:t.gitConfig.userName||i.username,email:t.gitConfig.userEmail||`${i.username}@users.noreply.github.com`,scope:"local"},github:{host:i.host,username:i.username},authentication:{type:"github-cli",source:"github-cli"},source:"github-cli",imported:!0,description:`Discovered from GitHub CLI (${i.host})`});return t.gitConfig.userName&&t.gitConfig.userEmail&&(e.some(r=>r.git.email.toLowerCase()===t.gitConfig.userEmail?.toLowerCase())||e.push({name:"default",git:{name:t.gitConfig.userName,email:t.gitConfig.userEmail,scope:"local"},authentication:{type:t.credentialHelper.hasGCM?"credential-manager":"none",source:t.credentialHelper.hasGCM?"git-credential-manager":"system"},source:"system-discovery",imported:!0,description:"Discovered from global Git configuration"})),e}};var _=class{static assessSafety(t){let e=t.type,i=t.input;return e==="git.push"&&i.force?{safety:"destructive",confirmation:{required:!0,reason:"Force push can overwrite remote history.",warning:"Remote commits may be permanently lost."}}:e==="git.reset"&&i.mode==="hard"?{safety:"destructive",confirmation:{required:!0,reason:`git reset --hard ${i.ref}`,warning:"All uncommitted changes will be permanently discarded."}}:e==="git.branch.delete"&&i.force?{safety:"destructive",confirmation:{required:!0,reason:`Force delete branch "${i.name}"`,warning:"Unmerged commits on this branch will be lost."}}:e==="git.stash.drop"?{safety:"destructive",confirmation:{required:!0,reason:`Drop stash ${i.stash||"stash@{0}"}`,warning:"The stashed changes cannot be recovered."}}:e==="github.repository.delete"?{safety:"destructive",confirmation:{required:!0,reason:`Permanently delete GitHub repository "${i.owner}/${i.repository}"`,warning:"This action is irreversible."}}:["git.status","git.diff","git.log","git.blame","github.account.get","github.repository.get","github.repository.list","github.issue.list","github.pull-request.list","github.actions.list","github.release.list"].includes(e)?{safety:"read-only",confirmation:{required:!1}}:{safety:"mutating",confirmation:{required:!1}}}};var ye=class{promptFn;constructor(t){this.promptFn=t??(async(e,i)=>!0)}setPromptFn(t){this.promptFn=t}async requestConfirmation(t,e){let i=`\u26A0\uFE0F Destructive Operation: ${t}`;return this.promptFn(i,e)}};var Re=require("child_process"),Ye=require("util");var wo=(0,Ye.promisify)(Re.execFile),be=class{host;auth;constructor(t={}){this.host=t.host||"github.com",this.auth=t.auth}getBaseUrl(){return this.host==="github.com"?"https://api.github.com":`https://${this.host}/api/v3`}async request(t,e="GET",i){let r=`${this.getBaseUrl()}${t}`,o={Accept:"application/vnd.github.v3+json","User-Agent":"GitAxis-VSCode-Extension"};if(this.auth?.credential&&(o.Authorization=`token ${this.auth.credential}`),this.auth?.credential)try{let s=await fetch(r,{method:e,headers:o,body:i?JSON.stringify(i):void 0});if(!s.ok){let a=await s.text();throw new Error(`GitHub API error (${s.status}): ${a}`)}return await s.json()}catch(s){I.warn(`Direct fetch failed, checking fallback to gh CLI: ${String(s)}`)}try{let s=["api",t,"-X",e];this.host!=="github.com"&&s.push("--hostname",this.host),i&&s.push("--input","-");let a=(0,Re.execFile)("gh",s,{timeout:15e3,shell:process.platform==="win32"},()=>{});i&&a.stdin&&(a.stdin.write(JSON.stringify(i)),a.stdin.end());let{stdout:n}=await new Promise((c,l)=>{let m="",g="";a.stdout?.on("data",u=>m+=u),a.stderr?.on("data",u=>g+=u),a.on("error",u=>l(u)),a.on("close",u=>{u===0?c({stdout:m,stderr:g}):l(new Error(g||`gh api failed with code ${u}`))})});return JSON.parse(n)}catch(s){throw new Error(`GitHub request failed for ${t}: ${String(s)}`)}}async getCurrentUser(){return this.request("/user")}async listRepositories(t){let e=t?`/users/${t}/repos?per_page=100`:"/user/repos?per_page=100";return(await this.request(e)).map(r=>({id:r.id,name:r.name,fullName:r.full_name,private:r.private,htmlUrl:r.html_url,description:r.description,defaultBranch:r.default_branch}))}async getRepository(t,e){let i=await this.request(`/repos/${t}/${e}`);return{id:i.id,name:i.name,fullName:i.full_name,private:i.private,htmlUrl:i.html_url,description:i.description,defaultBranch:i.default_branch}}async createRepository(t,e,i=!1){let r=await this.request("/user/repos","POST",{name:t,description:e,private:i,auto_init:!0});return{id:r.id,name:r.name,fullName:r.full_name,private:r.private,htmlUrl:r.html_url,description:r.description,defaultBranch:r.default_branch}}async forkRepository(t,e){let i=await this.request(`/repos/${t}/${e}/forks`,"POST");return{id:i.id,name:i.name,fullName:i.full_name,private:i.private,htmlUrl:i.html_url,description:i.description,defaultBranch:i.default_branch}}async deleteRepository(t,e){await this.request(`/repos/${t}/${e}`,"DELETE")}async listIssues(t,e,i="open"){return(await this.request(`/repos/${t}/${e}/issues?state=${i}&per_page=50`)).filter(o=>!o.pull_request).map(o=>({id:o.id,number:o.number,title:o.title,state:o.state,htmlUrl:o.html_url,user:o.user?.login||"unknown",createdAt:o.created_at}))}async createIssue(t,e,i,r,o){let s=await this.request(`/repos/${t}/${e}/issues`,"POST",{title:i,body:r,labels:o});return{id:s.id,number:s.number,title:s.title,state:s.state,htmlUrl:s.html_url,user:s.user?.login||"unknown",createdAt:s.created_at}}async closeIssue(t,e,i){await this.request(`/repos/${t}/${e}/issues/${i}`,"PATCH",{state:"closed"})}async listPullRequests(t,e,i="open"){return(await this.request(`/repos/${t}/${e}/pulls?state=${i}&per_page=50`)).map(o=>({id:o.id,number:o.number,title:o.title,state:o.state,htmlUrl:o.html_url,user:o.user?.login||"unknown",headRef:o.head?.ref||"",baseRef:o.base?.ref||"",createdAt:o.created_at}))}async createPullRequest(t,e,i,r,o,s,a=!1){let n=await this.request(`/repos/${t}/${e}/pulls`,"POST",{title:i,head:r,base:o,body:s,draft:a});return{id:n.id,number:n.number,title:n.title,state:n.state,htmlUrl:n.html_url,user:n.user?.login||"unknown",headRef:n.head?.ref||"",baseRef:n.base?.ref||"",createdAt:n.created_at}}async mergePullRequest(t,e,i,r="merge",o){await this.request(`/repos/${t}/${e}/pulls/${i}/merge`,"PUT",{merge_method:r,commit_message:o})}async listActions(t,e){return((await this.request(`/repos/${t}/${e}/actions/runs?per_page=20`)).workflow_runs||[]).map(o=>({id:o.id,name:o.name||"Workflow Run",status:o.status,conclusion:o.conclusion,htmlUrl:o.html_url,headBranch:o.head_branch}))}async listReleases(t,e){return(await this.request(`/repos/${t}/${e}/releases?per_page=20`)).map(r=>({id:r.id,tagName:r.tag_name,name:r.name,htmlUrl:r.html_url,publishedAt:r.published_at}))}async createRelease(t,e,i,r,o,s=!1,a=!1){let n=await this.request(`/repos/${t}/${e}/releases`,"POST",{tag_name:i,name:r,body:o,draft:s,prerelease:a});return{id:n.id,tagName:n.tag_name,name:n.name,htmlUrl:n.html_url,publishedAt:n.published_at}}};var ve=class{constructor(t,e,i){this.profileManager=t;this.gitClient=e;this.confirmationHandler=i??new ye}history=[];confirmationHandler;profileMismatchPrompt;setProfileMismatchPrompt(t){this.profileMismatchPrompt=t}getConfirmationHandler(){return this.confirmationHandler}getHistoryRecords(){return[...this.history]}getHistory(){return this.history.map(t=>t.operation)}async validate(t){let e=[],i=[];(t.target.kind==="local-repository"||t.target.kind==="remote")&&(t.input.repositoryPath||e.push({code:"INVALID_INPUT",message:"Repository path is required for local git operations"}));let r=_.assessSafety(t),o=r.confirmation.required,s=r.confirmation.required?r.confirmation.reason:void 0,a=r.confirmation.required?r.confirmation.warning:void 0;return{valid:e.length===0,errors:e,warnings:i,confirmationRequired:o,confirmationReason:s,confirmationWarning:a}}async cancel(t){let e=this.history.find(i=>i.operation.id===t);e&&e.state==="executing"&&(e.state="cancelled")}async execute(t){let e=new Date().toISOString(),i=Date.now(),r=[],o={operation:t,state:"validating"};this.history.unshift(o);try{let s=await this.validate(t);if(!s.valid){let u=s.errors.map(b=>b.message).join("; ");return this.createErrorResult(t.id,"INVALID_INPUT",u,"Operation input validation failed",e,o)}let a;if(t.profileId&&(a=await this.profileManager.getProfile(t.profileId)),a||(a=await this.profileManager.getActiveProfile()),a&&a.github?.username&&t.target.kind==="remote"){let u=t.input.repositoryPath;if(u)try{let b=await this.gitClient.getRemotes(u),h=b.find(v=>v.name===t.target.remoteName);if(h&&h.owner&&h.owner.toLowerCase()!==a.github.username.toLowerCase()){let v=await this.profileManager.matchProfile({repositoryPath:u,remotes:b}),k=v.recommendedProfileId?await this.profileManager.getProfile(v.recommendedProfileId):void 0;if(this.profileMismatchPrompt){let T=await this.profileMismatchPrompt(a,h.owner,k);if(T==="cancel")return o.state="cancelled",this.createErrorResult(t.id,"OPERATION_CANCELLED","User cancelled operation due to profile mismatch","Operation was cancelled due to profile mismatch",e,o);T==="switch"&&k&&(await this.profileManager.switchProfile(k.id,u),a=k)}r.push({code:"PROFILE_MISMATCH",message:`Active profile "${a.name}" (${a.github?.username||"no user"}) does not match remote owner "${h.owner}".`})}}catch{}}let n=_.assessSafety(t);if(t.safety=n.safety,t.confirmation=n.confirmation,t.type==="git.push"&&t.input.force&&n.confirmation.required){let b=(t.input.repositoryPath||"workspace").split(/[/\\]/).filter(Boolean).pop()||"repository",h=t.input.branch||"main",v=a?a.name:"Unknown";n.confirmation.warning=`Profile: ${v}
Repository: ${b}
Branch: ${h}

This may overwrite remote history.`}if(n.confirmation.required&&(o.state="waiting-for-confirmation",!await this.confirmationHandler.requestConfirmation(n.confirmation.reason,n.confirmation.warning)))return o.state="cancelled",this.createErrorResult(t.id,"OPERATION_CANCELLED","User cancelled destructive operation","Operation was cancelled",e,o);let c;if(a){let u=this.profileManager.getAuthManager();u&&(c=await u.resolveAuthentication(a))}o.state="executing";let l=await this.dispatchExecution(t,c);c&&(c.credential=void 0);let m=new Date().toISOString(),g={operationId:t.id,success:!0,data:l,warnings:r.length>0?r:void 0,startedAt:e,completedAt:m};return o.state="succeeded",o.result=g,o.durationMs=Date.now()-i,g}catch(s){let a=new Date().toISOString(),n=String(s.message||s);I.error(`Operation ${t.type} failed: ${n}`);let c="UNKNOWN";n.includes("not a git repository")?c="NOT_A_REPOSITORY":n.includes("Authentication failed")||n.includes("auth")?c="AUTHENTICATION_FAILED":n.includes("Merge conflict")||n.includes("conflict")?c="MERGE_CONFLICT":n.includes("remote rejected")?c="REMOTE_REJECTED":n.includes("nothing to commit")&&(c="NOTHING_TO_COMMIT");let l={operationId:t.id,success:!1,error:{code:c,message:n,userMessage:`Failed to execute ${t.type}: ${n}`,retryable:!0},warnings:r.length>0?r:void 0,startedAt:e,completedAt:a};return o.state="failed",o.result=l,o.durationMs=Date.now()-i,l}}async dispatchExecution(t,e){let i=t.input;if(t.type.startsWith("git."))return this.dispatchGitOperation(t.type,i);if(t.type.startsWith("github.")){let r=new be({host:i.host,auth:e});return this.dispatchGitHubOperation(t.type,i,r)}throw new Error(`Unknown operation type: ${t.type}`)}async dispatchGitOperation(t,e){switch(t){case"git.status":return await this.gitClient.status(e.repositoryPath);case"git.diff":return await this.gitClient.diff(e.repositoryPath,e.staged,e.path);case"git.add":return await this.gitClient.add(e.repositoryPath,e.paths||[],e.all),!0;case"git.restore":return await this.gitClient.restore(e.repositoryPath,e.paths,e.staged),!0;case"git.commit":return await this.gitClient.commit(e.repositoryPath,e.message,e.amend,e.signoff);case"git.amend":return await this.gitClient.amend(e.repositoryPath,e.message,e.noEdit);case"git.reset":return await this.gitClient.reset(e.repositoryPath,e.ref,e.mode),!0;case"git.branch.create":return await this.gitClient.createBranch(e.repositoryPath,e.name,e.startPoint,e.checkout),!0;case"git.branch.delete":return await this.gitClient.deleteBranch(e.repositoryPath,e.name,e.force),!0;case"git.branch.rename":return await this.gitClient.renameBranch(e.repositoryPath,e.oldName,e.newName),!0;case"git.checkout":return await this.gitClient.checkout(e.repositoryPath,e.ref,e.createBranch),!0;case"git.switch":return await this.gitClient.switchBranch(e.repositoryPath,e.branch,e.create),!0;case"git.merge":return await this.gitClient.merge(e.repositoryPath,e.branch,e.noFastForward,e.squash);case"git.rebase":return await this.gitClient.rebase(e.repositoryPath,e.onto);case"git.fetch":return await this.gitClient.fetch(e.repositoryPath,e.remote,e.prune,e.tags);case"git.pull":return await this.gitClient.pull(e.repositoryPath,e.remote,e.branch,e.rebase);case"git.push":return await this.gitClient.push(e.repositoryPath,e.remote,e.branch,e.setUpstream,e.force,e.forceWithLease,e.tags);case"git.clone":return await this.gitClient.clone(e.url,e.destinationPath,e.branch,e.depth),!0;case"git.init":return await this.gitClient.init(e.repositoryPath,e.bare),!0;case"git.stash.create":return await this.gitClient.stash(e.repositoryPath,e.message,e.includeUntracked);case"git.stash.apply":return await this.gitClient.stashApply(e.repositoryPath,e.stash);case"git.stash.pop":return await this.gitClient.stashPop(e.repositoryPath,e.stash);case"git.stash.drop":return await this.gitClient.stashDrop(e.repositoryPath,e.stash);case"git.tag.create":return await this.gitClient.createTag(e.repositoryPath,e.name,e.target,e.message),!0;case"git.tag.delete":return await this.gitClient.deleteTag(e.repositoryPath,e.name),!0;case"git.remote.add":return await this.gitClient.addRemote(e.repositoryPath,e.name,e.url),!0;case"git.remote.remove":return await this.gitClient.removeRemote(e.repositoryPath,e.name),!0;case"git.remote.set-url":return await this.gitClient.setRemoteUrl(e.repositoryPath,e.name,e.url,e.push),!0;case"git.log":return await this.gitClient.log(e.repositoryPath,e.maxCount,e.branch,e.path);case"git.blame":return await this.gitClient.blame(e.repositoryPath,e.path,e.startLine,e.endLine);default:throw new Error(`Unhandled Git operation: ${t}`)}}async dispatchGitHubOperation(t,e,i){switch(t){case"github.account.get":return await i.getCurrentUser();case"github.repository.get":return await i.getRepository(e.owner,e.repository);case"github.repository.list":return await i.listRepositories(e.owner);case"github.repository.create":return await i.createRepository(e.name,e.description,e.private);case"github.repository.delete":return await i.deleteRepository(e.owner,e.repository),!0;case"github.repository.fork":return await i.forkRepository(e.owner,e.repository);case"github.issue.create":return await i.createIssue(e.owner,e.repository,e.title,e.body,e.labels);case"github.issue.list":return await i.listIssues(e.owner,e.repository,e.state);case"github.issue.close":return await i.closeIssue(e.owner,e.repository,e.number),!0;case"github.pull-request.create":return await i.createPullRequest(e.owner,e.repository,e.title,e.head,e.base,e.body,e.draft);case"github.pull-request.list":return await i.listPullRequests(e.owner,e.repository,e.state);case"github.pull-request.merge":return await i.mergePullRequest(e.owner,e.repository,e.number,e.method,e.commitMessage),!0;case"github.actions.list":return await i.listActions(e.owner,e.repository);case"github.release.create":return await i.createRelease(e.owner,e.repository,e.tag,e.name,e.body,e.draft,e.prerelease);case"github.release.list":return await i.listReleases(e.owner,e.repository);default:throw new Error(`Unhandled GitHub operation: ${t}`)}}createErrorResult(t,e,i,r,o,s){let a=new Date().toISOString(),n={operationId:t,success:!1,error:{code:e,message:i,userMessage:r,retryable:!1},startedAt:o,completedAt:a};return s.result=n,n}};var y=E(require("vscode"));function S(d){return d?String(d).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"):""}function q(d){return d?String(d).replace(/\\/g,"\\\\").replace(/'/g,"\\'").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;"):""}var Pe=class{static render(t,e){let i=t.profile,r=t.repository,o=t.matchResult,s=t.profiles||[],a=t.discoveredAccounts||[],n=t.linkedProfileId,c=t.repoUrl,m=`${e||"'self'"} 'unsafe-inline'`,g=!!i?.github?.username,u=i?S(i.name):"No Active Profile",b=i?S(i.git.email):"Select or create a profile to get started",h=i?S(i.git.name):"",v=g?`@${S(i.github.username)}`:"None",k=i?.github?.host||"github.com",T="global fallback";if(r)if(n&&i&&n===i.id)T=`current repo (${S(r.name)})`;else if(n){let P=s.find(U=>U.id===n);T=`other (${S(P?.name||"linked")}) [global fallback]`}else T="current repo not linked [global fallback]";else T="no repository opened";let N=r?S(r.name):"No Repository Opened",G=r?.currentBranch?S(r.currentBranch):"\u2014",$e=o&&o.confidence!=="none"&&o.recommendedProfileId===i?.id?'<span class="badge badge-success">\u2713 Profile matches remote</span>':o&&o.confidence!=="none"&&o.recommendedProfileId!==i?.id?`<span class="badge badge-warning">\u26A0 Profile mismatch (Suggested: ${S(s.find(P=>P.id===o.recommendedProfileId)?.name||"other")})</span>`:'<span class="badge badge-muted">No remote match detected</span>',ot=JSON.stringify(s).replace(/</g,"\\u003c"),it=JSON.stringify(a).replace(/</g,"\\u003c");return`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src ${m}; style-src ${m}; script-src ${m};">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GitAxis Control Center</title>
  <style>
    :root {
      --bg: var(--vscode-sideBar-background, #1e1e1e);
      --fg: var(--vscode-sideBar-foreground, #cccccc);
      --card-bg: var(--vscode-editor-background, #252526);
      --btn-bg: var(--vscode-button-background, #0e639c);
      --btn-fg: var(--vscode-button-foreground, #ffffff);
      --btn-hover: var(--vscode-button-hoverBackground, #1177bb);
      --btn-sec-bg: var(--vscode-button-secondaryBackground, #3a3d41);
      --btn-sec-fg: var(--vscode-button-secondaryForeground, #ffffff);
      --btn-sec-hover: var(--vscode-button-secondaryHoverBackground, #45494e);
      --btn-danger-bg: #8b0000;
      --btn-danger-hover: #a50000;
      --input-bg: var(--vscode-input-background, #3c3c3c);
      --input-fg: var(--vscode-input-foreground, #cccccc);
      --input-border: var(--vscode-input-border, #3c3c3c);
      --border: var(--vscode-sideBarSectionHeader-border, rgba(255, 255, 255, 0.1));
      --focus-border: var(--vscode-focusBorder, #007acc);
      --badge-success-bg: #238636;
      --badge-warning-bg: #9e6a03;
      --badge-info-bg: #1f6feb;
      --badge-muted-bg: #444444;
      --error-fg: var(--vscode-errorForeground, #f48771);
    }
    * {
      box-sizing: border-box;
    }
    body {
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      color: var(--fg);
      background-color: var(--bg);
      margin: 0;
      padding: 12px;
    }
    .header-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      padding-bottom: 6px;
      border-bottom: 1px solid var(--border);
    }
    .header-title {
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.3px;
    }
    .icon-btn-round {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--fg);
      border-radius: 3px;
      cursor: pointer;
      padding: 2px 7px;
      font-size: 12px;
    }
    .icon-btn-round:hover {
      background: rgba(255, 255, 255, 0.1);
    }
    .section {
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border);
    }
    .section-title-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .section-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      opacity: 0.8;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 5px;
      padding: 10px;
      margin-bottom: 8px;
    }
    .status-dot {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      display: inline-block;
      flex-shrink: 0;
    }
    .dot-active { background: #2ea44f; }
    .dot-inactive { background: #6e7681; }
    .profile-card-header {
      display: flex;
      align-items: center;
      gap: 6px;
      font-weight: 600;
      font-size: 13px;
    }
    .profile-name {
      font-size: 13px;
      font-weight: 600;
    }
    .badge {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 10px;
      font-weight: 600;
      color: #ffffff;
      line-height: 1.2;
    }
    .badge-success { background: var(--badge-success-bg); }
    .badge-warning { background: var(--badge-warning-bg); }
    .badge-info { background: var(--badge-info-bg); }
    .badge-muted { background: var(--badge-muted-bg); }
    .profile-meta {
      font-size: 11px;
      opacity: 0.88;
      margin-top: 5px;
      line-height: 1.4;
    }
    .meta-sub {
      opacity: 0.7;
      font-size: 10px;
      margin-top: 2px;
    }
    .repo-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 5px;
      padding: 10px;
      margin-top: 6px;
    }
    .repo-header-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 6px;
    }
    .repo-name {
      font-weight: 600;
      font-size: 12px;
      word-break: break-all;
    }
    .btn-link {
      background: transparent;
      border: none;
      color: var(--vscode-textLink-foreground, #3794ff);
      cursor: pointer;
      font-size: 11px;
      padding: 0;
      text-decoration: underline;
      display: inline-flex;
      align-items: center;
      gap: 3px;
      white-space: nowrap;
    }
    .btn-link:hover {
      color: var(--vscode-textLink-activeForeground, #3794ff);
    }
    .btn {
      background: var(--btn-bg);
      color: var(--btn-fg);
      border: none;
      padding: 5px 10px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      text-align: center;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .btn:hover { background: var(--btn-hover); }
    .btn-block { width: 100%; }
    .btn-secondary {
      background: var(--btn-sec-bg);
      color: var(--btn-sec-fg);
      border: 1px solid var(--border);
    }
    .btn-secondary:hover { background: var(--btn-sec-hover); }
    .btn-danger {
      background: transparent;
      color: var(--error-fg);
      border: 1px solid rgba(244, 135, 113, 0.4);
    }
    .btn-danger:hover {
      background: var(--btn-danger-bg);
      color: #ffffff;
    }
    .btn-sm {
      padding: 3px 7px;
      font-size: 11px;
    }
    .btn-xs {
      background: var(--btn-sec-bg);
      color: var(--btn-sec-fg);
      border: 1px solid var(--border);
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 11px;
      cursor: pointer;
    }
    .btn-xs:hover { background: var(--btn-sec-hover); }
    .btn-scan {
      width: 100%;
      background: var(--btn-sec-bg);
      color: var(--btn-sec-fg);
      border: 1px dashed var(--vscode-focusBorder, #007acc);
      padding: 7px 10px;
      font-weight: 600;
      cursor: pointer;
      border-radius: 4px;
      margin-bottom: 6px;
    }
    .btn-scan:hover {
      background: var(--btn-sec-hover);
    }
    .card-btn-row {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
      margin-top: 8px;
    }
    .scan-hint {
      font-size: 11px;
      opacity: 0.7;
      margin-top: 4px;
      line-height: 1.3;
    }
    .discovered-list {
      margin-top: 8px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .discovered-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-left: 3px solid #007acc;
      border-radius: 4px;
      padding: 8px;
    }
    .discovered-title {
      font-size: 12px;
      font-weight: 600;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .source-tag {
      font-size: 9px;
      opacity: 0.7;
      background: rgba(255, 255, 255, 0.1);
      padding: 1px 4px;
      border-radius: 2px;
      text-transform: uppercase;
    }
    .discovered-detail {
      font-size: 11px;
      opacity: 0.8;
      margin-top: 2px;
    }
    .discovered-actions {
      display: flex;
      gap: 6px;
      margin-top: 6px;
    }
    .form-container {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 5px;
      padding: 10px;
      margin-top: 6px;
    }
    .form-group {
      margin-bottom: 9px;
    }
    .form-label {
      display: block;
      font-size: 11px;
      font-weight: 600;
      margin-bottom: 3px;
      opacity: 0.9;
    }
    .required {
      color: var(--error-fg);
    }
    .optional {
      font-weight: 400;
      opacity: 0.6;
      font-size: 10px;
    }
    .input-field {
      width: 100%;
      background: var(--input-bg);
      color: var(--input-fg);
      border: 1px solid var(--input-border);
      border-radius: 3px;
      padding: 5px 8px;
      font-size: 12px;
      outline: none;
    }
    .input-field:focus {
      border-color: var(--focus-border);
    }
    .pat-input-wrapper {
      display: flex;
      gap: 4px;
    }
    .btn-toggle {
      flex-shrink: 0;
      padding: 4px 8px;
      font-size: 11px;
    }
    .form-hint {
      font-size: 10px;
      opacity: 0.65;
      margin-top: 3px;
      line-height: 1.25;
    }
    .radio-row {
      display: flex;
      gap: 12px;
      margin-top: 3px;
    }
    .radio-label {
      font-size: 11px;
      display: flex;
      align-items: center;
      gap: 4px;
      cursor: pointer;
    }
    .form-btn-row {
      display: flex;
      gap: 6px;
      margin-top: 12px;
    }
    .form-btn-row .btn {
      flex: 1;
    }
    .form-error-banner {
      background: rgba(244, 135, 113, 0.15);
      border: 1px solid var(--error-fg);
      color: var(--error-fg);
      font-size: 11px;
      padding: 6px 8px;
      border-radius: 3px;
      margin-bottom: 8px;
    }
    .empty-hint {
      font-size: 11px;
      opacity: 0.65;
      font-style: italic;
      padding: 6px 0;
    }
  </style>
</head>
<body>
  <!-- HEADER -->
  <div class="header-bar">
    <span class="header-title">GitAxis Control Center</span>
    <button type="button" class="icon-btn-round" title="Refresh state" onclick="sendCmd('refresh')">\u21BB</button>
  </div>

  <!-- ACTIVE IDENTITY & REPO -->
  <div class="section">
    <div class="section-title">ACTIVE IDENTITY</div>
    <div class="card">
      <div class="profile-card-header">
        <span class="status-dot ${i?"dot-active":"dot-inactive"}"></span>
        <span class="profile-name">${u}</span>
        ${i?'<span class="badge badge-success">Active</span>':""}
      </div>
      <div class="profile-meta">
        ${h?`<div>\u{1F464} ${h} &lt;${b}&gt;</div>`:`<div>${b}</div>`}
        <div>\u{1F419} ${v} ${g?`<span class="meta-sub">(${S(k)})</span>`:""}</div>
        <div class="meta-sub">\u{1F4C1} Linked to: <strong>${T}</strong></div>
      </div>
    </div>

    <!-- CURRENT REPOSITORY STATUS -->
    <div class="repo-card">
      <div class="repo-header-row">
        <div class="repo-name">\u{1F4C1} CURRENT REPO: <strong>${N}</strong></div>
        ${c?`<button type="button" class="btn-link" title="Open repository on GitHub" onclick="openRepoInBrowser('${q(c)}')">\u2197 Open on GitHub</button>`:""}
      </div>
      <div style="font-size: 11px; opacity: 0.8; margin-top: 3px;">Branch: <strong>${G}</strong></div>
      <div style="margin-top: 5px;">${$e}</div>
      ${o&&o.confidence!=="none"&&o.recommendedProfileId!==i?.id?`<button type="button" class="btn btn-secondary btn-sm" style="margin-top: 6px; width: 100%;" onclick="sendCmd('useRecommended')">Switch to Suggested Profile</button>`:""}
    </div>
  </div>

  <!-- SYSTEM ACCOUNT SCANNER -->
  <div class="section">
    <div class="section-title-bar">
      <span class="section-title">SYSTEM ACCOUNT SCANNER</span>
    </div>
    <button type="button" class="btn-scan" onclick="scanAccounts()">
      \u{1F50D} Scan Local Git &amp; GitHub CLI Accounts
    </button>
    ${a.length>0?`<div class="discovered-list">
            ${a.map((P,U)=>`
              <div class="discovered-card">
                <div class="discovered-title">
                  <span>${S(P.github?.username?"@"+P.github.username:P.name)}</span>
                  <span class="source-tag">${S(P.source||"detected")}</span>
                </div>
                <div class="discovered-detail">${S(P.git.name)} &lt;${S(P.git.email)}&gt;</div>
                ${P.github?`<div class="discovered-detail">Host: ${S(P.github.host)}</div>`:""}
                <div class="discovered-actions">
                  <button type="button" class="btn btn-sm btn-primary" onclick="importDiscoveredAccount(${U})">+ Import as Profile</button>
                  <button type="button" class="btn btn-sm btn-secondary" onclick="fillFormWithAccount(${U})">Fill Form</button>
                </div>
              </div>`).join("")}
          </div>`:t.scanPerformed?'<div class="scan-hint">Scan completed. All discovered accounts are already in profiles or none were found.</div>':'<div class="scan-hint">1-click scan local Git configurations and GitHub CLI to import accounts seamlessly.</div>'}
  </div>

  <!-- PROFILES LIST -->
  <div class="section">
    <div class="section-title-bar">
      <span class="section-title">PROFILES (${s.length})</span>
      <button type="button" class="btn-xs" onclick="startNewProfile()">+ Add Profile</button>
    </div>
    ${s.length===0?'<div class="empty-hint">No profiles created yet. Use the form below or scan accounts above.</div>':s.map(P=>{let U=i?.id===P.id,Be=n===P.id,rt=!!r;return`
      <div class="card">
        <div class="profile-card-header">
          <span class="status-dot ${U?"dot-active":"dot-inactive"}"></span>
          <span class="profile-name">${S(P.name)}</span>
          ${U?'<span class="badge badge-success">Active</span>':""}
          ${Be?'<span class="badge badge-info">Linked</span>':""}
        </div>
        <div class="profile-meta">
          <div>Git: ${S(P.git.name)} &lt;${S(P.git.email)}&gt;</div>
          <div>GitHub: ${P.github?.username?"@"+S(P.github.username)+` <span class="meta-sub">(${S(P.github?.host||"github.com")})</span>`:"\u2014"}</div>
          <div class="meta-sub">Scope: ${S(P.git.scope||"local")} \xB7 Auth: ${S(P.authentication.type)}</div>
        </div>
        <div class="card-btn-row">
          ${U?"":`<button type="button" class="btn btn-sm" onclick="switchProfile('${q(P.id)}')">Switch</button>`}
          <button type="button" class="btn btn-sm btn-secondary" onclick="editProfile('${q(P.id)}')">Edit</button>
          ${rt?Be?`<button type="button" class="btn btn-sm btn-secondary" onclick="unlinkRepo('${q(P.id)}')">Unlink</button>`:`<button type="button" class="btn btn-sm btn-secondary" onclick="linkRepo('${q(P.id)}')">Link Repo</button>`:""}
          <button type="button" class="btn btn-sm btn-danger" onclick="deleteProfile('${q(P.id)}')">Delete</button>
        </div>
      </div>`}).join("")}
  </div>

  <!-- IN-SIDEBAR PERSISTENT PROFILE FORM -->
  <div class="section" id="profile-form-section" style="border-bottom: none;">
    <div class="section-title-bar">
      <span class="section-title" id="form-title">CREATE / EDIT PROFILE</span>
    </div>
    <div class="form-container">
      <div id="form-error-msg" class="form-error-banner" style="display: none;"></div>
      <input type="hidden" id="form-profile-id" value="" />
      
      <div class="form-group">
        <label class="form-label" for="form-name">Profile Name <span class="required">*</span></label>
        <input type="text" id="form-name" class="input-field" placeholder="e.g. work, personal, opensource" autocomplete="off" />
      </div>

      <div class="form-group">
        <label class="form-label" for="form-git-name">Git Author Name <span class="required">*</span></label>
        <input type="text" id="form-git-name" class="input-field" placeholder="e.g. John Doe" autocomplete="off" />
      </div>

      <div class="form-group">
        <label class="form-label" for="form-git-email">Git Email <span class="required">*</span></label>
        <input type="email" id="form-git-email" class="input-field" placeholder="e.g. john@company.com" autocomplete="off" />
      </div>

      <div class="form-group">
        <label class="form-label" for="form-gh-user">GitHub Username <span class="optional">(optional)</span></label>
        <input type="text" id="form-gh-user" class="input-field" placeholder="e.g. john-work" autocomplete="off" />
      </div>

      <div class="form-group">
        <label class="form-label" for="form-host">GitHub Host</label>
        <input type="text" id="form-host" class="input-field" value="github.com" placeholder="github.com" autocomplete="off" />
      </div>

      <div class="form-group">
        <label class="form-label" for="form-pat">Personal Access Token (PAT) <span class="optional">(optional)</span></label>
        <div class="pat-input-wrapper">
          <input type="password" id="form-pat" class="input-field" placeholder="ghp_xxxxxxxxxxxx" autocomplete="off" />
          <button type="button" id="btn-toggle-pat" class="btn btn-secondary btn-toggle" onclick="togglePatVisibility()">\u{1F441} Show</button>
        </div>
        <div class="form-hint">Stored securely in VS Code SecretStorage. Inputs are persistent across tab switches.</div>
      </div>

      <div class="form-group">
        <label class="form-label">Identity Scope</label>
        <div class="radio-row">
          <label class="radio-label">
            <input type="radio" name="form-scope" value="local" checked />
            <span>Current Repo (local)</span>
          </label>
          <label class="radio-label">
            <input type="radio" name="form-scope" value="global" />
            <span>Global</span>
          </label>
        </div>
      </div>

      <div class="form-btn-row">
        <button type="button" class="btn btn-primary" id="form-submit-btn" onclick="saveProfileForm()">Save Profile</button>
        <button type="button" class="btn btn-secondary" onclick="cancelProfileForm()">Cancel</button>
      </div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const profilesData = ${ot};
    const discoveredData = ${it};

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
        btn.innerText = '\u{1F648} Hide';
      } else {
        input.type = 'password';
        btn.innerText = '\u{1F441} Show';
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

    function linkRepo(id) {
      vscode.postMessage({ command: 'linkToRepo', profileId: id });
    }

    function unlinkRepo(id) {
      vscode.postMessage({ command: 'unlinkRepo', profileId: id });
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
</html>`}};var M=class{static isValidEmail(t){return!t||typeof t!="string"?!1:/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t.trim())}static isValidProfileName(t){if(!t||typeof t!="string")return!1;let e=t.trim();return e.length>=1&&e.length<=64&&/^[a-zA-Z0-9_\-\. ]+$/.test(e)}static isValidBranchName(t){if(!t||typeof t!="string")return!1;let e=t.trim();return e.startsWith("/")||e.endsWith("/")||e.endsWith(".lock")||e.includes("..")||e.includes("@{")||e.includes("\\")?!1:/^[a-zA-Z0-9_\-\./]+$/.test(e)}static sanitizeUrl(t){return t.replace(/:(\/\/[^@:]+):[^@]+@/,"$1:***@")}};var z=class{constructor(t,e,i,r,o){this.extensionUri=t;this.profileManager=e;this.repoDiscovery=i;this.systemDiscovery=r;this.onProfileChanged=o}static viewType="gitaxis.sidebarView";view;discoveredAccounts=[];scanPerformed=!1;resolveWebviewView(t,e,i){this.view=t,t.webview.options={enableScripts:!0,localResourceRoots:[this.extensionUri]},t.webview.onDidReceiveMessage(async r=>{try{switch(r.command){case"refresh":await this.refresh();break;case"switchProfile":{if(r.profileId){let o=async()=>{let c="Continue";return await y.window.showWarningMessage("You're about to change your global Git identity.",{modal:!0,detail:"This affects repositories that don't override their local Git identity."},c)===c},s=y.workspace.workspaceFolders?.[0]?.uri.fsPath,a;s&&(a=(await this.repoDiscovery.detectRepository(s))?.path);let n=await this.profileManager.switchProfile(r.profileId,a,o);y.window.showInformationMessage(`Active profile switched to "${n.name}".`),this.onProfileChanged?.(),await this.refresh()}else await y.commands.executeCommand("gitaxis.switchProfile");break}case"createProfileFromForm":{let o=r.data;if(!o||!o.name||!o.gitName||!o.gitEmail){let c="Profile Name, Git Author Name, and Git Email are required.";this.view?.webview.postMessage({command:"saveError",error:c}),y.window.showErrorMessage(c);break}if(!M.isValidProfileName(o.name)){let c="Please enter a valid profile name (alphanumeric, dash, underscore, 1-64 chars).";this.view?.webview.postMessage({command:"saveError",error:c}),y.window.showErrorMessage(c);break}if(!M.isValidEmail(o.gitEmail)){let c="Please enter a valid Git email address.";this.view?.webview.postMessage({command:"saveError",error:c}),y.window.showErrorMessage(c);break}let s={name:o.name.trim(),git:{name:o.gitName.trim(),email:o.gitEmail.trim(),scope:o.scope==="global"?"global":"local"},github:o.githubUsername?.trim()?{host:o.host?.trim()||"github.com",username:o.githubUsername.trim()}:void 0,authentication:{type:o.pat?.trim()?"pat":"none",source:o.pat?.trim()?"vs-code-secret-storage":"user-input"},source:"manual",imported:!1},a=await this.profileManager.createProfile(s,o.pat?.trim()||void 0);if((await this.profileManager.getActiveProfile())?.id===a.id){let c=y.workspace.workspaceFolders?.[0]?.uri.fsPath;if(c){let l=await this.repoDiscovery.detectRepository(c);l&&await this.profileManager.applyIdentityToRepository(a,l.path)}}this.view?.webview.postMessage({command:"saveSuccess",profileId:a.id}),y.window.showInformationMessage(`Profile "${a.name}" created successfully!`),this.onProfileChanged?.(),await this.refresh();break}case"updateProfileFromForm":{let o=r.data;if(!o||!o.id||!o.name||!o.gitName||!o.gitEmail){let c="Profile ID, name, Git author name, and email are required.";this.view?.webview.postMessage({command:"saveError",error:c}),y.window.showErrorMessage(c);break}if(!M.isValidProfileName(o.name)){let c="Please enter a valid profile name (alphanumeric, dash, underscore, 1-64 chars).";this.view?.webview.postMessage({command:"saveError",error:c}),y.window.showErrorMessage(c);break}if(!M.isValidEmail(o.gitEmail)){let c="Please enter a valid Git email address.";this.view?.webview.postMessage({command:"saveError",error:c}),y.window.showErrorMessage(c);break}let s={name:o.name.trim(),git:{name:o.gitName.trim(),email:o.gitEmail.trim(),scope:o.scope==="global"?"global":"local"},github:o.githubUsername?.trim()?{host:o.host?.trim()||"github.com",username:o.githubUsername.trim()}:{username:"",host:o.host?.trim()||"github.com"}};o.pat&&o.pat.trim().length>0&&(s.authentication={type:"pat",source:"vs-code-secret-storage"});let a=await this.profileManager.updateProfile(o.id,s,o.pat?.trim()||void 0);if((await this.profileManager.getActiveProfile())?.id===a.id){let c=y.workspace.workspaceFolders?.[0]?.uri.fsPath;if(c){let l=await this.repoDiscovery.detectRepository(c);l&&await this.profileManager.applyIdentityToRepository(a,l.path)}}this.view?.webview.postMessage({command:"saveSuccess",profileId:a.id}),y.window.showInformationMessage(`Profile "${a.name}" updated successfully!`),this.onProfileChanged?.(),await this.refresh();break}case"deleteProfile":{if(!r.profileId)break;let s=(await this.profileManager.getProfile(r.profileId))?.name||r.name||"this profile";await y.window.showWarningMessage(`Are you sure you want to delete profile "${s}"?`,{modal:!0},"Delete")==="Delete"&&(await this.profileManager.deleteProfile(r.profileId),this.view?.webview.postMessage({command:"profileDeleted",profileId:r.profileId}),y.window.showInformationMessage(`Profile "${s}" deleted.`),this.onProfileChanged?.(),await this.refresh());break}case"scanAccounts":{this.systemDiscovery&&await y.window.withProgress({location:y.ProgressLocation.Notification,title:"GitAxis: Scanning local Git and GitHub CLI accounts..."},async()=>{let o=await this.systemDiscovery.scan(),s=this.systemDiscovery.suggestProfiles(o),a=await this.profileManager.getProfiles();this.discoveredAccounts=s.filter(n=>!a.some(c=>c.name.toLowerCase()===n.name.toLowerCase()||c.git.email.toLowerCase()===n.git.email.toLowerCase())),this.scanPerformed=!0,await this.refresh(),this.discoveredAccounts.length===0?y.window.showInformationMessage("Scan completed. No new accounts detected."):y.window.showInformationMessage(`Scan completed. Found ${this.discoveredAccounts.length} account suggestion(s).`)});break}case"importDiscoveredAccount":{let o=r.account;if(!o&&typeof r.index=="number"&&this.discoveredAccounts[r.index]){let s=this.discoveredAccounts[r.index];o={name:s.name,git:{name:s.git.name,email:s.git.email,scope:s.git.scope||"local"},github:s.github?{host:s.github.host||"github.com",username:s.github.username}:void 0,authentication:s.authentication||{type:s.source==="github-cli"?"github-cli":"none",source:s.source==="github-cli"?"github-cli":"system"},source:s.source||"system-discovery",imported:!0,description:s.description}}if(o){let s=await this.profileManager.createProfile(o);typeof r.index=="number"&&r.index>=0&&r.index<this.discoveredAccounts.length?this.discoveredAccounts.splice(r.index,1):this.discoveredAccounts=this.discoveredAccounts.filter(a=>a.name.toLowerCase()!==o.name.toLowerCase()),y.window.showInformationMessage(`Profile "${s.name}" imported successfully!`),this.onProfileChanged?.(),await this.refresh()}break}case"openInBrowser":{r.url&&typeof r.url=="string"&&(r.url.startsWith("https://")||r.url.startsWith("http://")?await y.env.openExternal(y.Uri.parse(r.url)):y.window.showWarningMessage(`Invalid URL protocol: ${r.url}`));break}case"openGitHubRepo":{await y.commands.executeCommand("gitaxis.openGitHubRepo");break}case"linkToRepo":{let o=y.workspace.workspaceFolders?.[0]?.uri.fsPath;if(!o){y.window.showWarningMessage("No repository workspace open to link.");break}let a=(await this.repoDiscovery.detectRepository(o))?.path||B.normalizePath(o);if(r.profileId){await this.profileManager.associateRepository(a,r.profileId);let n=await this.profileManager.getProfile(r.profileId);y.window.showInformationMessage(`Linked repository to profile "${n?.name||r.profileId}".`),this.onProfileChanged?.(),await this.refresh()}break}case"unlinkRepo":{let o=y.workspace.workspaceFolders?.[0]?.uri.fsPath;if(o){let a=(await this.repoDiscovery.detectRepository(o))?.path||B.normalizePath(o);await this.profileManager.disassociateRepository(a),y.window.showInformationMessage("Removed profile link for current repository."),this.onProfileChanged?.(),await this.refresh()}break}case"useRecommended":{let o=await this.getCurrentState();if(o.matchResult?.recommendedProfileId){let s=async()=>{let c="Continue";return await y.window.showWarningMessage("You're about to change your global Git identity.",{modal:!0,detail:"This affects repositories that don't override their local Git identity."},c)===c},a=y.workspace.workspaceFolders?.[0]?.uri.fsPath,n;a&&(n=(await this.repoDiscovery.detectRepository(a))?.path),await this.profileManager.switchProfile(o.matchResult.recommendedProfileId,n,s),this.onProfileChanged?.(),await this.refresh()}break}}}catch(o){I.error(`Error handling webview message: ${String(o)}`);let s=o instanceof Error?o.message:String(o);this.view?.webview.postMessage({command:"saveError",error:s}),y.window.showErrorMessage(`GitAxis Error: ${s}`)}}),this.refresh()}async refresh(){if(!this.view)return;let t=await this.getCurrentState();this.view.webview.html=Pe.render(t,this.view.webview.cspSource)}async getCurrentState(){let t=await this.profileManager.getProfiles(),e=await this.profileManager.getActiveProfile(),i,r,o,s,a=y.workspace.workspaceFolders;if(a&&a.length>0){let n=a[0].uri.fsPath;if(i=await this.repoDiscovery.detectRepository(n),i){s=await this.profileManager.getAssociation(i.path),r=await this.profileManager.matchProfile({repositoryPath:i.path,remotes:i.remotes});let c=i.remotes.find(l=>l.name==="origin")||i.remotes[0];c&&c.owner&&c.repository&&(o=`https://${c.host||"github.com"}/${c.owner}/${c.repository}`)}}return{profile:e,repository:i,matchResult:r,profiles:t,repoUrl:o,linkedProfileId:s,discoveredAccounts:this.discoveredAccounts,scanPerformed:this.scanPerformed}}};var w=E(require("vscode"));function Qe(d,t,e,i,r){d.subscriptions.push(w.commands.registerCommand("gitaxis.switchProfile",async o=>{let s=await t.getProfiles();if(s.length===0){let l="Create Profile";await w.window.showInformationMessage("No profiles found. Would you like to create one?",l)===l&&await w.commands.executeCommand("gitaxis.createProfile");return}let a=o;if(!a){let l=await t.getActiveProfile(),m=s.map(u=>({label:`${u.id===l?.id?"$(check) ":""}${u.name}`,description:`${u.git.name} <${u.git.email}>`,detail:`GitHub: ${u.github?.username||"None"} \xB7 Auth: ${u.authentication.type} \xB7 Scope: ${u.git.scope}`,profileId:u.id})),g=await w.window.showQuickPick(m,{placeHolder:"Select a Git/GitHub Profile"});if(!g)return;a=g.profileId}let n=async()=>{let l="Continue";return await w.window.showWarningMessage("You're about to change your global Git identity.",{modal:!0,detail:"This affects repositories that don't override their local Git identity."},l)===l},c=w.workspace.workspaceFolders?.[0]?.uri.fsPath;if(await t.switchProfile(a,c,n),c&&await t.getAssociation(c)!==a){let m=await t.getProfile(a),g="Remember for this folder";w.window.showInformationMessage(`Switched to profile "${m?.name}". Remember this profile for this repository?`,g).then(u=>{u===g&&t.associateRepository(c,a)})}w.window.showInformationMessage("Active profile switched."),r?.()})),d.subscriptions.push(w.commands.registerCommand("gitaxis.createProfile",async()=>{let o=await w.window.showInputBox({title:"Create Profile (1/6)",prompt:"Enter a profile name (e.g. work, personal, opensource)",validateInput:h=>{if(!M.isValidProfileName(h))return"Please enter a valid profile name (alphanumeric, dash, underscore, 1-64 chars)"}});if(!o)return;let s=await w.window.showInputBox({title:"Create Profile (2/6)",prompt:"Enter Git commit author name (e.g. John Doe)",validateInput:h=>h.trim().length>0?void 0:"Git name cannot be empty"});if(!s)return;let a=await w.window.showInputBox({title:"Create Profile (3/6)",prompt:"Enter Git commit email (e.g. john@company.com)",validateInput:h=>M.isValidEmail(h)?void 0:"Please enter a valid email address"});if(!a)return;let n=await w.window.showQuickPick([{label:"Repository (Recommended)",description:"Applies identity locally to the opened repository",scope:"local"},{label:"Global",description:"Sets global Git identity (will prompt before overwriting)",scope:"global"}],{title:"Create Profile (4/6): Identity Scope"});if(!n)return;if(n.scope==="global"){let h="Continue";if(await w.window.showWarningMessage("You're about to change your global Git identity.",{modal:!0,detail:"This affects repositories that don't override their local Git identity."},h)!==h)return}let c=await w.window.showInputBox({title:"Create Profile (5/6)",prompt:"Enter GitHub username (optional, press Enter to skip)"}),l="github.com";if(c){let h=await w.window.showInputBox({title:"GitHub Host",prompt:"Enter GitHub host (default: github.com)",value:"github.com"});h&&(l=h.trim())}let m=[{label:"GitHub CLI",detail:"Use credentials from gh CLI",type:"github-cli"},{label:"Git Credential Manager",detail:"Delegate auth to system credential helper",type:"credential-manager"},{label:"Personal Access Token (PAT)",detail:"Securely saved in VS Code SecretStorage",type:"pat"},{label:"SSH",detail:"Use existing SSH keys",type:"ssh"},{label:"None",detail:"No remote authentication",type:"none"}],g=await w.window.showQuickPick(m,{title:"Create Profile (6/6): Authentication Method"});if(!g)return;let u;if(g.type==="pat"&&(u=await w.window.showInputBox({title:"GitHub Personal Access Token",prompt:"Enter Personal Access Token (stored encrypted in VS Code Secrets)",password:!0,validateInput:h=>h.trim().length>0?void 0:"Token cannot be empty"}),!u))return;let b={name:o.trim(),git:{name:s.trim(),email:a.trim(),scope:n.scope},github:c?{host:l,username:c.trim()}:void 0,authentication:{type:g.type,source:g.type==="pat"?"vs-code-secret-storage":"user-input"}};try{let h=await t.createProfile(b,u);w.window.showInformationMessage(`Profile "${h.name}" created successfully!`),r?.()}catch(h){w.window.showErrorMessage(`Failed to create profile: ${String(h)}`)}})),d.subscriptions.push(w.commands.registerCommand("gitaxis.manageProfiles",async()=>{let o=await t.getProfiles();if(o.length===0){w.window.showInformationMessage("No profiles to manage. Create one first.");return}let s=o.map(l=>({label:l.name,description:`${l.git.name} <${l.git.email}>`,detail:`ID: ${l.id} \xB7 Auth: ${l.authentication.type}`,profileId:l.id})),a=await w.window.showQuickPick(s,{placeHolder:"Select a profile to manage"});if(!a)return;let n=[{label:"Set as Active",action:"active"},{label:"Rename Profile",action:"rename"},{label:"Edit Git Identity",action:"edit"},{label:"Delete Profile",action:"delete"}],c=await w.window.showQuickPick(n,{placeHolder:`Action for profile "${a.label}"`});if(c)if(c.action==="active"){let l=w.workspace.workspaceFolders?.[0]?.uri.fsPath;await t.switchProfile(a.profileId,l),w.window.showInformationMessage(`Switched active profile to "${a.label}".`),r?.()}else if(c.action==="rename"){let l=await w.window.showInputBox({title:"Rename Profile",prompt:"Enter new profile name",value:a.label,validateInput:m=>M.isValidProfileName(m)?void 0:"Invalid profile name"});if(!l||l.trim()===a.label)return;try{await t.updateProfile(a.profileId,{name:l.trim()}),w.window.showInformationMessage(`Profile renamed to "${l.trim()}".`),r?.()}catch(m){w.window.showErrorMessage(`Failed to rename profile: ${String(m)}`)}}else if(c.action==="edit"){let l=await t.getProfile(a.profileId);if(!l)return;let m=await w.window.showInputBox({title:"Edit Git Name",prompt:"Enter commit author name",value:l.git.name});if(!m)return;let g=await w.window.showInputBox({title:"Edit Git Email",prompt:"Enter commit email",value:l.git.email,validateInput:u=>M.isValidEmail(u)?void 0:"Please enter a valid email"});if(!g)return;try{await t.updateProfile(a.profileId,{git:{name:m.trim(),email:g.trim()}}),w.window.showInformationMessage(`Profile "${l.name}" updated.`),r?.()}catch(u){w.window.showErrorMessage(`Failed to update profile: ${String(u)}`)}}else c.action==="delete"&&await w.window.showWarningMessage(`Are you sure you want to delete profile "${a.label}"?`,{modal:!0},"Delete")==="Delete"&&(await t.deleteProfile(a.profileId),w.window.showInformationMessage(`Profile "${a.label}" deleted.`),r?.())})),d.subscriptions.push(w.commands.registerCommand("gitaxis.scanAccounts",async()=>{w.window.withProgress({location:w.ProgressLocation.Notification,title:"GitAxis: Scanning system Git and GitHub configuration (read-only)..."},async()=>{let o=await e.scan(),s=e.suggestProfiles(o);if(s.length===0){w.window.showInformationMessage("Scan completed. No new accounts detected.");return}let a=await t.getProfiles(),n=s.filter(m=>!a.some(g=>g.name.toLowerCase()===m.name.toLowerCase()));if(n.length===0){w.window.showInformationMessage("Scan completed. Detected accounts already exist in GitAxis profiles.");return}let c=n.map(m=>({label:`Import "${m.name}"`,description:`${m.git.name} <${m.git.email}>`,detail:m.description,suggestion:m})),l=await w.window.showQuickPick(c,{placeHolder:"Select an account to import as a GitAxis profile"});if(l)try{let m=await t.createProfile(l.suggestion);w.window.showInformationMessage(`Profile "${m.name}" imported successfully!`),r?.()}catch(m){w.window.showErrorMessage(`Failed to import profile: ${String(m)}`)}})}))}var O=E(require("crypto")),p=E(require("vscode"));function V(){return p.workspace.workspaceFolders?.[0]?.uri.fsPath}function Ke(d,t,e,i){d.subscriptions.push(p.commands.registerCommand("gitaxis.status",async()=>{let o=V();if(!o){p.window.showErrorMessage("No workspace folder open.");return}let s={id:O.randomUUID(),type:"git.status",input:{repositoryPath:o},target:{kind:"local-repository",path:o},safety:"read-only",confirmation:{required:!1},createdAt:new Date().toISOString(),initiatedBy:"command-palette"},a=await t.execute(s);a.success&&a.data?p.window.showInformationMessage(`Status: ${a.data.clean?"Clean":`${a.data.modified} modified, ${a.data.staged} staged, ${a.data.untracked} untracked`}`):p.window.showErrorMessage(a.error?.userMessage||"Failed to get status"),i?.()})),d.subscriptions.push(p.commands.registerCommand("gitaxis.reset",async()=>{let o=V();if(!o)return;let s=await p.window.showQuickPick([{label:"mixed (Default)",mode:"mixed",description:"Resets index but keeps working tree changes"},{label:"soft",mode:"soft",description:"Keeps all changes staged"},{label:"hard \u26A0\uFE0F",mode:"hard",description:"DISCARDS all uncommitted changes"}],{title:"Select Reset Mode"});if(!s)return;let a=await p.window.showInputBox({title:"Git Reset",prompt:"Enter commit or ref to reset to",value:"HEAD"});if(!a)return;let n={id:O.randomUUID(),type:"git.reset",input:{repositoryPath:o,ref:a,mode:s.mode},target:{kind:"local-repository",path:o},safety:s.mode==="hard"?"destructive":"mutating",confirmation:s.mode==="hard"?{required:!0,reason:`git reset --hard ${a}`,warning:"All uncommitted changes will be discarded."}:{required:!1},createdAt:new Date().toISOString(),initiatedBy:"command-palette"},c=await t.execute(n);c.success?p.window.showInformationMessage(`Reset to ${a} (${s.mode}) succeeded.`):p.window.showErrorMessage(c.error?.userMessage||"Reset failed"),i?.()})),d.subscriptions.push(p.commands.registerCommand("gitaxis.manageRemote",async()=>{let o=V();if(!o)return;let s=await p.window.showQuickPick([{label:"Add Remote",action:"add"},{label:"Change Remote URL",action:"setUrl"},{label:"Remove Remote",action:"remove"}],{title:"Remote Management"});if(s){if(s.action==="add"){let a=await p.window.showInputBox({prompt:"Remote name",value:"origin"});if(!a)return;let n=await p.window.showInputBox({prompt:"Remote URL"});if(!n)return;let c={id:O.randomUUID(),type:"git.remote.add",input:{repositoryPath:o,name:a,url:n},target:{kind:"local-repository",path:o},safety:"mutating",confirmation:{required:!1},createdAt:new Date().toISOString(),initiatedBy:"command-palette"},l=await t.execute(c);l.success?p.window.showInformationMessage(`Remote "${a}" added.`):p.window.showErrorMessage(l.error?.userMessage||"Failed to add remote")}else if(s.action==="setUrl"){let a=await p.window.showInputBox({prompt:"Remote name",value:"origin"});if(!a)return;let n=await p.window.showInputBox({prompt:"New Remote URL"});if(!n)return;let c={id:O.randomUUID(),type:"git.remote.set-url",input:{repositoryPath:o,name:a,url:n},target:{kind:"local-repository",path:o},safety:"mutating",confirmation:{required:!1},createdAt:new Date().toISOString(),initiatedBy:"command-palette"},l=await t.execute(c);l.success?p.window.showInformationMessage(`Remote "${a}" URL updated.`):p.window.showErrorMessage(l.error?.userMessage||"Failed to update remote URL")}else if(s.action==="remove"){let a=await p.window.showInputBox({prompt:"Remote name to remove"});if(!a)return;let n={id:O.randomUUID(),type:"git.remote.remove",input:{repositoryPath:o,name:a},target:{kind:"local-repository",path:o},safety:"mutating",confirmation:{required:!1},createdAt:new Date().toISOString(),initiatedBy:"command-palette"},c=await t.execute(n);c.success?p.window.showInformationMessage(`Remote "${a}" removed.`):p.window.showErrorMessage(c.error?.userMessage||"Failed to remove remote")}i?.()}}));let r;d.subscriptions.push(p.commands.registerCommand("gitaxis.diff",async()=>{let o=V();if(!o){p.window.showErrorMessage("No workspace folder open.");return}let s=await p.window.showQuickPick([{label:"Working Tree Diff",staged:!1,description:"Unstaged changes"},{label:"Staged Changes Diff",staged:!0,description:"Staged changes (--staged)"}],{title:"Git Diff"});if(!s)return;let a={id:O.randomUUID(),type:"git.diff",input:{repositoryPath:o,staged:s.staged},target:{kind:"local-repository",path:o},safety:"read-only",confirmation:{required:!1},createdAt:new Date().toISOString(),initiatedBy:"command-palette"},n=await t.execute(a);if(n.success){let c=n.data?.trim();c?(r||(r=p.window.createOutputChannel("GitAxis: Diff")),r.clear(),r.appendLine(c),r.show()):p.window.showInformationMessage(`No ${s.staged?"staged":"unstaged"} changes detected.`)}else p.window.showErrorMessage(n.error?.userMessage||"Failed to get diff")})),d.subscriptions.push(p.commands.registerCommand("gitaxis.history",async()=>{let o=V();if(!o){p.window.showErrorMessage("No workspace folder open.");return}let s={id:O.randomUUID(),type:"git.log",input:{repositoryPath:o,maxCount:30},target:{kind:"local-repository",path:o},safety:"read-only",confirmation:{required:!1},createdAt:new Date().toISOString(),initiatedBy:"command-palette"},a=await t.execute(s);if(a.success&&a.data){if(a.data.length===0){p.window.showInformationMessage("No commit history found.");return}let n=a.data.map(l=>({label:l.subject,description:`${l.authorName} \xB7 ${l.hash.slice(0,7)}`,detail:`${l.authorDate} (${l.authorEmail})`,commit:l})),c=await p.window.showQuickPick(n,{title:`Commit History (${a.data.length} recent commits)`,placeHolder:"Select a commit to view details"});if(c){let l="Copy Commit Hash";await p.window.showInformationMessage(`Commit ${c.commit.hash}

Author: ${c.commit.authorName} <${c.commit.authorEmail}>
Date: ${c.commit.authorDate}

${c.commit.subject}`,l)===l&&(await p.env.clipboard.writeText(c.commit.hash),p.window.showInformationMessage("Commit hash copied to clipboard."))}}else p.window.showErrorMessage(a.error?.userMessage||"Failed to load history")})),d.subscriptions.push(p.commands.registerCommand("gitaxis.clone",async()=>{let o=await e.getProfiles(),s;if(o.length>0){let b=await e.getActiveProfile(),h=o.map(k=>({label:`${k.id===b?.id?"$(check) ":""}${k.name}`,description:`${k.git.name} <${k.git.email}>`,profileId:k.id})),v=await p.window.showQuickPick(h,{title:"Clone Repository (1/3): Select Profile"});if(!v)return;s=v.profileId}let a=await p.window.showInputBox({title:"Clone Repository (2/3)",prompt:"Enter Git repository URL to clone (HTTPS or SSH)",validateInput:b=>b.trim().length>0?void 0:"Repository URL is required"});if(!a)return;let n=await p.window.showOpenDialog({title:"Clone Repository (3/3): Select Destination Directory",canSelectFiles:!1,canSelectFolders:!0,canSelectMany:!1,openLabel:"Select Clone Location"});if(!n||n.length===0)return;let c=n[0].fsPath,l=/\/([^/]+?)(?:\.git)?$/.exec(a.trim()),m=l?l[1]:"repository",g=`${c}/${m}`.replace(/\\/g,"/"),u={id:O.randomUUID(),type:"git.clone",input:{url:a.trim(),destinationPath:g},target:{kind:"none"},safety:"mutating",confirmation:{required:!1},createdAt:new Date().toISOString(),initiatedBy:"command-palette"};p.window.withProgress({location:p.ProgressLocation.Notification,title:`GitAxis: Cloning ${a.trim()}...`},async()=>{let b=await t.execute(u);if(b.success){if(s){await e.associateRepository(g,s);let k=await e.getProfile(s);k&&await e.applyIdentityToRepository(k,g)}let h="Open in New Window";await p.window.showInformationMessage(`Cloned successfully into ${g}`,h)===h&&await p.commands.executeCommand("vscode.openFolder",p.Uri.file(g),!0),i?.()}else p.window.showErrorMessage(b.error?.userMessage||"Clone failed")})}))}var Y=E(require("crypto")),A=E(require("vscode"));function Ie(){return A.workspace.workspaceFolders?.[0]?.uri.fsPath}function je(d,t,e){d.subscriptions.push(A.commands.registerCommand("gitaxis.createBranch",async()=>{let i=Ie();if(!i)return;let r=await A.window.showInputBox({title:"Create Branch",prompt:"Enter new branch name",validateInput:n=>M.isValidBranchName(n)?void 0:"Invalid branch name"});if(!r)return;let o=await A.window.showQuickPick([{label:"Yes",value:!0,description:"Switch to new branch immediately"},{label:"No",value:!1,description:"Stay on current branch"}],{title:"Checkout new branch?"});if(!o)return;let s={id:Y.randomUUID(),type:"git.branch.create",input:{repositoryPath:i,name:r.trim(),checkout:o.value},target:{kind:"local-repository",path:i},safety:"mutating",confirmation:{required:!1},createdAt:new Date().toISOString(),initiatedBy:"command-palette"},a=await t.execute(s);a.success?A.window.showInformationMessage(`Branch "${r}" created.`):A.window.showErrorMessage(a.error?.userMessage||"Failed to create branch"),e?.()})),d.subscriptions.push(A.commands.registerCommand("gitaxis.checkoutBranch",async()=>{let i=Ie();if(!i)return;let r=await A.window.showInputBox({title:"Checkout Ref",prompt:"Enter branch name or commit ref to checkout"});if(!r)return;let o={id:Y.randomUUID(),type:"git.checkout",input:{repositoryPath:i,ref:r.trim()},target:{kind:"local-repository",path:i},safety:"mutating",confirmation:{required:!1},createdAt:new Date().toISOString(),initiatedBy:"command-palette"},s=await t.execute(o);s.success?A.window.showInformationMessage(`Checked out "${r}".`):A.window.showErrorMessage(s.error?.userMessage||"Checkout failed"),e?.()})),d.subscriptions.push(A.commands.registerCommand("gitaxis.merge",async()=>{let i=Ie();if(!i)return;let r=await A.window.showInputBox({title:"Git Merge",prompt:"Enter branch name to merge into current branch"});if(!r)return;let o={id:Y.randomUUID(),type:"git.merge",input:{repositoryPath:i,branch:r.trim()},target:{kind:"local-repository",path:i},safety:"mutating",confirmation:{required:!1},createdAt:new Date().toISOString(),initiatedBy:"command-palette"},s=await t.execute(o);s.success?A.window.showInformationMessage(`Merged "${r}" successfully.`):A.window.showErrorMessage(s.error?.userMessage||"Merge failed"),e?.()})),d.subscriptions.push(A.commands.registerCommand("gitaxis.rebase",async()=>{let i=Ie();if(!i)return;let r=await A.window.showInputBox({title:"Git Rebase",prompt:"Enter upstream branch to rebase onto (e.g. main, origin/main)"});if(!r)return;let o={id:Y.randomUUID(),type:"git.rebase",input:{repositoryPath:i,onto:r.trim()},target:{kind:"local-repository",path:i},safety:"mutating",confirmation:{required:!1},createdAt:new Date().toISOString(),initiatedBy:"command-palette"},s=await t.execute(o);s.success?A.window.showInformationMessage(`Rebased onto "${r}" successfully.`):A.window.showErrorMessage(s.error?.userMessage||"Rebase failed"),e?.()}))}var Te=E(require("crypto")),D=E(require("vscode"));function gt(){return D.workspace.workspaceFolders?.[0]?.uri.fsPath}function Je(d,t,e){d.subscriptions.push(D.commands.registerCommand("gitaxis.commit",async()=>{let i=gt();if(!i)return;let r=await D.window.showInputBox({title:"Git Commit",prompt:"Enter commit message",validateInput:n=>n.trim().length>0?void 0:"Commit message cannot be empty"});if(!r)return;let o=await D.window.showQuickPick([{label:"Stage All and Commit",stageAll:!0},{label:"Commit Staged Changes Only",stageAll:!1}],{title:"Staging options"});if(!o)return;if(o.stageAll){let n={id:Te.randomUUID(),type:"git.add",input:{repositoryPath:i,paths:[],all:!0},target:{kind:"local-repository",path:i},safety:"mutating",confirmation:{required:!1},createdAt:new Date().toISOString(),initiatedBy:"command-palette"};await t.execute(n)}let s={id:Te.randomUUID(),type:"git.commit",input:{repositoryPath:i,message:r.trim()},target:{kind:"local-repository",path:i},safety:"mutating",confirmation:{required:!1},createdAt:new Date().toISOString(),initiatedBy:"command-palette"},a=await t.execute(s);a.success?D.window.showInformationMessage(`Committed: "${r}"`):D.window.showErrorMessage(a.error?.userMessage||"Commit failed"),e?.()}))}var xe=E(require("crypto")),C=E(require("vscode"));function Me(){return C.workspace.workspaceFolders?.[0]?.uri.fsPath}function Ze(d,t,e){d.subscriptions.push(C.commands.registerCommand("gitaxis.push",async()=>{let i=Me();if(!i)return;let r=await C.window.showQuickPick([{label:"Normal Push",force:!1,forceWithLease:!1},{label:"Force with Lease (Safer)",force:!1,forceWithLease:!0,description:"Only overwrites if remote matches expected ref"},{label:"Force Push \u26A0\uFE0F",force:!0,forceWithLease:!1,description:"May overwrite remote commits"}],{title:"Git Push Options"});if(!r)return;let o={id:xe.randomUUID(),type:"git.push",input:{repositoryPath:i,remote:"origin",force:r.force,forceWithLease:r.forceWithLease},target:{kind:"remote",remoteName:"origin"},safety:r.force?"destructive":"mutating",confirmation:r.force?{required:!0,reason:"Force push can overwrite remote history.",warning:"Remote commits may be permanently lost."}:{required:!1},createdAt:new Date().toISOString(),initiatedBy:"command-palette"};C.window.withProgress({location:C.ProgressLocation.Notification,title:"GitAxis: Pushing to remote..."},async()=>{let s=await t.execute(o);if(s.success?C.window.showInformationMessage("Push succeeded."):C.window.showErrorMessage(s.error?.userMessage||"Push failed"),s.warnings&&s.warnings.length>0)for(let a of s.warnings)C.window.showWarningMessage(`Warning: ${a.message}`);e?.()})})),d.subscriptions.push(C.commands.registerCommand("gitaxis.pull",async()=>{let i=Me();if(!i)return;let r={id:xe.randomUUID(),type:"git.pull",input:{repositoryPath:i,remote:"origin"},target:{kind:"remote",remoteName:"origin"},safety:"mutating",confirmation:{required:!1},createdAt:new Date().toISOString(),initiatedBy:"command-palette"};C.window.withProgress({location:C.ProgressLocation.Notification,title:"GitAxis: Pulling from remote..."},async()=>{let o=await t.execute(r);o.success?C.window.showInformationMessage("Pull succeeded."):C.window.showErrorMessage(o.error?.userMessage||"Pull failed"),e?.()})})),d.subscriptions.push(C.commands.registerCommand("gitaxis.fetch",async()=>{let i=Me();if(!i)return;let r={id:xe.randomUUID(),type:"git.fetch",input:{repositoryPath:i,remote:"origin",prune:!0},target:{kind:"remote",remoteName:"origin"},safety:"mutating",confirmation:{required:!1},createdAt:new Date().toISOString(),initiatedBy:"command-palette"};C.window.withProgress({location:C.ProgressLocation.Notification,title:"GitAxis: Fetching remotes..."},async()=>{let o=await t.execute(r);o.success?C.window.showInformationMessage("Fetch completed."):C.window.showErrorMessage(o.error?.userMessage||"Fetch failed"),e?.()})}))}var Q=E(require("crypto")),$=E(require("vscode"));function ft(){return $.workspace.workspaceFolders?.[0]?.uri.fsPath}function Xe(d,t,e){d.subscriptions.push($.commands.registerCommand("gitaxis.stash",async()=>{let i=ft();if(!i)return;let r=await $.window.showQuickPick([{label:"Stash changes (push)",action:"create"},{label:"Pop stash (stash@{0})",action:"pop"},{label:"Apply stash",action:"apply"},{label:"Drop stash \u26A0\uFE0F",action:"drop"}],{title:"Git Stash Options"});if(r){if(r.action==="create"){let o=await $.window.showInputBox({prompt:"Optional stash message"}),s={id:Q.randomUUID(),type:"git.stash.create",input:{repositoryPath:i,message:o,includeUntracked:!0},target:{kind:"local-repository",path:i},safety:"mutating",confirmation:{required:!1},createdAt:new Date().toISOString(),initiatedBy:"command-palette"},a=await t.execute(s);a.success?$.window.showInformationMessage("Stashed successfully."):$.window.showErrorMessage(a.error?.userMessage||"Stash failed")}else if(r.action==="pop"){let o={id:Q.randomUUID(),type:"git.stash.pop",input:{repositoryPath:i,stash:"stash@{0}"},target:{kind:"local-repository",path:i},safety:"mutating",confirmation:{required:!1},createdAt:new Date().toISOString(),initiatedBy:"command-palette"},s=await t.execute(o);s.success?$.window.showInformationMessage("Stash popped successfully."):$.window.showErrorMessage(s.error?.userMessage||"Stash pop failed")}else if(r.action==="apply"){let o={id:Q.randomUUID(),type:"git.stash.apply",input:{repositoryPath:i,stash:"stash@{0}"},target:{kind:"local-repository",path:i},safety:"mutating",confirmation:{required:!1},createdAt:new Date().toISOString(),initiatedBy:"command-palette"},s=await t.execute(o);s.success?$.window.showInformationMessage("Stash applied successfully."):$.window.showErrorMessage(s.error?.userMessage||"Stash apply failed")}else if(r.action==="drop"){let o={id:Q.randomUUID(),type:"git.stash.drop",input:{repositoryPath:i,stash:"stash@{0}"},target:{kind:"local-repository",path:i},safety:"destructive",confirmation:{required:!0,reason:"Drop stash@{0}",warning:"Stashed changes will be permanently discarded."},createdAt:new Date().toISOString(),initiatedBy:"command-palette"},s=await t.execute(o);s.success?$.window.showInformationMessage("Stash dropped."):$.window.showErrorMessage(s.error?.userMessage||"Stash drop failed")}e?.()}}))}var ke=E(require("crypto")),x=E(require("vscode"));function ht(){return x.workspace.workspaceFolders?.[0]?.uri.fsPath}function et(d,t,e){d.subscriptions.push(x.commands.registerCommand("gitaxis.tag",async()=>{let i=ht();if(!i){x.window.showErrorMessage("No workspace folder open.");return}let r=await x.window.showQuickPick([{label:"Create Tag",action:"create",description:"Create a lightweight or annotated tag"},{label:"List Tags",action:"list",description:"View tags in this repository"},{label:"Push Tags",action:"push",description:"Push tags to remote origin"},{label:"Delete Tag",action:"delete",description:"Delete a local tag"}],{title:"Git Tag Management"});if(r){if(r.action==="create"){let o=await x.window.showInputBox({title:"Create Tag",prompt:"Enter tag name (e.g. v1.0.0)",validateInput:l=>M.isValidBranchName(l)?void 0:"Invalid tag name"});if(!o)return;let s=await x.window.showInputBox({title:"Tag Message",prompt:"Optional annotation message (leave blank for lightweight tag)"}),a=await x.window.showInputBox({title:"Target Commit",prompt:"Optional commit ref/hash (default: HEAD)"}),n={id:ke.randomUUID(),type:"git.tag.create",input:{repositoryPath:i,name:o.trim(),message:s?.trim()||void 0,target:a?.trim()||void 0},target:{kind:"local-repository",path:i},safety:"mutating",confirmation:{required:!1},createdAt:new Date().toISOString(),initiatedBy:"command-palette"},c=await t.execute(n);c.success?x.window.showInformationMessage(`Tag "${o}" created.`):x.window.showErrorMessage(c.error?.userMessage||"Failed to create tag"),e?.()}else if(r.action==="list")try{let s=await t.gitClient.getTags(i);if(s.length===0){x.window.showInformationMessage("No tags found in repository.");return}let a=s.map(n=>({label:n.name}));await x.window.showQuickPick(a,{title:`Repository Tags (${s.length})`})}catch(o){x.window.showErrorMessage(`Failed to list tags: ${String(o)}`)}else if(r.action==="delete")try{let s=await t.gitClient.getTags(i);if(s.length===0){x.window.showInformationMessage("No tags to delete.");return}let a=s.map(m=>({label:m.name})),n=await x.window.showQuickPick(a,{title:"Select Tag to Delete"});if(!n)return;let c={id:ke.randomUUID(),type:"git.tag.delete",input:{repositoryPath:i,name:n.label},target:{kind:"local-repository",path:i},safety:"mutating",confirmation:{required:!1},createdAt:new Date().toISOString(),initiatedBy:"command-palette"},l=await t.execute(c);l.success?x.window.showInformationMessage(`Tag "${n.label}" deleted.`):x.window.showErrorMessage(l.error?.userMessage||"Failed to delete tag"),e?.()}catch(o){x.window.showErrorMessage(`Failed to delete tag: ${String(o)}`)}else if(r.action==="push"){let o={id:ke.randomUUID(),type:"git.push",input:{repositoryPath:i,remote:"origin",tags:!0},target:{kind:"remote",remoteName:"origin"},safety:"mutating",confirmation:{required:!1},createdAt:new Date().toISOString(),initiatedBy:"command-palette"};x.window.withProgress({location:x.ProgressLocation.Notification,title:"GitAxis: Pushing tags to remote..."},async()=>{let s=await t.execute(o);s.success?x.window.showInformationMessage("Tags pushed to remote."):x.window.showErrorMessage(s.error?.userMessage||"Failed to push tags"),e?.()})}}}))}var j=E(require("crypto")),f=E(require("vscode"));function K(){return f.workspace.workspaceFolders?.[0]?.uri.fsPath}function tt(d,t,e){d.subscriptions.push(f.commands.registerCommand("gitaxis.openGitHubRepo",async()=>{let i=K();if(!i)return;let r=await e.detectRepository(i),o=r?.remotes.find(n=>n.name==="origin")||r?.remotes[0];if(!o||!o.owner||!o.repository){f.window.showWarningMessage("No GitHub remote found for this repository.");return}let a=`https://${o.host||"github.com"}/${o.owner}/${o.repository}`;await f.env.openExternal(f.Uri.parse(a))})),d.subscriptions.push(f.commands.registerCommand("gitaxis.createIssue",async()=>{let i=K();if(!i)return;let r=await e.detectRepository(i),o=r?.remotes.find(c=>c.name==="origin")||r?.remotes[0];if(!o||!o.owner||!o.repository){f.window.showWarningMessage("No GitHub remote configured.");return}let s=await f.window.showInputBox({title:"Create GitHub Issue",prompt:"Enter issue title",validateInput:c=>c.trim().length>0?void 0:"Title cannot be empty"});if(!s)return;let a=await f.window.showInputBox({title:"Create GitHub Issue",prompt:"Enter issue description (optional)"}),n={id:j.randomUUID(),type:"github.issue.create",input:{host:o.host,owner:o.owner,repository:o.repository,title:s.trim(),body:a?.trim()},target:{kind:"github-repository",host:o.host||"github.com",owner:o.owner,repository:o.repository},safety:"mutating",confirmation:{required:!1},createdAt:new Date().toISOString(),initiatedBy:"command-palette"};f.window.withProgress({location:f.ProgressLocation.Notification,title:"GitAxis: Creating GitHub issue..."},async()=>{let c=await t.execute(n);if(c.success&&c.data){let l="Open Issue";await f.window.showInformationMessage(`Issue #${c.data.number} created: ${c.data.title}`,l)===l&&c.data.htmlUrl&&await f.env.openExternal(f.Uri.parse(c.data.htmlUrl))}else f.window.showErrorMessage(c.error?.userMessage||"Failed to create issue")})})),d.subscriptions.push(f.commands.registerCommand("gitaxis.createPullRequest",async()=>{let i=K();if(!i)return;let r=await e.detectRepository(i),o=r?.remotes.find(m=>m.name==="origin")||r?.remotes[0];if(!o||!o.owner||!o.repository){f.window.showWarningMessage("No GitHub remote configured.");return}let s=r?.currentBranch||"main",a=await f.window.showInputBox({title:"Create Pull Request",prompt:"Enter Pull Request title",value:`Update from ${s}`,validateInput:m=>m.trim().length>0?void 0:"Title cannot be empty"});if(!a)return;let n=await f.window.showInputBox({title:"Target Branch (Base)",prompt:"Enter base branch",value:"main"});if(!n)return;let c=await f.window.showInputBox({title:"Pull Request Description",prompt:"Enter description (optional)"}),l={id:j.randomUUID(),type:"github.pull-request.create",input:{host:o.host,owner:o.owner,repository:o.repository,title:a.trim(),head:s,base:n.trim(),body:c?.trim()},target:{kind:"github-repository",host:o.host||"github.com",owner:o.owner,repository:o.repository},safety:"mutating",confirmation:{required:!1},createdAt:new Date().toISOString(),initiatedBy:"command-palette"};f.window.withProgress({location:f.ProgressLocation.Notification,title:"GitAxis: Creating Pull Request..."},async()=>{let m=await t.execute(l);if(m.success&&m.data){let g="Open PR";await f.window.showInformationMessage(`Pull Request #${m.data.number} created!`,g)===g&&m.data.htmlUrl&&await f.env.openExternal(f.Uri.parse(m.data.htmlUrl))}else f.window.showErrorMessage(m.error?.userMessage||"Failed to create pull request")})})),d.subscriptions.push(f.commands.registerCommand("gitaxis.actions",async()=>{let i=K();if(!i)return;let r=await e.detectRepository(i),o=r?.remotes.find(a=>a.name==="origin")||r?.remotes[0];if(!o||!o.owner||!o.repository){f.window.showWarningMessage("No GitHub remote configured.");return}let s={id:j.randomUUID(),type:"github.actions.list",input:{host:o.host,owner:o.owner,repository:o.repository},target:{kind:"github-repository",host:o.host||"github.com",owner:o.owner,repository:o.repository},safety:"read-only",confirmation:{required:!1},createdAt:new Date().toISOString(),initiatedBy:"command-palette"};f.window.withProgress({location:f.ProgressLocation.Notification,title:"GitAxis: Fetching GitHub Actions..."},async()=>{let a=await t.execute(s);if(a.success&&a.data){if(a.data.length===0){f.window.showInformationMessage("No workflow runs found.");return}let n=a.data.map(l=>({label:`${l.status==="completed"&&l.conclusion==="success"?"\u2713":"\u25CF"} ${l.name}`,description:`Status: ${l.status} \xB7 Conclusion: ${l.conclusion||"pending"}`,detail:`Branch: ${l.headBranch||"\u2014"}`,htmlUrl:l.htmlUrl})),c=await f.window.showQuickPick(n,{title:`GitHub Actions Runs (${a.data.length})`,placeHolder:"Select a workflow run to view in browser"});c?.htmlUrl&&await f.env.openExternal(f.Uri.parse(c.htmlUrl))}else f.window.showErrorMessage(a.error?.userMessage||"Failed to list actions")})})),d.subscriptions.push(f.commands.registerCommand("gitaxis.releases",async()=>{let i=K();if(!i)return;let r=await e.detectRepository(i),o=r?.remotes.find(a=>a.name==="origin")||r?.remotes[0];if(!o||!o.owner||!o.repository){f.window.showWarningMessage("No GitHub remote configured.");return}let s={id:j.randomUUID(),type:"github.release.list",input:{host:o.host,owner:o.owner,repository:o.repository},target:{kind:"github-repository",host:o.host||"github.com",owner:o.owner,repository:o.repository},safety:"read-only",confirmation:{required:!1},createdAt:new Date().toISOString(),initiatedBy:"command-palette"};f.window.withProgress({location:f.ProgressLocation.Notification,title:"GitAxis: Fetching GitHub Releases..."},async()=>{let a=await t.execute(s);if(a.success&&a.data){if(a.data.length===0){f.window.showInformationMessage("No releases found.");return}let n=a.data.map(l=>({label:l.name||l.tagName,description:`Tag: ${l.tagName}`,detail:`Published: ${l.publishedAt||"draft"}`,htmlUrl:l.htmlUrl})),c=await f.window.showQuickPick(n,{title:`GitHub Releases (${a.data.length})`,placeHolder:"Select a release to view in browser"});c?.htmlUrl&&await f.env.openExternal(f.Uri.parse(c.htmlUrl))}else f.window.showErrorMessage(a.error?.userMessage||"Failed to list releases")})}))}var F;async function wt(d){I.info("Activating GitAxis extension...");let t=new Z(d.secrets),e=new ee(d.globalState),i=new ae("git"),r=new le(t),o=new ue(e,r,i),s=new pe(i),a=new we(i),n=new ve(o,i);n.getConfirmationHandler().setPromptFn(async(b,h)=>{if(!R.workspace.getConfiguration("gitaxis").get("confirmDestructiveOperations",!0))return!0;let T="Continue",N=h?`${h}

Do you want to proceed?`:"Do you want to proceed?";return await R.window.showWarningMessage(b,{modal:!0,detail:N},T)===T}),n.setProfileMismatchPrompt(async(b,h,v)=>{let k=v?`Switch to ${v.name}`:void 0,T="Continue",N=k?[k,T]:[T],G=`Profile Mismatch: Active profile "${b.name}" (${b.github?.username||"no user"}) does not match remote owner "${h}".`,L=await R.window.showWarningMessage(G,{modal:!0},...N);return L===k?"switch":L===T?"continue":"cancel"}),F=R.window.createStatusBarItem(R.StatusBarAlignment.Left,100),F.command="gitaxis.switchProfile",F.tooltip="Click to switch GitAxis Profile",d.subscriptions.push(F);let c=async()=>{let b=await o.getActiveProfile(),h,v=R.workspace.workspaceFolders;if(v&&v.length>0)try{let k=await s.detectRepository(v[0].uri.fsPath);k?.currentBranch&&(h=k.currentBranch)}catch{}b?(F.text=h?`$(github) ${b.name} $(git-branch) ${h}`:`$(github) ${b.name}`,F.show()):(F.text="$(github) No Profile",F.show())};await c();let l,m=async()=>{await c(),l&&await l.refresh()};l=new z(d.extensionUri,o,s,a,m),d.subscriptions.push(R.window.registerWebviewViewProvider(z.viewType,l)),d.subscriptions.push(R.commands.registerCommand("gitaxis.open",async()=>{await R.commands.executeCommand("gitaxis.sidebarView.focus")})),Qe(d,o,a,i,m),Ke(d,n,o,m),je(d,n,m),Je(d,n,m),Ze(d,n,m),Xe(d,n,m),et(d,n,m),tt(d,n,s);let g=async()=>{let b=R.workspace.workspaceFolders;if(!b||b.length===0)return;let h=b[0].uri.fsPath,v=await s.detectRepository(h);if(!v||!R.workspace.getConfiguration("gitaxis").get("autoDetectProfile",!0))return;let T=await o.matchProfile({repositoryPath:v.path,remotes:v.remotes}),N=await o.getActiveProfile();if(T.recommendedProfileId&&T.recommendedProfileId!==N?.id){let G=await o.getProfile(T.recommendedProfileId);if(G){let L=`Use ${G.name}`;await R.window.showInformationMessage(`GitAxis detected repository "${v.name}". Recommended profile: "${G.name}"`,L,"Ignore")===L&&(await o.switchProfile(G.id,v.path),await m())}}};if((await o.getProfiles()).length===0){if(R.workspace.getConfiguration("gitaxis").get("promptScanOnFirstLaunch",!0)){let h="Scan";R.window.showInformationMessage("Welcome to GitAxis! Would you like to check your existing Git/GitHub configuration?",h,"Skip").then(async v=>{v===h&&await R.commands.executeCommand("gitaxis.scanAccounts")})}}else setTimeout(()=>{g().catch(b=>I.error(`Workspace check error: ${String(b)}`))},1e3);d.subscriptions.push(R.workspace.onDidChangeWorkspaceFolders(()=>{g().catch(b=>I.error(`Workspace change check error: ${String(b)}`)),m()})),I.info("GitAxis extension activated successfully.")}function yt(){I.info("Deactivating GitAxis extension...")}0&&(module.exports={activate,deactivate});
