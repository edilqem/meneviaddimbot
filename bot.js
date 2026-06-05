const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const schedule = require('node-schedule');

// =============================================
// CONFIG - CHANGE HERE
// =============================================
const CONFIG = {
  TOKEN: '8979500063:AAH84i-uX1x85eAHSMfvbu1t6uhBta_5RvQ',
  ADMIN_ID: 737032371,
  CHANNEL_ID: '@meneviaddim',
};

// İcazə üçün minimum gözləmə müddəti (gün)
const ICAZE_COOLDOWN_DAYS = 21; // 3 həftə
// =============================================

const bot = new TelegramBot(CONFIG.TOKEN, { polling: true });
const DB_FILE = path.join(__dirname, 'data.json');

// ---- DATABASE ----
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
    data.members[userId] = { name: userName, assignments: [], completed: [], pending: [], streak: 0, missedCount: 0, penalized: false, awaitingReason: false, awaitingPenalty: false, lastIcaze: null };
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

// İcazə cooldown yoxlaması: neçə gün qalıb? (0 = istifadə edə bilər)
function icazeQalanGun(member) {
  if (!member.lastIcaze) return 0;
  const kecenGun = (Date.now() - new Date(member.lastIcaze).getTime()) / (1000 * 60 * 60 * 24);
  if (kecenGun >= ICAZE_COOLDOWN_DAYS) return 0;
  return Math.ceil(ICAZE_COOLDOWN_DAYS - kecenGun);
}

// ---- USER COMMANDS ----

bot.onText(/\/start/, (msg) => {
  const userId = msg.from.id;
  const name = msg.from.first_name;
  const data = loadData();
  if (!data.members[userId]) {
    data.members[userId] = { name, assignments: [], completed: [], pending: [], streak: 0, missedCount: 0, penalized: false, awaitingReason: false, awaitingPenalty: false, lastIcaze: null };
    saveData(data);
  }
  bot.sendMessage(userId,
    `Salam, ${name}! 🌙\n\n` +
    `Admin hər həftə Cümə günü tapşırıqları paylaşacaq.\n\n` +
    `Tapşırıq paylaşıldıqdan sonra:\n` +
    `• Bu səhifədə /addim yazıb öz tapşırığını görə bilərsən\n` +
    `• Tapşırıq həmçinin kanalda da əks olunacaq\n\n` +
    `Tapşırığı tamamladıqda /etdim ✅\n` +
    `Tamamlaya bilmədikdə /etmedim ❌\n` +
    `İstirahət lazımdırsa /icaze 🏖 (minimum 3 həftədən bir)`
  );
});

bot.onText(/\/addim/, (msg) => {
  const userId = msg.from.id;
  const data = loadData();
  const member = data.members[userId];

  if (!member || member.pending.length === 0) {
    return bot.sendMessage(userId, '⏳ Hələ tapşırığın yoxdur. Admin tapşırıqları paylaşana qədər gözlə.');
  }

  if (member.awaitingPenalty) {
    return bot.sendMessage(userId,
      `⚠️ Cəza tapşırığını yerinə yetirməlisən:\n\n` +
      `*1 gün nafile oruc tut* və ya *bir günün bir adama yetən yeməyi qədər sədəqə ver*\n\n` +
      `Etdikdən sonra /etdim yaz.`, { parse_mode: 'Markdown' }
    );
  }

  const idx = member.pending[member.pending.length - 1];
  bot.sendMessage(userId,
    `📋 Bu həftəki tapşırığın:\n\n*${data.options[idx]}*\n\n` +
    `Bitirdikdə /etdim ✅\nEdə bilmədikdə /etmedim ❌\n` +
    `İstirahət lazımdırsa /icaze 🏖`, { parse_mode: 'Markdown' });
});

