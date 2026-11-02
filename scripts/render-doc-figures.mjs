// Core documentation SVG layouts. Mermaid sources live in docs/diagrams/sources/.
// Update source and layout together when architecture changes.
// Usage: node scripts/render-doc-figures.mjs [--check]
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const require = createRequire(import.meta.url);
process.chdir(resolve(dirname(fileURLToPath(import.meta.url)), '..'));

function makeHeroFigures(){
 const fs=require('node:fs');
 const out='docs/diagrams';const checking=process.argv.includes('--check');if(!checking)fs.mkdirSync(out,{recursive:true});
 function draw(type,zh,dark){
  const h={routing:1060,runtime:970,tasks:790,kernel:960}[type],w=1200;
  const p=dark?{bg:'#0b1220',surface:'#111d30',stroke:'#30425c',text:'#edf4ff',muted:'#b6c6da',line:'#8299b6',blue:'#83b0ff',blueFill:'#142c4b',purple:'#baa4ff',purpleFill:'#2b2247',green:'#79d9b2',greenFill:'#12382e'}:{bg:'#f8fafc',surface:'#ffffff',stroke:'#dbe4ef',text:'#15243a',muted:'#52657e',line:'#7488a2',blue:'#2563eb',blueFill:'#eff6ff',purple:'#7c3aed',purpleFill:'#f4f0ff',green:'#15815d',greenFill:'#edfbf4'};
  const labels={
   routing:zh?['chat / plugin / work 三级路由','Ackem 理解请求，选择内容回应、扩展调用或真实任务执行。']:['chat / plugin / work routing','Ackem selects how to handle a request; work delegates execution to AckemCode.'],
   runtime:zh?['三个执行入口，一个共享内核','桌面托管、独立工作与渠道桥接，各自保留生命周期。']:['Three entry paths, one shared kernel','Managed work, independent sessions and channel dispatch retain distinct lifecycles.'],
   tasks:zh?['从目标到结果的任务闭环','执行、验收与交付分别记录，返工始终围绕当前目标。']:['From a goal to an accepted result','Execution, acceptance and delivery are recorded separately.'],
   kernel:zh?['AckemCode 通用智能体内核','同一套会话、循环与工具，承接不同任务入口。']:['AckemCode general-purpose agent kernel','Shared sessions, agent loops and tools support multiple entry paths.']
  }[type];
  const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  const text=(x,y,t,size=20,color=p.text,weight=400,anchor='start')=>`<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="${anchor}">${esc(t)}</text>`;
  const choose=(en,cn)=>zh?cn:en;
  const pieces=[`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="title desc"><title id="title">${esc(labels[0])}</title><desc id="desc">${esc(labels[1])}</desc><defs><marker id="arrow" viewBox="0 0 10 10" refX="8.6" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${p.line}"/></marker></defs><g font-family="Segoe UI, Microsoft YaHei, PingFang SC, sans-serif"><rect x="1" y="1" width="${w-2}" height="${h-2}" rx="28" fill="${p.bg}" stroke="${p.stroke}"/>`];
  pieces.push(text(48,38,'ACKEM  /  ARCHITECTURE',13,p.muted,600));
  pieces.push(text(48,85,labels[0],32,p.text,650));
  pieces.push(text(48,119,labels[1],18,p.muted));
  const line=(d,dotted=false)=>pieces.push(`<path d="${d}" fill="none" stroke="${p.line}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" marker-end="url(#arrow)"${dotted?' stroke-dasharray="6 6"':''}/>`);
  const tag=(x,y,label)=>{const width=Math.max(58,[...label].reduce((a,c)=>a+(/[^\x00-\xff]/.test(c)?17:8.5),0)+24);pieces.push(`<rect x="${x-width/2}" y="${y-17}" width="${width}" height="27" rx="13.5" fill="${p.bg}"/>`);pieces.push(text(x,y+2,label,16,p.muted,500,'middle'))};
  const card=(x,y,width,height,title,sub=[],kind='neutral',eyebrow='')=>{
   const color=kind==='primary'?p.blue:kind==='accent'?p.purple:kind==='success'?p.green:p.stroke;
   const fill=kind==='primary'?p.blueFill:kind==='accent'?p.purpleFill:kind==='success'?p.greenFill:p.surface;
   pieces.push(`<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="17" fill="${fill}" stroke="${color}" stroke-width="${kind==='neutral'?1.2:1.5}"/>`);
   if(eyebrow){pieces.push(text(x+24,y+27,eyebrow,13,kind==='neutral'?p.muted:color,650));pieces.push(text(x+24,y+61,title,25,p.text,650));sub.forEach((t,i)=>pieces.push(text(x+24,y+95+i*27,t,18,p.muted)))}
   else if(height<=72){pieces.push(text(x+width/2,y+(sub.length?29:height/2+7),title,sub.length?21:22,p.text,600,'middle'));sub.forEach((t,i)=>pieces.push(text(x+width/2,y+54+i*23,t,17,p.muted,400,'middle')))}
   else{pieces.push(text(x+24,y+37,title,23,p.text,600));sub.forEach((t,i)=>pieces.push(text(x+24,y+68+i*26,t,18,p.muted)))}
  };
  if(type==='routing'){
   line('M600 202 V246');
   line('M600 334 V360 H218 V400');line('M600 334 V400');line('M600 334 V360 H982 V400');
   for(const x of [218,600,982]){line(`M${x} 608 V688`);line(`M${x} 802 V890`)}
   card(440,150,320,52,choose('Your request','用户请求'));
   card(48,246,1104,88,choose('Ackem semantic routing','Ackem 语义路由'),[choose('Current intent + recent conversation + enabled capabilities','本轮意图 ＋ 最近对话 ＋ 已启用能力')],'primary');
   tag(218,380,choose('Respond','直接回应'));tag(600,380,choose('Use a capability','现有能力'));tag(982,380,choose('Act on resources','真实资源'));
   card(48,400,340,208,'chat',[
    choose('Conversation and content','对话 · 解释 · 内容回应'),
    choose('Example: suggest a plan','例：给我一份整理方案'),
    choose('May use ordinary chat tools','可使用普通聊天工具')
   ],'primary',choose('CHAT  /  CONVERSATION','CHAT  /  对话'));
   card(430,400,340,208,'plugin',[
    choose('Use an enabled extension','调用已启用扩展'),
    choose('Validate target, then invoke','先核验目标，再实际调用'),
    choose('Example: run an existing plugin','例：使用现有插件处理内容')
   ],'primary',choose('PLUGIN  /  CAPABILITY','PLUGIN  /  能力调用'));
   card(812,400,340,208,'work',[
    choose('Inspect · change · deliver','调查 · 修改 · 产物交付'),
    choose('Read-only checks are work','只读检查也属于工作'),
    choose('Create or update plugins','创建／修改插件也走这里')
   ],'primary',choose('WORK  /  EXECUTION','WORK  /  任务执行'));
   card(48,688,340,114,choose('Conversation reply','内容回应'),[choose('Text · explanations · plans','正文 · 解释 · 方案')],'primary');
   card(430,688,340,114,choose('Extension runtime','扩展运行时'),[choose('Call the available capability','调用可用能力，取得回执')],'primary');
   card(812,688,340,114,'AckemCode',[
    choose('General-purpose agent kernel','通用智能体执行内核'),
    choose('Files · commands · web · docs','文件 · 命令 · 网络 · 文档')
   ],'accent');
   tag(218,854,choose('Content','正文结果'));tag(600,854,choose('Extension receipt','扩展回执'));tag(982,854,choose('Receipts + review','回执 · 产物 · 验收'));
   card(48,890,1104,82,choose('Ackem checks and delivers the result','Ackem 核对结果并交付'),[
    choose('Claims in the reply must match actual results and execution state.','回复中的结论应与真实结果、执行状态一致。')
   ],'success');
   pieces.push(text(600,1009,choose('Three handling modes, not sequential steps. Routing does not establish completion.','三种处理方式，不是串行步骤；路由选择 ≠ 执行完成。'),16,p.muted,500,'middle'));
   pieces.push(text(600,1040,choose('Desktop chat view. Independent work and channel bridges have separate entry paths.','桌面主聊天视角；独立工作与 QQ／微信桥接另有入口。'),14,p.muted,400,'middle'));
  }
  if(type==='runtime'){
   pieces.push(`<rect x="28" y="253" width="1144" height="305" rx="22" fill="none" stroke="${p.stroke}" stroke-dasharray="6 6"/>`);
   for(const x of [218,600,982])line(`M${x} 225 V310`);
   line('M218 410 V460');line('M600 410 V460');line('M982 410 V460');
   for(const x of [218,600,982])line(`M${x} 550 V620`);
   line('M600 708 V758');
   pieces.push(`<rect x="40" y="264" width="345" height="27" rx="8" fill="${p.bg}"/>`);
   pieces.push(text(48,282,choose('ACKEM HOST  /  ELECTRON MAIN PROCESS','ACKEM 宿主层  /  ELECTRON 主进程'),13,p.muted,650));
   card(48,165,340,60,choose('Desktop chat','桌面主聊天'));
   card(430,165,340,60,choose('Independent work','独立工作'));
   card(812,165,340,60,choose('QQ / WeChat','QQ / 微信'));
   card(48,310,340,100,choose('Ackem routing','Ackem 理解与路由'),['chat / plugin / work'],'primary');
   card(430,310,340,100,choose('Private session and queue','私有会话与输入队列'),[choose('Direct user control','由用户直接控制')],'primary');
   card(812,310,340,100,choose('Owner and remote grant','机主确认与远程开关'),[choose('Check channel authorization','核对渠道授权')],'primary');
   card(48,460,340,90,'TaskCoordinator',[choose('Contracts · supervision · acceptance','契约 · 监督 · 验收')],'primary');
   card(430,460,340,90,choose('Independent adapter','独立执行适配'),[choose('Separate from managed supervision','独立于托管监督链')],'primary');
   card(812,460,340,90,choose('Channel code adapter','渠道代码适配'),[choose('Dispatch matching code requests','命中代码请求后派工')],'primary');
   tag(218,441,'work');
   tag(600,590,'HTTP / SSE');
   card(48,620,1104,88,choose('Shared AckemCode service','共享 AckemCode 服务'),[choose('Agent loop · sessions · permissions · tools','智能体循环 · 会话 · 权限 · 工具')],'accent');
   card(48,758,1104,64,choose('Real resources  /  Files · commands · external services','真实资源  /  文件 · 命令 · 外部服务'),[],'success');
   pieces.push(text(48,853,choose('SEPARATE STORAGE BOUNDARIES','存储边界分别管理'),13,p.muted,650));
   card(48,874,532,58,choose('Ackem: memory · history · task state','Ackem：记忆 · 历史 · 任务状态'));
   card(620,874,532,58,choose('Kernel data and selected work directories','内核数据与选定工作目录'));
  }
  if(type==='tasks'){
   line('M600 206 V237 H218 V280');line('M388 330 H430');line('M770 330 H812');line('M982 380 V470');
   line('M812 520 H770');line('M430 520 H388');line('M218 570 V656');
   line('M600 470 V426 H795 V355 H812',true);
   card(48,154,1104,52,choose('User goal or goal amendment','用户目标或目标补充'));
   pieces.push(text(48,264,choose('01  RECEIVE, PERSIST AND EXECUTE','01  接收、持久化与执行'),13,p.muted,650));
   card(48,280,340,100,'TaskCoordinator',[choose('Goal and work contract','目标与工作契约')],'primary');
   card(430,280,340,100,'TaskRepository',[choose('Revisions · authority · queue','修订 · 授权 · 队列')],'primary');
   card(812,280,340,100,'AckemCode',[choose('Execute under current authority','按当前授权执行')],'accent');
   pieces.push(text(48,453,choose('02  REVIEW AND DELIVER','02  核对与交付'),13,p.muted,650));
   card(812,470,340,100,choose('Execution receipts','执行回执'),[choose('Tool results and artifacts','工具结果与产物')],'accent');
   card(430,470,340,100,choose('Supervision and acceptance','监督与验收'),[choose('Check the current goal and evidence','核对当前目标与证据')],'primary');
   card(48,470,340,100,choose('Notification outbox','通知 Outbox'),[choose('Deduplicate and publish','去重与发布')],'success');
   tag(699,425,choose('Rework if needed','需要时返工'));pieces.push(text(409,507,choose('Accept','通过'),13,p.muted,500,'middle'));
   card(48,656,1104,64,choose('Accepted result delivered to the user','验收后的结果交付给用户'),[],'success');
   pieces.push(text(600,758,choose('Execution  ·  Acceptance  ·  Delivery — distinct recorded stages','执行 · 验收 · 交付 —— 分别记录的三个阶段'),16,p.muted,400,'middle'));
  }
  if(type==='kernel'){
   line('M314 222 V253 H600 V280');line('M886 222 V253 H600 V280');line('M600 358 V382 H490 V405');
   line('M740 460 H800');line('M976 515 V550 H314 V590');line('M976 515 V550 H886 V590');
   line('M314 690 V720 H600 V750');line('M886 690 V720 H600 V750');line('M600 828 V870');
   line('M240 789 H24 V460 H240',true);
   card(48,154,532,68,choose('Ackem managed work','Ackem 托管工作'),[],'primary');
   card(620,154,532,68,choose('Independent work / CLI / Web','独立工作 / CLI / Web'));
   card(240,280,720,78,choose('Session and context','会话与上下文'),[choose('Goal · history · model','目标 · 历史 · 模型')],'accent');
   card(240,405,500,110,choose('Agent loop','智能体循环'),[choose('Plan · act · inspect','计划 · 行动 · 核对')],'accent');
   card(800,405,352,110,choose('Permissions','权限与交互'),[choose('Approval and user input','审批与用户输入')],'primary');
   card(48,590,532,100,choose('Local tools','本机工具'),[choose('Files · commands · documents','文件 · 命令 · 文档')],'primary');
   card(620,590,532,100,choose('External integrations','外部集成'),[choose('Web · MCP · LSP · skills','网页 · MCP · LSP · 技能')],'primary');
   card(240,750,720,78,choose('Events, receipts and artifacts','事件、回执与产物'),[choose('Actual execution evidence','真实执行证据')],'success');
   tag(132,788,choose('Continue','按需继续'));
   card(48,870,1104,58,choose('Host review and delivery','宿主验收与交付'),[],'success');
  }
  pieces.push('</g></svg>');return pieces.join('\n');
 }
 const map={routing:'request-routing',runtime:'runtime-architecture',tasks:'managed-task-lifecycle',kernel:'kernel-overview'};
 const failures=[];
 for(const [type,id] of Object.entries(map))for(const zh of [false,true])for(const dark of [false,true]){
  const figureId=id+'-'+(zh?'zh':'en'),sourceFile='docs/diagrams/sources/'+figureId+'.mmd';
  const body=fs.readFileSync(sourceFile,'utf8').trim();
  if(!body)throw Error('Empty Mermaid source: '+sourceFile);
  const hash=createHash('sha256').update(body).digest('hex');
  const escaped=body.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  const svg=draw(type,zh,dark).replace('<defs>','<metadata data-source="'+sourceFile+'" data-source-sha256="'+hash+'">'+escaped+'</metadata><defs>');
  const file=out+'/'+figureId+'.'+(dark?'dark':'light')+'.svg';
  if(checking){if(!fs.existsSync(file)||fs.readFileSync(file,'utf8')!==svg)failures.push(file)}else fs.writeFileSync(file,svg,'utf8');
 }
 if(failures.length)throw Error('Regenerate documentation figures: '+failures.join(', '));
 console.log(checking?'Verified 16 documentation SVG variants.':'Generated 16 documentation SVG variants.');
}
makeHeroFigures();
