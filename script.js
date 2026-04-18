'use strict';

const API       = '/api';
const TOKEN_KEY = 'itd_token';
const USER_KEY  = 'itd_user';

const EMOJIS = [
  '😀','😄','😁','😎','🤩','😍','🥳','😇',
  '🤔','🧐','🥸','😏','😌','🤗','😴','🤓',
  '👻','🤖','👽','🐼','🐨','🦊','🐯','🦁',
  '🐸','🐧','🦉','🦋','🌞','⚡','🔥','🌈',
  '🎭','🎩','🎸','🚀','💎','🍀','🌸','🍕',
  '🦄','🐲','🌊','🌙','⭐','🍭','🎯','💫',
];

const COLORS = [
  '#6C63FF','#FF6584','#43B89C',
  '#F7B731','#FC5C65','#45AAF2',
  '#A29BFE','#FD79A8','#00B894',
];

const TOOLBAR_EMOJIS = ['💡','🚀','❤️','✨','😂','🔥','💯','👀','🎉','💬'];

/* ═══════════ STATE ═══════════ */
const S = {
  token: null, user: null,
  posts: [], users: [],
  currentPage: 'feed',
  profileUserId: null,
  selEmoji: '😀', selColor: COLORS[0],
  editEmoji: '😀', editColor: COLORS[0],
  chatPartnerId: null, chatMessages: [],
  msgPollInterval: null,
};

/* ═══════════ UTILS ═══════════ */
const $  = id  => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

function esc(s) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(String(s ?? '')));
  return d.innerHTML;
}

function relTime(iso) {
  const s = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (s < 60)     return 'только что';
  if (s < 3600)   return `${Math.floor(s/60)} мин. назад`;
  if (s < 86400)  return `${Math.floor(s/3600)} ч. назад`;
  if (s < 604800) return `${Math.floor(s/86400)} дн. назад`;
  return new Date(iso).toLocaleDateString('ru-RU',{day:'numeric',month:'long'});
}

function fmt(n) {
  n = n || 0;
  return n >= 1000 ? (n/1000).toFixed(1).replace('.0','')+'k' : String(n);
}

function toast(msg, type='info', ms=3200) {
  const icons = {success:'✓',error:'✕',info:'ℹ'};
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.innerHTML = `<span>${icons[type]}</span><span>${esc(msg)}</span>`;
  $('toastBox').appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    el.addEventListener('animationend', () => el.remove(), {once:true});
  }, ms);
}

/* ═══════════ API ═══════════ */
async function api(method, path, body=null) {
  const opts = { method, headers: {'Content-Type':'application/json'} };
  if (S.token) opts.headers['Authorization'] = `Bearer ${S.token}`;
  if (body) opts.body = JSON.stringify(body);
  const res  = await fetch(API + path, opts);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message || `HTTP ${res.status}`);
  return json;
}

/* ═══════════ SESSION ═══════════ */
function saveSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  S.token = token; S.user = user;
}
function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  S.token = null; S.user = null;
}
function loadSession() {
  const t = localStorage.getItem(TOKEN_KEY);
  const u = localStorage.getItem(USER_KEY);
  if (t && u) { try { S.token=t; S.user=JSON.parse(u); return true; } catch {} }
  return false;
}

/* ═══════════ SCREENS ═══════════ */
function showAuth() { $('authScreen').classList.remove('hidden'); $('appScreen').classList.add('hidden'); }
function showApp()  { $('authScreen').classList.add('hidden');   $('appScreen').classList.remove('hidden'); }

/* ═══════════ EMOJI / COLOR BUILDERS ═══════════ */
function buildEmojiGrid(containerId, onSelect, currentEmoji) {
  const grid = $(containerId);
  grid.innerHTML = '';
  EMOJIS.forEach(em => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'emoji-btn' + (em === (currentEmoji||EMOJIS[0]) ? ' sel' : '');
    btn.textContent = em;
    btn.onclick = () => {
      grid.querySelectorAll('.emoji-btn').forEach(b => b.classList.remove('sel'));
      btn.classList.add('sel');
      onSelect(em);
    };
    grid.appendChild(btn);
  });
}

function buildColorSwatches(containerId, currentColor, onSelect) {
  const wrap = $(containerId);
  wrap.innerHTML = '';
  COLORS.forEach(c => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cs' + (c === currentColor ? ' active' : '');
    btn.style.background = c;
    btn.dataset.color = c;
    btn.onclick = () => {
      wrap.querySelectorAll('.cs').forEach(s => s.classList.remove('active'));
      btn.classList.add('active');
      onSelect(c);
    };
    wrap.appendChild(btn);
  });
}

