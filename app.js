require('dotenv').config();

const express = require('express');
const crypto = require('crypto');
const path = require('path');
const multer = require('multer');
const bcrypt = require('bcrypt');
const db = require('./db');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const TOKEN_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

// ============ Password Management ============

const BCRYPT_ROUNDS = 10;
const PASSWORD_MIN_LENGTH = 8;

function validatePasswordStrength(password) {
  if (!password || password.length < PASSWORD_MIN_LENGTH) {
    return { valid: false, error: 'Password must be at least 8 characters.' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, error: 'Password must contain lowercase letters.' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: 'Password must contain uppercase letters.' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, error: 'Password must contain numbers.' };
  }
  return { valid: true };
}

async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

async function getAdminPassword() {
  try {
    const [rows] = await db.query(
      'SELECT password_hash FROM admin_credentials WHERE username = ?',
      ['admin']
    );
    if (rows.length > 0) {
      return rows[0].password_hash;
    }
  } catch (err) {
    console.error('Error fetching admin password from DB:', err.message);
  }
  return null;
}

async function initializeAdminIfNeeded() {
  try {
    const [rows] = await db.query(
      'SELECT id FROM admin_credentials WHERE username = ?',
      ['admin']
    );
    if (rows.length === 0) {
      const hash = await hashPassword(ADMIN_PASSWORD);
      await db.query(
        'INSERT INTO admin_credentials (username, password_hash) VALUES (?, ?)',
        ['admin', hash]
      );
      console.log('Initialized admin credentials from ADMIN_PASSWORD env var.');
    }
  } catch (err) {
    console.error('Error initializing admin credentials:', err.message);
  }
}

// Initialize admin credentials on startup
initializeAdminIfNeeded().catch(err => console.error('Startup error:', err));

const CATEGORIES = ['Men', 'Women', 'Kids', 'Smart', 'Unisex'];

// ---------------- Auth helpers ----------------

function makeToken(password) {
  const payload = String(Date.now());
  const sig = crypto
    .createHmac('sha256', password)
    .update(payload)
    .digest('hex');
  return `${payload}.${sig}`;
}

function verifyToken(token, password) {
  if (typeof token !== 'string' || !token.includes('.')) return false;
  const [payload, sig] = token.split('.');
  const issuedAt = parseInt(payload, 10);
  if (Number.isNaN(issuedAt) || Date.now() - issuedAt > TOKEN_TTL_MS) return false;
  const expected = crypto
    .createHmac('sha256', password)
    .update(payload)
    .digest('hex');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function requireAdmin(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  
  (async () => {
    try {
      // Try to get password from database first
      let password = await getAdminPassword();
      if (!password) {
        password = ADMIN_PASSWORD;
      }
      
      if (!verifyToken(token, password)) {
        return res.status(401).json({ error: 'Unauthorised. Please log in.' });
      }
      req._adminPassword = password;
      next();
    } catch (err) {
      console.error('Auth middleware error:', err);
      res.status(401).json({ error: 'Unauthorised. Please log in.' });
    }
  })();
}

// ---------------- Middleware helpers ----------------

function asyncWrap(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function getPriceRange() {
  return [Number(process.env.MIN_PRICE) || 500, Number(process.env.MAX_PRICE) || 5000];
}

// ---------------- Product image upload ----------------

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) {
      cb(null, true);
      return;
    }
    const err = new Error('Only JPG, PNG, WebP or GIF images are allowed.');
    err.status = 400;
    cb(err, false);
  },
});

// Idempotent — also lets an existing install self-create the table on first upload.
const PRODUCT_IMAGES_SQL = `
  CREATE TABLE IF NOT EXISTS product_images (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    product_id  INT NOT NULL,
    data        LONGBLOB NOT NULL,
    content_type VARCHAR(80) NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_product_image (product_id),
    CONSTRAINT fk_image_product
      FOREIGN KEY (product_id) REFERENCES products(id)
      ON DELETE CASCADE
  )`;

// ---------------- Placeholder product image ----------------

const PALETTES = [
  ['#1f2937', '#f59e0b'],
  ['#0f766e', '#fbbf24'],
  ['#7c2d12', '#fb923c'],
  ['#1e3a8a', '#93c5fd'],
  ['#581c87', '#f0abfc'],
  ['#14532d', '#86efac'],
];

