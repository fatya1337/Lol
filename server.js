const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;
const APP_ID = 54508543;

// ─── Парсим ВСЕ форматы которые может слать ВК ───
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  // Если тело не распарсилось — пробуем вручную
  if (req.method === 'POST' && Object.keys(req.body).length === 0) {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      try {
        // Попытка 1: JSON
        req.body = JSON.parse(raw);
      } catch {
        try {
          // Попытка 2: form-urlencoded вручную
          const params = {};
          raw.split('&').forEach(pair => {
            const [k, v] = pair.split('=');
            if (k) params[decodeURIComponent(k)] = decodeURIComponent(v || '');
          });
          req.body = params;
        } catch {
          req.body = {};
        }
      }
      console.log('[Raw body parsed]', raw.substring(0, 200));
      next();
    });
  } else {
    next();
  }
});

const PACKAGES = {
  pack_1: { title: 'Стартер — 100 монет',  voices: 1,  coins: 100  },
  pack_2: { title: 'Базовый — 550 монет',   voices: 5,  coins: 550  },
  pack_3: { title: 'Выгодный — 1400 монет', voices: 10, coins: 1400 },
  pack_4: { title: 'Макс — 4000 монет',     voices: 25, coins: 4000 },
};

const transactions = [];

app.post('/vk-callback', (req, res) => {
  const data = req.body;
  console.log('[VK Callback] type:', data.type, '| keys:', Object.keys(data).join(', '));
  console.log('[VK Callback] full body:', JSON.stringify(data));

  const type = data.type;

  // ВК запрашивает информацию о товаре перед покупкой
  if (type === 'get_item') {
    const itemId = data.item;
    const pkg = PACKAGES[itemId];
    console.log('[get_item] itemId:', itemId, '| found:', !!pkg);

    if (!pkg) {
      return res.json({ error: { error_code: 20, error_msg: 'Item not found' } });
    }

    return res.json({
      response: {
        item_id:    itemId,
        title:      pkg.title,
        price:      pkg.voices,
        photo_url:  '',
        expiration: 0
      }
    });
  }

  // ВК сообщает что оплата прошла
  if (type === 'order_status_change') {
    const { id, user_id, status, item, votes } = data;
    console.log('[order] id:', id, 'status:', status, 'item:', item);

    if (status === 'chargeable') {
      const pkg = PACKAGES[item];
      transactions.push({
        order_id:       id,
        user_id,
        item,
        votes,
        coins_credited: pkg ? pkg.coins : 0,
        status:         'completed',
        timestamp:      new Date().toISOString()
      });
      console.log('[Payment OK] coins:', pkg ? pkg.coins : 0);
      return res.json({ response: { order_id: id } });
    }

    return res.json({ response: { order_id: id } });
  }

  res.json({ response: 1 });
});

app.get('/transactions', (req, res) => {
  res.json({ transactions, total: transactions.length });
});

app.get('/', (req, res) => {
  res.json({ status: 'ok', app_id: APP_ID, packages: Object.keys(PACKAGES) });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
