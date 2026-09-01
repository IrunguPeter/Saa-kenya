(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const loginView = $('loginView');
  const adminView = $('adminView');
  const toast = $('toast');

  const CATEGORIES = ['Men', 'Women', 'Kids', 'Smart', 'Unisex'];
  const STATUSES = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];
  const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
  const MAX_IMAGE_DIM = 2000;

  let products = [];
  let orders = [];
  let existingImages = []; // [ {id, url} ] already uploaded for the product being edited
  let pendingImageFiles = []; // [ File ] newly selected, not yet uploaded

  // ---------------- Utilities ----------------

  function authHeaders() {
    return { 'Content-Type': 'application/json' };
  }

  function formAuthHeaders() {
    return {};
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

  function placeholderSrc(id) {
    return '/img/placeholder/' + (id || 1) + '.svg?name=' + encodeURIComponent('Saa Kenya Watch');
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

  $('logoutBtn').addEventListener('click', async () => {
    try {
      await api('/api/admin/logout', { method: 'POST', headers: authHeaders() });
    } catch (e) {
      // The cookie is cleared client-side regardless; ignore network errors.
    }
    showLogin();
  });

  // ---------------- Password Change ----------------

  $('passwordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = $('passwordError');
    errEl.hidden = true;

    const current = $('pw_current').value;
    const newPw = $('pw_new').value;
    const confirm = $('pw_confirm').value;

    if (!current || !newPw || !confirm) {
      errEl.textContent = 'All fields are required.';
      errEl.hidden = false;
      return;
    }

    if (newPw !== confirm) {
      errEl.textContent = 'New passwords do not match.';
      errEl.hidden = false;
      return;
    }

    const btn = $('savePasswordBtn');
    btn.disabled = true;
    btn.textContent = 'Changing...';

    try {
      await api('/api/admin/change-password', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          current_password: current,
          new_password: newPw,
          confirm_password: confirm,
        }),
      });

      toastMsg('Password changed successfully. Signing out...');
      setTimeout(() => {
        showLogin();
        $('passwordForm').reset();
      }, 1500);
    } catch (err) {
      errEl.textContent = err.message;
      errEl.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Change Password';
    }
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

  $('adminSearch').addEventListener('input', () => {
    clearTimeout(productSearchTimer);
    productSearchTimer = setTimeout(() => renderProducts($('adminSearch').value), 200);
  });

  $('newProductBtn').addEventListener('click', () => openProductForm());

  async function openProductForm(product) {
    $('productModalTitle').textContent = product ? 'Edit product' : 'Add product';
    $('p_id').value = product ? product.id : '';
    $('p_name').value = product ? product.name : '';
    $('p_description').value = product ? product.description : '';
    $('p_price').value = product ? product.price : '';
    $('p_category').value = product ? product.category : 'Men';
    $('p_stock').value = product ? product.stock : 0;
    $('p_featured').value = product ? (product.featured ? 1 : 0) : 0;
    $('p_image_url').value = product ? product.image_url || '' : '';
    $('p_image_files').value = '';
    pendingImageFiles = [];
    existingImages = [];

    if (product) {
      try {
        const data = await api('/api/admin/products/' + product.id + '/images', {
          headers: authHeaders(),
        });
        existingImages = (data.images || []).slice();
      } catch (err) {
        console.error('Failed to load images', err);
      }
    }

    renderGallery();
    $('productModal').hidden = false;
    setTimeout(() => $('p_name').focus(), 50);
  }

  // Render the gallery: existing uploaded images (each with a remove button)
  // followed by previews of newly selected (pending) images.
  // Existing images can be re-ordered by dragging.
  function renderGallery() {
    const gallery = $('img_gallery');
    gallery.innerHTML = '';

    existingImages.forEach((img) => {
      const item = document.createElement('div');
      item.className = 'gallery-item';
      item.draggable = true;
      item.dataset.iid = img.id;
      item.innerHTML = `
        <img src="${escapeHtml(img.image_url)}" alt="Product image" />
        <span class="gallery-tag">photo</span>
        <button type="button" class="icon-btn gallery-del" data-iid="${img.id}" title="Remove">&times;</button>
      `;
      gallery.appendChild(item);
    });

    pendingImageFiles.forEach((file, idx) => {
      const item = document.createElement('div');
      item.className = 'gallery-item pending';
      item.innerHTML = `
        <img src="${URL.createObjectURL(file)}" alt="New image" />
        <span class="gallery-tag">new</span>
        <button type="button" class="icon-btn gallery-del" data-idx="${idx}" title="Remove">&times;</button>
      `;
      gallery.appendChild(item);
    });

    if (existingImages.length === 0 && pendingImageFiles.length === 0) {
      const hint = document.createElement('p');
      hint.className = 'hint';
      hint.textContent = 'No photos yet. Choose a photo below to add one (or several).';
      gallery.appendChild(hint);
      return;
    }
    if (existingImages.length > 1) {
      const hint = document.createElement('p');
      hint.className = 'hint';
      hint.textContent = 'The first photo is shown as the cover. Drag photos to reorder them.';
      gallery.appendChild(hint);
    }

    wireGalleryDrag(gallery);
    wireGalleryDelete(gallery);
  }

  function wireGalleryDelete(gallery) {
    gallery.querySelectorAll('.gallery-del').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const iid = btn.dataset.iid;
        if (iid) {
          await deleteProductImage(Number(iid));
        } else {
          pendingImageFiles.splice(Number(btn.dataset.idx), 1);
          renderGallery();
        }
      });
    });
  }

  // HTML5 drag-and-drop reordering of existing (uploaded) images.
  function wireGalleryDrag(gallery) {
    const items = Array.from(gallery.querySelectorAll('.gallery-item[data-iid]'));
    if (items.length < 2) return;

    let dragged = null;

    items.forEach((item) => {
      item.addEventListener('dragstart', (e) => {
        dragged = item;
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', item.dataset.iid);
      });

      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (!dragged || item === dragged) return;
        const rect = item.getBoundingClientRect();
        const before = e.clientX < rect.left + rect.width / 2;
        if (before) {
          gallery.insertBefore(dragged, item);
        } else {
          gallery.insertBefore(dragged, item.nextSibling);
        }
      });

      item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
        if (dragged) dragged.classList.remove('dragging');
        dragged = null;
        saveImageOrder();
      });
    });
  }

  // Persist the current on-screen order of existing images to the backend.
  async function saveImageOrder() {
    const id = Number($('p_id').value);
    const order = Array.from($('img_gallery').querySelectorAll('.gallery-item[data-iid]')).map(
      (el) => Number(el.dataset.iid)
    );
    if (!id || order.length === 0) return;
    try {
      await api('/api/admin/products/' + id + '/images/reorder', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ order }),
      });
    } catch (err) {
      toastMsg('Could not save image order: ' + err.message);
    }
  }

  async function deleteProductImage(iid) {
    const id = Number($('p_id').value);
    if (!id) {
      toastMsg('Save the product first, then you can remove its photos.');
      return;
    }
    try {
      await api('/api/admin/products/' + id + '/images/' + iid, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      existingImages = existingImages.filter((x) => x.id !== iid);
      renderGallery();
      toastMsg('Photo removed.');
      await loadProducts();
    } catch (err) {
      toastMsg(err.message);
    }
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read the selected image.')); };
      img.src = url;
    });
  }

  function compressImage(img, file, maxDim) {
    return new Promise((resolve, reject) => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      const ext = file.name.replace(/\.\w+$/, '').toLowerCase() + '.jpg';
      const encode = (type, q) => canvas.toBlob(
        (blob) => {
          if (!blob || blob.size <= MAX_IMAGE_BYTES || q <= 0.4) {
            if (!blob) {
              reject(new Error('Could not compress the image.'));
              return;
            }
            resolve(new File([blob], ext, { type: blob.type }));
          } else {
            encode(type, q - 0.1);
          }
        },
        type,
        q
      );
      encode('image/jpeg', 0.85);
    });
  }

  $('p_image_files').addEventListener('change', async () => {
    const files = Array.from($('p_image_files').files).slice(0, 10);
    pendingImageFiles = [];
    renderGallery();

    for (const file of files) {
      if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) {
        toastMsg('Skipped ' + file.name + ' - unsupported format.');
        continue;
      }
      try {
        const img = await loadImage(file);
        const needsResize = Math.max(img.width, img.height) > MAX_IMAGE_DIM;
        if (file.type === 'image/gif' && (file.size > MAX_IMAGE_BYTES || needsResize)) {
          toastMsg('Skipped ' + file.name + ' - GIF too large.');
          continue;
        }
        if (file.size <= MAX_IMAGE_BYTES && !needsResize) {
          pendingImageFiles.push(file);
        } else {
          const compressed = await compressImage(img, file, MAX_IMAGE_DIM);
          pendingImageFiles.push(compressed);
        }
      } catch (err) {
        toastMsg('Error processing ' + file.name + ': ' + err.message);
      }
    }
    
    renderGallery();
    if (pendingImageFiles.length > 0) {
      toastMsg(pendingImageFiles.length + ' image(s) ready to upload on save.');
    }
  });

  async function uploadProductImages(id, files) {
    const fd = new FormData();
    files.forEach(f => fd.append('images', f));
    return api('/api/admin/products/' + id + '/image', {
      method: 'POST',
      headers: formAuthHeaders(),
      body: fd,
    });
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
      let productId = id ? Number(id) : null;
      if (productId) {
        await api('/api/admin/products/' + productId, {
          method: 'PUT',
          headers: authHeaders(),
          body: JSON.stringify(body),
        });
      } else {
        const created = await api('/api/admin/products', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify(body),
        });
        productId = created.id;
      }
      
      if (pendingImageFiles.length > 0 && productId) {
        try {
          await uploadProductImages(productId, pendingImageFiles);
        } catch (uploadErr) {
          toastMsg('Product saved, but image upload failed: ' + uploadErr.message);
        }
      }
      $('productModal').hidden = true;
      $('productForm').reset();
      await Promise.all([loadProducts(), loadStats()]);
      toastMsg(id ? 'Product updated.' : 'Product added.');
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
    api('/api/admin/stats', { headers: authHeaders() })
      .then(() => showAdmin())
      .catch(() => showLogin());
  })();
})();