app.get('/img/placeholder/:id.svg', (req, res) => {
  const id = parseInt(req.params.id, 10) || 1;
  const [bg, fg] = PALETTES[id % PALETTES.length];
  const name = (req.query.name || 'Saa Kenya Watch')
    .replace(/[<>&"]/g, '')
    .slice(0, 40);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
  <rect width="600" height="400" fill="${bg}"/>
  <circle cx="300" cy="185" r="110" fill="none" stroke="${fg}" stroke-width="6"/>
  <circle cx="300" cy="185" r="98" fill="none" stroke="${fg}" stroke-opacity="0.4" stroke-width="2"/>
  <line x1="300" y1="185" x2="300" y2="120" stroke="${fg}" stroke-width="6" stroke-linecap="round"/>
  <line x1="300" y1="185" x2="348" y2="195" stroke="${fg}" stroke-width="6" stroke-linecap="round"/>
  <line x1="300" y1="185" x2="300" y2="90" stroke="${fg}" stroke-width="3" stroke-linecap="round"/>
  <line x1="300" y1="185" x2="370" y2="185" stroke="${fg}" stroke-width="3" stroke-linecap="round"/>
  <rect x="230" y="300" width="140" height="60" rx="14" fill="none" stroke="${fg}" stroke-width="6"/>
  <line x1="276" y1="330" x2="246" y2="315" stroke="${fg}" stroke-width="6" stroke-linecap="round"/>
  <line x1="324" y1="330" x2="354" y2="315" stroke="${fg}" stroke-width="6" stroke-linecap="round"/>
  <text x="300" y="392" fill="${fg}" font-family="sans-serif" font-size="22" text-anchor="middle">${name}</text>
</svg>`;
  res.type('image/svg+xml').set('Cache-Control', 'public, max-age=86400').send(svg);
});

// ---------------- Public: product image ----------------

app.get(
  '/img/product/:id',
  asyncWrap(async (req, res) => {
    const id = Number(req.params.id);
    const [rows] = await db.query(
      'SELECT data, content_type FROM product_images WHERE product_id = ?',
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Image not found.' });
    }
    res
      .type(rows[0].content_type)
      .set('Cache-Control', 'public, max-age=86400')
      .send(rows[0].data);
  })
);

// ---------------- Public: products ----------------

app.get(
  '/api/products',
  asyncWrap(async (req, res) => {
    const [min, max] = getPriceRange();
    const { category, q } = req.query;
    const where = ['price >= ?', 'price <= ?'];
    const params = [min, max];

    if (category && category !== 'All') {
      where.push('category = ?');
      params.push(category);
    }
    if (q && q.trim()) {
      where.push('(name LIKE ? OR description LIKE ?)');
      params.push(`%${q.trim()}%`, `%${q.trim()}%`);
    }

    const sql =
      'SELECT id, name, description, price, category, image_url, stock, featured FROM products WHERE ' +
      where.join(' AND ') +
      ' ORDER BY featured DESC, id ASC';

    const [rows] = await db.query(sql, params);
    res.json({ products: rows, min, max });
  })
);

// ---------------- Public: create order ----------------

app.post(
  '/api/orders',
  asyncWrap(async (req, res) => {
    const {
      full_name,
      phone,
      email,
      county,
      town,
      estate,
      landmark,
      notes,
      items,
    } = req.body || {};

    if (!full_name || !phone || !county || !town || !estate) {
      return res.status(400).json({
        error:
          'Please provide your full name, phone number, county, town and estate/address.',
      });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Your cart is empty.' });
    }

    const phoneOk = /^(\+?254|0)\d{9}$/.test(String(phone).replace(/[\s-]/g, ''));
    if (!phoneOk) {
      return res.status(400).json({
        error: 'Please enter a valid Kenyan phone number, e.g. 07XX XXX XXX or +2547XX XXX XXX.',
      });
    }
    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    const [min, max] = getPriceRange();

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      // Build product lookup (id -> row)
      const ids = items.map((i) => Number(i.product_id));
      const [productRows] = await conn.query(
        'SELECT id, name, price, stock FROM products WHERE id IN (?)',
        [ids]
      );
      const byId = new Map(productRows.map((p) => [p.id, p]));

      let total = 0;
      const lines = [];
      for (const item of items) {
        const p = byId.get(Number(item.product_id));
        if (!p) {
          throw Object.assign(new Error(`Product ${item.product_id} not found.`), { status: 400 });
        }
        if (p.price < min || p.price > max) {
          throw Object.assign(new Error(`${p.name} is outside the store price range.`), {
            status: 400,
          });
        }
        const qty = Math.max(1, parseInt(item.quantity, 10) || 1);
        if (p.stock < qty) {
          throw Object.assign(new Error(`Sorry, only ${p.stock} of "${p.name}" in stock.`), {
            status: 400,
          });
        }
        lines.push({ product_id: p.id, product_name: p.name, price: p.price, quantity: qty });
        total += p.price * qty;
      }

      const deliveryFee = total >= 2000 ? 0 : 150;
      total += deliveryFee;

      const [custRes] = await conn.query(
        `INSERT INTO customers (full_name, phone, email, county, town, estate, landmark, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [full_name, phone, email || null, county, town, estate, landmark || null, notes || null]
      );
      const customerId = custRes.insertId;

      const ref = `SAA-${String(Date.now()).slice(-6)}${customerId}`;
      const [orderRes] = await conn.query(
        'INSERT INTO orders (ref, customer_id, total, delivery_fee, status) VALUES (?, ?, ?, ?, ?)',
        [ref, customerId, total, deliveryFee, 'pending']
      );

      for (const line of lines) {
        await conn.query(
          'INSERT INTO order_items (order_id, product_id, product_name, price, quantity) VALUES (?, ?, ?, ?, ?)',
          [orderRes.insertId, line.product_id, line.product_name, line.price, line.quantity]
        );
        await conn.query('UPDATE products SET stock = stock - ? WHERE id = ?', [
          line.quantity,
          line.product_id,
        ]);
      }

      await conn.commit();

      res.status(201).json({
        order: {
          ref,
          total,
          deliveryFee,
          customer: { full_name, phone, county, town, estate },
        },
      });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  })
);

// ---------------- Admin: auth ----------------

app.post('/api/admin/login', asyncWrap(async (req, res) => {
  const { password } = req.body || {};
  if (!password) {
    return res.status(401).json({ error: 'Password is required.' });
  }

  try {
    // Try database password first
    const dbPasswordHash = await getAdminPassword();
    if (dbPasswordHash && (await verifyPassword(password, dbPasswordHash))) {
      const token = makeToken(password);
      req._adminPassword = password;
      return res.json({ token, expiresIn: TOKEN_TTL_MS });
    }

    // Fall back to env var password for backward compatibility
    if (password === ADMIN_PASSWORD) {
      const token = makeToken(ADMIN_PASSWORD);
      req._adminPassword = ADMIN_PASSWORD;
      return res.json({ token, expiresIn: TOKEN_TTL_MS });
    }

    res.status(401).json({ error: 'Incorrect admin password.' });
  } catch (err) {
    console.error('Login error:', err);
    res.status(401).json({ error: 'Incorrect admin password.' });
  }
}));

app.post(
  '/api/admin/change-password',
  requireAdmin,
  asyncWrap(async (req, res) => {
    const { current_password, new_password, confirm_password } = req.body || {};

    if (!current_password || !new_password) {
      return res
        .status(400)
        .json({ error: 'Current password and new password are required.' });
    }

    if (new_password !== confirm_password) {
      return res.status(400).json({ error: 'New passwords do not match.' });
    }

    const strength = validatePasswordStrength(new_password);
    if (!strength.valid) {
      return res.status(400).json({ error: strength.error });
    }

    try {
      // Verify current password
      const currentPasswordHash = await getAdminPassword();
      let isValid = false;

      if (currentPasswordHash) {
        isValid = await verifyPassword(current_password, currentPasswordHash);
      } else {
        isValid = current_password === ADMIN_PASSWORD;
      }

      if (!isValid) {
        return res.status(401).json({ error: 'Current password is incorrect.' });
      }

      // Prevent using the same password
      if (new_password === current_password) {
        return res
          .status(400)
          .json({ error: 'New password must be different from current password.' });
      }

      // Hash and store new password
      const newPasswordHash = await hashPassword(new_password);
      await db.query(
        'INSERT INTO admin_credentials (username, password_hash) VALUES (?, ?) ON DUPLICATE KEY UPDATE password_hash = ?',
        ['admin', newPasswordHash, newPasswordHash]
      );

      res.json({ message: 'Password changed successfully. Please sign in again.' });
    } catch (err) {
      console.error('Change password error:', err);
      res.status(500).json({ error: 'Failed to change password.' });
    }
  })
);

// ---------------- Admin: stats ----------------

app.get(
  '/api/admin/stats',
  requireAdmin,
  asyncWrap(async (req, res) => {
    const [productCount] = await db.query('SELECT COUNT(*) AS n FROM products');
    const [orderCount] = await db.query('SELECT COUNT(*) AS n FROM orders');
    const [pendingCount] = await db.query(
      "SELECT COUNT(*) AS n FROM orders WHERE status = 'pending'"
    );
    const [revenue] = await db.query(
      "SELECT COALESCE(SUM(total),0) AS total FROM orders WHERE status != 'cancelled'"
    );
    const [lowStock] = await db.query('SELECT COUNT(*) AS n FROM products WHERE stock <= 5');

    res.json({
      products: productCount[0].n,
      orders: orderCount[0].n,
      pending: pendingCount[0].n,
      revenue: Number(revenue[0].total),
      lowStock: lowStock[0].n,
    });
  })
);

// ---------------- Admin: products CRUD ----------------

app.post(
  '/api/admin/products',
  requireAdmin,
  asyncWrap(async (req, res) => {
    const { name, description, price, category, image_url, stock, featured } = req.body || {};
    if (!name || !description || price == null) {
      return res.status(400).json({ error: 'Name, description and price are required.' });
    }
    const p = Number(price);
    if (Number.isNaN(p) || p < 500 || p > 5000) {
      return res.status(400).json({ error: 'Price must be between KSh 500 and KSh 5,000.' });
    }
    const cat = CATEGORIES.includes(category) ? category : 'Men';
    const [res2] = await db.query(
      `INSERT INTO products (name, description, price, category, image_url, stock, featured)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name.trim(), description.trim(), p, cat, image_url || null, parseInt(stock, 10) || 0, featured ? 1 : 0]
    );
    res.status(201).json({ id: res2.insertId });
  })
);

app.put(
  '/api/admin/products/:id',
  requireAdmin,
  asyncWrap(async (req, res) => {
    const { name, description, price, category, image_url, stock, featured } = req.body || {};
    const id = Number(req.params.id);
    if (!name || !description || price == null) {
      return res.status(400).json({ error: 'Name, description and price are required.' });
    }
    const p = Number(price);
    if (Number.isNaN(p) || p < 500 || p > 5000) {
      return res.status(400).json({ error: 'Price must be between KSh 500 and KSh 5,000.' });
    }
    const cat = CATEGORIES.includes(category) ? category : 'Men';
    const [result] = await db.query(
      `UPDATE products
       SET name = ?, description = ?, price = ?, category = ?, image_url = ?, stock = ?, featured = ?
       WHERE id = ?`,
      [name.trim(), description.trim(), p, cat, image_url || null, parseInt(stock, 10) || 0, featured ? 1 : 0, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Product not found.' });
    }
    res.json({ ok: true });
  })
);

app.delete(
  '/api/admin/products/:id',
  requireAdmin,
  asyncWrap(async (req, res) => {
    const id = Number(req.params.id);
    const [result] = await db.query('DELETE FROM products WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Product not found.' });
    }
    res.json({ ok: true });
  })
);

// ---------------- Admin: product image upload / delete ----------------

app.post(
  '/api/admin/products/:id/image',
  requireAdmin,
  upload.single('image'),
  asyncWrap(async (req, res) => {
    const id = Number(req.params.id);
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided.' });
    }
    const [rows] = await db.query('SELECT id FROM products WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    await db.query(PRODUCT_IMAGES_SQL);
    await db.query(
      `INSERT INTO product_images (product_id, data, content_type) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE data = ?, content_type = ?`,
      [id, req.file.buffer, req.file.mimetype, req.file.buffer, req.file.mimetype]
    );
    await db.query('UPDATE products SET image_url = ? WHERE id = ?', [`/img/product/${id}`, id]);
    res.status(201).json({ image_url: `/img/product/${id}` });
  })
);

app.delete(
  '/api/admin/products/:id/image',
  requireAdmin,
  asyncWrap(async (req, res) => {
    const id = Number(req.params.id);
    await db.query(PRODUCT_IMAGES_SQL);
    await db.query('DELETE FROM product_images WHERE product_id = ?', [id]);
    await db.query('UPDATE products SET image_url = NULL WHERE id = ?', [id]);
    res.json({ ok: true });
  })
);

// ---------------- Admin: orders ----------------

app.get(
  '/api/admin/orders',
  requireAdmin,
  asyncWrap(async (req, res) => {
    const [orders] = await db.query(
      `SELECT o.id, o.ref, o.total, o.delivery_fee, o.status, o.created_at,
              c.full_name, c.phone, c.email, c.county, c.town, c.estate, c.landmark, c.notes
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       ORDER BY o.id DESC
       LIMIT 200`
    );
    const [items] = await db.query(
      'SELECT order_id, product_name, price, quantity FROM order_items ORDER BY id'
    );
    const itemsByOrder = new Map();
    for (const it of items) {
      if (!itemsByOrder.has(it.order_id)) itemsByOrder.set(it.order_id, []);
      itemsByOrder.get(it.order_id).push(it);
    }
    res.json({ orders: orders.map((o) => ({ ...o, items: itemsByOrder.get(o.id) || [] })) });
  })
);

app.put(
  '/api/admin/orders/:id/status',
  requireAdmin,
  asyncWrap(async (req, res) => {
    const { status } = req.body || {};
    const allowed = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: 'Invalid status.' });
    }
    const id = Number(req.params.id);
    const [result] = await db.query('UPDATE orders SET status = ? WHERE id = ?', [status, id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Order not found.' });
    }
    res.json({ ok: true });
  })
);

// ---------------- Errors ----------------

app.use((req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const msg =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'Image is too large. Maximum size is 10MB.'
        : 'Could not process the uploaded image.';
    return res.status(400).json({ error: msg });
  }
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Something went wrong.' });
});

module.exports = app;
