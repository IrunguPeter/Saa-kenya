require('dotenv').config();

const express = require('express');
const crypto = require('crypto');
const path = require('path');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const db = require('./db');
const notifications = require('./notifications');

const app = express();
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());

// Capture ?ref=CODE referral links: set a persistent referral cookie and bump
// the affiliate's click counter. The page is served as-is (200) and the
// canonical tag points to the clean URL, so referral links never create
// redirects that block indexing in Google Search Console.
app.use((req, res, next) => {
  const ref = typeof req.query.ref === 'string' ? req.query.ref.trim().slice(0, 30) : '';
  if (req.method !== 'GET' || !ref) return next();
  if (String(req.path || req.url).startsWith('/api')) return next();
  (async () => {
    try {
      const [rows] = await db.query(
        'SELECT id FROM affiliates WHERE code = ? AND status = ? LIMIT 1',
        [ref, 'active']
      );
      if (rows.length === 0) return next();
      const isNew = !(req.cookies && req.cookies.saa_ref === ref);
      res.cookie('saa_ref', ref, {
        httpOnly: true,
        sameSite: 'Lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: AFFILIATE_COOKIE_DAYS * 24 * 60 * 60 * 1000,
      });
      if (isNew) {
        await db.query('UPDATE affiliates SET clicks = clicks + 1 WHERE id = ?', [rows[0].id]);
      }
      next();
    } catch (err) {
      next(err);
    }
  })();
});

app.use(express.static(path.join(__dirname, 'public')));

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) {
  console.error('FATAL: ADMIN_PASSWORD environment variable is required.');
  console.error('Set ADMIN_PASSWORD in .env before starting the server.');
  process.exit(1);
}

const TOKEN_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

// ---------------- Affiliate program config ----------------

const AFFILIATE_SECRET = process.env.AFFILIATE_SECRET || ADMIN_PASSWORD;
const AFFILIATE_COMMISSION_RATE = Math.min(
  1,
  Math.max(0, Number(process.env.AFFILIATE_COMMISSION_RATE) || 0.1)
);
const AFFILIATE_COOKIE_DAYS = Math.max(1, Number(process.env.AFFILIATE_COOKIE_DAYS) || 30);
const AFFILIATE_MIN_PAYOUT = Math.max(0, Number(process.env.AFFILIATE_MIN_PAYOUT) || 500);

