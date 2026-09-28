import {findPath, followPath} from './pathfinding.mjs';
import {planStarterLoadout} from './loadout.mjs';
import {createHistory} from './editor/commandHistory.mjs';
import {attachPart, detachSubtree, setInstanceParams} from './editor/assemble.mjs';
import {buildEmptyCoreTemplate, buildEngineerMechaTemplate, buildQuadChassisArmTemplate} from './editor/templates.mjs';
import {PARAM_SPECS} from './editor/params.mjs';
import {explainAttachFailure} from './editor/compatible.mjs';
import {ACTIONS, autoBindings, setBinding} from './editor/bindings.mjs';
import {extractComponent, instantiateComponent} from './editor/components.mjs';
import {findNavControl} from './nav.mjs';
import {blueprintHasTool, formatBuildStatus, shouldApplySaveResponse, shouldSyncFromServer} from './buildDraft.mjs';
import {formatHangarMetricsHtml, hangarMetrics} from './editor/hangarMetrics.mjs';
import {cockpitViewHint, groupInstancesByZone, PART_ZONE} from './workshop/mechaZones.mjs';

const FREEFORM_PARTS = [
  'wheel', 'plate', 'beam', 'post', 'revolute_joint', 'prism_joint',
  'gripper', 'pusher', 'hook', 'battery',
  'mecha_head', 'armor_torso', 'armor_shoulder', 'mecha_leg', 'backpack_frame',
  'weapon_rifle', 'thruster_pack', 'winch_module', 'heavy_plate',
];
const CHILD_POINT = {
  wheel: 'hub',
  plate: 'face_a',
  beam: 'end_b',
  post: 'end_b',
  revolute_joint: 'in',
  prism_joint: 'in',
  gripper: 'mount',
  pusher: 'mount',
  hook: 'mount',
  battery: 'mount',
  camera: 'mount',
  display: 'mount',
  mecha_head: 'mount',
  armor_torso: 'mount',
  armor_shoulder: 'mount',
  mecha_leg: 'mount',
  backpack_frame: 'mount',
  weapon_rifle: 'mount',
  thruster_pack: 'mount',
  winch_module: 'mount',
  heavy_plate: 'mount',
};
const VIEWS = ['home', 'assembly', 'build', 'yard', 'missions', 'play', 'companion', 'collection'];

