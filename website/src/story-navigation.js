/* Keep catalogue context across Shop -> History -> About -> Shop navigation. */
(function initStoryNavigation(){
 if(!['/','/index.html','/shop','/shop/','/sets','/sets/'].includes(location.pathname))return;
 const key='stackr-story-return-v1',maxAge=2*60*60*1000,storyPaths=['/about','/about/','/about.html','/history','/history/','/history.html'];
 document.addEventListener('click',event=>{
  if(event.defaultPrevented||event.button>0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
  const link=event.target?.closest?.('a[href="/about"],a[href="/history"]');
  if(!link||link.hasAttribute('download'))return;
  const target=link.getAttribute('target');if(target&&target.toLowerCase()!=='_self')return;
  try{
   const destination=new URL(link.href||link.getAttribute('href'),location.href);
   if(destination.origin!==location.origin||!['/about','/history'].includes(destination.pathname))return;
   rememberBrowseContext(true);
   const browse=history.state?.stackrBrowse;if(!browse||typeof browse!=='object'||Array.isArray(browse))return;
   const snapshot=JSON.stringify({savedAt:Date.now(),browse});if(snapshot.length<=65536)sessionStorage.setItem(key,snapshot);
  }catch{}
 });
 if(typeof initialBrowseSnapshot!=='undefined'&&initialBrowseSnapshot)return;
 try{
  const text=sessionStorage.getItem(key);if(!text)return;
  let saved;try{saved=JSON.parse(text);}catch{sessionStorage.removeItem(key);return;}
  const age=Date.now()-saved?.savedAt;
  if(typeof saved?.savedAt!=='number'||!Number.isFinite(saved.savedAt)||age<0||age>maxAge||!saved.browse||typeof saved.browse!=='object'||Array.isArray(saved.browse)){sessionStorage.removeItem(key);return;}
  let referrer;try{referrer=new URL(document.referrer);}catch{return;}
  if(referrer.origin!==location.origin||!storyPaths.includes(referrer.pathname))return;
  sessionStorage.removeItem(key);
  restoreBrowseContext(saved.browse);
 }catch{}
})();
