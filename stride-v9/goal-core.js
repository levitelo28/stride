/* Stride Goal Planner v9: deterministic starter plans; no medical advice or AI calls. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.StrideGoals=api;})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
const VALID_TYPES=['5k','10k','half','marathon','general','strength','custom'];
const DIST={"5k":5,"10k":10,"half":21.0975,"marathon":42.195};
const WEEKDAY={2:[2,6],3:[2,4,6],4:[1,2,4,6],5:[1,2,3,4,6]};
const DAY_TO_MONDAY=(d)=>{const x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()-((x.getUTCDay()+6)%7));return x.toISOString().slice(0,10)};
const dayAdd=(d,n)=>{const x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10)};
const round=(x)=>Math.round(x*10)/10;
function normalize(input){
 const p={...input};
 if(!VALID_TYPES.includes(p.type))throw Error('Choose a supported goal type');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(p.targetDate||'')) || !Number.isFinite(Date.parse(p.targetDate+'T12:00:00Z')))throw Error('Choose a valid target date');
 p.baseWeeklyKm=Number(p.baseWeeklyKm||0);p.currentLongestKm=Number(p.currentLongestKm||0);p.runDays=Number(p.runDays||3);p.strengthDays=Number(p.strengthDays||2);
 if(!Number.isFinite(p.baseWeeklyKm)||p.baseWeeklyKm<0||p.baseWeeklyKm>250)throw Error('Enter current weekly kilometers between 0 and 250');
 if(!Number.isFinite(p.currentLongestKm)||p.currentLongestKm<0||p.currentLongestKm>200)throw Error('Enter a reasonable current long run');
 if(![2,3,4,5].includes(p.runDays)||![1,2,3,4].includes(p.strengthDays))throw Error('Choose valid days per week');
 p.name=String(p.name||'').trim().slice(0,100);
 p.constraints=String(p.constraints||'').trim().slice(0,600);
 return p;
}
function build(input,asOf){
 const p=normalize(input);const start=DAY_TO_MONDAY(asOf);
 if(p.targetDate<asOf)throw Error('Target date must be today or in the future');
 const weeks=Math.ceil((Date.parse(DAY_TO_MONDAY(p.targetDate)+'T12:00:00Z')-Date.parse(start+'T12:00:00Z'))/604800000)+1;
 if(weeks>80)throw Error('Choose a goal date within the next 80 weeks');
 const sessions={},notes=[],summary=[];const runType=!!DIST[p.type]||p.type==='custom';
 const targetDistance=DIST[p.type]||0;
 if(weeks<8&&(p.type==='half'||p.type==='marathon'))notes.push('This deadline allows little preparation. Consider a later event; no schedule guarantees readiness.');
 if(p.type==='marathon'&&(p.baseWeeklyKm<25||p.currentLongestKm<12))notes.push('Current running baseline is limited for marathon preparation; plan deliberately caps long runs and weekly increases. Reassess readiness before race day.');
 if(p.constraints)notes.push('You reported a training limitation. Plan generation cannot assess injuries or medical risk; adjust with qualified support as needed.');
 if(runType){
  const days=WEEKDAY[p.runDays];const idealLongest={"5k":10,"10k":14,"half":23,"marathon":30,"custom":16}[p.type];
  const base=Math.max(6,p.baseWeeklyKm||8),baseLong=Math.max(3,Math.min(p.currentLongestKm||4,base*.55));
  const peakGoal={"5k":24,"10k":35,"half":45,"marathon":60,"custom":36}[p.type];
  for(let k=0;k<weeks;k++){
   const wk=dayAdd(start,k*7);const recovery=(k%4===3&&k<weeks-2),taper=k===weeks-2?0.68:k===weeks-1?0.4:1;
   const growth=Math.min(peakGoal,base*Math.pow(1.07,k));let target=round(growth*(recovery?.8:1)*taper);
   // Avoid over-concentrating a week's training into the long run.
   const longest=round(Math.min(idealLongest,baseLong*Math.pow(1.09,k)*(recovery?.78:1)*taper,target*.49));
   let other=Math.max(0,target-longest),slotCount=days.length-1;
   const mid=days.slice(0,slotCount).map((offset,i)=>{
    const km=round(i===slotCount-1?Math.max(1,other-Math.floor(other/slotCount*10)/10*(slotCount-1)):Math.max(1,Math.floor(other/slotCount*10)/10));
    return {date:dayAdd(wk,offset),kind:'run',label:i===0?'Easy run':'Recovery run',distanceKm:km,note:'Easy conversational pace; shorten or skip for pain or excessive fatigue.'};
   });
   for(const x of mid)if(x.date>=asOf&&x.date<=p.targetDate)sessions[x.date]=x;
   const longDay=dayAdd(wk,days[days.length-1]);
   if(longDay>=asOf&&longDay<=p.targetDate)sessions[longDay]={date:longDay,kind:'long',label:'Long easy run',distanceKm:longest,note:'Comfortable effort. Use walk breaks if needed; cap prolonged runs around 3 hours and review fueling.'};
   summary.push({week:wk,kilometers:target,longRunKm:longest});
   if(k<weeks-1&&p.strengthDays>0){const picks=[0,3];for(let j=0;j<Math.min(p.strengthDays,2);j++){let date=dayAdd(wk,picks[j]);if(date>=asOf&&date<=p.targetDate&&!(date in sessions))sessions[date]={date,kind:j===0?'gymA':'gymB',label:'Strength & conditioning',minutes:35,note:'Keep effort moderate to support the running plan.'};}}
  }
  if(DIST[p.type]){
   const date=p.targetDate;
   // Do not imply the user is trained for the target simply because it is on the calendar.
   sessions[date]={date,kind:'event',label:(p.name||({"5k":"5K event","10k":"10K event","half":"Half marathon","marathon":"Marathon"}[p.type])),distanceKm:round(targetDistance),note:'Goal event only. Participation and pacing depend on actual readiness; the plan does not guarantee safe completion.'};
  }
 }else{
  const slots=p.strengthDays===1?[0]:p.strengthDays===2?[0,3]:p.strengthDays===3?[0,2,4]:[0,1,3,4];
  for(let k=0;k<weeks;k++){
   const wk=dayAdd(start,k*7);const rest=k%4===3;
   slots.forEach((offset,j)=>{let date=dayAdd(wk,offset);if(date>=asOf&&date<=p.targetDate)sessions[date]={date,kind:j%2===0?'gymA':'gymB',label:p.type==='general'&&j%2?'Cardio / mobility':'Strength workout',minutes:rest?25:Math.min(60,30+Math.floor(k/3)*5),note:rest?'Lower-volume recovery week; prioritize technique.':'Adapt exercises to your equipment and experience; track weights and recovery.'};});
   if(p.type==='general'){const cardioDay=dayAdd(wk,5);if(cardioDay>=asOf&&cardioDay<=p.targetDate&&!sessions[cardioDay])sessions[cardioDay]={date:cardioDay,kind:'other',label:'Easy aerobic activity',minutes:rest?20:Math.min(45,25+Math.floor(k/4)*5),note:'Walk, cycle, swim or choose another enjoyable low-to-moderate activity.'};}
   summary.push({week:wk,sessions:slots.length+(p.type==='general'?1:0)});
  }
 }
 return {profile:p,createdAt:new Date().toISOString(),source:'Structured starter plan (rules-based; not AI)',status:'draft',sessions,summary,warnings:notes,startingWeek:start};
}
return {build,normalize,dayAdd,DAY_TO_MONDAY,VALID_TYPES};
});