// ---- İCAZƏ ----
bot.onText(/\/icaze/, (msg) => {
  const userId = msg.from.id;
  const data = loadData();
  const member = data.members[userId];

  // Aktiv tapşırıq yoxdursa
  if (!member || member.pending.length === 0) {
    return bot.sendMessage(userId, '⏳ Aktiv tapşırığın yoxdur. İcazə yalnız aktiv tapşırıq olanda istifadə oluna bilər.');
  }

  // Cəza gözləyənlər icazə ala bilməz
  if (member.awaitingPenalty) {
    return bot.sendMessage(userId,
      `⚠️ Cəza tapşırığı gözləyirsən — icazə istifadə edə bilməzsən.\n\n` +
      `*1 gün nafile oruc tut* və ya *bir günün bir adama yetən yeməyi qədər sədəqə ver*, sonra /etdim yaz.`,
      { parse_mode: 'Markdown' }
    );
  }

  // Artıq /etmedim yazıbsa (səbəb gözlənilir)
  if (member.awaitingReason) {
    return bot.sendMessage(userId, '❌ Artıq /etmedim yazmısan, bu həftə icazə istifadə edə bilməzsən. Səbəbini yaz (1, 2, 3 və ya 4).');
  }

  // Bu həftə artıq "etmədim" qeydə alınıbsa
  const missedThisWeek = data.weeklyLog.some(l => l.userId === userId && l.result === 'missed');
  if (missedThisWeek) {
    return bot.sendMessage(userId, '❌ Bu həftə tapşırığı etmədiyini artıq bildirmisən — icazə istifadə edə bilməzsən.');
  }

  // 3 həftəlik cooldown yoxlaması
  const qalan = icazeQalanGun(member);
  if (qalan > 0) {
    return bot.sendMessage(userId,
      `⏳ İcazədən sonra minimum 3 həftə keçməlidir.\n\nNövbəti icazəyə qalan: *${qalan} gün*`,
      { parse_mode: 'Markdown' }
    );
  }

  // İcazə qəbul edildi ✅
  const idx = member.pending.pop();
  member.lastIcaze = new Date().toISOString();
  member.awaitingReason = false;
  // streak dondurulur — nə artır, nə sıfırlanır

  data.weeklyLog.push({ userId, name: member.name, optionIndex: idx, result: 'icaze', streak: member.streak || 0, date: new Date().toISOString() });
  saveData(data);

  // Kanalda şəffaf bildiriş
  bot.sendMessage(CONFIG.CHANNEL_ID,
    `🏖 *${member.name}* bu həftə icazə götürdü. Davamlılığı qorunur. 👍`,
    { parse_mode: 'Markdown' }
  );

  bot.sendMessage(userId,
    `🏖 İcazən qəbul edildi!\n\n` +
    `Bu həftəki tapşırıq sayılmayacaq və davamlılığın (*${member.streak || 0} həftə*) qorunur.\n\n` +
    `⏳ Növbəti icazəni minimum *3 həftə* sonra istifadə edə bilərsən.`,
    { parse_mode: 'Markdown' }
  );
});

