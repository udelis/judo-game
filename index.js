const { Telegraf } = require('telegraf');
const fs = require('fs');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);

// 👇 Один раз, перед запуском
bot.telegram.setMyCommands([
  { command: 'join', description: 'Приєднатись до гри' },
  { command: 'attack', description: 'Атакувати іншого (reply)' },
  { command: 'log', description: 'Останні атаки' },
  { command: 'profile', description: 'Твій профіль' },
  { command: 'leaderboard', description: 'Топ гравців' },
  { command: 'roles', description: 'Засідання ФДУ (раз на добу)' },
  { command: 'help', description: 'Список команд' },
  { command: 'president', description: 'Команда ролі: президент' },
  { command: 'trainer', description: 'Команда ролі: тренер' },
  { command: 'medic', description: 'Команда ролі: медсестра' },
  { command: 'laptiev', description: 'Команда ролі: лаптєв' },
  { command: 'judge', description: 'Команда ролі: суддя' }
]);

// ======== DATA INIT =========
const DATA_FILE = 'data.json';

let data = { chats: {} };
if (fs.existsSync(DATA_FILE)) {
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE));
    data = { chats: {}, ...parsed };
    if (!data.chats) data.chats = {};
  } catch (err) {
    console.error('❌ Error parsing data.json:', err);
  }
}

function save() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function getChatData(chatId) {
  if (!data.chats) data.chats = {};
  if (!data.chats[chatId]) {
    data.chats[chatId] = {
      players: {},
      lastRoleDistribution: null,
      logs: []
    };
  }
  return data.chats[chatId];
}
// =============================

function logAttack(chatData, attacker, target, score, result) {
  const logEntry = {
    time: new Date().toLocaleString('uk-UA'),
    attacker: attacker.username || attacker.first_name,
    target: target.username || target.first_name,
    score,
    result
  };
  chatData.logs.unshift(logEntry);
  chatData.logs = chatData.logs.slice(0, 20);
  save();
}

const results = {
  10: ['Іппон кидком', 'Іппон больовим!', 'Іппон задушливим', 'Супротивник отримав Хансоку-маке'],
  5: ['Ваза-арі'],
  1: ['Юко'],
  0: ['Супротивник провів контрприйом!', 'Ви отримали Хансоку-маке', 'Вас дискваліфіковано за неспортивну поведінку', 'Ви отримали травму']
};

const getToday = () => new Date().toISOString().split('T')[0];

function getTitle(score) {
  if (score >= 250) return 'МСМК';
  if (score >= 100) return 'МС';
  if (score >= 50) return 'КМС';
  return null;
}

// ==================== GAME =========================

bot.hears(/^\/join(@\w+)?$/, (ctx) => {
  const chatData = getChatData(ctx.chat.id);
  const userId = ctx.from.id;

  if (!chatData.players[userId]) {
    chatData.players[userId] = {
      name: ctx.from.first_name,
      score: 0,
      achievements: { world: 0, olympic: 0, ukraine: 0 },
      lastAttack: null,
      lastRoleAction: null,
      role: null
    };
    save();
    ctx.reply(`${ctx.from.first_name} приєднався до гри!`);
  } else {
    ctx.reply(`Ти вже в грі, ${ctx.from.first_name}!`);
  }
});

bot.hears(/^\/attack(@\w+)?$/, (ctx) => {
  const chatData = getChatData(ctx.chat.id);
  const attacker = ctx.from;
  const attackerData = chatData.players[attacker.id];
  const reply = ctx.message.reply_to_message;

  if (!attackerData) return ctx.reply('Ти ще не в грі. Напиши /join');
  if (!reply) return ctx.reply('Атаку можна робити лише як reply.');
  if (reply.from.id === attacker.id) return ctx.reply('Самоатака неможлива 🤕');
  if (!chatData.players[reply.from.id]) return ctx.reply('Супротивник ще не в грі.');

  const today = getToday();
  if (attackerData.lastAttack === today) return ctx.reply('Ти вже атакував сьогодні!');

  const score = [0, 1, 5, 10][Math.floor(Math.random() * 4)];
  const resultText = results[score][Math.floor(Math.random() * results[score].length)];

  attackerData.score += score;
  attackerData.lastAttack = today;

  const title = getTitle(attackerData.score);
  if (title) attackerData.title = title;

  const weekday = new Date().getDay();
  if (score === 10) {
    if (weekday === 3) attackerData.achievements.ukraine++;
    if (weekday === 6) attackerData.achievements.world++;
    if (weekday === 0) attackerData.achievements.olympic++;
  }

  save();
  logAttack(chatData, attacker, reply.from, score, resultText);

  ctx.reply(`💥 ${attacker.first_name} атакував ${reply.from.first_name}!\n🎯 ${resultText}\n+${score} балів. Загальний рахунок: ${attackerData.score}`);
});

