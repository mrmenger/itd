'use strict';

const express = require('express');
const cors    = require('cors');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const fs      = require('fs');
const path    = require('path');
const https   = require('https');

const app  = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET   = process.env.JWT_SECRET || 'itd_secret_2024';
const ADMIN_PASS   = process.env.ADMIN_PASS  || '1qw23er4';
const STORAGE_FILE = path.join('/tmp', 'itd_data.json');
const CREATOR_USERNAME = 'creator';

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname)));

// ═══════════════════════════════════════
//  DB
// ═══════════════════════════════════════
const EMPTY_DB = { users: [], posts: [], messages: [] };

function loadDB() {
  try {
    if (fs.existsSync(STORAGE_FILE)) {
      const raw = fs.readFileSync(STORAGE_FILE, 'utf-8');
      const db  = JSON.parse(raw);
      if (db && db.users) {
        console.log(`✅ DB from /tmp: ${db.users.length} users, ${db.posts.length} posts`);
        return db;
      }
    }
  } catch (e) { console.error('tmp read:', e.message); }

  try {
    if (process.env.ITD_DATA) {
      const raw = Buffer.from(process.env.ITD_DATA, 'base64').toString('utf-8');
      const db  = JSON.parse(raw);
      if (db && db.users) {
        console.log(`✅ DB from ENV: ${db.users.length} users`);
        saveFile(db);
        return db;
      }
    }
  } catch (e) { console.error('env read:', e.message); }

  console.log('📭 Empty DB');
  return JSON.parse(JSON.stringify(EMPTY_DB));
}

function saveFile(db) {
  try { fs.writeFileSync(STORAGE_FILE, JSON.stringify(db), 'utf-8'); }
  catch (e) { console.error('save:', e.message); }
}

let DB = loadDB();
function persist() { saveFile(DB); }

// Self-ping
function selfPing() {
  const url = process.env.RENDER_EXTERNAL_URL;
  if (!url) return;
  try {
    https.get(url + '/api/ping', r => console.log(`🏓 ping: ${r.statusCode}`))
         .on('error', () => {});
  } catch (_) {}
}
setInterval(selfPing, 14 * 60 * 1000);
app.get('/api/ping', (_, res) => res.json({ ok: true, ts: Date.now() }));

// ═══════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════
function authMiddleware(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, message: 'Нет токена' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ success: false, message: 'Токен недействителен' }); }
}

function adminMiddleware(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, message: 'Нет токена' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded.isAdmin) return res.status(403).json({ success: false, message: 'Нет прав администратора' });
    req.user = decoded;
    next();
  } catch { res.status(401).json({ success: false, message: 'Токен недействителен' }); }
}

function safe(u) {
  if (!u) return null;
  const { password: _, ...rest } = u;
  return rest;
}

function isCreator(user) {
  return user && user.username === CREATOR_USERNAME;
}

// ═══════════════════════════════════════
//  ADMIN AUTH
// ═══════════════════════════════════════
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ success: false, message: 'Введите пароль' });
  if (password !== ADMIN_PASS) return res.status(401).json({ success: false, message: 'Неверный пароль' });

  const token = jwt.sign({ isAdmin: true, role: 'admin' }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ success: true, data: { token } });
});

// ═══════════════════════════════════════
//  ADMIN ROUTES
// ═══════════════════════════════════════

// GET /api/admin/stats — статистика
app.get('/api/admin/stats', adminMiddleware, (req, res) => {
  const totalUsers    = DB.users.length;
  const totalPosts    = DB.posts.length;
  const totalMessages = DB.messages.length;
  const totalLikes    = DB.posts.reduce((s, p) => s + (p.likes?.length || 0), 0);
  const verifiedCount = DB.users.filter(u => u.verified).length;

  // Emoji clan stats
  const emojiStats = {};
  DB.users.forEach(u => {
    if (u.emoji) {
      emojiStats[u.emoji] = (emojiStats[u.emoji] || 0) + 1;
    }
  });

  const topEmoji = Object.entries(emojiStats)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([emoji, count]) => ({ emoji, count }));

  res.json({
    success: true,
    data: {
      totalUsers, totalPosts, totalMessages, totalLikes, verifiedCount,
      topEmoji,
      recentUsers: DB.users.slice(-5).reverse().map(safe),
      recentPosts: DB.posts.slice(0, 5).map(p => {
        const a = DB.users.find(u => u.id === p.authorId);
        return { ...p, author: a ? safe(a) : null };
      }),
    }
  });
});