// ---------------- Security headers ----------------

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// ---------------- Rate limiters ----------------

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: { error: 'Too many login attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const orderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { error: 'Too many orders sent. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

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

function hashPassword(password) {
  return new Promise((resolve, reject) => {
    bcrypt.hash(password, BCRYPT_ROUNDS, (err, hash) => (err ? reject(err) : resolve(hash)));
  });
}

function verifyPassword(password, hash) {
  return new Promise((resolve, reject) => {
    bcrypt.compare(password, hash, (err, ok) => (err ? reject(err) : resolve(ok)));
  });
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
  const token =
    (req.cookies && req.cookies.saa_admin_token) ||
    (req.headers.authorization || '').replace(/^Bearer\s+/i, '');

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

// ---------------- Affiliate auth helpers ----------------

function makeAffToken(id) {
  const payload = `${id}.${Date.now()}`;
  const sig = crypto
    .createHmac('sha256', AFFILIATE_SECRET)
    .update(payload)
    .digest('hex');
  return `${payload}.${sig}`;
}

function verifyAffToken(token) {
  if (typeof token !== 'string') return null;
  const [idStr, issuedAt, sig] = token.split('.');
  const id = parseInt(idStr, 10);
  const ts = parseInt(issuedAt, 10);
  if (!Number.isInteger(id) || Number.isNaN(ts) || Date.now() - ts > TOKEN_TTL_MS) return null;
  const expected = crypto
    .createHmac('sha256', AFFILIATE_SECRET)
    .update(`${idStr}.${issuedAt}`)
    .digest('hex');
  const a = Buffer.from(sig || '');
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return id;
}

async function requireAffiliate(req, res, next) {
  const token =
    (req.cookies && req.cookies.saa_aff_token) ||
    (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const id = verifyAffToken(token);
  if (!id) {
    return res.status(401).json({ error: 'Please log in to the affiliate dashboard.' });
  }
  try {
    const [rows] = await db.query(
      'SELECT id, name, email, phone, code, clicks, status FROM affiliates WHERE id = ?',
      [id]
    );
    if (rows.length === 0 || rows[0].status !== 'active') {
      return res.status(401).json({ error: 'Affiliate account not found or inactive.' });
    }
    req.affiliate = rows[0];
    next();
  } catch (err) {
    console.error('Affiliate auth error:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}

const affiliateAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { error: 'Too many attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

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
    id          SERIAL PRIMARY KEY,
    product_id  INT NOT NULL,
    data        BYTEA NOT NULL,
    content_type VARCHAR(80) NOT NULL,
    sort_order  INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
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

// Serve a specific product image (by image id).
app.get(
  '/img/product/:pid/:iid',
  asyncWrap(async (req, res) => {
    const pid = Number(req.params.pid);
    const iid = Number(req.params.iid);
    const [rows] = await db.query(
      'SELECT data, content_type FROM product_images WHERE id = ? AND product_id = ?',
      [iid, pid]
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

// Serve the first (cover) image for a product.
app.get(
  '/img/product/:id',
  asyncWrap(async (req, res) => {
    const id = Number(req.params.id);
    const [rows] = await db.query(
      'SELECT data, content_type FROM product_images WHERE product_id = ? ORDER BY sort_order ASC, id ASC LIMIT 1',
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

// Get products + images
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

    // Attach the ordered list of images for each product so the storefront
    // can render a swipeable carousel.
    const [images] = await db.query(
      `SELECT product_id, id, sort_order FROM product_images
       ORDER BY product_id ASC, sort_order ASC, id ASC`
    );
    const byProduct = new Map();
    for (const img of images) {
      if (!byProduct.has(img.product_id)) byProduct.set(img.product_id, []);
      byProduct.get(img.product_id).push({
        id: img.id,
        url: `/img/product/${img.product_id}/${img.id}`,
      });
    }

    const products = rows.map((p) => ({
      ...p,
      images: byProduct.get(p.id) || [],
    }));

    res.json({ products, min, max });
  })
);

// ---------------- Public: create order ----------------

app.post(
  '/api/orders',
  orderLimiter,
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
      // FOR UPDATE locks the rows for the duration of this transaction, so
      // concurrent orders cannot both read the same stock level and oversell.
      const [productRows] = await conn.query(
        'SELECT id, name, price, stock FROM products WHERE id IN (?) FOR UPDATE',
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
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING id`,
        [full_name, phone, email || null, county, town, estate, landmark || null, notes || null]
      );
      const customerId = custRes[0].id;

      const ref = `SAA-${String(Date.now()).slice(-6)}${customerId}`;
      const [orderRes] = await conn.query(
        'INSERT INTO orders (ref, customer_id, total, delivery_fee, status) VALUES (?, ?, ?, ?, ?) RETURNING id',
        [ref, customerId, total, deliveryFee, 'pending']
      );

      for (const line of lines) {
        await conn.query(
          'INSERT INTO order_items (order_id, product_id, product_name, price, quantity) VALUES (?, ?, ?, ?, ?)',
          [orderRes[0].id, line.product_id, line.product_name, line.price, line.quantity]
        );
        await conn.query('UPDATE products SET stock = stock - ? WHERE id = ?', [
          line.quantity,
          line.product_id,
        ]);
      }

      // Credit a pending affiliate commission when the order was referred.
      const refCode = (req.cookies && req.cookies.saa_ref) || null;
      if (refCode) {
        const [affRows] = await conn.query(
          'SELECT id FROM affiliates WHERE code = ? AND status = ? LIMIT 1',
          [refCode, 'active']
        );
        if (affRows.length > 0) {
          const commission =
            Math.round((total - deliveryFee) * AFFILIATE_COMMISSION_RATE * 100) / 100;
          if (commission > 0) {
            await conn.query(
              `INSERT INTO affiliate_commissions (affiliate_id, order_id, order_ref, amount)
               VALUES (?, ?, ?, ?)`,
              [affRows[0].id, orderRes[0].id, ref, commission]
            );
          }
        }
      }

      await conn.commit();

      // Notify the admin (email + browser push) without blocking the response.
      notifications
        .notifyAdmin({
          ref,
          total,
          deliveryFee,
          customer: { full_name, phone, county, town, estate },
          items: lines,
        })
        .catch((err) => console.error('Notification error:', err));

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

app.post('/api/admin/login', loginLimiter, asyncWrap(async (req, res) => {
  const { password } = req.body || {};
  if (!password) {
    return res.status(401).json({ error: 'Password is required.' });
  }

  try {
    // Try database password first
    const dbPasswordHash = await getAdminPassword();

    // Token HMAC key must be identical to what requireAdmin() uses when
    // verifying (the stored hash). Signing with the raw password breaks
    // auth as soon as a hash is present in the database.
    const signingKey = dbPasswordHash || ADMIN_PASSWORD;

    if (dbPasswordHash && (await verifyPassword(password, dbPasswordHash))) {
      const token = makeToken(signingKey);
      req._adminPassword = signingKey;
      res.cookie('saa_admin_token', token, {
        httpOnly: true,
        sameSite: 'Strict',
        secure: process.env.NODE_ENV === 'production',
        maxAge: TOKEN_TTL_MS,
      });
      return res.json({ token, expiresIn: TOKEN_TTL_MS });
    }

    // Fall back to env var password for backward compatibility
    if (password === ADMIN_PASSWORD) {
      const token = makeToken(signingKey);
      req._adminPassword = signingKey;
      res.cookie('saa_admin_token', token, {
        httpOnly: true,
        sameSite: 'Strict',
        secure: process.env.NODE_ENV === 'production',
        maxAge: TOKEN_TTL_MS,
      });
      return res.json({ token, expiresIn: TOKEN_TTL_MS });
    }

    res.status(401).json({ error: 'Incorrect admin password.' });
  } catch (err) {
    console.error('Login error:', err);
    res.status(401).json({ error: 'Incorrect admin password.' });
  }
}));

app.post('/api/admin/logout', requireAdmin, (req, res) => {
  res.clearCookie('saa_admin_token', {
    httpOnly: true,
    sameSite: 'Strict',
    secure: process.env.NODE_ENV === 'production',
  });
  res.json({ ok: true });
});

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
        'INSERT INTO admin_credentials (username, password_hash) VALUES (?, ?) ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash',
        ['admin', newPasswordHash]
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
       VALUES (?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
      [name.trim(), description.trim(), p, cat, image_url || null, parseInt(stock, 10) || 0, featured ? 1 : 0]
    );
    res.status(201).json({ id: res2[0].id });
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

// ---------------- Admin: product images ----------------

async function refreshCoverImage(productId) {
  const [rows] = await db.query(
    'SELECT id FROM product_images WHERE product_id = ? ORDER BY sort_order ASC, id ASC LIMIT 1',
    [productId]
  );
  if (rows.length > 0) {
    await db.query('UPDATE products SET image_url = ? WHERE id = ?', [`/img/product/${productId}`, productId]);
  } else {
    await db.query('UPDATE products SET image_url = NULL WHERE id = ?', [productId]);
  }
}

async function listProductImages(productId) {
  const [rows] = await db.query(
    'SELECT id, product_id, content_type, sort_order, created_at FROM product_images WHERE product_id = ? ORDER BY sort_order ASC, id ASC',
    [productId]
  );
  return rows.map((r) => ({ ...r, image_url: `/img/product/${productId}/${r.id}` }));
}

app.post(
  '/api/admin/products/:id/image',
  requireAdmin,
  upload.array('images', 10),
  asyncWrap(async (req, res) => {
    const id = Number(req.params.id);
    const files = req.files || [];
    if (files.length === 0) {
      return res.status(400).json({ error: 'No image files provided.' });
    }
    const [rows] = await db.query('SELECT id FROM products WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    await db.query(PRODUCT_IMAGES_SQL);
    
    // Auto-migrate on upload just in case
    await db.query(`ALTER TABLE product_images DROP CONSTRAINT IF EXISTS product_images_product_id_key;`);
    await db.query(`ALTER TABLE product_images ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;`);

    const { rows: nextPos } = await db.query(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM product_images WHERE product_id = ?',
      [id]
    );
    let pos = Number(nextPos[0].n) || 0;

    for (const file of files) {
      await db.query(
        'INSERT INTO product_images (product_id, data, content_type, sort_order) VALUES (?, ?, ?, ?)',
        [id, file.buffer, file.mimetype, pos]
      );
      pos += 1;
    }

    await refreshCoverImage(id);
    const images = await listProductImages(id);
    res.status(201).json({ images });
  })
);

app.get(
  '/api/admin/products/:id/images',
  requireAdmin,
  asyncWrap(async (req, res) => {
    const id = Number(req.params.id);
    const images = await listProductImages(id);
    res.json({ images });
  })
);

app.delete(
  '/api/admin/products/:id/images/:iid',
  requireAdmin,
  asyncWrap(async (req, res) => {
    const id = Number(req.params.id);
    const iid = Number(req.params.iid);
    await db.query(PRODUCT_IMAGES_SQL);
    const [result] = await db.query(
      'DELETE FROM product_images WHERE id = ? AND product_id = ?',
      [iid, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Image not found.' });
    }
    await refreshCoverImage(id);
    res.json({ ok: true });
  })
);

app.put(
  '/api/admin/products/:id/images/reorder',
  requireAdmin,
  asyncWrap(async (req, res) => {
    const id = Number(req.params.id);
    const { order } = req.body;
    if (!Array.isArray(order)) {
      return res.status(400).json({ error: 'Invalid order data.' });
    }
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      for (let i = 0; i < order.length; i++) {
        await conn.query('UPDATE product_images SET sort_order = ? WHERE id = ? AND product_id = ?', [i, Number(order[i]), id]);
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
    await refreshCoverImage(id);
    res.json({ ok: true });
  })
);

// Backward-compat delete-all images.
app.delete(
  '/api/admin/products/:id/image',
  requireAdmin,
  asyncWrap(async (req, res) => {
    const id = Number(req.params.id);
    await db.query(PRODUCT_IMAGES_SQL);
    await db.query('DELETE FROM product_images WHERE product_id = ?', [id]);
    await refreshCoverImage(id);
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

    // Reflect order status on any pending affiliate commission:
    // delivered = money collected on delivery = commission earned.
    if (status === 'delivered') {
      await db.query(
        `UPDATE affiliate_commissions SET status = 'earned', earned_at = CURRENT_TIMESTAMP
         WHERE order_id = ? AND status = 'pending'`,
        [id]
      );
    } else if (status === 'cancelled') {
      await db.query(
        `UPDATE affiliate_commissions SET status = 'void'
         WHERE order_id = ? AND status = 'pending'`,
        [id]
      );
    }

    res.json({ ok: true });
  })
);

// ---------------- Affiliate program ----------------

function affiliateReferralLink(req, code) {
  const base = process.env.SITE_URL || `${req.protocol}://${req.get('host')}`;
  return `${base.replace(/\/$/, '')}/?ref=${encodeURIComponent(code)}`;
}

async function affiliateBalances(affiliateId) {
  const [rows] = await db.query(
    `SELECT
       (SELECT COALESCE(SUM(amount), 0) FROM affiliate_commissions WHERE affiliate_id = ? AND status = 'earned') AS earned,
       (SELECT COALESCE(SUM(amount), 0) FROM affiliate_commissions WHERE affiliate_id = ? AND status = 'pending') AS pending,
       (SELECT COALESCE(SUM(amount), 0) FROM affiliate_payouts WHERE affiliate_id = ?) AS paid`,
    [affiliateId, affiliateId, affiliateId]
  );
  return {
    earned: Number(rows[0].earned),
    pending: Number(rows[0].pending),
    paid: Number(rows[0].paid),
    available: Number(rows[0].earned) - Number(rows[0].paid),
  };
}

app.post(
  '/api/affiliates/register',
  affiliateAuthLimiter,
  asyncWrap(async (req, res) => {
    const { name, email, phone, password } = req.body || {};

    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Please provide your full name.' });
    }
    if (!email || !/^\S+@\S+\.\S+$/.test(String(email))) {
      return res.status(400).json({ error: 'Please provide a valid email address.' });
    }
    const phoneOk = /^(\+?254|0)\d{9}$/.test(String(phone).replace(/[\s-]/g, ''));
    if (!phoneOk) {
      return res.status(400).json({ error: 'Please enter a valid Kenyan phone number.' });
    }
    const strength = validatePasswordStrength(password);
    if (!strength.valid) {
      return res.status(400).json({ error: strength.error });
    }

    const hash = await hashPassword(password);
    let code =
      String(crypto.randomBytes(4).toString('hex')) +
      String(Date.now()).slice(-4);

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const [existing] = await conn.query('SELECT id FROM affiliates WHERE email = ?', [email]);
      if (existing.length > 0) {
        await conn.rollback();
        conn.release();
        return res.status(409).json({ error: 'An account with that email already exists. Please log in.' });
      }
      let inserted = false;
      for (let attempt = 0; attempt < 3 && !inserted; attempt += 1) {
        const [result] = await conn.query(
          `INSERT INTO affiliates (name, email, phone, password_hash, code)
           VALUES (?, ?, ?, ?, ?) ON CONFLICT (code) DO NOTHING`,
          [String(name).trim(), String(email).trim(), String(phone).replace(/[\s-]/g, ''), hash, code]
        );
        if (result.affectedRows > 0) {
          inserted = true;
        } else {
          code =
            String(crypto.randomBytes(4).toString('hex')) +
            String(Date.now()).slice(-4);
        }
      }
      if (!inserted) {
        await conn.rollback();
        conn.release();
        return res.status(500).json({ error: 'Could not generate a unique referral code. Try again.' });
      }

      const [rows] = await conn.query(
        'SELECT id, name, email, phone, code FROM affiliates WHERE email = ?',
        [email]
      );
      const aff = rows[0];
      await conn.commit();
      conn.release();

      res.cookie('saa_aff_token', makeAffToken(aff.id), {
        httpOnly: true,
        sameSite: 'Strict',
        secure: process.env.NODE_ENV === 'production',
        maxAge: TOKEN_TTL_MS,
      });
      res.status(201).json({ affiliate: aff });
    } catch (err) {
      await conn.rollback();
      conn.release();
      throw err;
    }
  })
);

app.post(
  '/api/affiliates/login',
  affiliateAuthLimiter,
  asyncWrap(async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(401).json({ error: 'Email and password are required.' });
    }
    const [rows] = await db.query(
      'SELECT id, name, email, phone, code, password_hash, status FROM affiliates WHERE email = ?',
      [email]
    );
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    const aff = rows[0];
    if (aff.status !== 'active') {
      return res.status(401).json({ error: 'This affiliate account is inactive.' });
    }
    const ok = await verifyPassword(password, aff.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    res.cookie('saa_aff_token', makeAffToken(aff.id), {
      httpOnly: true,
      sameSite: 'Strict',
      secure: process.env.NODE_ENV === 'production',
      maxAge: TOKEN_TTL_MS,
    });
    res.json({
      affiliate: {
        id: aff.id,
        name: aff.name,
        email: aff.email,
        phone: aff.phone,
        code: aff.code,
      },
    });
  })
);

app.post('/api/affiliates/logout', (req, res) => {
  res.clearCookie('saa_aff_token', {
    httpOnly: true,
    sameSite: 'Strict',
    secure: process.env.NODE_ENV === 'production',
  });
  res.json({ ok: true });
});

app.get(
  '/api/affiliates/dashboard',
  requireAffiliate,
  asyncWrap(async (req, res) => {
    const id = req.affiliate.id;
    const [stats] = await db.query(
      `SELECT
         (SELECT COUNT(*) FROM affiliate_commissions WHERE affiliate_id = ? AND status != 'void') AS conversions,
         (SELECT COUNT(*) FROM affiliate_commissions WHERE affiliate_id = ? AND status = 'pending') AS pendingCount`,
      [id, id]
    );
    const balances = await affiliateBalances(id);
    const [commissions] = await db.query(
      'SELECT order_ref, amount, status, created_at FROM affiliate_commissions WHERE affiliate_id = ? ORDER BY id DESC LIMIT 20',
      [id]
    );
    const [payouts] = await db.query(
      'SELECT amount, status, created_at FROM affiliate_payouts WHERE affiliate_id = ? ORDER BY id DESC LIMIT 10',
      [id]
    );
    res.json({
      affiliate: req.affiliate,
      referralLink: affiliateReferralLink(req, req.affiliate.code),
      clicks: req.affiliate.clicks,
      conversions: Number(stats[0].conversions),
      ...balances,
      pendingCount: Number(stats[0].pendingCount),
      rate: AFFILIATE_COMMISSION_RATE,
      minPayout: AFFILIATE_MIN_PAYOUT,
      commissions,
      payouts,
    });
  })
);

app.get(
  '/api/affiliates/links',
  requireAffiliate,
  asyncWrap(async (req, res) => {
    const { code } = req.affiliate;
    const link = affiliateReferralLink(req, code);
    const shareText = `Get quality watches from just KSh 500 with nationwide delivery in Kenya! Shop via my link: ${link}`;
    res.json({
      referralLink: link,
      shareText,
      shareLinks: {
        whatsapp: `https://wa.me/?text=${encodeURIComponent(shareText)}`,
        x: `https://x.com/intent/tweet?text=${encodeURIComponent(shareText)}`,
        facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`,
        telegram: `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent('Saa Kenya watches from KSh 500!')}`,
      },
    });
  })
);

app.get(
  '/api/affiliates/payments',
  requireAffiliate,
  asyncWrap(async (req, res) => {
    const [payouts] = await db.query(
      'SELECT id, amount, phone, status, created_at FROM affiliate_payouts WHERE affiliate_id = ? ORDER BY id DESC LIMIT 50',
      [req.affiliate.id]
    );
    const balances = await affiliateBalances(req.affiliate.id);
    res.json({ payouts, balances });
  })
);

app.post(
  '/api/affiliates/payout',
  requireAffiliate,
  asyncWrap(async (req, res) => {
    const balances = await affiliateBalances(req.affiliate.id);
    if (balances.available < AFFILIATE_MIN_PAYOUT) {
      return res.status(400).json({
        error: `Payouts require a balance of at least KSh ${AFFILIATE_MIN_PAYOUT.toLocaleString()}. Your available balance is KSh ${balances.available.toLocaleString()}.`,
      });
    }
    const [result] = await db.query(
      `INSERT INTO affiliate_payouts (affiliate_id, amount, phone) VALUES (?, ?, ?) RETURNING id`,
      [req.affiliate.id, balances.available, req.affiliate.phone]
    );
    res.status(201).json({
      ok: true,
      payout: {
        id: result[0].id,
        amount: balances.available,
        status: 'requested',
      },
    });
  })
);

// ---------------- Admin: push notification subscriptions ----------------

const PUSH_SUBSCRIPTIONS_SQL = `
  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id         SERIAL PRIMARY KEY,
    endpoint   TEXT NOT NULL UNIQUE,
    p256dh     TEXT NOT NULL,
    auth       TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`;

// Public VAPID key so the browser can subscribe. The private key stays secret.
app.get(
  '/api/admin/notifications/vapid',
  requireAdmin,
  asyncWrap(async (req, res) => {
    if (!notifications.webPushConfigured()) {
      return res.status(503).json({
        error: 'Push notifications are not configured on this server.',
      });
    }
    res.json({ publicKey: process.env.WEB_PUSH_VAPID_PUBLIC_KEY });
  })
);

app.post(
  '/api/admin/notifications/subscribe',
  requireAdmin,
  asyncWrap(async (req, res) => {
    const body = req.body || {};
    const endpoint = body.endpoint;
    const keys = body.keys || {};
    const p256dh = body.p256dh || keys.p256dh || '';
    const auth = body.auth || keys.auth || '';
    if (!endpoint) {
      return res.status(400).json({ error: 'Subscription endpoint is required.' });
    }
    if (!notifications.webPushConfigured()) {
      return res.status(503).json({
        error: 'Push notifications are not configured on this server.',
      });
    }
    await db.query(PUSH_SUBSCRIPTIONS_SQL);
    await db.query(
      `INSERT INTO push_subscriptions (endpoint, p256dh, auth)
       VALUES (?, ?, ?)
       ON CONFLICT (endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
      [endpoint, p256dh, auth]
    );
    res.json({ ok: true });
  })
);

app.delete(
  '/api/admin/notifications/unsubscribe',
  requireAdmin,
  asyncWrap(async (req, res) => {
    const { endpoint } = req.body || {};
    if (!endpoint) return res.status(400).json({ error: 'Subscription endpoint is required.' });
    await db.query(PUSH_SUBSCRIPTIONS_SQL);
    await db.query('DELETE FROM push_subscriptions WHERE endpoint = ?', [endpoint]);
    res.json({ ok: true });
  })
);

// Send a test push to all subscribed admin devices (manual trigger in Settings).
app.post(
  '/api/admin/notifications/test',
  requireAdmin,
  asyncWrap(async (req, res) => {
    if (!notifications.webPushConfigured()) {
      return res.status(503).json({
        error: 'Push notifications are not configured on this server.',
      });
    }
    await db.query(PUSH_SUBSCRIPTIONS_SQL);
    const testOrder = {
      ref: 'SAA-TEST',
      total: 0,
      deliveryFee: 0,
      customer: { full_name: 'Test', phone: '', county: '', town: '', estate: '' },
      items: [{ product_name: 'Test notification', price: 0, quantity: 1 }],
    };
    await notifications.sendOrderPush(testOrder);
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
