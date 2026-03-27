const express = require('express');
const crypto = require('crypto');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  next();
});

// ─── Настройки ───────────────────────────────────
const APP_ID = 54508543;
const APP_SECRET = process.env.VK_APP_SECRET || 'ВСТАВЬ_СЕКРЕТНЫЙ_КЛЮЧ_ВК';
const PORT = process.env.PORT || 3000;

// ─── Товары — должны совпадать с фронтендом ──────
const PACKAGES = {
  pack_1: { title: 'Стартер — 100 монет',   voices: 1,  coins: 100,  price: 1  },
  pack_2: { title: 'Базовый — 550 монет',    voices: 5,  coins: 550,  price: 5  },
  pack_3: { title: 'Выгодный — 1400 монет',  voices: 10, coins: 1400, price: 10 },
  pack_4: { title: 'Макс — 4000 монет',      voices: 25, coins: 4000, price: 25 },
};

// ─── Хранилище транзакций (в памяти) ─────────────
const transactions = [];

// ─── Проверка подписи от ВК ──────────────────────
function verifySignature(params) {
  const { sig, ...rest } = params;
  const sorted = Object.keys(rest).sort().map(k => `${k}=${rest[k]}`).join('&');
  const hash = crypto.createHash('md5').update(sorted + APP_SECRET).digest('hex');
  return hash === sig;
}

// ─── Главный callback от ВК ──────────────────────
// ВК отправляет POST запросы на этот URL
// Типы: get_item, order_status_change
app.post('/vk-callback', (req, res) => {
  const data = req.body;
  console.log('[VK Callback]', JSON.stringify(data, null, 2));

  // Проверяем подпись
  if (!verifySignature(data)) {
    console.warn('[VK Callback] Invalid signature!');
    return res.json({ error: -1 });
  }

  const { type } = data;

  // ── get_item ──────────────────────────────────
  // ВК запрашивает информацию о товаре перед покупкой
  // Обязательно вернуть: title, price, item_id
  if (type === 'get_item') {
    const itemId = data.item;
    const pkg = PACKAGES[itemId];

    if (!pkg) {
      console.warn('[get_item] Unknown item:', itemId);
      return res.json({ error: { error_code: 20, error_msg: 'Item not found' } });
    }

    console.log('[get_item] Returning item:', itemId, pkg);

    return res.json({
      response: {
        item_id:  itemId,
        title:    pkg.title,
        price:    pkg.voices,  // цена в голосах
        photo_url: '',         // можно добавить картинку товара
        expiration: 0
      }
    });
  }

  // ── order_status_change ───────────────────────
  // ВК уведомляет об изменении статуса заказа
  if (type === 'order_status_change') {
    const { id, user_id, status, item, votes } = data;

    console.log(`[order_status_change] order=${id} user=${user_id} status=${status} item=${item}`);

    if (status === 'chargeable') {
      // Голоса успешно списаны — начисляем монеты
      const pkg = PACKAGES[item];
      const coinsToCredit = pkg ? pkg.coins : 0;

      transactions.push({
        order_id:       id,
        user_id,
        item,
        votes,
        coins_credited: coinsToCredit,
        status:         'completed',
        timestamp:      new Date().toISOString()
      });

      console.log(`[Payment OK] user=${user_id} order=${id} coins=${coinsToCredit}`);

      // Обязательный ответ ВК для подтверждения заказа
      return res.json({ response: { order_id: id } });
    }

    // Для других статусов просто подтверждаем
    return res.json({ response: { order_id: id } });
  }

  // Для неизвестных типов
  res.json({ response: 1 });
});

// ─── Просмотр транзакций (для отчёта) ────────────
app.get('/transactions', (req, res) => {
  res.json({ transactions, total: transactions.length });
});

// ─── Health check ─────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'ok', app_id: APP_ID, packages: Object.keys(PACKAGES) });
});

app.listen(PORT, () => {
  console.log(`VK Callback server running on port ${PORT}`);
});
