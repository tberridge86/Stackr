/* Presentation-only enhancements. No network calls or commerce integration. */
const editTrack=document.getElementById('edit-track');
const editCards=[...editTrack.querySelectorAll('.edit-product')];
const editPrevious=document.getElementById('edit-previous');
const editNext=document.getElementById('edit-next');
const editPosition=document.getElementById('edit-position');
const editMedia=matchMedia('(max-width: 760px)');
const gentleMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth';
let editFrame;
function updateEditPosition(){
 const bounds=editTrack.getBoundingClientRect();
 const active=editCards.reduce((best,card,i)=>Math.abs(card.getBoundingClientRect().left-bounds.left)<Math.abs(editCards[best].getBoundingClientRect().left-bounds.left)?i:best,0);
 editPosition.textContent=String(active+1).padStart(2,'0')+' / '+String(editCards.length).padStart(2,'0');
 editPrevious.disabled=active===0;editNext.disabled=active===editCards.length-1;
}
function moveEdit(direction){
 if(!editMedia.matches)return;
 editTrack.scrollBy({left:direction*(editCards[0].getBoundingClientRect().width+16),behavior:gentleMotion()});
}
editPrevious.addEventListener('click',()=>moveEdit(-1));
editNext.addEventListener('click',()=>moveEdit(1));
editTrack.addEventListener('scroll',()=>{cancelAnimationFrame(editFrame);editFrame=requestAnimationFrame(updateEditPosition);},{passive:true});
editMedia.addEventListener('change',updateEditPosition);
updateEditPosition();

// Additional supplier views retain their original photograph.
document.getElementById('quick-body').addEventListener('click',e=>{
 const referenceButton=e.target.closest('[data-photo-reference]');
 if(referenceButton){const p=byId(referenceButton.dataset.photoReference);if(p?.photoReference)openInfo(p.name+' · Supplier photograph','<div class="studio-reference-view">'+productPhoto({...p,...p.photoReference},'eager')+'</div><p class="studio-reference-caption">Another supplier view of the same retail product. This photograph does not confirm the condition or availability of shop stock.</p>');return;}
});

document.querySelectorAll('[data-example-price]').forEach(el=>{const p=products.find(item=>item.id===el.dataset.examplePrice);const area=el.closest('.edit-price');if(p&&area)area.outerHTML=pricePair(p);});

document.getElementById('product-guide').addEventListener('toggle',event=>{if(event.currentTarget.open)requestAnimationFrame(updateEditPosition);});

document.querySelectorAll('.guide-photo[data-quick]').forEach(stage=>{const p=byId(stage.dataset.quick);if(p?.image)stage.innerHTML=productPhoto(p);});