bot.hears(/^\/profile(@\w+)?$/, (ctx) => {
  const chatData = getChatData(ctx.chat.id);
  const player = chatData.players[ctx.from.id];
  if (!player) return ctx.reply('Ти ще не в грі. Напиши /join');

  const a = player.achievements;
  ctx.reply(`👤 ${player.name}
🎯 Бали: ${player.score}
${player.title ? `🥋 Звання: ${player.title}\n` : ''}${player.role ? `🎭 Роль: ${player.role}\n` : ''}

🏅 Досягнення:
- Чемпіон України: ${a.ukraine}
- Чемпіон Світу: ${a.world}
- Олімпійський чемпіон: ${a.olympic}`);
});

bot.hears(/^\/leaderboard(@\w+)?$/, (ctx) => {
  const chatData = getChatData(ctx.chat.id);
  const sorted = Object.entries(chatData.players).sort(([, a], [, b]) => b.score - a.score).slice(0, 5);

  if (!sorted.length) return ctx.reply('Поки немає гравців.');
  let msg = `🏆 Топ гравців:\n\n`;
  sorted.forEach(([id, p], i) => {
    msg += `${i + 1}. ${p.name} — ${p.score} балів\n`;
  });
  ctx.reply(msg);
});

bot.hears(/^\/log(@\w+)?$/, (ctx) => {
  const chatData = getChatData(ctx.chat.id);
  if (!chatData.logs.length) return ctx.reply('Ще не було жодної атаки.');

  const messages = chatData.logs.slice(0, 5).map((log, i) =>
    `#${i + 1} — ${log.attacker} → ${log.target}\n🎯 ${log.result} (${log.score} балів)\n🕓 ${log.time}`
  );
  ctx.reply(messages.join('\n\n'));
});

bot.hears(/^\/roles(@\w+)?$/, (ctx) => {
  const chatData = getChatData(ctx.chat.id);
  const today = getToday();

  if (chatData.lastRoleDistribution === today) {
    return ctx.reply('Засідання ФДУ вже проводилось сьогодні.');
  }

  const eligible = Object.entries(chatData.players).map(([id, p]) => ({ id, name: p.name }));
  if (eligible.length < 2) return ctx.reply('Потрібно ≥2 учасники.');

  Object.values(chatData.players).forEach(p => p.role = null);

  const roles = ['Президент ФДУ', 'Тренер', 'Медсестра', 'Лаптєв', 'Суддя'];
  const shuffled = eligible.sort(() => 0.5 - Math.random());
  const assigned = shuffled.slice(0, roles.length);

  let result = '🎲 Розподіл ролей ФДУ на сьогодні:\n\n';
  assigned.forEach((p, i) => {
    chatData.players[p.id].role = roles[i];
    result += `👤 ${p.name} → ${roles[i]}\n`;
  });

  chatData.lastRoleDistribution = today;
  save();
  ctx.reply(result);
});

function createRoleCommand(command, requiredRole, emojiReply) {
  bot.hears(new RegExp(`^/${command}(@\\w+)?$`), (ctx) => {
    const chatData = getChatData(ctx.chat.id);
    const player = chatData.players[ctx.from.id];
    const reply = ctx.message.reply_to_message;

    if (!player) return ctx.reply('Ти ще не в грі. Напиши /join');
    if (player.role !== requiredRole) return ctx.reply(`Цю команду може лише ${requiredRole}.`);
    if (!reply) return ctx.reply('Використай команду як reply.');

    const today = getToday();
    if (player.lastRoleAction === today) return ctx.reply('Ти вже використовував свою роль сьогодні.');

    player.lastRoleAction = today;
    save();
    ctx.reply(emojiReply);
  });
}

createRoleCommand('president', 'Президент ФДУ', '✌🏻💵🥋');
createRoleCommand('trainer', 'Тренер', '🏋️‍♂️🏃‍♂️🤬');
createRoleCommand('medic', 'Медсестра', '👩‍⚕️💉🩼');
createRoleCommand('laptiev', 'Лаптєв', '📸');
createRoleCommand('judge', 'Суддя', '💻🏆🙋‍♂️');

bot.hears(/^\/help(@\w+)?$/, (ctx) => {
  ctx.reply(`🎮 Команди гри:

/join — приєднатись до гри
/attack — атакувати іншого (відповіддю на його коммент)
/log — останні атаки
/profile — твій профіль
/leaderboard — топ гравців
/roles — Провести засідання ФДУ (раз на добу)

🧑‍⚖️ Команди ролей (reply):
/president — заплатити премію
/trainer — дати настанови
/medic — полікувати травму
/laptiev — сфототографувати
/judge — оцінити сутичку

📅 1 атака на добу
🥋 Звання за значну кількість перемог: КМС / МС / МСМК
🏆 Досягнення за: Іппон в середу, суботу, неділю`);
});

// ====================== ERRORS ========================
bot.catch((err, ctx) => {
  console.error('❌ Unhandled error while processing update', err);
  ctx.reply('⚠️ Сталася помилка. Спробуй пізніше.');
});

bot.launch();
console.log('✅ Бот запущено');
