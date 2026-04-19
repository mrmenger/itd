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
const STORAGE_FILE = path.join('/tmp', 'itd_data.json');

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname)));

const EMPTY_DB = { users: [], posts: [], messages: [] };

function loadDB() {
  try {
    if (fs.existsSync(STORAGE_FILE)) {
      const db = JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf-8'));
      if (db?.users) return db;
    }
  } catch(e) { console.error('tmp:', e.message); }
  try {
    if (process.env.ITD_DATA) {
      const db = JSON.parse(Buffer.from(process.env.ITD_DATA, 'base64').toString('utf-8'));
      if (db?.users) { saveFile(db); return db; }
    }
  } catch(e) { console.error('env:', e.message); }
  return JSON.parse(JSON.stringify(EMPTY_DB));
}
function saveFile(db) {
  try { fs.writeFileSync(STORAGE_FILE, JSON.stringify(db), 'utf-8'); }
  catch(e) { console.error('save:', e.message); }
}
let DB = loadDB();
function persist() { saveFile(DB); }

setInterval(() => {
  const url = process.env.RENDER_EXTERNAL_URL;
  if (!url) return;
  try { https.get(url + '/api/ping', r => console.log('ping:', r.statusCode)).on('error', () => {}); } catch(_) {}
}, 14 * 60 * 1000);

app.get('/api/ping', (_, res) => res.json({ ok: true }));

function authMW(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, message: 'Нет токена' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ success: false, message: 'Токен недействителен' }); }
}
function safe(u) { if (!u) return null; const { password: _, ...r } = u; return r; }

// AUTH
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
  const user = { id: Date.now().toString(), username: clean, password: hash,
    displayName: displayName.trim(), emoji, color: color || '#6C63FF',
    bio: bio?.trim() || '', followers: [], following: [], createdAt: new Date().toISOString() };
  DB.users.push(user); persist();
  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '90d' });
  res.status(201).json({ success: true, data: { token, user: safe(user) } });
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ success: false, message: 'Введите логин и пароль' });
  const user = DB.users.find(u => u.username === username.trim().toLowerCase());
  if (!user || !await bcrypt.compare(password, user.password))
    return res.status(401).json({ success: false, message: 'Неверный логин или пароль' });
  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '90d' });
  res.json({ success: true, data: { token, user: safe(user) } });
});

app.get('/api/auth/me', authMW, (req, res) => {
  const user = DB.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ success: false, message: 'Не найден' });
  res.json({ success: true, data: safe(user) });
});

app.patch('/api/auth/me', authMW, async (req, res) => {
  const user = DB.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ success: false, message: 'Не найден' });
  const { displayName, bio, emoji, color, password, newPassword } = req.body;
  if (displayName !== undefined) user.displayName = displayName.trim().slice(0, 50) || user.displayName;
  if (bio  !== undefined) user.bio   = bio.trim().slice(0, 200);
  if (emoji !== undefined) user.emoji = emoji;
  if (color !== undefined) user.color = color;
  if (newPassword && password) {
    if (!await bcrypt.compare(password, user.password))
      return res.status(400).json({ success: false, message: 'Неверный текущий пароль' });
    if (newPassword.length < 6)
      return res.status(400).json({ success: false, message: 'Новый пароль: мин. 6 символов' });
    user.password = await bcrypt.hash(newPassword, 10);
  }
  persist();
  res.json({ success: true, data: safe(user) });
});

// POSTS
app.get('/api/posts', authMW, (req, res) => {
  const { userId } = req.query;
  let list = [...DB.posts].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (userId) list = list.filter(p => p.authorId === userId);
  const enriched = list.map(p => {
    const a = DB.users.find(u => u.id === p.authorId);
    return { ...p, author: a ? { id: a.id, username: a.username, displayName: a.displayName, emoji: a.emoji, color: a.color } : null };
  });
  res.json({ success: true, data: enriched });
});

app.post('/api/posts', authMW, (req, res) => {
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ success: false, message: 'Пустой пост' });
  if (content.length > 1000) return res.status(400).json({ success: false, message: 'Макс. 1000 символов' });
  const author = DB.users.find(u => u.id === req.user.id);
  const post = { id: Date.now().toString(), authorId: req.user.id, content: content.trim(), likes: [], createdAt: new Date().toISOString() };
  DB.posts.unshift(post); persist();
  res.status(201).json({ success: true, data: { ...post, author: author ? { id: author.id, username: author.username, displayName: author.displayName, emoji: author.emoji, color: author.color } : null } });
});

