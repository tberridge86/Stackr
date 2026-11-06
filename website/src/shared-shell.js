/* Keep shared navigation aligned with the rendered route, including collection views. */
(()=>{
 const shell=document.querySelector('.stackr-shell');
 if(!shell)return;
 const measure=()=>document.documentElement.style.setProperty('--stackr-header-height',Math.ceil(shell.getBoundingClientRect().height)+'px');
 measure();
 if(typeof ResizeObserver==='function')new ResizeObserver(measure).observe(shell);
 else window.addEventListener('resize',measure,{passive:true});
 const menus=[...shell.querySelectorAll('.stackr-more')];
 for(const menu of menus)menu.addEventListener('toggle',()=>{if(menu.open)for(const other of menus)if(other!==menu)other.open=false;});
 document.addEventListener('click',event=>{
  for(const menu of menus)if(menu.open&&(!menu.contains(event.target)||event.target.closest('a,button')))menu.open=false;
 });
 document.addEventListener('keydown',event=>{
  if(event.key!=='Escape')return;
  for(const menu of menus)if(menu.open){const restore=menu.contains(document.activeElement);menu.open=false;if(restore)menu.querySelector('summary').focus();}
 });
 const collection=document.getElementById('collection-main');
 if(collection){
  const update=()=>{
   const inAccount=collection.dataset.view==='account';
   document.querySelectorAll('[data-shell-nav="collect"]').forEach(link=>{
    if(inAccount)link.removeAttribute('aria-current');else link.setAttribute('aria-current','page');
   });
   const account=document.getElementById('account-link');
   if(account){if(inAccount)account.setAttribute('aria-current','page');else account.removeAttribute('aria-current');}
  };
  update();
  new MutationObserver(update).observe(collection,{attributes:true,attributeFilter:['data-view']});
 }
})();