// GET /api/admin/users — все пользователи
app.get('/api/admin/users', adminMiddleware, (req, res) => {
  const users = DB.users.map(u => ({
    ...safe(u),
    postCount: DB.posts.filter(p => p.authorId === u.id).length,
  }));
  res.json({ success: true, data: users });
});

// PATCH /api/admin/users/:id/verify — верифицировать пользователя
app.patch('/api/admin/users/:id/verify', adminMiddleware, (req, res) => {
  const user = DB.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ success: false, message: 'Не найден' });
  user.verified = !user.verified;
  persist();
  res.json({ success: true, data: { verified: user.verified } });
});

// PATCH /api/admin/users/:id/ban — бан/разбан
app.patch('/api/admin/users/:id/ban', adminMiddleware, (req, res) => {
  const user = DB.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ success: false, message: 'Не найден' });
  if (isCreator(user)) return res.status(403).json({ success: false, message: 'Нельзя банить создателя' });
  user.banned = !user.banned;
  persist();
  res.json({ success: true, data: { banned: user.banned } });
});

// DELETE /api/admin/users/:id — удалить пользователя
app.delete('/api/admin/users/:id', adminMiddleware, (req, res) => {
  const idx = DB.users.findIndex(u => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Не найден' });
  if (isCreator(DB.users[idx])) return res.status(403).json({ success: false, message: 'Нельзя удалить создателя' });

  const uid = DB.users[idx].id;
  DB.users.splice(idx, 1);
  DB.posts    = DB.posts.filter(p => p.authorId !== uid);
  DB.messages = DB.messages.filter(m => m.from !== uid && m.to !== uid);
  persist();
  res.json({ success: true });
});

// GET /api/admin/posts — все посты
app.get('/api/admin/posts', adminMiddleware, (req, res) => {
  const posts = DB.posts.map(p => {
    const a = DB.users.find(u => u.id === p.authorId);
    return { ...p, author: a ? safe(a) : null };
  });
  res.json({ success: true, data: posts });
});

// DELETE /api/admin/posts/:id — удалить любой пост
app.delete('/api/admin/posts/:id', adminMiddleware, (req, res) => {
  const idx = DB.posts.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Не найден' });
  DB.posts.splice(idx, 1);
  persist();
  res.json({ success: true });
});

// DELETE /api/admin/messages — очистить все сообщения
app.delete('/api/admin/messages', adminMiddleware, (req, res) => {
  DB.messages = [];
  persist();
  res.json({ success: true });
});

// POST /api/admin/announce — объявление (пост от имени системы)
app.post('/api/admin/announce', adminMiddleware, (req, res) => {
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ success: false, message: 'Пустое объявление' });

  const post = {
    id: Date.now().toString(),
    authorId: 'system',
    content: content.trim(),
    likes: [],
    isAnnouncement: true,
    createdAt: new Date().toISOString(),
  };
  DB.posts.unshift(post);
  persist();
  res.status(201).json({ success: true, data: post });
});

// GET /api/admin/emoji-clans — статистика эмодзи кланов
app.get('/api/admin/emoji-clans', adminMiddleware, (req, res) => {
  const clans = {};
  DB.users.forEach(u => {
    if (!u.emoji) return;
    if (!clans[u.emoji]) clans[u.emoji] = { emoji: u.emoji, members: [] };
    clans[u.emoji].members.push({ id: u.id, username: u.username, displayName: u.displayName });
  });
  const sorted = Object.values(clans).sort((a, b) => b.members.length - a.members.length);
  res.json({ success: true, data: sorted });
});