const paths={robot:'M7 7V4h10v3M5 8h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Zm3 5v2m8-2v2M9 18h6M1 12v4m22-4v4',home:'m3 10 9-7 9 7M5 9v11h5v-6h4v6h5V9',tool:'m14 5 5-2-1 5-5 5-3-3 4-5ZM10 10l-7 7a2 2 0 0 0 3 3l7-7',board:'M9 4h6v4H9zM7 6H5v15h14V6h-2M8 12h8m-8 4h5',book:'M12 5C8 2 3 3 2 4v15c4-2 7-1 10 1 3-2 6-3 10-1V4c-4-2-7-1-10 1Zm0 0v15',coin:'m8 3 8 0 5 7-3 10H6L3 10 8 3Zm2 5h4l2 4-2 4h-4l-2-4 2-4Z',battery:'M3 6h16v12H3zM21 10v4m-10-6-3 5h5l-2 3',help:'M9 9a3 3 0 1 1 4 3c-1 0-1 1-1 2m0 3v.1M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',arrow:'M4 12h15m-6-6 6 6-6 6',pin:'m9 3 8 4-3 4v4l-8-4 3-2V3Zm0 10-4 8',parts:'m12 2 9 5v10l-9 5-9-5V7l9-5Zm0 10L3 7m9 5 9-5m-9 5v10M7 5l9 5',scan:'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0Zm-3 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z',arm:'M4 21h12M7 20v-6l5-4-4-5 3-3 6 7v4l-5 4v3M17 10l4 1v5m-1-5 2-3',wheels:'M5 7h14v9H5zM2 9v6m20-6v6M7 17v3m10-3v3M8 10h8',tracks:'M6 7h12a5 5 0 0 1 0 10H6A5 5 0 0 1 6 7Zm1 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm10 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z',face:'M3 4h18v15H3zM7 9v2m10-2v2M8 14q4 4 8 0M9 22h6',rotate:'M20 7v5h-5M4 17v-5h5M5 7a8 8 0 0 1 14-1l1 6M4 12l1 6a8 8 0 0 0 14-1',play:'m8 3 13 9-13 9V3Z',info:'M12 11v6m0-10v.1M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',move:'M12 2v20M2 12h20M8 6l4-4 4 4M8 18l4 4 4-4M6 8l-4 4 4 4m12-8 4 4-4 4',edit:'m4 15 12-12 5 5L9 20l-6 1 1-6Zm10-10 5 5',chat:'M4 3h16v14H9l-5 4V3Zm4 5h8m-8 4h5',blueprint:'M3 3h18v18H3zM7 3v3m4-3v2m4-2v3m4-3v2M7 11l4-3 6 4v6H7v-7Zm4-3v7h6',check:'m5 12 4 4L19 6',circle:'M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',star:'m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1 3-6Z',lock:'M6 10h12v11H6zM8 10V6a4 4 0 0 1 8 0v4m-4 5v2'};
const icon=name=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.parts}"/></svg>`;
function icons(root=document){root.querySelectorAll('[data-icon]').forEach(el=>{el.innerHTML=icon(el.dataset.icon)})}icons();
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let actionSettled=Promise.resolve(),finishAction=()=>{},navigationVersion=0,navigating=false;
let state=null,view='home',scene=null,busy=false,filter='全部',routeVersion=0,toastTimer;const modal=$('#modal');
let editorScene=null,buildHistory=createHistory(),buildBp=null,buildSelected=null,pendingBuildPart=null,editorReady=null;
let pendingAttach=null; // {parentInstanceId, pointId, partId}
let buildSlotTab='head'; // 机库左栏当前槽位 tab
const BUILD_SLOT_TABS=[
  {zone:'head',label:'头'},
  {zone:'torso',label:'躯干'},
  {zone:'shoulder_l',label:'肩'},
  {zone:'chassis',label:'底盘'},
  {zone:'arm',label:'臂'},
  {zone:'backpack',label:'背包'},
  {zone:'weapon',label:'武器'},
];
let buildDirty=false,buildSaving=false,buildSaveFailed=false,pendingComponent=null;
let yardScene=null,yardReady=null,yardKeys={forward:0,turn:0,joint:0,extend:0,grasp:0,fire:0,thrust:0,winch:0},yardChallengeSubmitting=false;
let yardDiagTimer=null;
const THEME_KEY='gameVisualTheme';
const THEME_IDS=new Set(['warm','mecha','wasteland','future']);
function normalizeThemeId(id){
 const s=String(id||'').trim().toLowerCase();
 return THEME_IDS.has(s)?s:'warm';
}
function readStoredTheme(){
 try{return normalizeThemeId(localStorage.getItem(THEME_KEY))}catch{return 'warm'}
}
function syncThemeButtons(themeId){
 $$('.theme-btn').forEach(btn=>{
  const on=btn.dataset.theme===themeId;
  btn.classList.toggle('is-active',on);
  btn.setAttribute('aria-pressed',on?'true':'false');
 });
}
function applyVisualTheme(themeId,{persist=true}={}){
 const id=normalizeThemeId(themeId);
 if(persist){
  try{localStorage.setItem(THEME_KEY,id)}catch{/* ignore */}
 }
 document.body.dataset.theme=id;
 syncThemeButtons(id);
 editorScene?.setTheme?.(id);
 yardScene?.setTheme?.(id);
 if(view==='build')requestAnimationFrame(()=>refitBuildEditor());
}
function toast(text){if(!text)return;$('#toast').textContent=text;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),4200)}
function showModal(content){$('#modal-content').innerHTML=content;if(!modal.open)modal.showModal();icons(modal)}
$('.modal-close').onclick=()=>modal.close();modal.addEventListener('click',e=>{if(e.target===modal){const r=modal.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)modal.close()}});
async function navigate(next,replace=false,{force=false}={}){
 if(!state)return;
 if(!VIEWS.includes(next))next='home';
 if(view==='build'&&next!=='build'&&buildDirty&&!force){
  const leave=window.confirm('当前作品尚未保存。本地草稿会保留，但刷新可能丢失。仍要离开？');
  if(!leave)return;
 }
 const request=++navigationVersion;navigating=true;routeVersion++;scene?.setRoute([]);
 await actionSettled;
 if(request!==navigationVersion)return;
 if(next==='play'&&!state.active)next='missions';
 const sameView=next===view&&!force;
 const transition=state.active?(next==='play'?(state.active.paused?'resume':null):(!state.active.paused?'pause':null)):null;
 if(transition&&!await act(transition,{},true)){
  if(request===navigationVersion){navigating=false;history.replaceState({},'',`#${view}`)}
  return;
 }
 if(request!==navigationVersion)return;
 const leavingYard=view==='yard'&&next!=='yard';
 navigating=false;view=next;document.body.dataset.view=next;
 $$('.screen').forEach(s=>s.hidden=s.id!==next);
 $$('.bottom-nav button').forEach(b=>{const selected=b.dataset.view===(next==='play'?'missions':next);b.classList.toggle('active',selected);b.setAttribute('aria-current',selected?'page':'false')});
 const hash=`#${next}`;if(location.hash!==hash)history[replace?'replaceState':'pushState']({},'',hash);
 scene?.update(state,view);if(!sameView)window.scrollTo(0,0);render();
 if(next==='build'){
  if(sameView&&editorScene){editorScene.resize();updateBuildChrome()}
  else await ensureBuildEditor({resync:!sameView&&!buildDirty});
 }
 else editorScene?.resize();
 if(next==='yard')await ensureYardScene();
 else if(leavingYard){
  yardKeys={forward:0,turn:0,joint:0,extend:0,grasp:0,fire:0,thrust:0,winch:0};
  yardScene?.setInput(0,0);
  if(yardDiagTimer){clearInterval(yardDiagTimer);yardDiagTimer=null}
 }
}
window.addEventListener('popstate',()=>navigate(location.hash.slice(1)||'home',true));
document.addEventListener('click',e=>{const nav=findNavControl(e.target);if(nav)navigate(nav.dataset.view)});
async function act(action,extra={},quiet=false){if(busy||!state)return false;busy=true;actionSettled=new Promise(resolve=>{finishAction=resolve});document.body.classList.add('busy');$('#save-status').innerHTML=`${icon('rotate')} 正在保存…`;try{const response=await fetch('/api/game/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,revision:state.revision,...extra})});const data=await response.json();if(data.state)state=data.state;render();scene?.update(state,view);if(!data.ok){toast(data.reason||'操作未完成');return false}if(action==='move')await scene?.armMotion();if(!quiet)toast(data.message);return data}catch(error){toast('暂时无法连接工坊，未确认保存。请重试。');return false}finally{busy=false;finishAction();document.body.classList.remove('busy');$('#save-status').innerHTML='<span class="live-dot"></span> 本地工坊 · 自动保存'}}
function hasPart(id){return id==='arm'?state.equipped.some(p=>p==='arm'||p==='arm_left'):state.equipped.includes(id)}
function requirementName(id){return id==='arm'?'机械臂（左 / 右任选）':state.parts.find(p=>p.id===id).name}
function renderChapterMap(){
 if(!state||!$('#chapter-map'))return;
 const status=state.challenge_status||{};
 const byChapter={};
 (state.open_challenges||[]).forEach(c=>{const k=c.chapter;(byChapter[k]=byChapter[k]||[]).push(c);});
 $('#chapter-map').innerHTML=(state.chapters||[]).map(ch=>{
  const nodes=(byChapter[ch.chapter]||[]).slice().sort((a,b)=>a.order-b.order);
  return `<div class="chapter-col ${nodes.length&&nodes.every(n=>status[n.id]==='done')?'all-done':''}">
   <div class="chapter-head"><span class="chapter-no">CH ${ch.chapter}</span><h3>${esc(ch.title)}</h3><p>${esc(ch.blurb)}</p></div>
   <div class="chapter-nodes">${nodes.map(n=>{const st=status[n.id]||'locked';return `<button type="button" class="chapter-node ${st}" data-challenge="${n.id}" ${st==='locked'?'disabled':''}><span class="node-ico">${st==='done'?'✓':st==='locked'?'🔒':'▶'}</span><span class="node-title">${esc(n.title)}</span><span class="node-reward">${st==='done'?'已完成':'+'+n.reward+' 币'}</span></button>`;}).join('')}</div>
  </div>`;
 }).join('');
}
function render(){if(!state)return;$('#coins').textContent=state.coins;$('#energy').textContent=state.energy+'%';$('#robot-label').textContent=state.name;$('#speech-name').textContent=state.name;$('#companion-name').textContent=state.name;$('.model-badge').textContent=state.name+' / MODULAR COMPANION';$('#charge').disabled=!!state.active&&!state.active.paused;$('#charge').title=state.active&&!state.active.paused?'返回工坊暂停任务后可充电':'点击补满电量';const next=state.missions.find(m=>!state.completed.includes(m.id))||state.missions[2];$('#home-task').textContent=state.completed.length===3?'工坊亮起来了':next.title;$('#home-desc').textContent=state.completed.length===3?'三个委托都完成了！试试新的装配，也可以重温这段小小冒险。':next.description;$('#home-reward').textContent=state.completed.length===3?'3 / 3':'+'+next.reward;$('#home-progress').textContent=`0${state.completed.length} / 03`;$$('.chapter-dots i').forEach((el,i)=>el.classList.toggle('done',i<state.completed.length));$('#task-dot').hidden=state.completed.length===3;
 renderParts();$('#power-label').textContent=`${state.power} / ${state.capacity} W`;$('#power-meter').style.width=`${state.power/state.capacity*100}%`;$('#power-meter').parentElement.classList.toggle('warning',state.power/state.capacity>.8);$('#port-label').textContent=`${state.ports} / 4`;$('#port-dots').innerHTML=Array.from({length:4},(_,i)=>`<i class="${i<state.ports?'used':''}"></i>`).join('');$('#abilities').innerHTML=state.equipped.map(id=>{const p=state.parts.find(p=>p.id===id);return `<div class="ability"><i>${icon(p.icon)}</i><span>${p.id.startsWith('arm')?p.name+' · ':''}${p.ability}</span></div>`}).join('')||'<p class="tip">从零件库装上第一个零件吧。</p>';$('#assembly-tip').textContent=state.active?(state.active.paused?'任务已暂停，进度已保留。现在可以自由改装和充电，准备好后从委托板继续。':'正在返回工坊，稍后即可改装。'):!state.equipped.includes('camera')?'小提示：装上摄像头，才能发现桌面的秘密。':!hasPart('arm')?'机械臂可以搬运核心。供电不足时，先卸下屏幕。':'扫描与搬运准备好了，去接一份委托吧。';
 $('#mission-board').innerHTML=state.missions.map((m,i)=>{const done=state.completed.includes(m.id),locked=state.missions.slice(0,i).some(p=>!state.completed.includes(p.id)),active=state.active?.mission===m.id;const ready=m.requires.every(hasPart)&&state.equipped.some(p=>p==='wheels'||p==='tracks');return `<article class="mission-card paper"><div class="mission-art"><span class="mission-number">COMMISSION / 0${i+1}</span>${icon(['scan','book','star'][i])}<span class="mission-badge">${active?(state.active.paused?'已暂停':'探索中'):done?'已完成':locked?'尚未解锁':'可接取'}</span></div><div class="mission-content"><h2>${m.title}</h2><p>${m.description}</p><div class="requirements">${m.requires.map(id=>`<span class="${hasPart(id)?'ready':''}">${hasPart(id)?'✓ ':''}${requirementName(id)}</span>`).join('')}</div><div class="reward-line">${icon('coin')}<b>${done?'奖励已领取':'+'+m.reward}</b><span>${done?'可重复练习':'零件币 · +'+m.xp+' 默契'}</span></div><button class="${locked?'dark':'primary'} full" data-mission="${m.id}" ${locked||state.active&&!active?'disabled':''}>${active?'继续探索':locked?'完成前一委托解锁':!ready?'先去改装':done?'再次挑战':'接受委托'} ${icon(active?'arrow':locked?'lock':'play')}</button></div></article>`}).join('');
 $('#level').textContent=`默契 Lv.${state.level}`;$('#xp-label').textContent=`${state.xp%40} / 40 · 下一等级`;$('#xp-meter').style.width=`${state.xp%40/40*100}%`;$('#growth').innerHTML=[['scan','探索',state.completed.length],['arm','搬运',state.completed.length],['face','表达',state.completed.includes('little-stage')?3:0]].map(([ic,label,n])=>`<div class="growth-row"><i>${icon(ic)}</i><span>${label}</span><div class="meter"><span style="width:${n/3*100}%"></span></div><small>${n}/3</small></div>`).join('');$('#memory-count').textContent=`${state.memories.length} / 3`;$('#memories').innerHTML=state.memories.length?state.memories.map(m=>`<div class="memory"><i>${icon('star')}</i><div><strong>${esc(m.title)}</strong><p>${esc(m.quote)}</p></div></div>`).join(''):'<div class="empty-memory">这里还没有回忆。<br>一起完成第一个委托，就会留下第一束光。</div>';$('#memory-quote').textContent=state.memories.at(-1)?.quote||'我的第一个愿望？和你一起，去看看桌子另一边。';$$('[data-accent]').forEach(b=>{b.classList.toggle('selected',state.accent===b.dataset.accent);b.setAttribute('aria-pressed',state.accent===b.dataset.accent)});
 renderChapterMap();
 if(state.active){const a=state.active,m=state.missions.find(m=>m.id===a.mission);$('#play-title').textContent=m.title;$('#objectives').innerHTML=[[a.scanned,'靠近光点，扫描核心'],[a.carrying,'用机械臂拾取核心'],[false,'回到充电站，交付核心']].map(([done,t])=>`<div class="objective ${done?'done':''}">${icon(done?'check':'circle')}${t}</div>`).join('');$('#play-hint').textContent=a.carrying?'青色圆环是充电站。回到那里，按 3 交付。':a.scanned?'再靠近一些，按 2 夹起这枚核心。':'琥珀色光点就是目标。靠近后按 1 扫描。';$('#move-count').textContent=a.moves;$('#scan').disabled=a.scanned;$('#pick').disabled=!a.scanned||a.carrying;$('#deliver').disabled=!a.carrying;}
}
function partCard(p,collection=false){const owned=state.owned.includes(p.id),equipped=state.equipped.includes(p.id);return `<button class="part-card ${equipped?'equipped':''}" data-part="${p.id}" draggable="${owned&&!collection}" title="${esc(p.description)}" aria-pressed="${equipped}"><span class="part-check">${equipped?'已安装':owned?'已拥有':icon('lock')}</span><span class="part-symbol">${icon(p.icon)}</span><strong>${p.name}</strong><small>${owned?p.power+' W · '+p.ability:p.price+' 零件币 · 解锁'}</small></button>`}
function renderParts(){$('#owned-count').textContent=`${state.owned.length} / ${state.parts.length}`;$('#parts-grid').innerHTML=state.parts.filter(p=>filter==='全部'||p.category===filter).map(p=>partCard(p)).join('');$('#collection-grid').innerHTML=state.parts.map(p=>partCard(p,true)).join('');$('#collection-count').textContent=`已收集 ${state.owned.length} / ${state.parts.length}`}
$('#part-filters').onclick=e=>{const b=e.target.closest('[data-filter]');if(!b)return;filter=b.dataset.filter;$$('[data-filter]').forEach(el=>el.classList.toggle('active',el===b));renderParts()};
document.addEventListener('click',async e=>{const p=e.target.closest('[data-part]');if(p){const id=p.dataset.part,part=state.parts.find(p=>p.id===id);if(!state.owned.includes(id)){showModal(`<span class="eyebrow">NEW POSSIBILITIES</span><h2>解锁${part.name}</h2><p>${part.description}</p><p>需要 <strong>${part.price} 零件币</strong>，当前拥有 ${state.coins}。</p><button id="confirm-buy" class="primary full" ${state.coins<part.price?'disabled':''}>${state.coins<part.price?'零件币不足':'解锁零件'}</button>`);$('#confirm-buy').onclick=async()=>{if(await act('buy',{part:id}))modal.close()};return}if(view==='collection'){navigate('assembly');return}await act('equip',{part:id});return}
 const missionButton=e.target.closest('[data-mission]');if(missionButton){const m=state.missions.find(m=>m.id===missionButton.dataset.mission);if(state.active){navigate('play');return}if(!m.requires.every(hasPart)||!state.equipped.some(p=>p==='wheels'||p==='tracks')){navigate('assembly');toast('为这次任务装上所需零件，再回来出发。');return}if(await act('start',{mission:m.id}))navigate('play')}
 const chNode=e.target.closest('[data-challenge]');if(chNode){const id=chNode.dataset.challenge;if((state.challenge_status||{})[id]==='locked')return;await startYardChallenge(id);await navigate('yard');return}
 const accent=e.target.closest('[data-accent]');if(accent)await act('appearance',{accent:accent.dataset.accent});
});
document.addEventListener('dragstart',e=>{const p=e.target.closest('[data-part]');if(p&&state.owned.includes(p.dataset.part)){e.dataTransfer.setData('text/plain',p.dataset.part);e.dataTransfer.effectAllowed='copy'}});
const drop=$('#drop-target');drop.addEventListener('dragover',e=>{e.preventDefault();drop.classList.add('drag-over')});drop.addEventListener('dragleave',()=>drop.classList.remove('drag-over'));drop.addEventListener('drop',async e=>{e.preventDefault();drop.classList.remove('drag-over');const part=e.dataTransfer.getData('text/plain');if(state.equipped.includes(part)){toast('这个零件已经安装好了。');return}await act('equip',{part})});let rotationStart=null;drop.addEventListener('pointerdown',e=>{rotationStart=e.clientX;drop.setPointerCapture(e.pointerId)});drop.addEventListener('pointermove',e=>{if(rotationStart!==null&&scene){scene.angle+=(e.clientX-rotationStart)*.008;rotationStart=e.clientX}});drop.addEventListener('pointerup',()=>rotationStart=null);drop.addEventListener('pointercancel',()=>rotationStart=null);
$('#charge').onclick=()=>act('charge');$('#move-help').onclick=()=>toast('点击桌面的空格自动寻路，或使用方向键逐格移动。');
$('#apply-starter-loadout').onclick=()=>{
 if(!state)return;
 const partPower=Object.fromEntries(state.parts.map(p=>[p.id,p.power]));
 const plan=planStarterLoadout({owned:state.owned,equipped:state.equipped,capacity:state.capacity,basePower:2,partPower});
 const nameOf=id=>{const p=state.parts.find(x=>x.id===id);return p?p.name:id};
 if(plan.missing.length){
  showModal(`<span class="eyebrow">RECOMMENDED LOADOUT</span><h2>还差几件零件</h2><p>${esc(plan.note)}</p><p>缺口：${plan.missing.map(nameOf).map(esc).join('、')}。请先在零件库解锁，推荐装配不会自动扣币购买。</p><button class="primary full" id="close-loadout-gap">知道了</button>`);
  $('#close-loadout-gap').onclick=()=>modal.close();
  return;
 }
 if(plan.ok===false){
  showModal(`<span class="eyebrow">RECOMMENDED LOADOUT</span><h2>供电预算不足</h2><p>${esc(plan.note)}</p><p>最终功耗：<strong>${plan.finalPower} / ${plan.finalCapacity} W</strong></p><button class="primary full" id="close-loadout-power">知道了</button>`);
  $('#close-loadout-power').onclick=()=>modal.close();
  return;
 }
 if(plan.ok!==false&&plan.equip.length===0&&plan.unequip.length===0&&!plan.missing.length){
  showModal(`<span class="eyebrow">RECOMMENDED LOADOUT</span><h2>已满足首关推荐</h2><p>${esc(plan.note)}</p><p>无需改动装配。</p><button class="primary full" id="close-loadout-ready">知道了</button>`);
  $('#close-loadout-ready').onclick=()=>modal.close();
  return;
 }
 const equipLine=plan.equip.length?plan.equip.map(nameOf).map(esc).join('、'):'无';
 const unequipLine=plan.unequip.length?plan.unequip.map(nameOf).map(esc).join('、'):'无';
 showModal(`<span class="eyebrow">RECOMMENDED LOADOUT</span><h2>应用首关推荐装配？</h2><p>${esc(plan.note)}</p><p>将安装：<strong>${equipLine}</strong></p><p>将卸下：<strong>${unequipLine}</strong></p><p>最终功耗：<strong>${plan.finalPower} / ${plan.finalCapacity} W</strong></p><div class="dialog-actions"><button class="dark" id="cancel-loadout">取消</button><button class="primary" id="confirm-loadout">确认应用</button></div>`);
 $('#cancel-loadout').onclick=()=>modal.close();
 $('#confirm-loadout').onclick=async()=>{
  modal.close();
  for(const id of plan.unequip){if(state.equipped.includes(id)&&!await act('equip',{part:id},true))return}
  for(const id of plan.equip){if(!state.equipped.includes(id)&&!await act('equip',{part:id},true))return}
  toast(plan.unequip.includes('display')?'已装上首关零件，并卸下表情屏幕。':'已应用首关推荐装配。');
 };
};

$('#scan').onclick=async()=>{if(await act('scan'))scene?.scan()};$('#pick').onclick=()=>act('pick');$('#deliver').onclick=async()=>{if(!state.active)return;const m=state.missions.find(m=>m.id===state.active.mission),first=!state.completed.includes(m.id);if(await act('deliver',{},true)){routeVersion++;scene?.setRoute([]);navigate('home');showModal(`<div class="success-mark">${icon('star')}</div><span class="eyebrow" style="justify-content:center;margin-top:15px">A LITTLE MOMENT TO REMEMBER</span><h2 style="text-align:center">${first?'把光，带回家。':'又一次顺利归来。'}</h2><p style="text-align:center">${esc(m.quote)}</p><div class="reward-summary"><div><strong>+${first?m.reward:0}</strong><small>零件币${first?'':' · 首次奖励已领取'}</small></div><div><strong>+${first?m.xp:0}</strong><small>伙伴默契</small></div></div><div class="dialog-actions"><button class="dark" id="see-memories">查看回忆</button><button class="primary" id="next-task">下一次冒险</button></div>`);$('#see-memories').onclick=()=>{modal.close();navigate('companion')};$('#next-task').onclick=()=>{modal.close();navigate('missions')}}};
$('#return-workshop').onclick=()=>navigate('home');
$('#abandon-task').onclick=()=>{showModal('<span class="eyebrow">BACK TO THE WORKSHOP</span><h2>这次先回家？</h2><p>本次探索位置和携带的核心会重置，已获得的奖励与零件都会保留。</p><button class="primary full" id="confirm-abandon">放弃本次任务并回工坊</button>');$('#confirm-abandon').onclick=async()=>{routeVersion++;if(await act('abandon')){modal.close();navigate('home')}}};
$('#toggle-quest').onclick=()=>{const panel=$('.play-quest'),btn=$('#toggle-quest'),collapsed=!panel.classList.contains('is-collapsed');panel.classList.toggle('is-collapsed',collapsed);panel.classList.toggle('quest-collapsed',collapsed);btn.setAttribute('aria-expanded',collapsed?'false':'true');btn.textContent=collapsed?'任务':'收起'};
$('#rename').onclick=()=>{showModal(`<span class="eyebrow">HELLO, LITTLE FRIEND</span><h2>给伙伴一个名字</h2><form id="name-form"><input name="name" aria-label="伙伴名字" maxlength="16" required value="${esc(state.name)}"><button class="primary full">保存名字</button></form>`);$('#name-form').onsubmit=async e=>{e.preventDefault();if(await act('rename',{name:new FormData(e.target).get('name')}))modal.close()}};
$('#help').onclick=()=>showModal('<span class="eyebrow">WELCOME TO YOUR LITTLE WORKSHOP</span><h2>从一个小小的想法开始</h2><p>① 在「改装」安装摄像头和任意一侧机械臂。左右臂可独立装卸，单臂就能搬运；双臂需要扩容电池。功耗不够时，可以先卸下表情屏幕，或解锁并安装扩容电池。</p><p>② 在「委托」接受任务。点击桌面移动，靠近琥珀色光点后按 1 扫描、按 2 搬运。</p><p>③ 带着核心回到青色充电站，按 3 交付。获得零件币、默契和回忆。</p><p>工坊顶部电池可以充电；图鉴里可以进入真实硬件与工程工具。进度保存在当前电脑的 Studio 数据目录中。</p>');
$('#open-chat').onclick=async()=>{if(!state.robot_id){if(!await act('charge',{},true))return}showModal(`<span class="eyebrow">A MOMENT WITH ${esc(state.name)}</span><h2>和${esc(state.name)}聊聊</h2><p id="chat-reply">我在这里。今天想聊点什么？</p><form id="chat-form"><input name="text" aria-label="对伙伴说的话" placeholder="你好，小伙伴" maxlength="500" required autocomplete="off"><button class="primary full">发送</button></form><a class="text-link" href="/robot.html?id=${encodeURIComponent(state.robot_id)}">打开完整形象与对话页 →</a>`);$('#chat-form').onsubmit=async e=>{e.preventDefault();const form=e.target,button=form.querySelector('button');button.disabled=true;button.textContent='伙伴正在想…';try{const res=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({robot_id:state.robot_id,text:new FormData(form).get('text')})});const data=await res.json();$('#chat-reply').textContent=data.ok?data.reply:data.reason||'暂时没能回应，再试一次吧。';if(data.ok)form.reset()}catch{$('#chat-reply').textContent='连接暂时中断，请稍后重试。'}finally{button.disabled=false;button.textContent='发送'}}};

function activeBlueprint(){
 if(!state)return null;
 const id=state.active_blueprint_id;
 return (state.blueprints||[]).find(b=>b.id===id)||(state.blueprints||[])[0]||null;
}
function syncBuildFromState(resetHistory=false,{force=false}={}){
 if(!shouldSyncFromServer({dirty:buildDirty,force}))return;
 const bp=activeBlueprint();
 if(!bp)return;
 buildBp=structuredClone(bp);
 buildDirty=false;
 buildSaveFailed=false;
 if(resetHistory){buildHistory=createHistory();buildHistory.push(buildBp)}
 else if(!buildHistory.canUndo&&!buildHistory.canRedo)buildHistory.push(buildBp);
 buildSelected=buildBp.root_instance_id;
 editorScene?.setBlueprint(buildBp);
 editorScene?.setSelected(buildSelected);
 updateBuildChrome();
}
function isNearEmptyBlueprint(bp){
 return !bp?.instances || bp.instances.length <= 1;
}
function setBuildGuide(text){
 const el=$('#build-guide');
 if(el&&text)el.textContent=text;
}
function pulsePartsPanel(){
 const panel=$('.build-parts');
 if(!panel)return;
 panel.classList.remove('is-collapsed');
 panel.classList.remove('is-pulse');
 void panel.offsetWidth;
 panel.classList.add('is-pulse');
 const btn=$('#build-toggle-parts');
 if(btn){btn.setAttribute('aria-expanded','true');btn.textContent='收起'}
}
function applyEngineerMechaTemplate({quiet=false}={}){
 if(!state)return false;
 const active=activeBlueprint();
 const tpl=buildEngineerMechaTemplate({
  id:active?.id||'engineer-mecha',
  name:'工程机甲',
 });
 applyBuildBlueprint(tpl);
 buildSelected=tpl.root_instance_id;
 editorScene?.setSelected(buildSelected);
 // 机甲主题更易读轮廓；仍可手动切回温暖
 if(normalizeThemeId(document.body.dataset.theme)!=='mecha'){
  applyVisualTheme('mecha');
 }
 editorScene?.frameAll?.({snap:true});
 setBuildGuide('工程机甲已装好：头罩、装甲、腿架与肩枪。保存后进试验场。');
 if(!quiet)toast('已装工程机甲：看头罩青绿、肩甲、腿架与金色步枪；点「整机」看全貌');
 return true;
}
function applyQuadTemplate({quiet=false}={}){
 if(!state)return false;
 const active=activeBlueprint();
 const tpl=buildQuadChassisArmTemplate({
  id:active?.id||'quad-chassis-arm',
  name:active?.name||'四轮机架与两关节臂',
 });
 applyBuildBlueprint(tpl);
 buildSelected=tpl.root_instance_id;
 editorScene?.setSelected(buildSelected);
 editorScene?.frameAll?.();
 setBuildGuide('四轮模板已装好。点「保存」，再点「进试验场」就能开。');
 if(!quiet)toast('已装上四轮+机械臂，记得保存后再试跑');
 return true;
}
function renderBuildPalette(){
 const tabsWrap=$('#build-slot-tabs'); if(!tabsWrap)return;
 const groups={};
 for(const id of FREEFORM_PARTS){
  const z=PART_ZONE[id]||'配件';
  (groups[z]||(groups[z]=[])).push(id);
 }
 const tabs=BUILD_SLOT_TABS.filter(t=>groups[t.zone]?.length);
 if(groups['配件']?.length)tabs.push({zone:'配件',label:'配件'});
 if(!groups[buildSlotTab]?.length)buildSlotTab=tabs[0]?.zone||'head';
 tabsWrap.innerHTML=tabs.map(t=>`<button type="button" class="slot-tab${t.zone===buildSlotTab?' active':''}" data-slot="${esc(t.zone)}">${esc(t.label)}<small>${groups[t.zone].length}</small></button>`).join('');
 const pal=$('#build-part-palette'); if(!pal)return;
 const defs=state?.part_defs||[];
 const nameOf=id=>defs.find(p=>p.id===id)?.name||id;
 const catOf=id=>defs.find(p=>p.id===id)?.category||'';
 const iconOf=id=>defs.find(p=>p.id===id)?.icon||'parts';
 const equipped=new Set((buildBp?.instances||[]).map(i=>i.part_id));
 pal.innerHTML=(groups[buildSlotTab]||[]).map(id=>`
  <button type="button" class="build-part-btn${pendingBuildPart===id?' active':''}${equipped.has(id)?' equipped':''}" data-build-part="${esc(id)}">
   <i class="part-symbol">${icon(iconOf(id))}</i>
   <strong>${esc(nameOf(id))}</strong>
   <small>${esc(catOf(id))}</small>
   ${equipped.has(id)?'<span class="part-check">已装</span>':''}
  </button>`).join('')||'<p class="tip">此槽位暂无可用零件</p>';
 const count=$('#build-catalog-count'); if(count)count.textContent=`目录 ${FREEFORM_PARTS.length}`;
}
function updateBuildChrome(){
 $$('.build-part-btn').forEach(b=>b.classList.toggle('active',b.dataset.buildPart===pendingBuildPart));
 const undo=$('#build-undo'),redo=$('#build-redo');
 if(undo)undo.disabled=!buildHistory.canUndo;
 if(redo)redo.disabled=!buildHistory.canRedo;
 const detach=$('#build-detach');
 if(detach)detach.disabled=!buildSelected||buildSelected===buildBp?.root_instance_id;
 const status=$('#build-status');
 if(status){
  status.textContent=formatBuildStatus({
   saving:buildSaving,
   dirty:buildDirty,
   failed:buildSaveFailed,
   name:buildBp?.name||activeBlueprint()?.name||'未命名作品',
   instanceCount:(buildBp?.instances||[]).length,
  });
 }
 const empty=isNearEmptyBlueprint(buildBp);
 const cta=$('#build-empty-cta');
 if(cta)cta.hidden=!empty;
 const hint=$('#build-pick-hint');
 if(hint){
  if(pendingBuildPart){
   const name=$('.build-part-btn.active')?.textContent?.trim()||pendingBuildPart;
   hint.textContent=`已选「${name}」→ 点画布上的绿色连接点安装`;
   hint.classList.add('is-ready');
  }else if(empty){
   hint.textContent='新手：点中间大按钮一键装模板；或点下方零件再点蓝点';
   hint.classList.remove('is-ready');
  }else{
   hint.textContent='点零件 → 再点连接点继续加装；也可以随时换模板';
   hint.classList.remove('is-ready');
  }
 }
 if(empty)setBuildGuide('还是空机架。一键装四轮模板最快；也可以自己选零件。');
 else if(buildDirty)setBuildGuide('有未保存改动。保存后进试验场试跑。');
 else if(!blueprintHasTool(buildBp,state?.part_defs||[]))setBuildGuide('还缺夹爪/推板/钩子，装上才能进试验场抓东西。');
 else setBuildGuide('可以进试验场试跑了。失败就回编辑再改。');
 renderBuildPalette();
 renderBuildParams();
 renderBuildBindings();
 renderComponentLibrary();
 renderHangarMetrics();
 renderHangarTopStats();
 editorScene?.setPendingPart?.(pendingBuildPart);
}
function renderHangarMetrics(){
 const el=$('#hangar-metrics');
 if(!el)return;
 const m=hangarMetrics(buildBp,state?.part_defs||[]);
 const zones=buildBp?groupInstancesByZone(buildBp):{};
 const zoneLine=Object.entries(zones).filter(([,ids])=>ids.length).map(([z,ids])=>`${z}:${ids.length}`).join(' · ');
 const view=buildBp?cockpitViewHint(buildBp):null;
 el.innerHTML=formatHangarMetricsHtml(m)+
  (zoneLine?`<p class="tip">区域覆盖 ${esc(zoneLine)}</p>`:'')+
  (view?`<p class="tip${view.ok?'':' is-warn'}">${esc(view.reason)}</p>`:'');
 renderHangarCompare(m);
}
function renderHangarCompare(cur){
 const el=$('#hangar-compare'); if(!el)return;
 if(!cur||!buildBp?.instances?.length){el.innerHTML='';return;}
 const defs=state?.part_defs||[];
 const ref=hangarMetrics(buildEngineerMechaTemplate({id:'ref',name:'工程机甲参考'}),defs);
 const row=(label,curV,refV,unit)=>{
  const d=curV-refV;
  const arrow=d>0.0005?'▲':(d<-0.0005?'▼':'＝');
  const cls=d>0.0005?'up':(d<-0.0005?'down':'');
  return `<div class="ch">${label}</div><div class="cur">${curV.toFixed(2)}${unit}</div><div class="ref">${refV.toFixed(2)}${unit}</div><div class="delta ${cls}">${arrow}${Math.abs(d).toFixed(2)}${unit}</div>`;
 };
 el.innerHTML=`<h3>对照 · 工程机甲参考</h3>
  <div class="compare-grid">
   <div class="ch">指标</div><div class="ch">当前</div><div class="ch">参考</div><div class="ch">差值</div>
   ${row('质量',cur.mass,ref.mass,'kg')}
   ${row('可达',cur.reach,ref.reach,'m')}
   ${row('轮距',cur.width,ref.width,'m')}
   ${row('倾覆裕度',cur.tipMargin,ref.tipMargin,'m')}
  </div>
  <p class="tip">绿升红降：相对标准工程机甲，你的改装偏什么方向。</p>`;
}
function renderHangarTopStats(){
 const el=$('#hangar-topstats'); if(!el)return;
 const defs=state?.part_defs||[];
 const m=hangarMetrics(buildBp,defs);
 // 机库内部按质量折算功耗估算（part_defs 序列化未带 power_w，且与装配态 parts 的 id 体系不同）
 const used=(buildBp?.instances||[]).reduce((s,i)=>{
  const d=defs.find(p=>p.id===i.part_id);
  return s+(d?(d.mass_kg||0)*3.2:0);
 },0);
 const cap=state?.capacity||12;
 const over=used>cap*0.8;
 el.innerHTML=`
  <div class="topstat"><b>${m.mass.toFixed(2)}</b><span>总重 KG</span></div>
  <div class="topstat"><b class="${over?'is-warn':''}">${used.toFixed(1)}<small>/${cap}</small></b><span>供电估 W</span></div>
  <div class="topstat"><b>${m.parts}</b><span>零件数</span></div>`;
}
function renderBuildBindings(){
 const panel=$('#build-bindings');
 if(!panel||!buildBp)return;
 const bindings=autoBindings(buildBp);
 const labels={lift:'抬臂',extend:'伸缩',grasp:'夹取',drive:'驾驶',turn:'转向',fire:'射击',thrust:'推进',winch:'绞盘'};
 panel.innerHTML=`<div class="panel-heading"><h2>控制绑定</h2><small>选中后点动作</small></div>`+
  ACTIONS.map(action=>{
   const ids=bindings[action]||[];
   return `<div class="bind-row"><button type="button" class="dark bind-action" data-bind-action="${action}">${labels[action]||action}</button><span>${ids.length?ids.map(esc).join(', '):'（未绑定）'}</span></div>`;
  }).join('')+
  `<button type="button" class="text-button" id="build-auto-bind">自动绑定可驱动件</button>`;
 panel.querySelectorAll('[data-bind-action]').forEach(btn=>{
  btn.onclick=()=>{
   if(!buildSelected){toast('先选中要绑定的零件');return}
   const action=btn.dataset.bindAction;
   const cur=autoBindings(buildBp)[action]||[];
   const nextIds=cur.includes(buildSelected)?cur.filter(id=>id!==buildSelected):[...cur,buildSelected];
   applyBuildBlueprint(setBinding(buildBp,action,nextIds));
   toast(`已更新 ${labels[action]||action} 绑定`);
  };
 });
 $('#build-auto-bind')?.addEventListener('click',()=>{
  const auto=autoBindings({...buildBp,bindings:{}});
  let next=buildBp;
  for(const action of ACTIONS) next=setBinding(next,action,auto[action]);
  applyBuildBlueprint(next);
  toast('已按零件类型自动绑定');
 });
}
function renderComponentLibrary(){
 const panel=$('#build-components');
 if(!panel)return;
 const lib=state?.component_library||[];
 panel.innerHTML=`<div class="panel-heading"><h2>自制组件</h2><small>${lib.length}</small></div>`+
  (lib.length?lib.map(c=>`<button type="button" class="build-part-btn" data-place-component="${esc(c.id)}">${esc(c.name||c.id)} · ${c.instances?.length||0}件</button>`).join(''):'<p class="tip">选中子结构后点「存为组件」</p>');
 panel.querySelectorAll('[data-place-component]').forEach(btn=>{
  btn.onclick=()=>{
   const comp=(state.component_library||[]).find(c=>c.id===btn.dataset.placeComponent);
   if(!comp)return;
   if(!buildSelected){toast('先选中要挂接的父零件');return}
   pendingComponent=comp;
   toast('已选组件：再点父零件上的绿色连接点放置');
   pendingBuildPart=null;
   updateBuildChrome();
  };
 });
}
function renderBuildParams(){
 const panel=$('#build-params');
 if(!panel)return;
 const inst=(buildBp?.instances||[]).find(i=>i.instance_id===buildSelected);
 if(!inst){
  panel.innerHTML='<p class="tip">选中零件后可调尺寸参数</p>';
  return;
 }
 const specs=PARAM_SPECS[inst.part_id];
 if(!specs){
  panel.innerHTML=`<p class="tip">${esc(inst.part_id)} · 暂无可调参数</p>`;
  return;
 }
 panel.innerHTML=Object.entries(specs).map(([key,spec])=>{
  const val=inst.params?.[key]??spec.default;
  return `<label class="build-param-row"><span>${esc(spec.label)}</span><input type="range" min="${spec.min}" max="${spec.max}" step="0.01" value="${val}" data-param-key="${key}"><b>${Number(val).toFixed(2)}</b></label>`;
 }).join('');
 panel.querySelectorAll('input[data-param-key]').forEach(input=>{
  const label=input.parentElement?.querySelector('b');
  input.addEventListener('input',()=>{if(label)label.textContent=Number(input.value).toFixed(2)});
  input.addEventListener('change',()=>{
   const key=input.dataset.paramKey;
   const next=setInstanceParams(buildBp,buildSelected,{[key]:Number(input.value)});
   applyBuildBlueprint(next);
  });
 });
}
function applyBuildBlueprint(next,{push=true,dirty=true}={}){
 buildBp=next;
 if(dirty){buildDirty=true;buildSaveFailed=false}
 if(push)buildHistory.push(buildBp);
 editorScene?.setBlueprint(buildBp);
 if(buildSelected&&!(buildBp.instances||[]).some(i=>i.instance_id===buildSelected)){
  buildSelected=buildBp.root_instance_id;
 }
 editorScene?.setSelected(buildSelected);
 updateBuildChrome();
}
function expandHangarPartsLibrary(){
 const panel=$('.build-parts');
 const btn=$('#build-toggle-parts');
 const narrow=typeof matchMedia==='function'&&matchMedia('(max-width:900px)').matches;
 if(!panel)return;
 panel.classList.toggle('is-collapsed',!!narrow);
 if(btn){
  btn.setAttribute('aria-expanded',narrow?'false':'true');
  btn.textContent=narrow?'展开零件库':'收起零件库';
 }
}
function refitBuildEditor(){
 editorScene?.resize?.();
 editorScene?.frameAll?.();
}
async function ensureBuildEditor({resync=false}={}){
 if(editorScene){
  expandHangarPartsLibrary();
  if(!buildBp)syncBuildFromState(false,{force:true});
  else if(resync&&!buildDirty)syncBuildFromState(false);
  else updateBuildChrome();
  refitBuildEditor();
  requestAnimationFrame(()=>{refitBuildEditor();setTimeout(refitBuildEditor,80)});
  return editorScene;
 }
 if(editorReady)return editorReady;
 editorReady=(async()=>{
  try{
   const {BlueprintEditorScene}=await import('/game-assets/workshop/editorScene.mjs');
   window.__gamePartDefs=state?.part_defs||[];
   editorScene=new BlueprintEditorScene($('#build-world'),{
    getPartDefs:()=>state?.part_defs||window.__gamePartDefs||[],
    onSelect:(id)=>{buildSelected=id;editorScene.setSelected(id);pendingBuildPart=null;updateBuildChrome()},
    onPickPoint:(instanceId,pointId,meta)=>{
     if(pendingComponent&&buildBp){
      if(meta&&meta.compatible===false){toast(meta.reason||'连接点不兼容');return}
      try{
       const {blueprint}=instantiateComponent(buildBp,pendingComponent,{parentInstanceId:instanceId,parentPointId:pointId});
       applyBuildBlueprint(blueprint);
       pendingComponent=null;
       toast('组件已挂上');
      }catch(err){toast(err.message||'无法放置组件')}
      return;
     }
     if(!pendingBuildPart||!buildBp){
      pulsePartsPanel();
      setBuildGuide('先点左侧零件（如夹爪），再点蓝色连接点。');
      toast('先点左侧零件，再点连接点');
      return;
     }
     if(meta&&meta.compatible===false){toast(meta.reason||'连接点不兼容');return}
     const childPoint=CHILD_POINT[pendingBuildPart];
     if(!childPoint){toast('未知零件连接点');return}
     const fail=explainAttachFailure(buildBp,instanceId,pointId,pendingBuildPart,state?.part_defs||[]);
     if(fail){toast(fail);return}
     const collision=editorScene?.validateAttach?.(instanceId,pointId,pendingBuildPart);
     if(collision&&collision.ok===false){toast(collision.reason||'安装位置会碰撞');return}
     const same=pendingAttach
      &&pendingAttach.parentInstanceId===instanceId
      &&pendingAttach.pointId===pointId
      &&pendingAttach.partId===pendingBuildPart;
     if(!same){
      pendingAttach={parentInstanceId:instanceId,pointId,partId:pendingBuildPart};
      setBuildGuide('预览已对齐。再点一次同一连接点确认安装。');
      toast('预览已吸附——再点一次确认安装');
      return;
     }
     try{
      const next=attachPart(buildBp,{
       partId:pendingBuildPart,
       parentInstanceId:instanceId,
       parentPointId:pointId,
       childPointId:childPoint,
      });
      const newId=(next.instances||[]).map(i=>i.instance_id).find(id=>!(buildBp.instances||[]).some(o=>o.instance_id===id));
      applyBuildBlueprint(next);
      pendingBuildPart=null;
      pendingAttach=null;
      updateBuildChrome();
      editorScene?.playInstall?.();
      editorScene?.clearPreview?.();
      if(newId)editorScene?.flashInstall?.(newId);
      toast('零件已挂上');
     }catch(err){toast(err.message||'无法连接')}
    },
   });
   syncBuildFromState(true,{force:true});
   editorScene?.setTheme?.(readStoredTheme());
   expandHangarPartsLibrary();
   refitBuildEditor();
   requestAnimationFrame(()=>{refitBuildEditor();setTimeout(refitBuildEditor,80)});
  }catch(error){
   console.error(error);
   toast('建造场景未能启动');
   editorReady=null;
  }
  return editorScene;
 })();
 return editorReady;
}
async function saveBuildBlueprint({quiet=false}={}){
 if(!buildBp){toast('没有可保存的蓝图');return false}
 const payload=structuredClone(buildBp);
 buildSaving=true;buildSaveFailed=false;updateBuildChrome();
 // 保存期间若 applyBuildBlueprint 把 dirty 重新置 true，响应不得覆盖草稿
 buildDirty=false;
 const data=await act('blueprint_replace',{blueprint:payload},quiet);
 buildSaving=false;
 if(!data){
  buildDirty=true;
  buildSaveFailed=true;
  updateBuildChrome();
  return false;
 }
 if(!shouldApplySaveResponse({dirtyDuringSave:buildDirty})){
  updateBuildChrome();
  if(!quiet)toast('蓝图已保存；本地还有更新的未保存修改');
  return true;
 }
 buildDirty=false;
 window.__gamePartDefs=state.part_defs||[];
 syncBuildFromState(false,{force:true});
 updateBuildChrome();
 return true;
}
$('#build-slot-tabs')?.addEventListener('click',e=>{
 const b=e.target.closest('[data-slot]');
 if(!b)return;
 buildSlotTab=b.dataset.slot;
 renderBuildPalette();
});
$('#build-part-palette')?.addEventListener('click',e=>{
 const btn=e.target.closest('[data-build-part]');
 if(!btn)return;
 pendingBuildPart=btn.dataset.buildPart;
 if(!FREEFORM_PARTS.includes(pendingBuildPart))return;
 if(!buildSelected)buildSelected=buildBp?.root_instance_id||null;
 editorScene?.setSelected(buildSelected);
 updateBuildChrome();
 setBuildGuide(`已选「${btn.textContent.trim()}」——点画布上的绿色连接点装上。`);
 toast(`已选 ${btn.textContent.trim()}：去点绿色连接点`);
});
$('#build-undo')?.addEventListener('click',()=>{
 const prev=buildHistory.undo();
 if(!prev){toast('没有可撤销的步骤');return}
 applyBuildBlueprint(prev,{push:false});
});
$('#build-redo')?.addEventListener('click',()=>{
 const next=buildHistory.redo();
 if(!next){toast('没有可重做的步骤');return}
 applyBuildBlueprint(next,{push:false});
});
function wireApplyMecha(){
 applyEngineerMechaTemplate();
}
function wireApplyQuad(){
 applyQuadTemplate();
}
$('#build-apply-mecha')?.addEventListener('click',wireApplyMecha);
$('#build-apply-quad')?.addEventListener('click',wireApplyQuad);
$('#build-quick-start')?.addEventListener('click',()=>{
 applyEngineerMechaTemplate();
});
$('#build-empty-pick')?.addEventListener('click',()=>{
 const cta=$('#build-empty-cta');
 if(cta)cta.hidden=true;
 pulsePartsPanel();
 setBuildGuide('点左侧零件，再点蓝点安装。');
 toast('从左侧选一个零件开始');
});
$('#build-new-empty')?.addEventListener('click',()=>{
 if(!state)return;
 showModal(`<span class="eyebrow">NEW CHASSIS</span><h2>新建空机架？</h2><p>将用仅含核心的空白作品替换当前编辑草稿（可撤销）。也可以随时一键装回四轮模板。</p><div class="dialog-actions"><button class="dark" id="cancel-empty">取消</button><button class="primary" id="confirm-empty">新建空机架</button></div>`);
 $('#cancel-empty').onclick=()=>modal.close();
 $('#confirm-empty').onclick=()=>{
  modal.close();
  const active=activeBlueprint();
  const tpl=buildEmptyCoreTemplate({
   id:active?.id||`empty-${Date.now().toString(36)}`,
   name:'空机架',
  });
  applyBuildBlueprint(tpl);
  buildSelected=tpl.root_instance_id;
  editorScene?.setSelected(buildSelected);
  setBuildGuide('空机架已就绪。点「一键装上四轮机架」最快。');
  toast('已从空机架开始');
 };
});
$('#build-detach')?.addEventListener('click',()=>{
 if(!buildBp||!buildSelected){toast('先选中要拆卸的零件');return}
 try{
  const next=detachSubtree(buildBp,buildSelected);
  applyBuildBlueprint(next);
  buildSelected=next.root_instance_id;
  editorScene?.setSelected(buildSelected);
  toast('已拆卸选中零件及其子树');
 }catch(err){toast(err.message||'无法拆卸')}
});
$('#build-save-component')?.addEventListener('click',async()=>{
 if(!buildBp||!buildSelected){toast('先选中子结构的根零件');return}
 try{
  const comp=extractComponent(buildBp,buildSelected,{name:`组件-${buildSelected}`});
  if(!await act('save_component',{component:comp}))return;
  renderComponentLibrary();
 }catch(err){toast(err.message||'无法保存组件')}
});
$('#build-save')?.addEventListener('click',async()=>{
 await saveBuildBlueprint();
});
$('#build-enter-yard')?.addEventListener('click',async()=>{
 if(!state)return;
 if(buildDirty){
  if(!await saveBuildBlueprint({quiet:true}))return;
 }
 const bp=buildBp||activeBlueprint();
 if(!blueprintHasTool(bp,state.part_defs||[])){
  toast('蓝图上还没有夹爪/推板/钩子，先装上再进试验场');
  return;
 }
 if(!await act('enter_yard'))return;
 await navigate('yard');
});
$('#build-toggle-parts')?.addEventListener('click',()=>{
 const panel=$('.build-parts');
 if(!panel)return;
 const collapsed=panel.classList.toggle('is-collapsed');
 const btn=$('#build-toggle-parts');
 if(btn)btn.setAttribute('aria-expanded',collapsed?'false':'true');
 if(btn)btn.textContent=collapsed?'展开零件库':'收起零件库';
});
$('#build-cam-frame')?.addEventListener('click',()=>editorScene?.frameAll?.());
$('#build-cam-front')?.addEventListener('click',()=>editorScene?.setStandardView?.('front'));
$('#build-cam-side')?.addEventListener('click',()=>editorScene?.setStandardView?.('side'));
$('#build-cam-top')?.addEventListener('click',()=>editorScene?.setStandardView?.('top'));
$('#build-cam-bottom')?.addEventListener('click',()=>editorScene?.viewBottom?.());
$('#build-cam-focus')?.addEventListener('click',()=>editorScene?.focusSelection?.());
$('#build-reduce-motion')?.addEventListener('change',e=>editorScene?.setReduceMotion?.(e.target.checked));
$('#build-mute-sfx')?.addEventListener('change',e=>{
 editorScene?.setMuted?.(e.target.checked);
 yardScene?.setMuted?.(e.target.checked);
 const y=$('#yard-mute-sfx');if(y)y.checked=e.target.checked;
});
function syncYardCamButtons(mode){
 $$('#yard .build-cam-bar .cam-btn').forEach(btn=>{
  const id=btn.id||'';
  const map={
   'yard-cam-cockpit':'cockpit',
   'yard-cam-follow':'follow',
   'yard-cam-orbit':'orbit',
   'yard-cam-tool':'tool',
   'yard-cam-frame':'orbit',
  };
  btn.classList.toggle('is-active',map[id]===mode);
 });
}
$('#yard-cam-cockpit')?.addEventListener('click',()=>{
 yardScene?.enterCockpit?.();
 syncYardCamButtons('cockpit');
 toast('驾驶舱第一人称');
});
$('#yard-cam-follow')?.addEventListener('click',()=>{
 yardScene?.resumeFollow?.();
 syncYardCamButtons('follow');
});
$('#yard-cam-orbit')?.addEventListener('click',()=>{
 yardScene?.setCameraMode?.('orbit');
 syncYardCamButtons('orbit');
});
$('#yard-cam-tool')?.addEventListener('click',()=>{
 yardScene?.focusTool?.();
 syncYardCamButtons('tool');
});
$('#yard-cam-frame')?.addEventListener('click',()=>{
 yardScene?.frameCameraToBounds?.();
 syncYardCamButtons('orbit');
});
$('#yard-reduce-motion')?.addEventListener('change',e=>yardScene?.setReduceMotion?.(e.target.checked));
$('#yard-mute-sfx')?.addEventListener('change',e=>{
 yardScene?.setMuted?.(e.target.checked);
 editorScene?.setMuted?.(e.target.checked);
 const b=$('#build-mute-sfx');if(b)b.checked=e.target.checked;
});
$('#yard-quality-low')?.addEventListener('change',e=>{
 yardScene?.setQuality?.(e.target.checked?'low':'high');
 editorScene?.setQuality?.(e.target.checked?'low':'high');
});
$('#yard-debug')?.addEventListener('change',e=>{
 yardScene?.setDebug?.(e.target.checked);
});
document.addEventListener('click',e=>{
 const btn=e.target.closest?.('.theme-btn[data-theme]');
 if(!btn)return;
 applyVisualTheme(btn.dataset.theme);
 toast(`已切换视觉主题：${btn.textContent.trim()}`);
});
applyVisualTheme(readStoredTheme(),{persist:false});
$('#yard-contrast')?.addEventListener('click',async()=>{
 try{
  const [{compareStructures},{shortArmBlueprint,longArmBlueprint,contrastPartDefs}]=await Promise.all([
   import('/game-assets/simulation/structureContrast.mjs'),
   import('/game-assets/editor/contrastBlueprints.mjs'),
  ]);
  const live=state?.part_defs||[];
  const defs=live.length?live:contrastPartDefs();
  const report=compareStructures(shortArmBlueprint(),longArmBlueprint(),defs,{
   targetDist:0.18,
   heldMass:0.6,
  });
  const hint=$('#yard-structure-hint');
  if(hint){
   hint.hidden=false;
   hint.textContent=report.summary;
  }
  toast(report.summary);
 }catch(err){
  console.error(err);
  toast(err.message||'结构对比失败');
 }
});

function offerUpright(reason){
 showModal(`<span class="eyebrow">TIPPED OVER</span><h2>倾覆了</h2><p>${esc(reason||'重心超出支撑面')}</p><div class="dialog-actions"><button class="dark" id="tip-dismiss">知道了</button><button class="primary" id="tip-upright">扶正</button></div>`);
 $('#tip-dismiss').onclick=()=>modal.close();
 $('#tip-upright').onclick=()=>{yardScene?.upright();modal.close();toast('已扶正')};
}

async function ensureYardScene(){
 if(yardScene){
  yardScene.resize();
  yardScene.setBlueprint(activeBlueprint(),state?.part_defs||[]);
  yardScene.reset();
  syncYardChallengeUi();
  startYardDiagnostics();
  return yardScene;
 }
 if(yardReady)return yardReady;
 yardReady=(async()=>{
  try{
   const {YardScene}=await import('/game-assets/workshop/yardScene.mjs');
   window.__gamePartDefs=state?.part_defs||[];
   yardScene=new YardScene($('#yard-world'),{
    getPartDefs:()=>state?.part_defs||window.__gamePartDefs||[],
    onTip:(reason)=>{toast(reason);offerUpright(reason)},
    onGrasp:(result)=>{if(result?.reason)toast(result.reason)},
    onChallengeReady:(payload)=>submitYardChallenge(payload),
   });
   yardScene.setBlueprint(activeBlueprint(),state?.part_defs||[]);
   yardScene.setTheme?.(readStoredTheme());
   if($('#yard-quality-low')?.checked)yardScene.setQuality?.('low');
   yardScene.reset();
   yardScene.resumeFollow?.();
   syncYardCamButtons('follow');
   syncYardChallengeUi();
   startYardDiagnostics();
  }catch(error){
   console.error(error);
   toast('试验场未能启动');
   yardReady=null;
  }
  return yardScene;
 })();
 return yardReady;
}

function startYardDiagnostics(){
 if(yardDiagTimer)clearInterval(yardDiagTimer);
 const refreshYardStatus=()=>{
  const bp=activeBlueprint();
  const el=$('#yard-status');
  if(el&&bp){
   el.textContent=`试跑 · ${bp.name||'未命名'} · ${(bp.instances||[]).length} 零件 · rev ${bp.revision??state?.revision??'—'}`;
  }
 };
 refreshYardStatus();
 yardDiagTimer=setInterval(()=>{
  if(view!=='yard'||!yardScene)return;
  refreshYardStatus();
  const d=yardScene.diagnostics?.();
  const el=$('#yard-diagnostics');
  if(!el||!d)return;
  const issues=(d.controls?.issues||[]).map(i=>i.message).slice(0,2);
  const gy=typeof d.groundY==='number'?` · 离地 ${d.groundY.toFixed(2)}m`:'';
  el.textContent=`质量 ${d.mass.toFixed(2)}kg · 轮距宽 ${d.width.toFixed(2)}m · 可达 ${d.reach.toFixed(2)}m · 夹爪${d.gripperOpen>0.4?'张开':'闭合'}`+
   gy+
   (d.graspPhase&&d.graspPhase!=='idle'?` · 抓取:${d.graspPhase}`:'')+
   (d.fps?` · ${Math.round(d.fps)}fps`:'')+
   (d.tipRisk?' · ⚠接近倾覆':'')+
   (issues.length?` · ${issues.join('；')}`:'');
  const hint=$('#yard-structure-hint');
  if(hint&&d.structureHint){
   hint.hidden=false;
   hint.textContent=d.structureHint;
  }
 },400);
}

function syncYardChallengeUi(){
 const ch=state?.challenge;
 const on=!!(ch&&ch.started);
 const id=ch?.id||'';
 const drawerBtn=$('#yard-challenge');
 const gapBtn=$('#yard-challenge-gap');
 if(drawerBtn){
  drawerBtn.textContent=on&&id==='drawer-block'?'抽屉进行中':'抽屉挑战';
  drawerBtn.disabled=on&&id==='drawer-block';
 }
 if(gapBtn){
  gapBtn.textContent=on&&id==='desk-gap-rescue'?'救援进行中':'跨桌缝救援';
  gapBtn.disabled=on&&id==='desk-gap-rescue';
 }
 const submit=$('#yard-submit-challenge');
 if(submit)submit.hidden=!on;
 if(yardScene){
  if(on)yardScene.setChallengeMode(true,id);
  else if(yardScene.world?.challengeMode)yardScene.setChallengeMode(false);
 }
}

function offerChallengeSuccess(first,challenge,stars){
 const reward=first?(challenge?.reward??150):0;
 const xp=first?(challenge?.xp??60):0;
 const title=challenge?.title||'开放挑战';
 const starsHtml=stars?`<div class="challenge-stars">${'★'.repeat(stars)}<span class="dim">${'★'.repeat(3-stars)}</span></div>`:'';
 showModal(`<div class="success-mark">${icon('star')}</div><span class="eyebrow" style="justify-content:center;margin-top:15px">CHALLENGE</span><h2 style="text-align:center">${first?`${esc(title)}，完成了。`:'又一次稳稳送达。'}</h2>${starsHtml}<p style="text-align:center">结构决定解法——愿意的话，回编辑再改一版。</p><div class="reward-summary"><div><strong>+${reward}</strong><small>零件币${first?'':' · 首次奖励已领取'}</small></div><div><strong>+${xp}</strong><small>伙伴默契</small></div></div><div class="dialog-actions"><button class="dark" id="challenge-edit">回编辑</button><button class="primary" id="challenge-ok">继续试验</button></div>`);
 $('#challenge-ok').onclick=()=>modal.close();
 $('#challenge-edit').onclick=()=>{modal.close();navigate('build')};
}

async function submitYardChallenge(payload){
 if(yardChallengeSubmitting||!state?.challenge?.run_id)return;
 const status=payload||yardScene?.challengeStatus?.();
 if(!status||status.region!=='receive'||!(status.speed<=0.05)){
  toast(status?.region!=='receive'?'请先把方块放到接收区':'方块还在移动，请等它停稳');
  return;
 }
 yardChallengeSubmitting=true;
 const cid=state.challenge.id;
 const challenge=(state.open_challenges||[]).find(c=>c.id===cid)||{reward:150,xp:60,title:'挑战'};
 const first=!(state.completed_challenges||[]).includes(cid);
 const data=await act('submit_challenge',{
  run_id:state.challenge.run_id,
  block_id:status.block_id,
  region:'receive',
  speed:status.speed,
  elapsed:_challengeStart?Math.round((Date.now()-_challengeStart)/100)/10:null,
 },true);
 yardChallengeSubmitting=false;
 if(data)offerChallengeSuccess(first,challenge,challengeStars(data));
}

// 从后端返回文案里提取星级（"N★"），无则返回 null
function challengeStars(text){const m=String(text||'').match(/(\d)★/);return m?+m[1]:null;}
let _challengeStart=0;

async function startYardChallenge(missionId){
 if(!state)return;
 const bp=activeBlueprint();
 if(!blueprintHasTool(bp,state.part_defs||[])){
  toast('当前蓝图缺少操作工具，已返回编辑');
  await navigate('build');
  return;
 }
 const data=await act('start_challenge',{mission:missionId});
 if(!data)return;
 _challengeStart=Date.now();
 yardScene?.setChallengeMode(true,missionId);
 yardScene?.reset();
 syncYardChallengeUi();
 toast(missionId==='desk-gap-rescue'?'跨桌缝救援开始：小心掉缝，把方块救回接收区':'抽屉挑战开始：把方块运到接收区');
}

$('#yard-upright')?.addEventListener('click',()=>{yardScene?.upright();toast('已扶正')});
$('#yard-reset')?.addEventListener('click',async()=>{
 await act('yard_reset',{},true);
 yardScene?.reset();
 toast('已回到起点');
});
$('#yard-exit')?.addEventListener('click',async()=>{
 if(!await act('exit_yard'))return;
 buildDirty=false;
 syncBuildFromState(true,{force:true});
 await navigate('build');
});
$('#yard-challenge-shelf')?.addEventListener('click',()=>startYardChallenge('bookshelf-rescue'));
$('#yard-challenge')?.addEventListener('click',()=>startYardChallenge('drawer-block'));
$('#yard-challenge-gap')?.addEventListener('click',()=>startYardChallenge('desk-gap-rescue'));
$('#yard-submit-challenge')?.addEventListener('click',()=>submitYardChallenge());

function syncYardDriveInput(){
 if(view!=='yard'||!yardScene)return;
 yardScene.setInput(yardKeys.forward,yardKeys.turn);
 if(yardKeys.joint)yardScene.setJointDelta(yardKeys.joint*0.04);
 if(yardKeys.extend)yardScene.setExtendDelta?.(yardKeys.extend*0.008);
 if(yardKeys.grasp){yardScene.setGraspDelta?.(yardKeys.grasp);yardKeys.grasp=0}
 yardScene.setExtrasInput?.({fire:yardKeys.fire,thrust:yardKeys.thrust,winch:yardKeys.winch});
 if(yardKeys.fire)yardKeys.fire=0;
 if(yardKeys.winch)yardKeys.winch=0;
 syncYardCombatHud();
}
function syncYardCombatHud(){
 const el=$('#cockpit-hud');
 if(!el||!yardScene?.hudState)return;
 const h=yardScene.hudState();
 const bits=[`HP ${h.hp}/${h.maxHp}`];
 if(h.hasWeapon)bits.push(`弹药 ${h.ammo}` ,`热量 ${Math.round(h.heat)}`);
 if(h.hasThrust)bits.push(`燃料 ${h.fuel?.toFixed?.(2)??h.fuel}`);
 if(h.hasWinch)bits.push(h.winch?'绞盘中':'绞盘就绪');
 el.textContent=bits.join(' · ');
}

document.addEventListener('keydown',e=>{
 if(modal.open||['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)||e.altKey||e.ctrlKey||e.metaKey)return;
 if(view==='yard'){
  if(e.code==='KeyR'){
   e.preventDefault();
   if(!e.repeat){const r=yardScene?.tryInteract();if(r?.reason)toast(r.reason)}
   return;
  }
  const driveMap={
   KeyW:['forward',1],ArrowUp:['forward',1],
   KeyS:['forward',-1],ArrowDown:['forward',-1],
   KeyA:['turn',1],ArrowLeft:['turn',1],
   KeyD:['turn',-1],ArrowRight:['turn',-1],
   KeyQ:['joint',1],KeyE:['joint',-1],
   KeyZ:['extend',1],KeyC:['extend',-1],
   KeyF:['grasp',-1],
   KeyT:['fire',1],
   KeyG:['winch',1],
  };
  const bind=driveMap[e.code];
  if(bind){e.preventDefault();yardKeys[bind[0]]=bind[1];syncYardDriveInput();return}
  if(e.code==='Space'){
   e.preventDefault();
   if(yardScene?.hudState?.()?.hasThrust){yardKeys.thrust=1;syncYardDriveInput();return}
   const r=yardScene?.tryInteract();if(r?.reason)toast(r.reason);return;
  }
  if(e.code==='KeyX'){e.preventDefault();yardScene?.reset();act('yard_reset',{},true);toast('已回到起点');return}
  return;
 }
 if(view!=='play'||navigating)return;
 const directions={ArrowUp:[0,-1],ArrowDown:[0,1],ArrowLeft:[-1,0],ArrowRight:[1,0]};
 if(directions[e.key]){e.preventDefault();routeVersion++;scene?.setRoute([]);if(!busy&&state.active){const d=directions[e.key];act('move',{position:state.active.position.map((v,i)=>v+d[i])},true)}}
 else if(['1','2','3'].includes(e.key)){e.preventDefault();$('#'+({'1':'scan','2':'pick','3':'deliver'}[e.key])).click()}
});
document.addEventListener('keyup',e=>{
 if(view!=='yard')return;
 if(e.code==='Space'){yardKeys.thrust=0;syncYardDriveInput();return}
 const driveMap={
  KeyW:['forward',1],ArrowUp:['forward',1],
  KeyS:['forward',-1],ArrowDown:['forward',-1],
  KeyA:['turn',1],ArrowLeft:['turn',1],
  KeyD:['turn',-1],ArrowRight:['turn',-1],
  KeyQ:['joint',1],KeyE:['joint',-1],
  KeyZ:['extend',1],KeyC:['extend',-1],
 };
 const bind=driveMap[e.code];
 if(!bind)return;
 if(yardKeys[bind[0]]===bind[1])yardKeys[bind[0]]=0;
 syncYardDriveInput();
});

function blockedSet(){return new Set([...state.world.blocked,...(state.equipped.includes('tracks')?[]:state.world.low)].map(p=>p.join(',')))}
async function walk(target){
 if(view!=='play'||!state.active||navigating)return;
 const path=findPath(state.active.position,target,blockedSet(),state.world.size);
 if(!path){toast('这里被挡住了，换个位置试试。');return}
 const version=++routeVersion;
 scene?.setRoute(path);
 const result=await followPath({
  path,
  version,
  getVersion:()=>routeVersion,
  move:async(pos,i)=>{
   await actionSettled;
   // Skip act when superseded; return true so followPath's version check marks cancelled (not move_failed).
   if(version!==routeVersion||view!=='play'||!state.active)return true;
   const from=state.active.position;
   const data=await act('move',{position:pos},true);
   if(localStorage.DEBUG_WALK==='1')console.debug({step:i,from,to:pos,reason:data? 'ok': 'move_failed'});
   if(!data)return false;
   scene?.setRoute(path.slice(i+1));
   return true;
  },
 });
 if(version===routeVersion)scene?.setRoute([]);
 if(result?.reason==='move_failed')toast('这一步没能走出去…');
}
async function load(){try{const response=await fetch('/api/game');const data=await response.json();if(!data.ok)throw Error('存档加载失败');state=data.state;window.__gamePartDefs=state.part_defs||[];try{const {WorkshopScene}=await import('/game-assets/scene.js');scene=new WorkshopScene($('#world'),walk)}catch(error){console.error(error);const el=document.createElement('div');el.className='webgl-error';el.textContent='三维场景未能启动。请使用支持 WebGL 的浏览器并启用硬件加速；改装、图鉴和伙伴档案仍可使用。';$('#world').append(el)}$('#loading').hidden=true;navigate(location.hash.slice(1)||'home',true)}catch(error){$('#loading p').textContent='无法读取本地工坊，请确认 Studio 服务已启动。';$('#retry').hidden=false;$('#retry').onclick=()=>location.reload();console.error(error)}}
load();
