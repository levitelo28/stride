/* Stride cloud adapter — optional Supabase Auth, state backup, and private photo storage.
   Public URL / publishable key only. All access is checked by Supabase RLS. */
(function(){'use strict';
const SETUP_KEY='stride-cloud-settings', LOCAL_KEY='stride-v1';
const cfg0=window.STRIDE_CLOUD_CONFIG||{};
let cfg={url:cfg0.url||'',key:cfg0.key||''};
try{const old=JSON.parse(localStorage.getItem(SETUP_KEY)||'{}');if((!cfg.url||!cfg.key)&&old.url&&old.key)cfg=old;}catch{}
let client=null, user=null, ready=false, busy=false, dirty=false, saving=false, timer=null, initialized=false, lastError='', lastSaved='', changeCount=0, remoteRevision=null, syncConflict=false;
const photoUrls={};
function status(){return {configured:!!client,signedIn:!!user,ready,email:user?.email||'',lastSaved,error:lastError,dirty,syncConflict}};
function notify(msg){window.StrideApp?.notify?.(msg)}
function refresh(){window.StrideApp?.render?.()}
function updateStatus(){const pill=document.getElementById('sync-pill');if(pill){pill.textContent=user?(syncConflict?'⚠ Sync conflict':lastError?'⚠ Sync issue':!ready?'● Connecting…':dirty?'● Saving…':'✓ Cloud saved'):(client?'● Sign in to sync':'○ Cloud not set up');pill.title=lastError||'';} }
function snapshot(){return window.StrideApp?.snapshot?.()||{};}
function apply(data){window.StrideApp?.hydrate?.(data)}
function hasLocalData(d){return (d.runLogs?.length||0)+(d.food?.length||0)+(d.sleep?.length||0)+Object.keys(d.gymLogs||{}).length+Object.keys(d.completed||{}).length+(d.healthRuns?.length||0)>0;}
function cleanSnapshot(d){const clone=JSON.parse(JSON.stringify(d));delete clone.selectedView;delete clone.selectedDate;return clone;}
const pendingKey=()=>user?'stride-cloud-pending-'+user.id:'';
const revisionKey=()=>user?'stride-cloud-revision-'+user.id:'';
function flagPending(){if(user)try{localStorage.setItem(pendingKey(),'1')}catch{}}
function rememberRevision(){if(user&&remoteRevision!==null)try{localStorage.setItem(revisionKey(),String(remoteRevision))}catch{}}
function saveLocalBackup(label){if(!user)return;try{localStorage.setItem('stride-'+label+'-'+user.id,JSON.stringify({app:'Stride',savedAt:new Date().toISOString(),data:snapshot()}))}catch{}}
async function initialize(){
 if(!cfg.url||!cfg.key)return;
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(cfg.url)||cfg.key.length<30){lastError='Invalid Supabase URL or key';updateStatus();return;}
 if(!window.supabase?.createClient){lastError='Cloud library failed to load. Check your connection.';updateStatus();return;}
 try{
  client=window.supabase.createClient(cfg.url.replace(/\/$/,''),cfg.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  const {data,error}=await client.auth.getSession();if(error)throw error;
  client.auth.onAuthStateChange((_event,session)=>{if(session?.user?.id!==user?.id){user=session?.user||null;ready=false;lastError='';updateStatus();if(user)setTimeout(()=>loadAfterLogin(),0);else refresh();}});
  if(data?.session?.user){user=data.session.user;await loadAfterLogin();}
  initialized=true;updateStatus();refresh();
 }catch(e){lastError=e.message;updateStatus();}
}
async function loadAfterLogin(forceRemote=false){
 if(!client||!user||busy)return;
 busy=true;ready=false;lastError='';syncConflict=false;updateStatus();
 try{
  const {data,error}=await client.from('stride_user_state').select('state,revision,updated_at').eq('user_id',user.id).maybeSingle();
  if(error)throw error;
  if(data?.state&&typeof data.state==='object'){
   const local=snapshot();
   const pending=!forceRemote&&localStorage.getItem(pendingKey())==='1';
   const cachedRevision=Number(localStorage.getItem(revisionKey())||0);
   remoteRevision=Number(data.revision);
   lastSaved=data.updated_at||'';
   if(pending&&cachedRevision!==remoteRevision){
     syncConflict=true;saveLocalBackup('conflict-backup');
     lastError='Cloud has newer changes than this device. Export a backup, then use Refresh cloud copy to resolve.';
     notify('Sync conflict: your local entries are preserved. Export a backup before refreshing.');
   }else if(pending){
     ready=true;dirty=true;
     notify('Finishing the last unsynced changes from this device.');
   }else{
     if(hasLocalData(local))saveLocalBackup('before-cloud');
     apply(data.state);
     ready=true;dirty=false;
     localStorage.removeItem(pendingKey());
     rememberRevision();
   }
  }else{
   const state=cleanSnapshot(snapshot());
   const response=await client.from('stride_user_state').insert({user_id:user.id,state}).select('revision,updated_at').single();
   if(response.error)throw response.error;
   remoteRevision=Number(response.data.revision);lastSaved=response.data.updated_at||'';
   rememberRevision();localStorage.removeItem(pendingKey());ready=true;dirty=false;
  }
  if(ready){
   notify('Cloud account connected. Your records can sync across devices.');
   await refreshPhotoUrls();
   await refreshTrainingPlan();
   if(dirty)queueSave();
  }
 }catch(e){lastError='Cloud setup incomplete: '+e.message;notify(lastError);}
 finally{busy=false;updateStatus();refresh();}
}
async function save(){
 if(!client||!user||!ready||saving||syncConflict)return;
 saving=true;dirty=true;updateStatus();const state=cleanSnapshot(snapshot());const version=changeCount;
 try{
  const response=await client.from('stride_user_state').update({state}).eq('user_id',user.id).eq('revision',remoteRevision).select('revision,updated_at').maybeSingle();
  if(response.error)throw response.error;
  if(!response.data){
    syncConflict=true;saveLocalBackup('conflict-backup');
    throw Error('Newer changes were saved from another device. Export a backup of your current entries, then refresh the cloud copy. No data was overwritten.');
  }
  remoteRevision=Number(response.data.revision);rememberRevision();
  lastSaved=response.data.updated_at||new Date().toISOString();lastError='';dirty=changeCount!==version;
  if(!dirty)localStorage.removeItem(pendingKey());
 }catch(e){lastError='Cloud save failed: '+e.message;dirty=true;flagPending();notify(syncConflict?'Sync conflict: records remain on this device.':'Saved on this device; cloud sync failed. Try Sync now when online.');}
 finally{saving=false;updateStatus();if(!lastError&&dirty){clearTimeout(timer);timer=setTimeout(save,1000);}}
}
function queueSave(){if(user)flagPending();changeCount++;dirty=true;updateStatus();if(!ready||syncConflict)return;clearTimeout(timer);timer=setTimeout(save,900);}
async function signIn(email){if(!client)throw Error('Configure cloud first');const r=await client.auth.signInWithOtp({email,options:{emailRedirectTo:location.origin+location.pathname}});if(r.error)throw r.error;notify('Check your email for the Stride sign-in link.');}
async function signOut(){if(!client)return; if(!confirm('Sign out? Your cloud records remain saved. This device’s cache will be cleared for privacy.'))return;await client.auth.signOut();localStorage.removeItem(LOCAL_KEY);location.reload();}
async function configure(url,key){cfg={url:url.trim().replace(/\/$/,''),key:key.trim()};localStorage.setItem(SETUP_KEY,JSON.stringify(cfg));location.reload();}
async function estimateMeal(image,description){
 if(!client||!user||!ready)throw Error('Sign in to your cloud account first');
 const response=await client.functions.invoke('analyze-meal',{body:{image,description}});
 if(response.error)throw new Error(response.error.message||'AI is not configured yet');
 return response.data;
}
async function uploadPhoto(dataUrl){
 if(!ready||!user||!dataUrl?.startsWith('data:image/'))return null;
 try{const blob=await(await fetch(dataUrl)).blob();if(blob.size>8e6)throw Error('Photo too large');const mime=blob.type||'image/jpeg';if(!['image/jpeg','image/png','image/webp'].includes(mime))throw Error('Unsupported image type');const ext=mime==='image/png'?'png':mime==='image/webp'?'webp':'jpg';const path=user.id+'/'+Date.now()+'-'+Math.random().toString(36).slice(2)+'.'+ext;const r=await client.storage.from('meal-photos').upload(path,blob,{contentType:mime,upsert:false});if(r.error)throw r.error;const link=await client.storage.from('meal-photos').createSignedUrl(path,3600);if(link.error)throw link.error;photoUrls[path]={url:link.data.signedUrl,expires:Date.now()+3500*1000};return path;}catch(e){notify('Photo kept on this device; private cloud upload failed.');return null;}
}
async function deletePhoto(path){if(!client||!user||!path||!path.startsWith(user.id+'/'))return;await client.storage.from('meal-photos').remove([path]);delete photoUrls[path];}
async function refreshTrainingPlan(){
 if(!client||!user||!window.StrideApp?.setTrainingOverrides)return;
 try{
  const {data,error}=await client.from('stride_training_overrides').select('training_date,activity,planned_km,instructions').eq('user_id',user.id).order('training_date',{ascending:true});
  if(error)throw error;
  window.StrideApp.setTrainingOverrides(data||[]);
 }catch(e){console.warn('Using bundled training plan because cloud schedule could not load:',e?.message||e);}
}
async function refreshPhotoUrls(){if(!client||!user)return;const entries=snapshot().food||[];const paths=[...new Set(entries.map(x=>x.photoPath).filter(Boolean))];await Promise.all(paths.map(async path=>{if(photoUrls[path]&&photoUrls[path].expires>Date.now())return;const r=await client.storage.from('meal-photos').createSignedUrl(path,3600);if(!r.error)photoUrls[path]={url:r.data.signedUrl,expires:Date.now()+3500*1000};}));refresh();}
function photoUrl(x){if(!x)return '';return x.photoPath?(photoUrls[x.photoPath]?.url||''):(x.photo||'');}
function renderSettings(){const st=status();const safe=(v)=>String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let html=`<div class="card cloud-panel"><div class="card-head"><h2>Your secure cloud account</h2><span class="pill ${st.ready?'':'yellow'}">${st.ready?'Connected':st.configured?'Sign in required':'Setup needed'}</span></div><p class="muted">Netlify hosts the app. Supabase saves your workouts, food, photos, and sleep privately across devices. A browser cache is still kept for offline use.</p>`;
 if(!st.configured)html+=`<form id="cloud-config-form" class="cloud-form"><div class="field"><label>Supabase Project URL</label><input class="input" name="url" type="url" required placeholder="https://yourproject.supabase.co" value="${safe(cfg.url)}"/></div><div class="field"><label>Supabase publishable or anon key (not a secret service key)</label><input class="input" name="key" required placeholder="sb_publishable_…" value="${safe(cfg.key)}"/></div><button type="submit" class="btn">Connect project</button><p class="small-note">You must run the provided database setup SQL once in your Supabase project first.</p></form>`;
 else if(!st.signedIn)html+=`<form id="cloud-login-form" class="cloud-form"><div class="field"><label>Email address</label><input type="email" class="input" name="email" autocomplete="email" placeholder="you@example.com" required/></div><button class="btn" type="submit">Email me a sign-in link</button></form>`;
 else html+=`<div class="cloud-user"><strong>Signed in as ${safe(st.email)}</strong><small>${st.ready?'Your entries are saved to the cloud.':'Still connecting to your cloud records.'}</small>${st.lastSaved?`<small>Last saved: ${safe(new Date(st.lastSaved).toLocaleString())}</small>`:''}</div><div class="setting-actions"><button class="btn small" data-cloud="sync-now">Sync now</button><button class="btn secondary small" data-cloud="reload">Refresh cloud copy</button><button class="btn ghost small" data-cloud="sign-out">Sign out</button></div>`;
 if(st.error)html+=`<p class="cloud-error" role="alert">${safe(st.error)}. Confirm that your SQL setup and Auth redirect URLs are configured.</p>`;
 if(st.syncConflict)html+=`<p class="cloud-error">This device has unsynced changes and the cloud has a newer version. Download a backup from Your data & privacy, then choose Refresh cloud copy if you want the cloud version.</p>`;
 html+=`</div>`;return html;}
 document.addEventListener('submit',async e=>{if(e.target.id==='cloud-config-form'){e.preventDefault();const f=new FormData(e.target);await configure(String(f.get('url')||''),String(f.get('key')||''));}if(e.target.id==='cloud-login-form'){e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;try{await signIn(String(new FormData(e.target).get('email')||''));}catch(x){lastError=x.message;refresh();notify(x.message)}finally{b.disabled=false;}}});
 document.addEventListener('click',async e=>{const b=e.target.closest('[data-cloud]');if(!b)return;const cmd=b.dataset.cloud;if(cmd==='sign-out')await signOut();if(cmd==='sync-now'){await save();notify(lastError||'Cloud sync complete');}if(cmd==='reload'){if(confirm('Load the latest cloud copy? Export a backup first: unsynced device edits may be replaced.')){saveLocalBackup('before-refresh');await loadAfterLogin(true);}}if(cmd==='change-project'){if(confirm('Change Supabase project? Your cloud account is not deleted. Export a backup first.')){localStorage.removeItem(SETUP_KEY);await client?.auth.signOut();location.reload();}}});
 window.addEventListener('online',()=>{if(dirty)save();});
 window.StrideCloud={boot:initialize,status,queueSave,estimateMeal,uploadPhoto,deletePhoto,photoUrl,refreshPhotoUrls,renderSettings};
})();
