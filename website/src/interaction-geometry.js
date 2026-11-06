/* Shared by the photo inspector and its boundary/gesture tests. */
const productGeometry=Object.freeze({
 clamp:(value,min,max)=>Math.max(min,Math.min(max,value)),
 constrain(view,bounds){
  const scale=this.clamp(view.scale,1,4);
  const x=Math.max(0,(bounds.photoWidth*scale-bounds.width)/2);
  const y=Math.max(0,(bounds.photoHeight*scale-bounds.height)/2);
  return {scale,x:this.clamp(view.x,-x,x),y:this.clamp(view.y,-y,y)};
 },
 zoomAt(view,scale,anchor,bounds){
  const next=this.clamp(scale,1,4),ratio=next/view.scale;
  return this.constrain({scale:next,x:anchor.x-(anchor.x-view.x)*ratio,y:anchor.y-(anchor.y-view.y)*ratio},bounds);
 },
 fit(width,height,ratio){return ratio>width/height?{width,height:width/ratio}:{width:height*ratio,height};},
 tilt(x,y,width,height){return {x:this.clamp((.5-y/height)*10,-5,5),y:this.clamp((x/width-.5)*12,-6,6)};},
 cardPose(x,y,width,height){return {yaw:this.clamp((x/width-.5)*42,-30,30),pitch:this.clamp((.5-y/height)*32,-22,22),lightX:this.clamp(x/width*100,0,100),lightY:this.clamp(y/height*100,0,100)};},
 rotateCard(pose,yaw,pitch){const y=this.clamp(pose.yaw+yaw,-45,45),x=this.clamp(pose.pitch+pitch,-30,30);return {yaw:y,pitch:x,lightX:50+y*.85,lightY:45-x};}
});