app.patch('/api/posts/:id/like', authMW, (req, res) => {
  const post = DB.posts.find(p => p.id === req.params.id);
  if (!post) return res.status(404).json({ success: false, message: 'Не найден' });
  const uid = req.user.id, idx = post.likes.indexOf(uid);
  if (idx === -1) post.likes.push(uid); else post.likes.splice(idx, 1);
  persist();
  res.json({ success: true, data: { liked: idx === -1, likesCount: post.likes.length } });
});

app.delete('/api/posts/:id', authMW, (req, res) => {
  const idx = DB.posts.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Не найден' });
  if (DB.posts[idx].authorId !== req.user.id) return res.status(403).json({ success: false, message: 'Нет прав' });
  DB.posts.splice(idx, 1); persist();
  res.json({ success: true });
});

// USERS
app.get('/api/users', authMW, (req, res) => {
  const { q } = req.query;
  let list = DB.users.filter(u => u.id !== req.user.id);
  if (q) { const lq = q.toLowerCase(); list = list.filter(u => u.displayName.toLowerCase().includes(lq) || u.username.toLowerCase().includes(lq)); }
  res.json({ success: true, data: list.map(safe) });
});

app.get('/api/users/:id', authMW, (req, res) => {
  const user = DB.users.find(u => u.id === req.params.id || u.username === req.params.id);
  if (!user) return res.status(404).json({ success: false, message: 'Не найден' });
  res.json({ success: true, data: safe(user) });
});

app.patch('/api/users/me/follow/:id', authMW, (req, res) => {
  const me = DB.users.find(u => u.id === req.user.id);
  const target = DB.users.find(u => u.id === req.params.id);
  if (!target) return res.status(404).json({ success: false, message: 'Не найден' });
  if (me.id === target.id) return res.status(400).json({ success: false, message: 'Нельзя на себя' });
  const already = me.following.includes(target.id);
  if (already) { me.following = me.following.filter(i => i !== target.id); target.followers = target.followers.filter(i => i !== me.id); }
  else { me.following.push(target.id); target.followers.push(me.id); }
  persist();
  res.json({ success: true, data: { following: !already, followersCount: target.followers.length } });
});

// MESSAGES
app.get('/api/messages', authMW, (req, res) => {
  const myId = req.user.id;
  const pSet = new Set();
  DB.messages.forEach(m => { if (m.from === myId) pSet.add(m.to); if (m.to === myId) pSet.add(m.from); });
  const dialogs = [];
  pSet.forEach(pid => {
    const partner = DB.users.find(u => u.id === pid);
    if (!partner) return;
    const thread = DB.messages.filter(m => (m.from===myId&&m.to===pid)||(m.from===pid&&m.to===myId)).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
    dialogs.push({ partner: safe(partner), last: thread[0], unread: thread.filter(m=>m.to===myId&&!m.read).length, updatedAt: thread[0]?.createdAt||'' });
  });
  dialogs.sort((a,b) => new Date(b.updatedAt)-new Date(a.updatedAt));
  res.json({ success: true, data: dialogs });
});

app.get('/api/messages/:userId', authMW, (req, res) => {
  const myId = req.user.id, othId = req.params.userId;
  const thread = DB.messages.filter(m=>(m.from===myId&&m.to===othId)||(m.from===othId&&m.to===myId)).sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));
  let changed = false;
  thread.forEach(m => { if (m.to===myId&&!m.read) { m.read=true; changed=true; } });
  if (changed) persist();
  res.json({ success: true, data: thread });
});

app.post('/api/messages/:userId', authMW, (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ success: false, message: 'Пустое сообщение' });
  if (text.length > 2000) return res.status(400).json({ success: false, message: 'Макс. 2000 символов' });
  const target = DB.users.find(u => u.id === req.params.userId);
  if (!target) return res.status(404).json({ success: false, message: 'Не найден' });
  if (target.id === req.user.id) return res.status(400).json({ success: false, message: 'Нельзя себе' });
  const msg = { id: Date.now().toString(), from: req.user.id, to: target.id, text: text.trim(), read: false, createdAt: new Date().toISOString() };
  DB.messages.push(msg); persist();
  res.status(201).json({ success: true, data: msg });
});

app.delete('/api/messages/msg/:msgId', authMW, (req, res) => {
  const idx = DB.messages.findIndex(m => m.id === req.params.msgId);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Не найдено' });
  if (DB.messages[idx].from !== req.user.id) return res.status(403).json({ success: false, message: 'Нет прав' });
  DB.messages.splice(idx, 1); persist();
  res.json({ success: true });
});

app.get('*', (_, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.listen(PORT, () => console.log(`✅ http://localhost:${PORT}`));