/* ═══════════ AUTH — REGISTER ═══════════ */
buildEmojiGrid('emojiGrid', em => {
  S.selEmoji = em;
  $('prevAv').textContent = em;
  $('miniAv').textContent = em;
}, '😀');

buildColorSwatches('colorSwatches', S.selColor, c => {
  S.selColor = c;
  $('prevAv').style.background = c;
  $('miniAv').style.background = c;
});
$('prevAv').style.background = S.selColor;
$('miniAv').style.background = S.selColor;

$('step1Btn').onclick = () => {
  $('rStep1').classList.add('hidden');
  $('rStep2').classList.remove('hidden');
  $('stepNum').textContent = '2';
  $('rName').focus();
};
$('backStep').onclick = () => {
  $('rStep2').classList.add('hidden');
  $('rStep1').classList.remove('hidden');
  $('stepNum').textContent = '1';
};

$('toReg').onclick   = () => { $('loginPanel').classList.add('hidden');   $('regPanel').classList.remove('hidden'); };
$('toLogin').onclick = () => { $('regPanel').classList.add('hidden');     $('loginPanel').classList.remove('hidden'); };

/* Password strength */
$('rPass').addEventListener('input', () => {
  const v = $('rPass').value;
  let sc = 0;
  if (v.length >= 6)  sc++;
  if (v.length >= 10) sc++;
  if (/[A-Z]/.test(v)) sc++;
  if (/[0-9]/.test(v)) sc++;
  if (/[^A-Za-z0-9]/.test(v)) sc++;
  const lvls = [
    {p:'0%',c:'transparent',l:''},
    {p:'25%',c:'#FC5C65',l:'😬 Слабый'},
    {p:'50%',c:'#F7B731',l:'🤔 Средний'},
    {p:'75%',c:'#45AAF2',l:'👍 Хороший'},
    {p:'100%',c:'#34C77B',l:'💪 Сильный'},
  ];
  const lv = lvls[Math.min(sc,4)];
  const bar = $('pwBar');
  bar.style.width = lv.p; bar.style.background = lv.c;
  $('pwLbl').textContent = lv.l;
});

/* Password eye */
document.addEventListener('click', e => {
  const btn = e.target.closest('.pw-eye');
  if (!btn) return;
  const inp = $(btn.dataset.t);
  inp.type = inp.type === 'password' ? 'text' : 'password';
  btn.textContent = inp.type === 'password' ? '👁' : '🙈';
});

/* ═══════════ LOGIN ═══════════ */
$('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const username = $('lUser').value.trim();
  const password = $('lPass').value;
  $('loginErr').textContent = '';
  $('lUserErr').textContent = '';
  $('lPassErr').textContent = '';
  if (!username) { $('lUserErr').textContent = 'Введите логин'; return; }
  if (!password) { $('lPassErr').textContent = 'Введите пароль'; return; }

  $('loginBtn').disabled = true;
  $('loginBtnTxt').textContent = 'Входим...';
  $('loginSpin').classList.remove('hidden');
  try {
    const { data } = await api('POST', '/auth/login', { username, password });
    saveSession(data.token, data.user);
    await bootApp();
  } catch(err) {
    $('loginErr').textContent = err.message;
  } finally {
    $('loginBtn').disabled = false;
    $('loginBtnTxt').textContent = 'Войти';
    $('loginSpin').classList.add('hidden');
  }
});

/* ═══════════ REGISTER ═══════════ */
$('regForm').addEventListener('submit', async e => {
  e.preventDefault();
  const displayName = $('rName').value.trim();
  const username    = $('rUser').value.trim();
  const password    = $('rPass').value;
  const bio         = $('rBio').value.trim();
  $('regErr').textContent = $('rNameErr').textContent = $('rUserErr').textContent = $('rPassErr').textContent = '';

  let ok = true;
  if (!displayName)      { $('rNameErr').textContent = 'Введите имя'; ok = false; }
  if (!username)         { $('rUserErr').textContent = 'Введите логин'; ok = false; }
  if (password.length<6) { $('rPassErr').textContent = 'Минимум 6 символов'; ok = false; }
  if (!ok) return;

  $('regBtn').disabled = true;
  $('regBtnTxt').textContent = 'Создаём...';
  $('regSpin').classList.remove('hidden');
  try {
    const { data } = await api('POST', '/auth/register', {
      displayName, username, password, bio,
      emoji: S.selEmoji, color: S.selColor,
    });
    saveSession(data.token, data.user);
    await bootApp();
    toast('Добро пожаловать! 🎉', 'success');
  } catch(err) {
    $('regErr').textContent = err.message;
  } finally {
    $('regBtn').disabled = false;
    $('regBtnTxt').textContent = 'Создать аккаунт';
    $('regSpin').classList.add('hidden');
  }
});