bot.onText(/\/etdim/, (msg) => {
  const userId = msg.from.id;
  const data = loadData();
  const member = data.members[userId];

  if (!member || member.pending.length === 0) {
    return bot.sendMessage(userId, 'Aktiv tapşırığın yoxdur. /addim yazın.');
  }
  
  if (member.awaitingReason || member.missedCount > 0 && !member.awaitingPenalty) {
    return bot.sendMessage(userId, '❌ Bu həftə tapşırığı etmədiyini bildirmişdin. Növbəti həftə yeni tapşırıq veriləcək.');
  }
  
  if (member.awaitingPenalty) {
    // Cəzanı etdi
    member.awaitingPenalty = false;
    member.penalized = false;
    member.missedCount = 0;
    member.streak = 0;
    saveData(data);

    // Kanalda xəbər ver
    bot.sendMessage(CONFIG.CHANNEL_ID,
      `✅ *${member.name}* cəza tapşırığını yerinə yetirdi. Növbəti həftə yeni tapşırıq veriləcək. 💪`,
      { parse_mode: 'Markdown' }
    );
    return bot.sendMessage(userId, '✅ Cəza tapşırığını tamamladın! Növbəti həftə yeni tapşırıq veriləcək. Allah qəbul etsin! 🤲');
  }

  const idx = member.pending.pop();
  member.completed.push(idx);
  member.streak = (member.streak || 0) + 1;
  member.missedCount = 0;
  member.penalized = false;
  member.awaitingReason = false;

  data.weeklyLog.push({ userId, name: member.name, optionIndex: idx, result: 'done', streak: member.streak, date: new Date().toISOString() });
  saveData(data);
  bot.sendMessage(userId, `✅ Əla! Tapşırığı tamamladın. Allah qəbul etsin! 🤲\n\n🔥 Davamlılıq: *${member.streak} həftə*`, { parse_mode: 'Markdown' });
});

bot.onText(/\/etmedim/, (msg) => {
  const userId = msg.from.id;
  const data = loadData();
  const member = data.members[userId];

  if (!member || member.pending.length === 0) {
    return bot.sendMessage(userId, 'Aktiv tapşırığın yoxdur. /addim yazın.');
  }

  if (member.awaitingPenalty) {
    return bot.sendMessage(userId,
      `⚠️ Cəza tapşırığını hələ yerinə yetirməmisən!\n\n` +
      `*1 gün nafile oruc tut* və ya *bir günün bir adama yetən yeməyi qədər sədəqə ver*\n\n` +
      `Etdikdən sonra /etdim yaz.`, { parse_mode: 'Markdown' }
    );
  }

  member.missedCount = (member.missedCount || 0) + 1;
  member.streak = 0;

  if (member.missedCount === 1) {
    // Birinci dəfə - səbəb soruş
    member.awaitingReason = true;
    saveData(data);
    bot.sendMessage(userId,
      `😔 Problem deyil, növbəti həftə yenə şansın var! 💪\n\n` +
      `Səbəbini bizimləm paylaş — bu kanalda hamı üçün faydalı olar:\n\n` +
      `1️⃣ Vaxtım olmadı\n` +
      `2️⃣ Unutdum\n` +
      `3️⃣ Çətin idi\n` +
      `4️⃣ Başqa səbəb\n\n` +
      `Rəqəmi yaz (1, 2, 3 və ya 4)`
    );
  } else {
    // İkinci dəfə - cəza
    member.awaitingPenalty = true;
    member.awaitingReason = false;
    const idx = member.pending[member.pending.length - 1];
    saveData(data);

    // Kanalda elan et
    bot.sendMessage(CONFIG.CHANNEL_ID,
      `⚠️ *${member.name}* bu tapşırığı ikinci dəfə ardıcıl yerinə yetirmədi.\n\n` +
      `📋 Tapşırıq: _${data.options[idx]}_\n\n` +
      `Cəza olaraq: *1 gün nafile oruc tutmalı* və ya *bir günün bir adama yetən yeməyi qədər sədəqə verməlidir.*`,
      { parse_mode: 'Markdown' }
    );

    bot.sendMessage(userId,
      `❌ Bu tapşırığı ikinci dəfə yerinə yetirmədin.\n\n` +
      `Cəza olaraq:\n*1 gün nafile oruc tut* və ya *bir günün bir adama yetən yeməyi qədər sədəqə ver*\n\n` +
      `Etdikdən sonra /etdim yaz.`, { parse_mode: 'Markdown' }
    );
  }
});

