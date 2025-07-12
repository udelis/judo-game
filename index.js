const { Telegraf } = require('telegraf');
const fs = require('fs');
const bot = new Telegraf('7257776724:AAE_ypIzhxvXDMl9jnvFxpR72Ax1HXVe1Xo');

const DATA_FILE = 'data.json';

// Завантаження даних
let data = {
  players: {},
  lastRoleDistribution: null,
  logs: [] // Додано
};


if (fs.existsSync(DATA_FILE)) {
    data = JSON.parse(fs.readFileSync(DATA_FILE));
}

function save() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}
function logAttack(attacker, target, score, result) {
    const logEntry = {
        time: new Date().toLocaleString('uk-UA'),
        attacker: attacker.username || attacker.first_name,
        target: target.username || target.first_name,
        score,
        result
    };

    if (!data.logs) data.logs = []; // 🛠️ захист від undefined

    data.logs.unshift(logEntry);
    data.logs = data.logs.slice(0, 20);
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

// /join
bot.command('join', (ctx) => {
    const id = ctx.from.id;
    if (!data.players[id]) {
        data.players[id] = {
            name: ctx.from.first_name,
            score: 0,
            achievements: {
                world: 0,
                olympic: 0,
                ukraine: 0
            },
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

// /attack
bot.command('attack', (ctx) => {
    const attacker = ctx.from;
    const reply = ctx.message.reply_to_message;
    const attackerData = data.players[attacker.id];

    if (!attackerData) return ctx.reply('Ти ще не в грі. Напиши /join');
    if (!reply) return ctx.reply('Атаку можна робити лише як reply на повідомлення іншого гравця.');
    if (reply.from.id === attacker.id) return ctx.reply('Самоатака неможлива 🤕');
    if (!data.players[reply.from.id]) return ctx.reply('Супротивник ще не в грі.');

    const today = getToday();
    if (attackerData.lastAttack === today) return ctx.reply('Ти вже атакував сьогодні! Повернись завтра.');

    const pointsOptions = [0, 1, 5, 10];
    const score = pointsOptions[Math.floor(Math.random() * pointsOptions.length)];
    const resultText = results[score][Math.floor(Math.random() * results[score].length)];

    attackerData.score += score;
    attackerData.lastAttack = today;

    const title = getTitle(attackerData.score);
    if (title) attackerData.title = title;

    const weekday = new Date().getDay(); // 0=Неділя, 3=Середа, 6=Субота
    if (score === 10) {
        if (weekday === 3) attackerData.achievements.ukraine += 1;
        if (weekday === 6) attackerData.achievements.world += 1;
        if (weekday === 0) attackerData.achievements.olympic += 1;
    }

    save();

    ctx.reply(
        `💥 ${attacker.first_name} атакував ${reply.from.first_name}!\n` +
        `🎯 ${resultText}\n` +
        `+${score} балів. Загальний рахунок: ${attackerData.score}`
        

    );
    logAttack(attacker, reply.from, score, resultText);
});

// /profile
bot.command('profile', (ctx) => {
    const player = data.players[ctx.from.id];
    if (!player) return ctx.reply('Ти ще не в грі. Напиши /join');

    const role = player.role ? `🎭 Роль: ${player.role}` : '';
    const title = player.title ? `🥋 Звання: ${player.title}` : '';
    const a = player.achievements;
    const ach = `🏅 Досягнення:
- Чемпіон України: ${a.ukraine}
- Чемпіон Світу: ${a.world}
- Олімпійський чемпіон: ${a.olympic}`;

    ctx.reply(
        `👤 ${player.name}\n` +
        `🎯 Бали: ${player.score}\n` +
        `${title}\n${role}\n\n${ach}`
    );
});

// /leaderboard
bot.command('leaderboard', (ctx) => {
    const sorted = Object.entries(data.players)
        .sort(([, a], [, b]) => b.score - a.score)
        .slice(0, 5);

    if (sorted.length === 0) return ctx.reply('Поки немає гравців.');

    let msg = '🏆 Топ гравців:\n\n';
    sorted.forEach(([id, p], i) => {
        const title = p.title ? ` (${p.title})` : '';
        msg += `${i + 1}. ${p.name} — ${p.score} балів\n`;
    });
    ctx.reply(msg);
});

// /roles — Засідання ФДУ
bot.command('roles', (ctx) => {
    const today = getToday();

    if (data.lastRoleDistribution === today) {
        return ctx.reply('Засідання ФДУ вже проводилось сьогодні. Спробуйте завтра.');
    }

    const eligible = Object.entries(data.players)
        .filter(([id, p]) => p)
        .map(([id, p]) => ({ id, name: p.name }));

    if (eligible.length < 2) {
        return ctx.reply('Потрібно хоча б 2 учасники, щоб провести засідання ФДУ.');
    }

    Object.values(data.players).forEach(player => {
        player.role = null;
    });

    const roles = ['Президент ФДУ', 'Тренер', 'Медсестра', 'Лаптєв', 'Суддя'];
    const shuffled = eligible.sort(() => 0.5 - Math.random());
    const assigned = shuffled.slice(0, roles.length);

    let result = '🎲 Розподіл ролей ФДУ на сьогодні:\n\n';

    assigned.forEach((player, index) => {
        const role = roles[index];
        data.players[player.id].role = role;
        result += `👤 ${player.name} → ${role}\n`;
    });

    data.lastRoleDistribution = today;
    save();

    ctx.reply(result);
});
function createRoleCommand(command, requiredRole, emojiReply) {
    bot.command(command, (ctx) => {
        const player = data.players[ctx.from.id];
        const reply = ctx.message.reply_to_message;

        if (!player) return ctx.reply('Ти ще не в грі. Напиши /join');
        if (player.role !== requiredRole) return ctx.reply(`Цю команду може використовувати тільки ${requiredRole}.`);
        if (!reply) return ctx.reply('Команду потрібно використовувати як reply на повідомлення іншого учасника.');

        const today = getToday();
        if (player.lastRoleAction === today) {
            return ctx.reply('Цю спецкоманду можна використовувати тільки 1 раз на добу!');
        }

        player.lastRoleAction = today;
        save();
        ctx.reply(`${emojiReply}`);
    });
}


createRoleCommand('president', 'Президент ФДУ', '✌🏻💵🥋');
createRoleCommand('trainer', 'Тренер', '🏋️‍♂️🏃‍♂️🤬');
createRoleCommand('medic', 'Медсестра', '👩‍⚕️💉🩼');
createRoleCommand('laptiev', 'Лаптєв', '📸');
createRoleCommand('judge', 'Суддя', '💻🏆🙋‍♂️');
bot.command('help', (ctx) => {
    ctx.reply(
`🎮 Команди гри:

/join — приєднатись до гри
/attack — атакувати іншого (через reply)
/log — останні атаки
/profile — твій профіль: бали, досягнення, звання, роль
/leaderboard — топ гравців
/roles — засідання ФДУ (раз на добу, якщо ≥2 гравці)

🧑‍⚖️ Спецкоманди ролей (через reply):
/president — Премія
/trainer — Настанови
/medic — Лікування
/laptiev — Зробити фото зі змагань
/judge — Провести суддівство

📅 Атакувати можна 1 раз на добу (00:00–23:59)
🥋 За бали даються звання: КМС / МС / МСМК
🏆 Досягнення: за Іппон у середу, суботу, неділю

Приємної боротьби! Борітеся - поборете!`
    );
});
bot.command('log', (ctx) => {
    if (!data.logs || data.logs.length === 0) {
        return ctx.reply('Ще не було жодної атаки.');
    }

    const messages = data.logs.slice(0, 5).map((log, i) => {
        return `#${i + 1} — ${log.attacker} → ${log.target}
🎯 ${log.result} (${log.score} балів)
🕓 ${log.time}`;
    });

    ctx.reply(messages.join('\n\n'));
});

bot.launch();
console.log('Бот запущено');
