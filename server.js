const express = require('express');
const crypto = require('crypto');
const app = express();

app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  next();
});

// ─── Настройки ───────────────────────────────
const APP_ID = 54508543;
const APP_SECRET = process.env.VK_APP_SECRET || 'ВСТАВЬ_СЕКРЕТНЫЙ_КЛЮЧ_ВК';
const PORT = process.env.PORT || 3000;

// ─── Хранилище транзакций (в памяти, для теста) ──
const transactions = [];

// ─── Проверка подписи от ВК ──────────────────────
function verifySignature(params) {
  const { sig, ...rest } = params;
  const sorted = Object.keys(rest).sort().map(k => `${k}=${rest[k]}`).join('&');
  const hash = crypto.createHash('md5').update(sorted + APP_SECRET).digest('hex');
  return hash === sig;
}

// ─── Callback от ВК при оплате ───────────────────
app.post('/vk-callback', (req, res) => {
  const data = req.body;
  console.log('[VK Callback]', JSON.stringify(data, null, 2));

  // Проверяем подпись
  if (!verifySignature(data)) {
    console.warn('[VK Callback] Invalid signature!');
    return res.json({ error: -1 });
  }

  const { type, object } = data;

  if (type === 'order_status_change') {
    const { id, user_id, status, item, votes } = object;

    if (status === 'chargeable') {
      // Голоса списаны — начисляем монеты
      const pkg = getPackageByItem(item);
      const coinsToCredit = pkg ? pkg.totalCoins : 0;

      transactions.push({
        order_id: id,
        user_id,
        item,
        votes,
        coins_credited: coinsToCredit,
        status: 'completed',
        timestamp: new Date().toISOString()
      });

      console.log(`[Payment] user=${user_id} order=${id} coins=${coinsToCredit}`);

      // ОБЯЗАТЕЛЬНО ответить ВК
      return res.json({ response: 1 });
    }
  }

  res.json({ response: 1 });
});

// ─── Получить список транзакций ──────────────────
app.get('/transactions', (req, res) => {
  res.json({ transactions, total: transactions.length });
});

// ─── Health check ────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'ok', app_id: APP_ID });
});

// ─── Пакеты (должны совпадать с фронтендом) ──────
function getPackageByItem(itemId) {
  const packages = {
    pack_1: { voices: 1,  totalCoins: 100  },
    pack_2: { voices: 5,  totalCoins: 550  },
    pack_3: { voices: 10, totalCoins: 1400 },
    pack_4: { voices: 25, totalCoins: 4000 },
  };
  return packages[itemId] || null;
}

app.listen(PORT, () => {
  console.log(`VK Callback server running on port ${PORT}`);
});
