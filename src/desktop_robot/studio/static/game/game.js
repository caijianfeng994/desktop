import {findPath, followPath} from './pathfinding.mjs';
import {planStarterLoadout} from './loadout.mjs';

const paths={robot:'M7 7V4h10v3M5 8h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Zm3 5v2m8-2v2M9 18h6M1 12v4m22-4v4',home:'m3 10 9-7 9 7M5 9v11h5v-6h4v6h5V9',tool:'m14 5 5-2-1 5-5 5-3-3 4-5ZM10 10l-7 7a2 2 0 0 0 3 3l7-7',board:'M9 4h6v4H9zM7 6H5v15h14V6h-2M8 12h8m-8 4h5',book:'M12 5C8 2 3 3 2 4v15c4-2 7-1 10 1 3-2 6-3 10-1V4c-4-2-7-1-10 1Zm0 0v15',coin:'m8 3 8 0 5 7-3 10H6L3 10 8 3Zm2 5h4l2 4-2 4h-4l-2-4 2-4Z',battery:'M3 6h16v12H3zM21 10v4m-10-6-3 5h5l-2 3',help:'M9 9a3 3 0 1 1 4 3c-1 0-1 1-1 2m0 3v.1M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',arrow:'M4 12h15m-6-6 6 6-6 6',pin:'m9 3 8 4-3 4v4l-8-4 3-2V3Zm0 10-4 8',parts:'m12 2 9 5v10l-9 5-9-5V7l9-5Zm0 10L3 7m9 5 9-5m-9 5v10M7 5l9 5',scan:'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0Zm-3 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z',arm:'M4 21h12M7 20v-6l5-4-4-5 3-3 6 7v4l-5 4v3M17 10l4 1v5m-1-5 2-3',wheels:'M5 7h14v9H5zM2 9v6m20-6v6M7 17v3m10-3v3M8 10h8',tracks:'M6 7h12a5 5 0 0 1 0 10H6A5 5 0 0 1 6 7Zm1 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm10 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z',face:'M3 4h18v15H3zM7 9v2m10-2v2M8 14q4 4 8 0M9 22h6',rotate:'M20 7v5h-5M4 17v-5h5M5 7a8 8 0 0 1 14-1l1 6M4 12l1 6a8 8 0 0 0 14-1',play:'m8 3 13 9-13 9V3Z',info:'M12 11v6m0-10v.1M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',move:'M12 2v20M2 12h20M8 6l4-4 4 4M8 18l4 4 4-4M6 8l-4 4 4 4m12-8 4 4-4 4',edit:'m4 15 12-12 5 5L9 20l-6 1 1-6Zm10-10 5 5',chat:'M4 3h16v14H9l-5 4V3Zm4 5h8m-8 4h5',blueprint:'M3 3h18v18H3zM7 3v3m4-3v2m4-2v3m4-3v2M7 11l4-3 6 4v6H7v-7Zm4-3v7h6',check:'m5 12 4 4L19 6',circle:'M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',star:'m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1 3-6Z',lock:'M6 10h12v11H6zM8 10V6a4 4 0 0 1 8 0v4m-4 5v2'};
const icon=name=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.parts}"/></svg>`;
function icons(root=document){root.querySelectorAll('[data-icon]').forEach(el=>{el.innerHTML=icon(el.dataset.icon)})}icons();
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let actionSettled=Promise.resolve(),finishAction=()=>{},navigationVersion=0,navigating=false;
let state=null,view='home',scene=null,busy=false,filter='全部',routeVersion=0,toastTimer;const modal=$('#modal');
function toast(text){if(!text)return;$('#toast').textContent=text;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),4200)}
function showModal(content){$('#modal-content').innerHTML=content;if(!modal.open)modal.showModal();icons(modal)}
$('.modal-close').onclick=()=>modal.close();modal.addEventListener('click',e=>{if(e.target===modal){const r=modal.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)modal.close()}});
async function navigate(next,replace=false){
 if(!state)return;
 if(!['home','assembly','missions','play','companion','collection'].includes(next))next='home';
 const request=++navigationVersion;navigating=true;routeVersion++;scene?.setRoute([]);
 await actionSettled;
 if(request!==navigationVersion)return;
 if(next==='play'&&!state.active)next='missions';
 const transition=state.active?(next==='play'?(state.active.paused?'resume':null):(!state.active.paused?'pause':null)):null;
 if(transition&&!await act(transition,{},true)){
  if(request===navigationVersion){navigating=false;history.replaceState({},'',`#${view}`)}
  return;
 }
 if(request!==navigationVersion)return;
 navigating=false;view=next;document.body.dataset.view=next;
 $$('.screen').forEach(s=>s.hidden=s.id!==next);
 $$('.bottom-nav button').forEach(b=>{const selected=b.dataset.view===(next==='play'?'missions':next);b.classList.toggle('active',selected);b.setAttribute('aria-current',selected?'page':'false')});
 const hash=`#${next}`;if(location.hash!==hash)history[replace?'replaceState':'pushState']({},'',hash);
 scene?.update(state,view);window.scrollTo(0,0);render();
}
window.addEventListener('popstate',()=>navigate(location.hash.slice(1)||'home',true));
document.addEventListener('click',e=>{const nav=e.target.closest('[data-view]');if(nav)navigate(nav.dataset.view)});
async function act(action,extra={},quiet=false){if(busy||!state)return false;busy=true;actionSettled=new Promise(resolve=>{finishAction=resolve});document.body.classList.add('busy');$('#save-status').innerHTML=`${icon('rotate')} 正在保存…`;try{const response=await fetch('/api/game/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,revision:state.revision,...extra})});const data=await response.json();if(data.state)state=data.state;render();scene?.update(state,view);if(!data.ok){toast(data.reason||'操作未完成');return false}if(action==='move')await scene?.armMotion();if(!quiet)toast(data.message);return data}catch(error){toast('暂时无法连接工坊，未确认保存。请重试。');return false}finally{busy=false;finishAction();document.body.classList.remove('busy');$('#save-status').innerHTML='<span class="live-dot"></span> 本地工坊 · 自动保存'}}
function hasPart(id){return id==='arm'?state.equipped.some(p=>p==='arm'||p==='arm_left'):state.equipped.includes(id)}
function requirementName(id){return id==='arm'?'机械臂（左 / 右任选）':state.parts.find(p=>p.id===id).name}
function render(){if(!state)return;$('#coins').textContent=state.coins;$('#energy').textContent=state.energy+'%';$('#robot-label').textContent=state.name;$('#speech-name').textContent=state.name;$('#companion-name').textContent=state.name;$('.model-badge').textContent=state.name+' / MODULAR COMPANION';$('#charge').disabled=!!state.active&&!state.active.paused;$('#charge').title=state.active&&!state.active.paused?'返回工坊暂停任务后可充电':'点击补满电量';const next=state.missions.find(m=>!state.completed.includes(m.id))||state.missions[2];$('#home-task').textContent=state.completed.length===3?'工坊亮起来了':next.title;$('#home-desc').textContent=state.completed.length===3?'三个委托都完成了！试试新的装配，也可以重温这段小小冒险。':next.description;$('#home-reward').textContent=state.completed.length===3?'3 / 3':'+'+next.reward;$('#home-progress').textContent=`0${state.completed.length} / 03`;$$('.chapter-dots i').forEach((el,i)=>el.classList.toggle('done',i<state.completed.length));$('#task-dot').hidden=state.completed.length===3;
 renderParts();$('#power-label').textContent=`${state.power} / ${state.capacity} W`;$('#power-meter').style.width=`${state.power/state.capacity*100}%`;$('#power-meter').parentElement.classList.toggle('warning',state.power/state.capacity>.8);$('#port-label').textContent=`${state.ports} / 4`;$('#port-dots').innerHTML=Array.from({length:4},(_,i)=>`<i class="${i<state.ports?'used':''}"></i>`).join('');$('#abilities').innerHTML=state.equipped.map(id=>{const p=state.parts.find(p=>p.id===id);return `<div class="ability"><i>${icon(p.icon)}</i><span>${p.id.startsWith('arm')?p.name+' · ':''}${p.ability}</span></div>`}).join('')||'<p class="tip">从零件库装上第一个零件吧。</p>';$('#assembly-tip').textContent=state.active?(state.active.paused?'任务已暂停，进度已保留。现在可以自由改装和充电，准备好后从委托板继续。':'正在返回工坊，稍后即可改装。'):!state.equipped.includes('camera')?'小提示：装上摄像头，才能发现桌面的秘密。':!hasPart('arm')?'机械臂可以搬运核心。供电不足时，先卸下屏幕。':'扫描与搬运准备好了，去接一份委托吧。';
 $('#mission-board').innerHTML=state.missions.map((m,i)=>{const done=state.completed.includes(m.id),locked=state.missions.slice(0,i).some(p=>!state.completed.includes(p.id)),active=state.active?.mission===m.id;const ready=m.requires.every(hasPart)&&state.equipped.some(p=>p==='wheels'||p==='tracks');return `<article class="mission-card paper"><div class="mission-art"><span class="mission-number">COMMISSION / 0${i+1}</span>${icon(['scan','book','star'][i])}<span class="mission-badge">${active?(state.active.paused?'已暂停':'探索中'):done?'已完成':locked?'尚未解锁':'可接取'}</span></div><div class="mission-content"><h2>${m.title}</h2><p>${m.description}</p><div class="requirements">${m.requires.map(id=>`<span class="${hasPart(id)?'ready':''}">${hasPart(id)?'✓ ':''}${requirementName(id)}</span>`).join('')}</div><div class="reward-line">${icon('coin')}<b>${done?'奖励已领取':'+'+m.reward}</b><span>${done?'可重复练习':'零件币 · +'+m.xp+' 默契'}</span></div><button class="${locked?'dark':'primary'} full" data-mission="${m.id}" ${locked||state.active&&!active?'disabled':''}>${active?'继续探索':locked?'完成前一委托解锁':!ready?'先去改装':done?'再次挑战':'接受委托'} ${icon(active?'arrow':locked?'lock':'play')}</button></div></article>`}).join('');
 $('#level').textContent=`默契 Lv.${state.level}`;$('#xp-label').textContent=`${state.xp%40} / 40 · 下一等级`;$('#xp-meter').style.width=`${state.xp%40/40*100}%`;$('#growth').innerHTML=[['scan','探索',state.completed.length],['arm','搬运',state.completed.length],['face','表达',state.completed.includes('little-stage')?3:0]].map(([ic,label,n])=>`<div class="growth-row"><i>${icon(ic)}</i><span>${label}</span><div class="meter"><span style="width:${n/3*100}%"></span></div><small>${n}/3</small></div>`).join('');$('#memory-count').textContent=`${state.memories.length} / 3`;$('#memories').innerHTML=state.memories.length?state.memories.map(m=>`<div class="memory"><i>${icon('star')}</i><div><strong>${esc(m.title)}</strong><p>${esc(m.quote)}</p></div></div>`).join(''):'<div class="empty-memory">这里还没有回忆。<br>一起完成第一个委托，就会留下第一束光。</div>';$('#memory-quote').textContent=state.memories.at(-1)?.quote||'我的第一个愿望？和你一起，去看看桌子另一边。';$$('[data-accent]').forEach(b=>{b.classList.toggle('selected',state.accent===b.dataset.accent);b.setAttribute('aria-pressed',state.accent===b.dataset.accent)});
 if(state.active){const a=state.active,m=state.missions.find(m=>m.id===a.mission);$('#play-title').textContent=m.title;$('#objectives').innerHTML=[[a.scanned,'靠近光点，扫描核心'],[a.carrying,'用机械臂拾取核心'],[false,'回到充电站，交付核心']].map(([done,t])=>`<div class="objective ${done?'done':''}">${icon(done?'check':'circle')}${t}</div>`).join('');$('#play-hint').textContent=a.carrying?'青色圆环是充电站。回到那里，按 3 交付。':a.scanned?'再靠近一些，按 2 夹起这枚核心。':'琥珀色光点就是目标。靠近后按 1 扫描。';$('#move-count').textContent=a.moves;$('#scan').disabled=a.scanned;$('#pick').disabled=!a.scanned||a.carrying;$('#deliver').disabled=!a.carrying;}
}
function partCard(p,collection=false){const owned=state.owned.includes(p.id),equipped=state.equipped.includes(p.id);return `<button class="part-card ${equipped?'equipped':''}" data-part="${p.id}" draggable="${owned&&!collection}" title="${esc(p.description)}" aria-pressed="${equipped}"><span class="part-check">${equipped?'已安装':owned?'已拥有':icon('lock')}</span><span class="part-symbol">${icon(p.icon)}</span><strong>${p.name}</strong><small>${owned?p.power+' W · '+p.ability:p.price+' 零件币 · 解锁'}</small></button>`}
function renderParts(){$('#owned-count').textContent=`${state.owned.length} / ${state.parts.length}`;$('#parts-grid').innerHTML=state.parts.filter(p=>filter==='全部'||p.category===filter).map(p=>partCard(p)).join('');$('#collection-grid').innerHTML=state.parts.map(p=>partCard(p,true)).join('');$('#collection-count').textContent=`已收集 ${state.owned.length} / ${state.parts.length}`}
$('#part-filters').onclick=e=>{const b=e.target.closest('[data-filter]');if(!b)return;filter=b.dataset.filter;$$('[data-filter]').forEach(el=>el.classList.toggle('active',el===b));renderParts()};
document.addEventListener('click',async e=>{const p=e.target.closest('[data-part]');if(p){const id=p.dataset.part,part=state.parts.find(p=>p.id===id);if(!state.owned.includes(id)){showModal(`<span class="eyebrow">NEW POSSIBILITIES</span><h2>解锁${part.name}</h2><p>${part.description}</p><p>需要 <strong>${part.price} 零件币</strong>，当前拥有 ${state.coins}。</p><button id="confirm-buy" class="primary full" ${state.coins<part.price?'disabled':''}>${state.coins<part.price?'零件币不足':'解锁零件'}</button>`);$('#confirm-buy').onclick=async()=>{if(await act('buy',{part:id}))modal.close()};return}if(view==='collection'){navigate('assembly');return}await act('equip',{part:id});return}
 const missionButton=e.target.closest('[data-mission]');if(missionButton){const m=state.missions.find(m=>m.id===missionButton.dataset.mission);if(state.active){navigate('play');return}if(!m.requires.every(hasPart)||!state.equipped.some(p=>p==='wheels'||p==='tracks')){navigate('assembly');toast('为这次任务装上所需零件，再回来出发。');return}if(await act('start',{mission:m.id}))navigate('play')}
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
document.addEventListener('keydown',e=>{if(view!=='play'||navigating||modal.open||['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)||e.altKey||e.ctrlKey||e.metaKey)return;const directions={ArrowUp:[0,-1],ArrowDown:[0,1],ArrowLeft:[-1,0],ArrowRight:[1,0]};if(directions[e.key]){e.preventDefault();routeVersion++;scene?.setRoute([]);if(!busy&&state.active){const d=directions[e.key];act('move',{position:state.active.position.map((v,i)=>v+d[i])},true)}}else if(['1','2','3'].includes(e.key)){e.preventDefault();$('#'+({'1':'scan','2':'pick','3':'deliver'}[e.key])).click()}});
async function load(){try{const response=await fetch('/api/game');const data=await response.json();if(!data.ok)throw Error('存档加载失败');state=data.state;try{const {WorkshopScene}=await import('/game-assets/scene.js');scene=new WorkshopScene($('#world'),walk)}catch(error){console.error(error);const el=document.createElement('div');el.className='webgl-error';el.textContent='三维场景未能启动。请使用支持 WebGL 的浏览器并启用硬件加速；改装、图鉴和伙伴档案仍可使用。';$('#world').append(el)}$('#loading').hidden=true;navigate(location.hash.slice(1)||'home',true)}catch(error){$('#loading p').textContent='无法读取本地工坊，请确认 Studio 服务已启动。';$('#retry').hidden=false;$('#retry').onclick=()=>location.reload();console.error(error)}}
load();
