(function () {
  'use strict';

  const TOKEN_KEY = 'saa_admin_token';

  const $ = (id) => document.getElementById(id);
  const loginView = $('loginView');
  const adminView = $('adminView');
  const toast = $('toast');

  const CATEGORIES = ['Men', 'Women', 'Kids', 'Smart', 'Unisex'];
  const STATUSES = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];

  let products = [];
  let orders = [];

  // ---------------- Utilities ----------------

  function token() {
    return localStorage.getItem(TOKEN_KEY) || '';
  }

  function setToken(t) {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  }

  function authHeaders() {
    return { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() };
  }

  function formatKSh(n) {
    return 'KSh ' + Number(n).toLocaleString('en-KE', { maximumFractionDigits: 0 });
  }

  function formatDate(d) {
    if (!d) return '–';
    return new Date(d.replace(' ', 'T')).toLocaleString('en-KE', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c]);
  }

  function productImage(p) {
    return p.image_url ||
      '/img/placeholder/' + p.id + '.svg?name=' + encodeURIComponent(p.name);
  }

  function toastMsg(msg) {
    toast.textContent = msg;
    toast.hidden = false;
    clearTimeout(toastMsg._t);
    toastMsg._t = setTimeout(() => { toast.hidden = true; }, 2600);
  }

  function showLogin() {
    loginView.hidden = false;
    adminView.hidden = true;
    setTimeout(() => $('adminPassword').focus(), 50);
  }

  function showAdmin() {
    loginView.hidden = true;
    adminView.hidden = false;
    loadStats();
    loadProducts();
    loadOrders();
  }

  async function api(path, opts) {
    const res = await fetch(path, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401) {
        setToken('');
        showLogin();
        $('loginError').textContent = 'Your session expired. Please sign in again.';
        $('loginError').hidden = false;
      }
      throw new Error(data.error || 'Request failed.');
    }
    return data;
  }

  // ---------------- Login ----------------

  $('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = $('loginError');
    errEl.hidden = true;
    const btn = $('loginBtn');
    btn.disabled = true;
    btn.textContent = 'Signing in...';
    try {
      const data = await api('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: $('adminPassword').value }),
      });
      setToken(data.token);
      $('loginForm').reset();
      showAdmin();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sign In';
    }
  });

  $('logoutBtn').addEventListener('click', () => {
    setToken('');
    showLogin();
  });

  // ---------------- Tabs ----------------

  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab-panel').forEach((p) => (p.hidden = true));
      $('panel-' + btn.dataset.tab).hidden = false;
    });
  });

  document.querySelectorAll('[data-goto]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.goto;
      document.querySelectorAll('.tab-btn').forEach((b) => {
        b.classList.toggle('active', b.dataset.tab === tab);
      });
      document.querySelectorAll('.tab-panel').forEach((p) => (p.hidden = true));
      $('panel-' + tab).hidden = false;
    });
  });

  // ---------------- Stats ----------------

  async function loadStats() {
    try {
      const data = await api('/api/admin/stats', { headers: authHeaders() });
      $('statProducts').textContent = data.products;
      $('statOrders').textContent = data.orders;
      $('statPending').textContent = data.pending;
      $('statRevenue').textContent = formatKSh(data.revenue);
      $('statLowStock').textContent = data.lowStock;
    } catch (err) {
      toastMsg(err.message);
    }
  }

  // ---------------- Products ----------------

  function renderProducts(filter) {
    const q = (filter || '').toLowerCase();
    const rows = products.filter(
      (p) =>
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
    );

    const tbody = $('adminProductRows');
    if (rows.length === 0) {
      tbody.innerHTML =
        '<tr class="empty-row"><td colspan="7">No products found.</td></tr>';
      return;
    }

    tbody.innerHTML = rows
      .map(
        (p) => `
      <tr>
        <td>#${p.id}</td>
        <td>
          <div class="table-product">
            <img src="${productImage(p)}" alt="" loading="lazy" />
            <div>
              <div class="pname">${escapeHtml(p.name)}</div>
              <div class="stat-label">${escapeHtml(p.description.slice(0, 60))}${p.description.length > 60 ? '…' : ''}</div>
            </div>
          </div>
        </td>
        <td>${escapeHtml(p.category)}</td>
        <td class="price-cell">${formatKSh(p.price)}</td>
        <td>
          <span class="stock-badge ${p.stock <= 0 ? 'stock-out' : p.stock <= 5 ? 'stock-low' : 'stock-in'}">
            ${p.stock <= 0 ? 'Out' : p.stock <= 5 ? 'Low' : 'In stock'} (${p.stock})
          </span>
        </td>
        <td>
          ${p.featured
            ? '<span class="feat-badge stock-in">★ Featured</span>'
            : '<span class="feat-badge" style="background:#f3f4f6;color:#6b7280;">No</span>'}
        </td>
        <td>
          <div class="row-actions">
            <button class="act-edit" data-edit="${p.id}">Edit</button>
            <button class="act-del" data-del="${p.id}">Delete</button>
          </div>
        </td>
      </tr>`
      )
      .join('');
  }

  async function loadProducts() {
    try {
      const data = await api('/api/products', { headers: authHeaders() });
      products = data.products || [];
      renderProducts($('adminSearch').value);
    } catch (err) {
      $('adminProductRows').innerHTML =
        '<tr class="empty-row"><td colspan="7">Could not load products.</td></tr>';
    }
  }

  let productSearchTimer;
  $('adminSearch').addEventListener('input', () => {
    clearTimeout(productSearchTimer);
    productSearchTimer = setTimeout(() => renderProducts($('adminSearch').value), 200);
  });

  $('newProductBtn').addEventListener('click', () => openProductForm());

  function openProductForm(product) {
    $('productModalTitle').textContent = product ? 'Edit product' : 'Add product';
    $('p_id').value = product ? product.id : '';
    $('p_name').value = product ? product.name : '';
    $('p_description').value = product ? product.description : '';
    $('p_price').value = product ? product.price : '';
    $('p_category').value = product ? product.category : 'Men';
    $('p_stock').value = product ? product.stock : 0;
    $('p_featured').value = product ? (product.featured ? 1 : 0) : 0;
    $('p_image_url').value = product ? product.image_url || '' : '';
    $('productModal').hidden = false;
    setTimeout(() => $('p_name').focus(), 50);
  }

  $('productForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = $('p_id').value;
    const body = {
      name: $('p_name').value.trim(),
      description: $('p_description').value.trim(),
      price: Number($('p_price').value),
      category: $('p_category').value,
      stock: parseInt($('p_stock').value, 10) || 0,
      featured: $('p_featured').value === '1',
      image_url: $('p_image_url').value.trim() || null,
    };

    if (!body.name || !body.description || !body.price) {
      toastMsg('Name, description and price are required.');
      return;
    }
    if (body.price < 500 || body.price > 5000) {
      toastMsg('Price must be between KSh 500 and KSh 5,000.');
      return;
    }

    const btn = $('saveProductBtn');
    btn.disabled = true;
    btn.textContent = 'Saving...';
    try {
      if (id) {
        await api('/api/admin/products/' + id, {
          method: 'PUT',
          headers: authHeaders(),
          body: JSON.stringify(body),
        });
        toastMsg('Product updated.');
      } else {
        await api('/api/admin/products', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify(body),
        });
        toastMsg('Product added.');
      }
      $('productModal').hidden = true;
      $('productForm').reset();
      await Promise.all([loadProducts(), loadStats()]);
    } catch (err) {
      toastMsg(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save product';
    }
  });

  $('closeProductModal').addEventListener('click', () => ($('productModal').hidden = true));

  $('adminProductRows').addEventListener('click', async (e) => {
    const editBtn = e.target.closest('[data-edit]');
    const delBtn = e.target.closest('[data-del]');
    if (editBtn) {
      const p = products.find((x) => x.id === Number(editBtn.dataset.edit));
      if (p) openProductForm(p);
    } else if (delBtn) {
      const id = Number(delBtn.dataset.del);
      const p = products.find((x) => x.id === id);
      if (!confirm('Delete "' + (p ? p.name : 'this product') + '"? This cannot be undone.')) return;
      try {
        await api('/api/admin/products/' + id, {
          method: 'DELETE',
          headers: authHeaders(),
        });
        toastMsg('Product deleted.');
        await Promise.all([loadProducts(), loadStats()]);
      } catch (err) {
        toastMsg(err.message);
      }
    }
  });

  // ---------------- Orders ----------------

  function renderOrders() {
    const tbody = $('adminOrderRows');
    if (orders.length === 0) {
      tbody.innerHTML =
        '<tr class="empty-row"><td colspan="7">No orders yet.</td></tr>';
      return;
    }

    tbody.innerHTML = orders
      .map(
        (o) => `
      <tr>
        <td class="price-cell">${escapeHtml(o.ref)}</td>
        <td>
          <div class="pname">${escapeHtml(o.full_name)}</div>
          <div class="stat-label">${escapeHtml(o.phone)}${o.email ? ' · ' + escapeHtml(o.email) : ''}</div>
        </td>
        <td>${escapeHtml(o.town)}, ${escapeHtml(o.county)}</td>
        <td class="price-cell">${formatKSh(o.total)}</td>
        <td>
          <select class="status-select" data-status="${o.id}" aria-label="Update status">
            ${STATUSES.map(
              (s) =>
                `<option value="${s}" ${o.status === s ? 'selected' : ''}>${s[0].toUpperCase() + s.slice(1)}</option>`
            ).join('')}
          </select>
        </td>
        <td>${formatDate(o.created_at)}</td>
        <td><button class="btn btn-ghost btn-sm" data-view="${o.id}">View</button></td>
      </tr>`
      )
      .join('');
  }

  async function loadOrders() {
    try {
      const data = await api('/api/admin/orders', { headers: authHeaders() });
      orders = data.orders || [];
      renderOrders();
    } catch (err) {
      $('adminOrderRows').innerHTML =
        '<tr class="empty-row"><td colspan="7">Could not load orders.</td></tr>';
    }
  }

  $('adminOrderRows').addEventListener('change', async (e) => {
    const sel = e.target.closest('.status-select');
    if (!sel) return;
    const id = Number(sel.dataset.status);
    const status = sel.value;
    try {
      await api('/api/admin/orders/' + id + '/status', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ status }),
      });
      const o = orders.find((x) => x.id === id);
      if (o) o.status = status;
      renderOrders();
      toastMsg('Order marked ' + status + '.');
      loadStats();
    } catch (err) {
      toastMsg(err.message);
      renderOrders();
    }
  });

  $('adminOrderRows').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-view]');
    if (!btn) return;
    const o = orders.find((x) => x.id === Number(btn.dataset.view));
    if (o) openOrderDetail(o);
  });

  $('closeOrderModal').addEventListener('click', () => ($('orderModal').hidden = true));

  function openOrderDetail(o) {
    $('orderRef').textContent = o.ref;
    const itemsHtml = (o.items || [])
      .map(
        (it) => `
      <div class="line">
        <span>${escapeHtml(it.product_name)} <span class="qty">× ${it.quantity}</span></span>
        <span class="price-cell">${formatKSh(it.price * it.quantity)}</span>
      </div>`
      )
      .join('');

    $('orderDetailBody').innerHTML = `
      <div class="order-meta">
        <div><div class="om-label">Customer</div>${escapeHtml(o.full_name)}</div>
        <div><div class="om-label">Phone</div>${escapeHtml(o.phone)}</div>
        ${o.email ? `<div><div class="om-label">Email</div>${escapeHtml(o.email)}</div>` : ''}
        <div><div class="om-label">Status</div><span class="status-badge status-${o.status}">${o.status}</span></div>
        <div><div class="om-label">Location</div>${escapeHtml(o.estate)}, ${escapeHtml(o.town)}, ${escapeHtml(o.county)}</div>
        ${o.landmark ? `<div><div class="om-label">Landmark</div>${escapeHtml(o.landmark)}</div>` : ''}
        <div><div class="om-label">Date</div>${formatDate(o.created_at)}</div>
      </div>
      <div class="order-lines">
        ${itemsHtml || '<p style="color:var(--muted)">No items.</p>'}
      </div>
      <div class="order-total-box">
        <span>Total ${o.delivery_fee > 0 ? '(incl. KSh ' + o.delivery_fee + ' delivery)' : '(free delivery)'}</span>
        <span>${formatKSh(o.total)}</span>
      </div>
      ${o.notes ? `<div class="order-notes">📝 ${escapeHtml(o.notes)}</div>` : ''}
    `;
    $('orderModal').hidden = false;
  }

  // ---------------- Misc ----------------

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      $('productModal').hidden = true;
      $('orderModal').hidden = true;
    }
  });

  // Close modals when clicking the overlay background
  [$('productModal'), $('orderModal')].forEach((m) => {
    m.addEventListener('click', (e) => {
      if (e.target === m) m.hidden = true;
    });
  });

  // ---------------- Boot ----------------

  (function init() {
    if (token()) {
      showAdmin();
    } else {
      showLogin();
    }
  })();
})();