// Səbəb cavabını tut
bot.on('message', (msg) => {
  if (!msg.text) return;
  if (msg.text.startsWith('/')) return;

  const userId = msg.from.id;
  const data = loadData();
  const member = data.members[userId];

  if (!member || !member.awaitingReason) return;

  const reasons = { '1': 'Vaxtım olmadı', '2': 'Unutdum', '3': 'Çətin idi', '4': 'Başqa səbəb' };
  const reason = reasons[msg.text.trim()] || msg.text.trim();
  const idx = member.pending[member.pending.length - 1];

  member.awaitingReason = false;
  data.weeklyLog.push({ userId, name: member.name, optionIndex: idx, result: 'missed', reason, streak: 0, date: new Date().toISOString() });
  saveData(data);

  // Kanalda elan et
  bot.sendMessage(CONFIG.CHANNEL_ID,
    `❌ *${member.name}* bu həftəki tapşırığı tamamlaya bilmədi.\n` +
    `📋 Tapşırıq: _${data.options[idx]}_\n` +
    `💬 Səbəb: ${reason}\n\n` +
    `Növbəti həftə eyni tapşırıq yenə veriləcək. 💪`,
    { parse_mode: 'Markdown' }
  );

  bot.sendMessage(userId, '✅ Səbəbin qeyd edildi. Növbəti həftə yenə cəhd et! 💪');
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
  await doWeeklySend();
  bot.sendMessage(msg.chat.id, '✅ Kanal mesajı göndərildi!');
});

async function doWeeklySend() {
  const data = loadData();
  if (!data.options.length || !Object.keys(data.members).length) return;

  let mesaj = `🌙 *Salam Aleykum, Cüməniz mübarək!* 🤲\n\n*Bu həftəki tapşırıqlar:*\n\n`;
  for (const [userId, member] of Object.entries(data.members)) {
    if (member.awaitingPenalty) {
      mesaj += `👤 ${member.name}: ⚠️ _Cəza tapşırığı gözləyir_\n`;
      continue;
    }
    const optionIndex = assignOption(data, userId, member.name);
    mesaj += `👤 ${member.name}: *${data.options[optionIndex]}*\n`;
  }
  mesaj += `\nTapşırığını görmək üçün bota şəxsi /addim yazın.\n` +
    `Tamamladıqda /etdim ✅, tamamlamadıqda /etmedim ❌\n\n` +
    `🏖 İstirahət lazımdırsa /icaze yazıb həmin həftə tapşırığı etməyə bilərsiniz (icazədən sonra minimum 3 həftə keçməlidir).`;

  try {
    await bot.sendMessage(CONFIG.CHANNEL_ID, mesaj, { parse_mode: 'Markdown' });
    saveData(data);
    console.log('✅ Həftəlik tapşırıqlar göndərildi');
  } catch (e) {
    console.log('Send xətası:', e.message);
  }
}

bot.onText(/\/members/, (msg) => {
  if (!isAdmin(msg.from.id)) return;
  const data = loadData();
  const members = Object.entries(data.members);
  if (!members.length) return bot.sendMessage(msg.chat.id, 'Heç bir üzv yoxdur.');
  const list = members.map(([id, m]) => {
    const qalan = icazeQalanGun(m);
    const icazeText = qalan > 0 ? ` | İcazə: ${qalan} gün sonra` : ' | İcazə: ✅';
    return `👤 ${m.name} (ID: ${id}) - Davamlılıq: ${m.streak || 0} | Tamamlanan: ${m.completed.length}${icazeText}`;
  }).join('\n');
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
    member.awaitingReason = false;
  }
  saveData(data);
  bot.sendMessage(msg.chat.id, '✅ Sıfırlandı. Yeni həftə başlayır!');
});