// ═══════════════════════════════════════
//  AUTH
// ═══════════════════════════════════════
app.post('/api/auth/register', async (req, res) => {
  const { username, password, displayName, emoji, color, bio } = req.body;
  if (!username || !password || !displayName || !emoji)
    return res.status(400).json({ success: false, message: 'Заполните все поля' });

  const clean = username.trim().toLowerCase();
  if (clean.length < 3 || clean.length > 20)
    return res.status(400).json({ success: false, message: 'Логин: 3–20 символов' });
  if (!/^[a-z0-9_]+$/.test(clean))
    return res.status(400).json({ success: false, message: 'Логин: только a-z, 0-9, _' });
  if (password.length < 6)
    return res.status(400).json({ success: false, message: 'Пароль: минимум 6 символов' });
  if (displayName.trim().length < 2)
    return res.status(400).json({ success: false, message: 'Имя слишком короткое' });
  if (DB.users.find(u => u.username === clean))
    return res.status(409).json({ success: false, message: 'Логин уже занят' });

  const hash = await bcrypt.hash(password, 10);
  const user = {
    id: Date.now().toString(),
    username: clean,
    password: hash,
    displayName: displayName.trim(),
    emoji,
    color: color || '#6C63FF',
    bio: bio?.trim() || '',
    followers: [],
    following: [],
    verified: clean === CREATOR_USERNAME,
    banned: false,
    createdAt: new Date().toISOString(),
  };
  DB.users.push(user);
  persist();

  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '90d' });
  res.status(201).json({ success: true, data: { token, user: safe(user) } });
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ success: false, message: 'Введите логин и пароль' });

  const user = DB.users.find(u => u.username === username.trim().toLowerCase());
  if (!user) return res.status(401).json({ success: false, message: 'Неверный логин или пароль' });
  if (user.banned) return res.status(403).json({ success: false, message: '🚫 Вы заблокированы' });

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(401).json({ success: false, message: 'Неверный логин или пароль' });

  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '90d' });
  res.json({ success: true, data: { token, user: safe(user) } });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  const user = DB.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ success: false, message: 'Не найден' });
  if (user.banned) return res.status(403).json({ success: false, message: 'Заблокирован' });
  res.json({ success: true, data: safe(user) });
});

app.patch('/api/auth/me', authMiddleware, async (req, res) => {
  const user = DB.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ success: false, message: 'Не найден' });

  const { displayName, bio, emoji, color, password, newPassword } = req.body;
  if (displayName !== undefined) user.displayName = displayName.trim().slice(0, 50) || user.displayName;
  if (bio         !== undefined) user.bio         = bio.trim().slice(0, 200);
  if (emoji       !== undefined) user.emoji       = emoji;
  if (color       !== undefined) user.color       = color;

  if (newPassword && password) {
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ success: false, message: 'Неверный текущий пароль' });
    if (newPassword.length < 6) return res.status(400).json({ success: false, message: 'Новый пароль: мин. 6 символов' });
    user.password = await bcrypt.hash(newPassword, 10);
  }
  persist();
  res.json({ success: true, data: safe(user) });
});

// ═══════════════════════════════════════
//  POSTS
// ═══════════════════════════════════════
app.get('/api/posts', authMiddleware, (req, res) => {
  const { userId } = req.query;
  let list = [...DB.posts].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (userId) list = list.filter(p => p.authorId === userId);

  const enriched = list.map(p => {
    if (p.authorId === 'system') {
      return { ...p, author: { id: 'system', username: 'system', displayName: '📢 Объявление', emoji: '📢', color: '#6C63FF' } };
    }
    const a = DB.users.find(u => u.id === p.authorId);
    return {
      ...p,
      author: a ? { id: a.id, username: a.username, displayName: a.displayName, emoji: a.emoji, color: a.color, verified: a.verified } : null,
    };
  });
  res.json({ success: true, data: enriched });
});

app.post('/api/posts', authMiddleware, (req, res) => {
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ success: false, message: 'Пустой пост' });
  if (content.length > 1000) return res.status(400).json({ success: false, message: 'Макс. 1000 символов' });

  const author = DB.users.find(u => u.id === req.user.id);
  if (author?.banned) return res.status(403).json({ success: false, message: 'Вы заблокированы' });

  const post = {
    id: Date.now().toString(),
    authorId: req.user.id,
    content: content.trim(),
    likes: [],
    createdAt: new Date().toISOString(),
  };
  DB.posts.unshift(post);
  persist();

  res.status(201).json({
    success: true,
    data: {
      ...post,
      author: author
        ? { id: author.id, username: author.username, displayName: author.displayName, emoji: author.emoji, color: author.color, verified: author.verified }
        : null,
    },
  });
});

app.patch('/api/posts/:id/like', authMiddleware, (req, res) => {
  const post = DB.posts.find(p => p.id === req.params.id);
  if (!post) return res.status(404).json({ success: false, message: 'Не найден' });

  const uid = req.user.id;
  const idx = post.likes.indexOf(uid);
  if (idx === -1) post.likes.push(uid);
  else post.likes.splice(idx, 1);
  persist();

  res.json({ success: true, data: { liked: idx === -1, likesCount: post.likes.length } });
});

app.delete('/api/posts/:id', authMiddleware, (req, res) => {
  const idx = DB.posts.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Не найден' });
  if (DB.posts[idx].authorId !== req.user.id) return res.status(403).json({ success: false, message: 'Нет прав' });

  DB.posts.splice(idx, 1);
  persist();
  res.json({ success: true });
});

