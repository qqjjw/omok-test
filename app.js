const DEFAULT_SERVER = 'https://omok-test.onrender.com';
const size = 15;
const boardElement = document.querySelector('#board');
const status = document.querySelector('#status');
const notice = document.querySelector('#notice');
const serverInput = document.querySelector('#server-url');
const shareButton = document.querySelector('#share');
let socket, reconnectTimer, attempt = 0, generation = 0;
let mode = 'black', revision = 0, board = Array(size * size).fill(null), connected = false;
let serverBase = '';
const points = [];
const ns = 'http://www.w3.org/2000/svg';
const svg = document.createElementNS(ns, 'svg');
svg.setAttribute('viewBox', '0 0 150 150'); svg.setAttribute('aria-hidden', 'true');
for (let i = 0; i < size; i++) {
  for (const vertical of [true, false]) {
    const line = document.createElementNS(ns, 'line');
    const v = 5 + 10 * i;
    for (const [key, value] of Object.entries(vertical ? {x1:v,y1:5,x2:v,y2:145} : {x1:5,y1:v,x2:145,y2:v})) line.setAttribute(key, value);
    line.setAttribute('stroke', '#79603c'); line.setAttribute('stroke-width', '.35'); svg.append(line);
  }
}
for (const [x,y] of [[3,3],[11,3],[7,7],[3,11],[11,11]]) {
  const star = document.createElementNS(ns, 'circle');
  star.setAttribute('cx', 5+x*10);star.setAttribute('cy',5+y*10);star.setAttribute('r',1);star.setAttribute('fill','#79603c');svg.append(star);
}
boardElement.append(svg);
for (let i = 0; i < size * size; i++) {
  const point = document.createElement('button'); point.className = 'point';point.disabled = true;
  point.addEventListener('click', () => {
    if (!connected || socket?.readyState !== WebSocket.OPEN) return;
    if (mode !== 'remove' && board[i]) { notice.textContent='이미 돌이 있습니다. 삭제 모드로 지울 수 있어요.';return; }
    if (mode === 'remove' && !board[i]) {notice.textContent='삭제할 돌을 선택해 주세요.';return;}
    socket.send(JSON.stringify({type:mode === 'remove' ? 'remove' : 'place',x:i%size,y:Math.floor(i/size),color:mode,revision}));
  });
  points.push(point);boardElement.append(point);
}
function render() {
  for (let i=0;i<points.length;i++) {
    points[i].dataset.color=board[i] || '';
    points[i].disabled=!connected;
    points[i].setAttribute('aria-label',`${Math.floor(i/size)+1}행 ${i%size+1}열, ${board[i]==='black'?'흑돌':board[i]==='white'?'백돌':'빈 자리'}`);
  }
  status.dataset.connected=String(connected);
}
function normalizeAddress(value) {
  const url = new URL(value.trim());
  if (!['http:','https:','ws:','wss:'].includes(url.protocol) || url.username || url.password) throw new Error('주소를 확인해 주세요.');
  if (url.protocol==='ws:') url.protocol='http:';
  if (url.protocol==='wss:') url.protocol='https:';
  if (location.protocol==='https:' && url.protocol!=='https:') throw new Error('HTTPS 또는 WSS 주소를 사용해 주세요.');
  return url.origin;
}
function connect(base, id) {
  if (id!==generation) return;
  connected=false;render();status.textContent=attempt?'다시 연결 중…':'서버 연결 중…';
  notice.textContent='무료 서버가 잠들어 있으면 첫 연결에 약 1분이 걸릴 수 있습니다.';
  const ws=new WebSocket(base.replace(/^http/,'ws')+'/ws'); socket=ws;
  ws.addEventListener('open',()=>{if(id!==generation)return;attempt=0;status.textContent='판 동기화 중…';});
  ws.addEventListener('message',event=>{
    if(id!==generation)return;
    let msg;try{msg=JSON.parse(event.data);}catch{return;}
    if(msg.type==='state' && msg.size===size && Array.isArray(msg.board) && msg.board.length===size*size){
      board=msg.board;revision=msg.revision;connected=true;render();status.textContent='연결됨';
      document.querySelector('#players').textContent=`${msg.players} / 2명`;
      if(!notice.dataset.error)notice.textContent=msg.players===2?'두 명이 함께 보고 있습니다. 자유롭게 돌을 놓아보세요.':'연결되었습니다. 초대 링크를 친구에게 보내세요.';
    }else if(msg.type==='error' || msg.type==='full'){
      notice.textContent=msg.message;notice.dataset.error='true';
    }
  });
  ws.addEventListener('close',event=>{
    if(id!==generation)return;
    connected=false;render();document.querySelector('#players').textContent='— / 2명';
    if(event.code===4003 || event.code===4008){status.textContent='접속 제한';return;}
    status.textContent='연결 끊김 · 재시도 중';delete notice.dataset.error;
    reconnectTimer=setTimeout(()=>connect(base,id),Math.min(1000*2**attempt++,15000));
  });
  ws.addEventListener('error',()=>{});
}
function start(value) {
  try {serverBase=normalizeAddress(value);} catch(error){notice.textContent=error.message;return;}
  generation++;clearTimeout(reconnectTimer);socket?.close();attempt=0;delete notice.dataset.error;
  serverInput.value=serverBase;shareButton.disabled=false;
  try{localStorage.setItem('omok-server',serverBase);}catch{}
  const url=new URL(location.href);url.searchParams.set('server',serverBase);history.replaceState(null,'',url);
  connect(serverBase,generation);
}
document.querySelector('#connect-form').addEventListener('submit',event=>{event.preventDefault();start(serverInput.value);});
document.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>{
  mode=button.dataset.mode;delete notice.dataset.error;
  document.querySelectorAll('[data-mode]').forEach(other=>other.setAttribute('aria-pressed',String(other===button)));
  document.querySelector('#mode-label').textContent=mode==='remove'?'돌 삭제':mode==='black'?'흑돌 놓기':'백돌 놓기';
  notice.textContent=mode==='remove'?'지울 돌을 선택해 주세요.':mode==='black'?'빈 자리에 흑돌을 놓습니다.':'빈 자리에 백돌을 놓습니다.';
}));
shareButton.addEventListener('click',async()=>{
  const url=new URL(location.href);url.searchParams.set('server',serverBase);
  try{await navigator.clipboard.writeText(url.href);notice.textContent='초대 링크를 복사했습니다.';}catch{window.prompt('이 링크를 복사해 친구에게 보내세요.',url.href);}
});
render();
const configured=new URL(location.href).searchParams.get('server');
if(configured)start(configured);
else if(location.hostname.endsWith('.onrender.com') || ['localhost','127.0.0.1'].includes(location.hostname))start(location.origin);
else start(DEFAULT_SERVER);
