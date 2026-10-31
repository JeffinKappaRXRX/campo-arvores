/* Geometry and robust sensor-window checks; these do not certify sensor accuracy. */
(function(root){'use strict';
function median(values){const a=[...values].sort((x,y)=>x-y),n=a.length;return n?n%2?a[(n-1)/2]:(a[n/2-1]+a[n/2])/2:null;}
function quantile(sorted,p){const i=(sorted.length-1)*p,a=Math.floor(i);return sorted[a]+(sorted[Math.ceil(i)]-sorted[a])*(i-a);}
function elevation(beta,gamma){if(!Number.isFinite(beta)||!Number.isFinite(gamma))return null;const r=Math.PI/180;return Math.asin(Math.max(-1,Math.min(1,-Math.cos(beta*r)*Math.cos(gamma*r))))/r;}
function screenRoll(beta,gamma,direction=0){if(![beta,gamma,direction].every(Number.isFinite))return null;const r=Math.PI/180,b=beta*r,g=gamma*r,a=direction*r,right=-Math.cos(b)*Math.sin(g),up=Math.sin(b);return Math.atan2(Math.cos(a)*right-Math.sin(a)*up,Math.sin(a)*right+Math.cos(a)*up)/r;}
function quality(samples,now){
 const recent=samples.filter(s=>Number.isFinite(s.value)&&Number.isFinite(s.at)&&now-s.at>=0&&now-s.at<=1600);
 if(recent.length<6||now-recent[0].at<700||now-recent.at(-1).at>500)return null;
 const values=recent.map(s=>s.value),mid=median(values),mad=median(values.map(v=>Math.abs(v-mid))),limit=Math.max(.15,3*1.4826*mad),inliers=recent.filter(s=>Math.abs(s.value-mid)<=limit);
 if(inliers.length<Math.ceil(recent.length*.8)||inliers.length<5)return null;
 const sorted=inliers.map(s=>s.value).sort((a,b)=>a-b),spread=quantile(sorted,.9)-quantile(sorted,.1),half=recent[0].at+(recent.at(-1).at-recent[0].at)/2;
 const first=inliers.filter(s=>s.at<=half).map(s=>s.value),last=inliers.filter(s=>s.at>half).map(s=>s.value),latest=recent.filter(s=>now-s.at<=350).map(s=>s.value);
 if(!first.length||!last.length||!latest.length||spread>.8||Math.abs(median(first)-median(last))>.25||Math.abs(median(latest)-mid)>.35)return null;
 return {angle:median(inliers.map(s=>s.value)),spread,samples:inliers.length,rejected:recent.length-inliers.length,at:now};
}
function sensitivity(distance,base,top,errorDegrees=.5){if(![distance,base,top,errorDegrees].every(Number.isFinite)||distance<=0)return null;const rad=Math.PI/180;return distance*errorDegrees*rad*(1/Math.cos(base*rad)**2+1/Math.cos(top*rad)**2);}
root.CampoClinometer={median,elevation,screenRoll,quality,sensitivity};if(typeof module!=='undefined')module.exports=root.CampoClinometer;
})(typeof globalThis!=='undefined'?globalThis:this);