// ═══════════════════════════════════════
//  USERS
// ═══════════════════════════════════════
app.get('/api/users', authMiddleware, (req, res) => {
  const { q } = req.query;
  let list = DB.users.filter(u => u.id !== req.user.id && !u.banned);
  if (q) {
    const lq = q.toLowerCase();
    list = list.filter(u =>
      u.displayName.toLowerCase().includes(lq) ||
      u.username.toLowerCase().includes(lq)
    );
  }
  res.json({ success: true, data: list.map(safe) });
});

app.get('/api/users/:id', authMiddleware, (req, res) => {
  const user = DB.users.find(u => u.id === req.params.id || u.username === req.params.id);
  if (!user) return res.status(404).json({ success: false, message: 'Не найден' });
  res.json({ success: true, data: safe(user) });
});

// Emoji clans — публичная
app.get('/api/emoji-clans', authMiddleware, (req, res) => {
  const clans = {};
  DB.users.forEach(u => {
    if (!u.emoji) return;
    if (!clans[u.emoji]) clans[u.emoji] = { emoji: u.emoji, count: 0, members: [] };
    clans[u.emoji].count++;
    clans[u.emoji].members.push(u.username);
  });
  const sorted = Object.values(clans).sort((a, b) => b.count - a.count);
  res.json({ success: true, data: sorted });
});

app.patch('/api/users/me/follow/:id', authMiddleware, (req, res) => {
  const me     = DB.users.find(u => u.id === req.user.id);
  const target = DB.users.find(u => u.id === req.params.id);
  if (!target) return res.status(404).json({ success: false, message: 'Не найден' });
  if (me.id === target.id) return res.status(400).json({ success: false, message: 'Нельзя на себя' });

  const already = me.following.includes(target.id);
  if (already) {
    me.following     = me.following.filter(i => i !== target.id);
    target.followers = target.followers.filter(i => i !== me.id);
  } else {
    me.following.push(target.id);
    target.followers.push(me.id);
  }
  persist();
  res.json({ success: true, data: { following: !already, followersCount: target.followers.length } });
});

// ═══════════════════════════════════════
//  MESSAGES
// ═══════════════════════════════════════
app.get('/api/messages', authMiddleware, (req, res) => {
  const myId = req.user.id;
  const partnersSet = new Set();
  DB.messages.forEach(m => {
    if (m.from === myId) partnersSet.add(m.to);
    if (m.to   === myId) partnersSet.add(m.from);
  });

  const dialogs = [];
  partnersSet.forEach(pid => {
    const partner = DB.users.find(u => u.id === pid);
    if (!partner) return;
    const thread = DB.messages
      .filter(m => (m.from === myId && m.to === pid) || (m.from === pid && m.to === myId))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const last   = thread[0];
    const unread = thread.filter(m => m.to === myId && !m.read).length;
    dialogs.push({ partner: safe(partner), last, unread, updatedAt: last?.createdAt || '' });
  });

  dialogs.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  res.json({ success: true, data: dialogs });
});

app.get('/api/messages/:userId', authMiddleware, (req, res) => {
  const myId  = req.user.id;
  const othId = req.params.userId;
  const thread = DB.messages
    .filter(m => (m.from === myId && m.to === othId) || (m.from === othId && m.to === myId))
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  let changed = false;
  thread.forEach(m => { if (m.to === myId && !m.read) { m.read = true; changed = true; } });
  if (changed) persist();

  res.json({ success: true, data: thread });
});

app.post('/api/messages/:userId', authMiddleware, (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ success: false, message: 'Пустое сообщение' });
  if (text.length > 2000) return res.status(400).json({ success: false, message: 'Макс. 2000 символов' });

  const target = DB.users.find(u => u.id === req.params.userId);
  if (!target) return res.status(404).json({ success: false, message: 'Не найден' });
  if (target.id === req.user.id) return res.status(400).json({ success: false, message: 'Нельзя себе' });

  const msg = {
    id: Date.now().toString(),
    from: req.user.id,
    to: target.id,
    text: text.trim(),
    read: false,
    createdAt: new Date().toISOString(),
  };
  DB.messages.push(msg);
  persist();
  res.status(201).json({ success: true, data: msg });
});

app.delete('/api/messages/msg/:msgId', authMiddleware, (req, res) => {
  const idx = DB.messages.findIndex(m => m.id === req.params.msgId);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Не найдено' });
  if (DB.messages[idx].from !== req.user.id) return res.status(403).json({ success: false, message: 'Нет прав' });
  DB.messages.splice(idx, 1);
  persist();
  res.json({ success: true });
});

app.get('*', (_, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.listen(PORT, () => console.log(`✅ http://localhost:${PORT}`));