// ---- WEEKLY REPORT ----
async function sendWeeklyReport() {
  const data = loadData();
  const done = data.weeklyLog.filter(l => l.result === 'done');
  const missed = data.weeklyLog.filter(l => l.result === 'missed');
  const icaze = data.weeklyLog.filter(l => l.result === 'icaze');
  const penalized = Object.values(data.members).filter(m => m.awaitingPenalty);

  // Streak sıralaması - ən çox ardıcıl edənlər yuxarıda
  const doneSorted = [...done].sort((a, b) => (b.streak || 0) - (a.streak || 0));

  let report = `📊 *Həftəlik Hesabat*\n\n`;

  report += `✅ *Tamamlayanlar (${done.length}):*\n`;
  doneSorted.forEach(l => {
    const streakText = l.streak > 1 ? ` 🔥 ${l.streak} həftə ardıcıl` : '';
    report += `  • ${l.name}: _${data.options[l.optionIndex] || '?'}_${streakText}\n`;
  });

  if (icaze.length) {
    report += `\n🏖 *İcazəlilər (${icaze.length}):*\n`;
    icaze.forEach(l => {
      report += `  • ${l.name} — bu həftə icazədə idi (davamlılığı qorunur: ${l.streak} həftə)\n`;
    });
  }

  if (missed.length) {
    report += `\n❌ *Tamamlamayanlar (${missed.length}):*\n`;
    missed.forEach(l => {
      const reasonText = l.reason ? ` — Səbəb: ${l.reason}` : '';
      report += `  • ${l.name}: _${data.options[l.optionIndex] || '?'}_${reasonText}\n`;
    });
  }

  if (penalized.length) {
    report += `\n⚠️ *Cəzalılar (${penalized.length}):*\n`;
    penalized.forEach(m => {
      report += `  • ${m.name} — 2 dəfə ardıcıl yerinə yetirmədi\n`;
    });
  }

  // Səbəb statistikası
  const reasons = missed.filter(l => l.reason).map(l => l.reason);
  if (reasons.length) {
    const reasonCount = {};
    reasons.forEach(r => { reasonCount[r] = (reasonCount[r] || 0) + 1; });
    report += `\n📈 *Səbəb statistikası:*\n`;
    Object.entries(reasonCount).forEach(([r, c]) => {
      report += `  • ${r}: ${c} nəfər\n`;
    });
  }

  report += `\n📅 Növbəti Cümə tapşırıqlar yenilənəcək.`;

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
    if (!member.awaitingPenalty) {
      member.assignments = [];
      member.pending = [];
    }
    member.awaitingReason = false;
  }
  saveData(data);
}

bot.onText(/\/report/, (msg) => {
  if (!isAdmin(msg.from.id)) return;
  sendWeeklyReport();
  bot.sendMessage(msg.chat.id, '📊 Hesabat göndərildi.');
});

// Cümə saat 12:00 (Bakı vaxtı) - tapşırıq paylaş
schedule.scheduleJob({ dayOfWeek: 5, hour: 12, minute: 0, tz: 'Asia/Baku' }, doWeeklySend);

// Cümə axşamı saat 22:00 (Bakı vaxtı) - hesabat
schedule.scheduleJob({ dayOfWeek: 4, hour: 22, minute: 0, tz: 'Asia/Baku' }, sendWeeklyReport);

// Cümə axşamı saat 10:00 (Bakı vaxtı) - xatırlatma
schedule.scheduleJob({ dayOfWeek: 4, hour: 10, minute: 0, tz: 'Asia/Baku' }, async () => {
  const data = loadData();
  const pending = Object.values(data.members).filter(m => m.pending.length > 0 && !m.awaitingPenalty);
  if (!pending.length) return;

  const names = pending.map(m => `• ${m.name}`).join('\n');
  try {
    await bot.sendMessage(CONFIG.CHANNEL_ID,
      `⏰ *Xatırlatma!*\n\nHəftənin son günüdür! Tapşırığını hələ tamamlamayan üzvlər:\n\n${names}\n\nTapşırığını bitirmək üçün son şansın! 💪`,
      { parse_mode: 'Markdown' }
    );
  } catch (e) {
    console.log('Xatırlatma xətası:', e.message);
  }
});

console.log('✅ Bot işə düşdü!');
