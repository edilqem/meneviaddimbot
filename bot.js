const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const schedule = require('node-schedule');

// =============================================
// CONFIG - CHANGE HERE
// =============================================
const CONFIG = {
  TOKEN: '8979500063:AAG0EgyPhv4IZt6953vwpyFgmWJlrNSaIFM',       // Your token from BotFather
  ADMIN_ID: 737032371,                   // Your Telegram ID (number)
  CHANNEL_ID: '@meneviaddim',             // Channel @name or -100xxxxxxxxxx ID
  WEEKLY_REPORT_DAY: 5,                 // 1=Monday ... 7=Sunday (5=Friday)
  WEEKLY_REPORT_HOUR: 20,               // Report hour (24h format)
  WEEKLY_REPORT_MINUTE: 0,
};
// =============================================

const bot = new TelegramBot(CONFIG.TOKEN, { polling: true });
const DB_FILE = path.join(__dirname, 'data.json');
 
function loadData() {
  if (!fs.existsSync(DB_FILE)) {
    return { options: [], members: {}, weeklyLog: [], lastWeekLog: [], assignmentPool: [] };
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}
 
function saveData(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}
 
function isAdmin(userId) {
  return userId === CONFIG.ADMIN_ID;
}
 
function buildPool(data) {
  if (data.assignmentPool.length === 0) {
    data.assignmentPool = [...Array(data.options.length).keys()];
    for (let i = data.assignmentPool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [data.assignmentPool[i], data.assignmentPool[j]] = [data.assignmentPool[j], data.assignmentPool[i]];
    }
  }
}
 
function assignOption(data, userId, userName) {
  if (!data.options.length) return null;
  if (!data.members[userId]) {
    data.members[userId] = { name: userName, assignments: [], completed: [], pending: [] };
  }
  buildPool(data);
  let optionIndex = null;
  for (let i = 0; i < data.assignmentPool.length; i++) {
    const idx = data.assignmentPool[i];
    if (!data.members[userId].assignments.includes(idx)) {
      optionIndex = idx;
      data.assignmentPool.splice(i, 1);
      break;
    }
  }
  if (optionIndex === null) {
    data.members[userId].assignments = [];
    buildPool(data);
    optionIndex = data.assignmentPool.shift();
  }
  data.members[userId].assignments.push(optionIndex);
  data.members[userId].pending.push(optionIndex);
  return optionIndex;
}
 
// ---- USER COMMANDS ----
 
bot.onText(/\/start/, (msg) => {
  const userId = msg.from.id;
  const name = msg.from.first_name;
  const data = loadData();
  if (!data.members[userId]) {
    data.members[userId] = { name: name, assignments: [], completed: [], pending: [] };
    saveData(data);
  }
  bot.sendMessage(userId,
    `Salam, ${name}! 🌙\n\n` +
    `Admin hər kəs üçün həftəlik tapşırığı paylaşacaq.\n\n` +
    `Tapşırıq paylaşıldıqdan sonra:\n` +
    `• Bu səhifədə /mytask yazıb öz tapşırığını görə bilərsən\n` +
    `• Tapşırıq həmçinin kanalda da əks olunacaq\n\n` +
    `Tapşırığı tamamladıqda /done ✅\n` +
    `Tamamlaya bilmədikdə /notdone ❌`
  );
});
 
bot.onText(/\/mytask/, (msg) => {
  const userId = msg.from.id;
  const data = loadData();
  const member = data.members[userId];
 
  if (!member || member.pending.length === 0) {
    return bot.sendMessage(userId, '⏳ Hələ tapşırığın yoxdur. Admin tapşırıqları paylaşana qədər gözlə.');
  }
 
  const idx = member.pending[member.pending.length - 1];
  bot.sendMessage(userId, `📋 Bu həftəki tapşırığın:\n\n*${data.options[idx]}*\n\nBitirdikdə /done yazın ✅`, { parse_mode: 'Markdown' });
});
 
bot.onText(/\/done/, (msg) => {
  const userId = msg.from.id;
  const data = loadData();
  const member = data.members[userId];
 
  if (!member || member.pending.length === 0) {
    return bot.sendMessage(userId, 'Aktiv tapşırığın yoxdur. /mytask yazın.');
  }
 
  const idx = member.pending.pop();
  member.completed.push(idx);
  data.weeklyLog.push({ userId, name: member.name, optionIndex: idx, result: 'done', date: new Date().toISOString() });
  saveData(data);
  bot.sendMessage(userId, '✅ Əla! Tapşırığı tamamladın. Allah qəbul etsin! 🤲');
});
 
bot.onText(/\/notdone/, (msg) => {
  const userId = msg.from.id;
  const data = loadData();
  const member = data.members[userId];
 
  if (!member || member.pending.length === 0) {
    return bot.sendMessage(userId, 'Aktiv tapşırığın yoxdur. /mytask yazın.');
  }
 
  const idx = member.pending[member.pending.length - 1];
  data.weeklyLog.push({ userId, name: member.name, optionIndex: idx, result: 'missed', date: new Date().toISOString() });
  saveData(data);
  bot.sendMessage(userId, '❌ Problem deyil. Növbəti həftə bu tapşırıq yenə sənə veriləcək. Uğurlar! 💪');
});
 
// =============================================
// ADMIN COMMANDS
// =============================================
 
bot.onText(/\/admin/, (msg) => {
  if (!isAdmin(msg.from.id)) return;
  bot.sendMessage(msg.chat.id,
    `🔧 *Admin Panel*\n\n` +
    `/addoption [text] - Tapşırıq əlavə et\n` +
    `/listoption - Bütün tapşırıqları gör\n` +
    `/deloption [number] - Tapşırıq sil\n` +
    `/send - Kanala tapşırıqları paylaş\n` +
    `/report - Həftəlik hesabat göndər\n` +
    `/members - Qeydiyyatlı üzvlər\n` +
    `/reset - Yeni həftəyə sıfırla`,
    { parse_mode: 'Markdown' }
  );
});
 
bot.onText(/\/addoption (.+)/, (msg, match) => {
  if (!isAdmin(msg.from.id)) return;
  const text = match[1].trim();
  const data = loadData();
  data.options.push(text);
  saveData(data);
  bot.sendMessage(msg.chat.id, `✅ Tapşırıq əlavə edildi (#${data.options.length}): ${text}`);
});
 
bot.onText(/\/listoption/, (msg) => {
  if (!isAdmin(msg.from.id)) return;
  const data = loadData();
  if (!data.options.length) return bot.sendMessage(msg.chat.id, 'Heç bir tapşırıq yoxdur.');
  const list = data.options.map((o, i) => `${i + 1}. ${o}`);
  let chunk = `📋 *Tapşırıq siyahısı (${data.options.length} ədəd):*\n\n`;
  for (const line of list) {
    if ((chunk + line + '\n').length > 3800) {
      bot.sendMessage(msg.chat.id, chunk, { parse_mode: 'Markdown' });
      chunk = '';
    }
    chunk += line + '\n';
  }
  if (chunk) bot.sendMessage(msg.chat.id, chunk, { parse_mode: 'Markdown' });
});
 
bot.onText(/\/deloption (\d+)/, (msg, match) => {
  if (!isAdmin(msg.from.id)) return;
  const idx = parseInt(match[1]) - 1;
  const data = loadData();
  if (idx < 0 || idx >= data.options.length) return bot.sendMessage(msg.chat.id, '❌ Yanlış nömrə.');
  const removed = data.options.splice(idx, 1);
  saveData(data);
  bot.sendMessage(msg.chat.id, `🗑 Silindi: ${removed[0]}`);
});
 
bot.onText(/\/send/, async (msg) => {
  if (!isAdmin(msg.from.id)) return;
  const data = loadData();
  if (!data.options.length) return bot.sendMessage(msg.chat.id, '⚠️ Tapşırıq siyahısı boşdur!');
  if (!Object.keys(data.members).length) return bot.sendMessage(msg.chat.id, '⚠️ Heç bir üzv yoxdur! Üzvlər əvvəlcə şəxsidə /start yazmalıdır.');
 
  let mesaj = `🌙 *Bu həftəki tapşırıqlar:*\n\n`;
 
  for (const [userId, member] of Object.entries(data.members)) {
    const optionIndex = assignOption(data, userId, member.name);
    mesaj += `👤 ${member.name}: *${data.options[optionIndex]}*\n`;
  }
 
  mesaj += `\nTapşırığını görmək üçün bota şəxsi /mytask yazın.\nTamamladıqda /done ✅, tamamlamadıqda /notdone ❌`;
 
  try {
    await bot.sendMessage(CONFIG.CHANNEL_ID, mesaj, { parse_mode: 'Markdown' });
    saveData(data);
    bot.sendMessage(msg.chat.id, '✅ Kanal mesajı göndərildi!');
  } catch (e) {
    bot.sendMessage(msg.chat.id, '❌ Kanala göndərmək olmadı: ' + e.message);
  }
});
 
bot.onText(/\/members/, (msg) => {
  if (!isAdmin(msg.from.id)) return;
  const data = loadData();
  const members = Object.entries(data.members);
  if (!members.length) return bot.sendMessage(msg.chat.id, 'Heç bir üzv yoxdur.');
  const list = members.map(([id, m]) =>
    `👤 ${m.name} (ID: ${id}) - Tamamlanan: ${m.completed.length}`
  ).join('\n');
  bot.sendMessage(msg.chat.id, `*Üzvlər (${members.length} nəfər):*\n\n${list}`, { parse_mode: 'Markdown' });
});
 
bot.onText(/\/reset/, (msg) => {
  if (!isAdmin(msg.from.id)) return;
  const data = loadData();
  data.lastWeekLog = [...data.weeklyLog];
  data.weeklyLog = [];
  data.assignmentPool = [];
  for (const member of Object.values(data.members)) {
    member.assignments = [];
    member.pending = [];
  }
  saveData(data);
  bot.sendMessage(msg.chat.id, '✅ Sıfırlandı. Yeni həftə başlayır!');
});
 
// ---- WEEKLY REPORT ----
async function sendWeeklyReport() {
  const data = loadData();
  const done = data.weeklyLog.filter(l => l.result === 'done');
  const missed = data.weeklyLog.filter(l => l.result === 'missed');
 
  let report = `📊 *Həftəlik Hesabat*\n\n`;
  report += `✅ Tamamlayanlar (${done.length}):\n`;
  done.forEach(l => { report += `  • ${l.name}: ${data.options[l.optionIndex] || '?'}\n`; });
 
  if (missed.length) {
    report += `\n❌ Tamamlamayanlar (${missed.length}):\n`;
    missed.forEach(l => { report += `  • ${l.name}: ${data.options[l.optionIndex] || '?'} (növbəti həftə yenə veriləcək)\n`; });
  }
 
  report += `\n📅 Növbəti həftə tapşırıqlar /send ilə göndəriləcək.`;
 
  try {
    await bot.sendMessage(CONFIG.CHANNEL_ID, report, { parse_mode: 'Markdown' });
  } catch (e) {
    console.log('Kanala göndərmək olmadı:', e.message);
  }
  try {
    await bot.sendMessage(CONFIG.ADMIN_ID, report, { parse_mode: 'Markdown' });
  } catch (e) {}
 
  data.lastWeekLog = [...data.weeklyLog];
  data.weeklyLog = [];
  data.assignmentPool = [];
  for (const member of Object.values(data.members)) {
    member.assignments = [];
    member.pending = [];
  }
  saveData(data);
}
 
bot.onText(/\/report/, (msg) => {
  if (!isAdmin(msg.from.id)) return;
  sendWeeklyReport();
  bot.sendMessage(msg.chat.id, '📊 Hesabat göndərildi.');
});
 
schedule.scheduleJob(
  { dayOfWeek: CONFIG.WEEKLY_REPORT_DAY, hour: CONFIG.WEEKLY_REPORT_HOUR, minute: CONFIG.WEEKLY_REPORT_MINUTE },
  sendWeeklyReport
);
 
console.log('✅ Bot işə düşdü!');

