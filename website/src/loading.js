/* An independent, bounded brand introduction. It never waits for the catalogue. */
(()=>{
 'use strict';
 const root=document.documentElement;
 const started=performance.now();
 const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 let finished=false,deadline;
 function reveal(){
  if(finished)return;
  finished=true;
  clearTimeout(deadline);
  document.removeEventListener('keydown',skipOnEscape);
  root.classList.remove('site-starting');
  const content=document.getElementById('site-content');
  const loader=document.getElementById('site-loader');
  if(content)content.inert=false;
  if(loader){
   const hadFocus=loader.contains(document.activeElement);
   loader.classList.add('is-ready');
   loader.setAttribute('aria-hidden','true');
   if(hadFocus)document.querySelector('.brand')?.focus({preventScroll:true});
   setTimeout(()=>{loader.hidden=true;},reduced?0:180);
  }
 }
 function skipOnEscape(event){if(event.key==='Escape')reveal();}
 function imageReady(image){
  if(image.complete)return Promise.resolve();
  return new Promise(resolve=>{
   image.addEventListener('load',resolve,{once:true});
   image.addEventListener('error',resolve,{once:true});
  });
 }
 function begin(){
  if(finished)return;
  const loader=document.getElementById('site-loader');
  const content=document.getElementById('site-content');
  if(!loader||!content){reveal();return;}
  content.inert=true;
  document.getElementById('loader-skip')?.addEventListener('click',reveal);
  document.addEventListener('keydown',skipOnEscape);
  const images=[...document.querySelectorAll('.loader-brand img, #featured-product .hero-art-button img')];
  Promise.allSettled(images.map(imageReady)).then(()=>{
   const delay=reduced?0:Math.max(0,320-(performance.now()-started));
   setTimeout(reveal,delay);
  }).catch(reveal);
 }
 try{
  root.classList.add('site-starting');
  deadline=setTimeout(reveal,1800);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',begin,{once:true});
  else begin();
 }catch{reveal();}
})();