/* ═══════════ BOOT ═══════════ */
async function bootApp() {
  showApp();
  syncHeaderUI();
  await Promise.all([fetchPosts(), fetchUsers()]);
  renderFeed();
  renderSidebarStats();
  startMsgPoll();
}

function syncHeaderUI() {
  const u = S.user;
  if (!u) return;

  $('hAv').textContent        = u.emoji;
  $('hAv').style.background   = u.color;
  $('umenuName').textContent   = u.displayName;
  $('umenuHandle').textContent = '@' + u.username;

  $('sideAv').textContent      = u.emoji;
  $('sideAv').style.background = u.color;
  $('sideName').textContent    = u.displayName;
  $('sideHandle').textContent  = '@' + u.username;

  $('mobAv').textContent       = u.emoji;
  $('mobAv').style.background  = u.color;
  $('mobName').textContent     = u.displayName;
  $('mobHandle').textContent   = '@' + u.username;

  $('bottomNavAv').textContent      = u.emoji;
  $('bottomNavAv').style.background = u.color;

  $('qcAv').textContent      = u.emoji;
  $('qcAv').style.background = u.color;

  $('modalAv').textContent      = u.emoji;
  $('modalAv').style.background = u.color;
  $('modalName').textContent    = u.displayName;
  $('modalHandle').textContent  = '@' + u.username;
}

/* ═══════════ LOGOUT ═══════════ */
$('logoutBtn').onclick = () => {
  stopMsgPoll();
  clearSession();
  S.posts = []; S.users = [];
  $('postsList').innerHTML = '';
  $('peopleList').innerHTML = '';
  $('dialogsList').innerHTML = '';
  $('chatMessages').innerHTML = '';
  $('umenuDrop').classList.remove('open');
  showAuth();
  $('loginPanel').classList.remove('hidden');
  $('regPanel').classList.add('hidden');
  $('loginForm').reset();
  toast('Вы вышли', 'info');
};

/* ═══════════ POSTS ═══════════ */
async function fetchPosts(userId=null) {
  try {
    const url = userId ? `/posts?userId=${userId}` : '/posts';
    const { data } = await api('GET', url);
    if (!userId) S.posts = data;
    return data;
  } catch(err) { console.error(err); return []; }
}

function renderFeed() {
  $('skeletons').classList.add('hidden');
  const list = $('postsList');
  list.innerHTML = '';
  if (S.posts.length === 0) { $('feedEmpty').classList.remove('hidden'); return; }
  $('feedEmpty').classList.add('hidden');
  S.posts.forEach(p => list.appendChild(buildPostCard(p)));
  renderSidebarStats();
}

function buildPostCard(p) {
  const isOwn = p.authorId === S.user?.id;
  const liked  = p.likes?.includes(S.user?.id);
  const a      = p.author || {};

  const art = document.createElement('article');
  art.className = 'post-card';
  art.dataset.id = p.id;
  art.innerHTML = `
    <div class="pc-head">
      <div class="pc-author" data-uid="${esc(p.authorId)}">
        <div class="pc-av" style="background:${esc(a.color||'#6C63FF')};border-color:${esc(a.color||'#6C63FF')}">${esc(a.emoji||'👤')}</div>
        <div>
          <div class="pc-name">${esc(a.displayName||'Аноним')}</div>
          <div class="pc-meta">
            <span class="pc-handle">@${esc(a.username||'?')}</span>
            <span class="pc-sep">·</span>
            <time class="pc-date" datetime="${p.createdAt}">${relTime(p.createdAt)}</time>
          </div>
        </div>
      </div>
      ${isOwn ? `<button class="pc-del" data-del="${esc(p.id)}" title="Удалить">🗑</button>` : ''}
    </div>
    <div class="pc-body"><p class="pc-text">${esc(p.content)}</p></div>
    <div class="pc-foot">
      <button class="post-act post-act--like ${liked?'liked':''}" data-like="${esc(p.id)}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="${liked?'currentColor':'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
        </svg>
        <span class="like-n">${fmt(p.likes?.length)}</span>
      </button>
      ${!isOwn ? `<button class="post-act post-act--msg" data-msg="${esc(p.authorId)}">💬 Написать</button>` : ''}
    </div>
  `;
  return art;
}

function setupPostDelegation(listId) {
  $(listId).addEventListener('click', async e => {
    const likeBtn = e.target.closest('[data-like]');
    if (likeBtn) {
      const id = likeBtn.dataset.like;
      try {
        const { data } = await api('PATCH', `/posts/${id}/like`);
        const p = S.posts.find(x => x.id === id);
        if (p) {
          if (data.liked) { if(!p.likes.includes(S.user.id)) p.likes.push(S.user.id); }
          else p.likes = p.likes.filter(u => u !== S.user.id);
        }
        likeBtn.classList.toggle('liked', data.liked);
        likeBtn.querySelector('svg').setAttribute('fill', data.liked ? 'currentColor' : 'none');
        likeBtn.querySelector('.like-n').textContent = fmt(data.likesCount);
        likeBtn.classList.add('pop');
        likeBtn.addEventListener('animationend', () => likeBtn.classList.remove('pop'), {once:true});
        renderSidebarStats();
      } catch(err) { toast(err.message, 'error'); }
      return;
    }

    const delBtn = e.target.closest('[data-del]');
    if (delBtn) {
      if (!confirm('Удалить пост?')) return;
      const id = delBtn.dataset.del;
      try {
        await api('DELETE', `/posts/${id}`);
        S.posts = S.posts.filter(p => p.id !== id);
        document.querySelectorAll(`.post-card[data-id="${id}"]`).forEach(c => {
          c.style.transition = 'opacity .3s,transform .3s';
          c.style.opacity = '0'; c.style.transform = 'scale(.97)';
          setTimeout(() => { c.remove(); renderSidebarStats(); }, 300);
        });
        if (S.posts.length === 0) $('feedEmpty').classList.remove('hidden');
      } catch(err) { toast(err.message, 'error'); }
      return;
    }

    const msgBtn = e.target.closest('[data-msg]');
    if (msgBtn) { openChat(msgBtn.dataset.msg); return; }

    const authorEl = e.target.closest('[data-uid]');
    if (authorEl && !e.target.closest('button')) openProfile(authorEl.dataset.uid);
  });
}

setupPostDelegation('postsList');
setupPostDelegation('profilePosts');

/* ═══════════ SIDEBAR STATS ═══════════ */
function renderSidebarStats() {
  const myPosts   = S.posts.filter(p => p.authorId === S.user?.id);
  const myLikes   = myPosts.reduce((s,p) => s + (p.likes?.length||0), 0);
  const followers = S.user?.followers?.length || 0;
  const following = S.user?.following?.length || 0;

  // Desktop left sidebar
  if($('sPosts'))     $('sPosts').textContent     = myPosts.length;
  if($('sFollowers')) $('sFollowers').textContent = followers;
  if($('sFollowing')) $('sFollowing').textContent = following;

  // Desktop right sidebar
  if($('rPosts'))     $('rPosts').textContent     = myPosts.length;
  if($('rLikes'))     $('rLikes').textContent     = fmt(myLikes);
  if($('rFollowers')) $('rFollowers').textContent = followers;

  // Mobile profile bar
  if($('mobPosts'))     $('mobPosts').textContent     = myPosts.length;
  if($('mobFollowers')) $('mobFollowers').textContent = followers;
  if($('mobFollowing')) $('mobFollowing').textContent = following;
}

/* ═══════════ POST MODAL ═══════════ */
(function buildToolbar() {
  const bar = $('emojiToolbar');
  TOOLBAR_EMOJIS.forEach(em => {
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'tb-emoji'; btn.textContent = em;
    btn.onclick = () => insertAt($('postTa'), em);
    bar.appendChild(btn);
  });
})();

function insertAt(el, text) {
  const s = el.selectionStart, e2 = el.selectionEnd;
  el.value = el.value.slice(0,s) + text + el.value.slice(e2);
  el.selectionStart = el.selectionEnd = s + text.length;
  el.dispatchEvent(new Event('input'));
  el.focus();
}

function openPostModal() {
  $('postModal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  setTimeout(() => $('postTa').focus(), 200);
}
function closePostModal() {
  $('postModal').classList.add('hidden');
  document.body.style.overflow = '';
  $('postTa').value = '';
  $('charN').textContent = '0';
  $('charN').parentElement.className = 'char-c';
  $('publishBtn').disabled = true;
  $('postErr').textContent = '';
}

['hPostBtn','sidePostBtn','qcTrigger','emptyPostBtn','mobPostBtn','fabPostBtn']
  .forEach(id => { const el=$(id); if(el) el.onclick = openPostModal; });

$('closePost').onclick = $('cancelPost').onclick = closePostModal;
$('postModal').addEventListener('click', e => { if(e.target===$('postModal')) closePostModal(); });
document.addEventListener('keydown', e => {
  if(e.key==='Escape' && !$('postModal').classList.contains('hidden')) closePostModal();
});

$('postTa').addEventListener('input', () => {
  const len = $('postTa').value.length;
  $('charN').textContent = len;
  const cc = $('charN').parentElement;
  cc.className = 'char-c';
  if(len > 800) cc.classList.add('warn');
  if(len > 950) cc.classList.add('danger');
  $('publishBtn').disabled = len === 0 || len > 1000;
  $('postErr').textContent = '';
});

$('postTa').addEventListener('keydown', e => {
  if((e.ctrlKey||e.metaKey) && e.key==='Enter' && !$('publishBtn').disabled) {
    e.preventDefault(); submitPost();
  }
});
$('publishBtn').onclick = submitPost;

async function submitPost() {
  const content = $('postTa').value.trim();
  if(!content) return;
  $('publishBtn').disabled = true;
  $('publishTxt').textContent = 'Публикуем...';
  $('publishSpin').classList.remove('hidden');
  $('postErr').textContent = '';
  try {
    const { data } = await api('POST', '/posts', { content });
    S.posts.unshift(data);
    $('feedEmpty').classList.add('hidden');
    $('postsList').prepend(buildPostCard(data));
    renderSidebarStats();
    closePostModal();
    toast('Опубликовано! 🎉', 'success');
    window.scrollTo({top:0,behavior:'smooth'});
  } catch(err) {
    $('postErr').textContent = err.message;
    $('publishBtn').disabled = false;
  } finally {
    $('publishTxt').textContent = 'Опубликовать';
    $('publishSpin').classList.add('hidden');
  }
}

/* ═══════════ PEOPLE ═══════════ */
async function fetchUsers() {
  try { const { data } = await api('GET', '/users'); S.users = data; }
  catch(err) { console.error(err); }
}

function renderPeople(filter='') {
  const list = $('peopleList');
  list.innerHTML = '';
  let filtered = S.users;
  if(filter) {
    const lf = filter.toLowerCase();
    filtered = S.users.filter(u =>
      u.displayName.toLowerCase().includes(lf) ||
      u.username.toLowerCase().includes(lf)
    );
  }
  if(filtered.length === 0) { $('peopleEmpty').classList.remove('hidden'); return; }
  $('peopleEmpty').classList.add('hidden');
  filtered.forEach(u => list.appendChild(buildPersonCard(u)));
}

function buildPersonCard(u) {
  const isFollowing = S.user?.following?.includes(u.id);
  const postCount   = S.posts.filter(p => p.authorId === u.id).length;
  const div = document.createElement('div');
  div.className = 'person-card';
  div.dataset.userId = u.id;
  div.innerHTML = `
    <div class="person-card__av" style="background:${esc(u.color||'#6C63FF')}">${esc(u.emoji||'👤')}</div>
    <div class="person-card__info">
      <div class="person-card__name">${esc(u.displayName)}</div>
      <div class="person-card__handle">@${esc(u.username)}</div>
      <div class="person-card__stats">${postCount} постов · ${u.followers?.length||0} читателей</div>
    </div>
    <div class="person-card__actions">
      <button class="btn btn--outline ${isFollowing?'following':''}" data-follow="${esc(u.id)}">
        ${isFollowing?'Читаю':'+ Читать'}
      </button>
      <button class="btn btn--outline btn--sm" data-msg-user="${esc(u.id)}" title="Написать">💬</button>
    </div>
  `;
  return div;
}

$('peopleList').addEventListener('click', async e => {
  const followBtn = e.target.closest('[data-follow]');
  if(followBtn) {
    const tid = followBtn.dataset.follow;
    try {
      const { data } = await api('PATCH', `/users/me/follow/${tid}`);
      if(data.following) { if(!S.user.following.includes(tid)) S.user.following.push(tid); }
      else S.user.following = S.user.following.filter(i => i !== tid);
      localStorage.setItem(USER_KEY, JSON.stringify(S.user));
      const tu = S.users.find(u => u.id === tid);
      if(tu) {
        if(data.following) { if(!tu.followers.includes(S.user.id)) tu.followers.push(S.user.id); }
        else tu.followers = tu.followers.filter(i => i !== S.user.id);
      }
      followBtn.classList.toggle('following', data.following);
      followBtn.textContent = data.following ? 'Читаю' : '+ Читать';
      const card = followBtn.closest('.person-card');
      if(card && tu) {
        const pc = S.posts.filter(p => p.authorId === tu.id).length;
        card.querySelector('.person-card__stats').textContent =
          `${pc} постов · ${tu.followers.length} читателей`;
      }
      renderSidebarStats();
      toast(data.following ? `Читаете @${tu?.username}` : `Отписались от @${tu?.username}`, 'success');
    } catch(err) { toast(err.message, 'error'); }
    return;
  }

  const msgBtn = e.target.closest('[data-msg-user]');
  if(msgBtn) { openChat(msgBtn.dataset.msgUser); return; }

  const card = e.target.closest('.person-card');
  if(card && !e.target.closest('button')) openProfile(card.dataset.userId);
});

$('peopleSearch').addEventListener('input', e => renderPeople(e.target.value));

/* ═══════════ MESSAGES ═══════════ */
async function fetchDialogs() {
  try { const { data } = await api('GET', '/messages'); return data; }
  catch { return []; }
}

async function renderDialogs() {
  const dialogs = await fetchDialogs();
  const list = $('dialogsList');
  list.innerHTML = '';

  const unreadTotal = dialogs.reduce((s,d) => s + d.unread, 0);
  updateMsgBadge(unreadTotal);

  if(dialogs.length === 0) { $('dialogsEmpty').classList.remove('hidden'); return; }
  $('dialogsEmpty').classList.add('hidden');

  dialogs.forEach(d => {
    const p = d.partner;
    const div = document.createElement('div');
    div.className = 'dialog-item' + (S.chatPartnerId===p.id ? ' active' : '');
    div.dataset.uid = p.id;
    div.innerHTML = `
      <div class="dialog-item__av" style="background:${esc(p.color||'#6C63FF')}">${esc(p.emoji||'👤')}</div>
      <div class="dialog-item__info">
        <div class="dialog-item__name">${esc(p.displayName)}</div>
        <div class="dialog-item__last">${esc((d.last?.text||'').slice(0,50))}</div>
      </div>
      <div class="dialog-item__meta">
        <span class="dialog-item__time">${d.last ? relTime(d.last.createdAt) : ''}</span>
        ${d.unread ? `<span class="dialog-item__unread">${d.unread}</span>` : ''}
      </div>
    `;
    div.onclick = () => openChat(p.id);
    list.appendChild(div);
  });
}

function updateMsgBadge(n) {
  [$('msgBadge'), $('msgBadgeSide'), $('msgBadgeMob')].forEach(el => {
    if(!el) return;
    if(n > 0) { el.textContent = n; el.classList.remove('hidden'); }
    else el.classList.add('hidden');
  });
}

async function openChat(userId) {
  S.chatPartnerId = userId;
  switchPage('messages');

  $('chatPanel').classList.remove('hidden');
  if(window.innerWidth <= 720) $('dialogsPanel').classList.add('hidden');

  let partner = S.users.find(u => u.id === userId);
  if(!partner) {
    try { const { data } = await api('GET', `/users/${userId}`); partner = data; } catch {}
  }
  if(partner) {
    $('chatAv').textContent         = partner.emoji || '👤';
    $('chatAv').style.background    = partner.color || '#6C63FF';
    $('chatName').textContent        = partner.displayName;
    $('chatHandle').textContent      = '@' + partner.username;
    $('chatViewProfile').onclick     = () => openProfile(partner.id);
  }

  await loadChatMessages();
  $('chatInput').focus();
  renderDialogs();
}

async function loadChatMessages() {
  if(!S.chatPartnerId) return;
  try {
    const { data } = await api('GET', `/messages/${S.chatPartnerId}`);
    S.chatMessages = data;
    renderChatMessages();
  } catch(err) { console.error(err); }
}

function renderChatMessages() {
  const box = $('chatMessages');
  box.innerHTML = '';
  if(S.chatMessages.length === 0) {
    box.innerHTML = `<div class="chat-empty"><div class="chat-empty__icon">👋</div><p>Начните общение!</p></div>`;
    return;
  }
  S.chatMessages.forEach(m => box.appendChild(buildBubble(m)));
  box.scrollTop = box.scrollHeight;
}

function buildBubble(m) {
  const isOut = m.from === S.user.id;
  const div = document.createElement('div');
  div.className = `msg-bubble msg-bubble--${isOut?'out':'in'}`;
  div.dataset.msgId = m.id;
  div.innerHTML = `
    ${esc(m.text)}
    <span class="msg-bubble__time">${relTime(m.createdAt)}</span>
    ${isOut ? `<button class="msg-bubble__del" data-del-msg="${esc(m.id)}">✕</button>` : ''}
  `;
  return div;
}

async function sendMessage() {
  const text = $('chatInput').value.trim();
  if(!text || !S.chatPartnerId) return;
  $('chatSend').disabled = true;
  try {
    const { data } = await api('POST', `/messages/${S.chatPartnerId}`, { text });
    S.chatMessages.push(data);
    $('chatInput').value = '';
    $('chatInput').style.height = 'auto';
    renderChatMessages();
    renderDialogs();
  } catch(err) { toast(err.message, 'error'); }
  finally { $('chatSend').disabled = false; }
}

$('chatSend').onclick = sendMessage;
$('chatInput').addEventListener('keydown', e => {
  if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});
$('chatInput').addEventListener('input', function() {
  this.style.height = 'auto';
  this.style.height = Math.min(this.scrollHeight, 120) + 'px';
});

$('chatMessages').addEventListener('click', async e => {
  const btn = e.target.closest('[data-del-msg]');
  if(!btn) return;
  if(!confirm('Удалить сообщение?')) return;
  const id = btn.dataset.delMsg;
  try {
    await api('DELETE', `/messages/msg/${id}`);
    S.chatMessages = S.chatMessages.filter(m => m.id !== id);
    renderChatMessages();
    renderDialogs();
  } catch(err) { toast(err.message, 'error'); }
});

$('chatBack').onclick = () => {
  $('chatPanel').classList.add('hidden');
  $('dialogsPanel').classList.remove('hidden');
  S.chatPartnerId = null;
};

$('goToPeopleBtn').onclick = () => switchPage('people');

function startMsgPoll() {
  stopMsgPoll();
  S.msgPollInterval = setInterval(async () => {
    const dialogs = await fetchDialogs();
    const unread  = dialogs.reduce((s,d) => s + d.unread, 0);
    updateMsgBadge(unread);
    if(S.chatPartnerId && S.currentPage === 'messages') {
      await loadChatMessages();
    }
  }, 5000);
}
function stopMsgPoll() { clearInterval(S.msgPollInterval); }

/* ═══════════ PROFILE ═══════════ */
async function openProfile(userId) {
  S.profileUserId = userId;
  switchPage('profile');

  let user = userId === S.user.id ? S.user : S.users.find(u => u.id === userId);
  if(!user) {
    try { const { data } = await api('GET', `/users/${userId}`); user = data; }
    catch { toast('Пользователь не найден', 'error'); return; }
  }

  const isMe = userId === S.user.id;
  const isFollowing = S.user?.following?.includes(userId);

  $('profileAv').textContent       = user.emoji || '👤';
  $('profileAv').style.background  = user.color || '#6C63FF';
  $('profileName').textContent     = user.displayName;
  $('profileHandle').textContent   = '@' + user.username;
  $('profileBio').textContent      = user.bio || '';

  const posts = await fetchPosts(userId);
  $('pPostCount').textContent = posts.length;
  $('pFollowers').textContent = user.followers?.length || 0;
  $('pFollowing').textContent = user.following?.length || 0;

  const actions = $('profileActions');
  actions.innerHTML = '';

  if(isMe) {
    const editBtn = document.createElement('button');
    editBtn.className = 'btn btn--outline';
    editBtn.textContent = '✏️ Редактировать';
    editBtn.onclick = () => toggleEditProfile(true, user);
    actions.appendChild(editBtn);
  } else {
    const followBtn = document.createElement('button');
    followBtn.className = `btn btn--outline${isFollowing?' following':''}`;
    followBtn.textContent = isFollowing ? 'Читаю' : '+ Читать';
    followBtn.onclick = async () => {
      try {
        const { data } = await api('PATCH', `/users/me/follow/${userId}`);
        followBtn.classList.toggle('following', data.following);
        followBtn.textContent = data.following ? 'Читаю' : '+ Читать';
        $('pFollowers').textContent = data.followersCount;
        if(data.following) { if(!S.user.following.includes(userId)) S.user.following.push(userId); }
        else S.user.following = S.user.following.filter(i => i !== userId);
        localStorage.setItem(USER_KEY, JSON.stringify(S.user));
        renderSidebarStats();
      } catch(err) { toast(err.message, 'error'); }
    };

    const msgBtn = document.createElement('button');
    msgBtn.className = 'btn btn--primary';
    msgBtn.textContent = '💬 Написать';
    msgBtn.onclick = () => openChat(userId);

    actions.appendChild(followBtn);
    actions.appendChild(msgBtn);
  }

  $('editProfileCard').classList.add('hidden');
  const profilePosts = $('profilePosts');
  profilePosts.innerHTML = '';
  if(posts.length === 0) { $('profileEmpty').classList.remove('hidden'); return; }
  $('profileEmpty').classList.add('hidden');
  posts.forEach(p => profilePosts.appendChild(buildPostCard(p)));
}

function toggleEditProfile(show, user) {
  const card = $('editProfileCard');
  if(!show) { card.classList.add('hidden'); return; }
  card.classList.remove('hidden');
  card.scrollIntoView({behavior:'smooth', block:'start'});

  $('editName').value = user.displayName || '';
  $('editBio').value  = user.bio || '';
  S.editEmoji = user.emoji || '😀';
  S.editColor = user.color || COLORS[0];
  $('editErr').textContent = '';

  buildEmojiGrid('editEmojiGrid', em => { S.editEmoji = em; }, S.editEmoji);
  buildColorSwatches('editColorSwatches', S.editColor, c => { S.editColor = c; });
}

$('cancelEditBtn').onclick = () => $('editProfileCard').classList.add('hidden');

$('saveEditBtn').onclick = async () => {
  const displayName = $('editName').value.trim();
  const bio         = $('editBio').value.trim();
  const curPass     = $('editCurPass').value;
  const newPass     = $('editNewPass').value;
  $('editErr').textContent = '';

  if(!displayName) { $('editErr').textContent = 'Имя не может быть пустым'; return; }

  const payload = { displayName, bio, emoji: S.editEmoji, color: S.editColor };
  if(newPass) { payload.password = curPass; payload.newPassword = newPass; }

  $('saveEditBtn').disabled = true;
  $('saveEditTxt').textContent = 'Сохраняем...';
  $('saveSpin').classList.remove('hidden');

  try {
    const { data } = await api('PATCH', '/auth/me', payload);
    S.user = { ...S.user, ...data };
    localStorage.setItem(USER_KEY, JSON.stringify(S.user));
    syncHeaderUI();
    $('editProfileCard').classList.add('hidden');
    $('editCurPass').value = '';
    $('editNewPass').value = '';
    openProfile(S.user.id);
    toast('Профиль обновлён ✅', 'success');
  } catch(err) {
    $('editErr').textContent = err.message;
  } finally {
    $('saveEditBtn').disabled = false;
    $('saveEditTxt').textContent = 'Сохранить';
    $('saveSpin').classList.add('hidden');
  }
};

/* ═══════════ NAVIGATION ═══════════ */
const PAGES = {
  feed:     'feedPage',
  people:   'peoplePage',
  messages: 'messagesPage',
  profile:  'profilePage',
};

function switchPage(page) {
  S.currentPage = page;

  Object.entries(PAGES).forEach(([key, id]) => {
    $(id).classList.toggle('hidden', key !== page);
  });

  // Mobile profile bar — только на ленте
  const mpb = $('mobProfileBar');
  if(mpb) mpb.style.display = (page === 'feed') ? 'flex' : 'none';

  // Desktop nav
  $$('.nav__link').forEach(l =>
    l.classList.toggle('nav__link--active', l.dataset.page === page)
  );

  // Desktop side nav
  $$('.side-nav__item').forEach(l =>
    l.classList.toggle('side-nav__item--active', l.dataset.page === page)
  );

  // Bottom nav
  $$('.bottom-nav__item[data-page]').forEach(l =>
    l.classList.toggle('bottom-nav__item--active', l.dataset.page === page)
  );

  if(page === 'people')     { $('peopleSearch').value = ''; renderPeople(); }
  if(page === 'messages')   { renderDialogs(); }
  if(page === 'profile-me') { openProfile(S.user.id); }

  $('umenuDrop').classList.remove('open');
}

// Nav delegation
document.addEventListener('click', e => {
  const link = e.target.closest('.nav__link, .side-nav__item, .bottom-nav__item[data-page], [data-page]');
  if(!link) return;
  const page = link.dataset.page;
  if(!page) return;
  // Игнорируем если не навигационный элемент
  if(!link.classList.contains('nav__link') &&
     !link.classList.contains('side-nav__item') &&
     !link.classList.contains('bottom-nav__item') &&
     !link.classList.contains('mob-profile-bar__top') &&
     !link.classList.contains('btn--outline') &&
     !link.classList.contains('umenu__item')) return;
  e.preventDefault();
  switchPage(page);
});

// Mob profile bar кнопка "Профиль"
$('mobProfileBar').addEventListener('click', e => {
  const btn = e.target.closest('[data-page]');
  if(btn) switchPage(btn.dataset.page);
});

// User menu items
$('umenuDrop').addEventListener('click', e => {
  const item = e.target.closest('.umenu__item[data-page]');
  if(item) switchPage(item.dataset.page);
});

$('goHome').onclick = e => { e.preventDefault(); switchPage('feed'); };

/* ═══════════ USER MENU ═══════════ */
$('umenuTrigger').onclick = e => {
  e.stopPropagation();
  $('umenuDrop').classList.toggle('open');
};
document.addEventListener('click', e => {
  if(!e.target.closest('#umenu')) $('umenuDrop').classList.remove('open');
});

/* ═══════════ SCROLL ═══════════ */
window.addEventListener('scroll', () => {
  $('header').classList.toggle('scrolled', window.scrollY > 10);
  $('scrollTop').classList.toggle('hidden', window.scrollY < 400);
  $$('.pc-date').forEach(el => { el.textContent = relTime(el.getAttribute('datetime')); });
}, { passive: true });

$('scrollTop').onclick = () => window.scrollTo({top:0, behavior:'smooth'});

setInterval(() => {
  $$('.pc-date').forEach(el => { el.textContent = relTime(el.getAttribute('datetime')); });
}, 60000);

/* ═══════════ INIT ═══════════ */
(async function init() {
  if(loadSession()) {
    try {
      const { data } = await api('GET', '/auth/me');
      S.user = data;
      localStorage.setItem(USER_KEY, JSON.stringify(data));
      await bootApp();
    } catch {
      clearSession();
      showAuth();
    }
  } else {
    showAuth();
  }
})();
