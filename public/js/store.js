(function () {
  'use strict';

  // ---------------- State ----------------

  const FREE_DELIVERY_OVER = 2000;
  const DELIVERY_FEE = 150;
  const CART_KEY = 'saa_cart';

  const state = {
    products: [],
    category: 'All',
    search: '',
    cart: loadCart(),
  };

  // ---------------- DOM refs ----------------

  const $ = (id) => document.getElementById(id);
  const productGrid = $('productGrid');
  const loadingEl = $('loading');
  const emptyState = $('emptyState');
  const searchInput = $('searchInput');
  const cartBtn = $('cartBtn');
  const cartCount = $('cartCount');
  const cartDrawer = $('cartDrawer');
  const overlay = $('overlay');
  const closeCart = $('closeCart');
  const cartItems = $('cartItems');
  const cartEmpty = $('cartEmpty');
  const subtotalEl = $('subtotal');
  const deliveryEstimate = $('deliveryEstimate');
  const checkoutBtn = $('checkoutBtn');
  const checkoutModal = $('checkoutModal');
  const closeCheckout = $('closeCheckout');
  const checkoutForm = $('checkoutForm');
  const orderSummary = $('orderSummary');
  const placeOrderBtn = $('placeOrderBtn');
  const successModal = $('successModal');
  const successName = $('successName');
  const successRef = $('successRef');
  const successTotal = $('successTotal');
  const successPhone = $('successPhone');
  const successLoc = $('successLoc');
  const continueShopping = $('continueShopping');
  const toast = $('toast');
  const yearEl = $('year');

  // ---------------- Utilities ----------------

  const KENYAN_COUNTIES = [
    'Mombasa', 'Kwale', 'Kilifi', 'Tana River', 'Lamu', 'Taita-Taveta',
    'Garissa', 'Wajir', 'Mandera', 'Marsabit', 'Isiolo', 'Meru',
    'Tharaka-Nithi', 'Embu', 'Kitui', 'Machakos', 'Makueni', 'Nyandarua',
    'Nyeri', 'Kirinyaga', "Murang'a", 'Kiambu', 'Turkana', 'West Pokot',
    'Samburu', 'Trans Nzoia', 'Uasin Gishu', 'Elgeyo-Marakwet', 'Nandi',
    'Baringo', 'Laikipia', 'Nakuru', 'Narok', 'Kajiado', 'Kericho', 'Bomet',
    'Kakamega', 'Vihiga', 'Bungoma', 'Busia', 'Siaya', 'Kisumu',
    'Homa Bay', 'Migori', 'Kisii', 'Nyamira', 'Nairobi',
  ];

  function formatKSh(n) {
    return 'KSh ' + Number(n).toLocaleString('en-KE', {
      maximumFractionDigits: 0,
    });
  }

  function productImage(p) {
    if (p.image_url) return p.image_url;
    const id = p.id || p.product_id || 1;
    return (
      '/img/placeholder/' + id + '.svg?name=' + encodeURIComponent(p.name)
    );
  }

  function stockClass(stock) {
    if (stock <= 0) return 'stock-out';
    if (stock <= 5) return 'stock-low';
    return 'stock-in';
  }

  function stockLabel(stock) {
    if (stock <= 0) return 'Out of stock';
    if (stock <= 5) return 'Only ' + stock + ' left';
    return 'In stock';
  }

  function toastMsg(msg) {
    toast.textContent = msg;
    toast.hidden = false;
    clearTimeout(toastMsg._t);
    toastMsg._t = setTimeout(() => {
      toast.hidden = true;
    }, 2600);
  }

  // ---------------- Cart ----------------

  function loadCart() {
    try {
      const raw = localStorage.getItem(CART_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function saveCart() {
    localStorage.setItem(CART_KEY, JSON.stringify(state.cart));
  }

  function cartTotal() {
    return state.cart.reduce((sum, i) => sum + i.price * i.quantity, 0);
  }

  function deliveryFeeFor(total) {
    return total >= FREE_DELIVERY_OVER ? 0 : DELIVERY_FEE;
  }

  function addToCart(product) {
    if (product.stock <= 0) {
      toastMsg('Sorry, this watch is out of stock.');
      return;
    }
    const existing = state.cart.find((i) => i.product_id === product.id);
    if (existing) {
      if (existing.quantity >= product.stock) {
        toastMsg('Only ' + product.stock + ' in stock.');
        return;
      }
      existing.quantity += 1;
    } else {
      state.cart.push({
        product_id: product.id,
        name: product.name,
        price: Number(product.price),
        image_url: product.image_url,
        stock: product.stock,
        quantity: 1,
      });
    }
    saveCart();
    renderCart();
    openCart();
  }

  function changeQty(productId, delta) {
    const item = state.cart.find((i) => i.product_id === productId);
    if (!item) return;
    item.quantity += delta;
    if (item.quantity <= 0) {
      state.cart = state.cart.filter((i) => i.product_id !== productId);
    } else if (item.quantity > item.stock) {
      item.quantity = item.stock;
      toastMsg('Only ' + item.stock + ' in stock.');
    }
    saveCart();
    renderCart();
  }

  function removeItem(productId) {
    state.cart = state.cart.filter((i) => i.product_id !== productId);
    saveCart();
    renderCart();
  }

  function renderCart() {
    const items = state.cart;
    cartCount.textContent = items.reduce((s, i) => s + i.quantity, 0);

    cartEmpty.hidden = items.length > 0;
    checkoutBtn.disabled = items.length === 0;

    if (items.length === 0) {
      cartItems.innerHTML = '';
      subtotalEl.textContent = formatKSh(0);
      deliveryEstimate.textContent = formatKSh(0);
      return;
    }

    cartItems.innerHTML = items
      .map(
        (i) => `
      <div class="cart-item">
        <img src="${productImage(i)}" alt="${i.name.replace(/"/g, '&quot;')}" loading="lazy" />
        <div class="cart-item-info">
          <div class="cart-item-name">${i.name}</div>
          <div class="cart-item-price">${formatKSh(i.price)}</div>
          <div class="qty-controls">
            <button type="button" data-act="minus" data-id="${i.product_id}" aria-label="Decrease quantity">−</button>
            <span>${i.quantity}</span>
            <button type="button" data-act="plus" data-id="${i.product_id}" aria-label="Increase quantity">+</button>
          </div>
        </div>
        <button type="button" class="cart-item-remove" data-act="remove" data-id="${i.product_id}">Remove</button>
      </div>`
      )
      .join('');

    const total = cartTotal();
    subtotalEl.textContent = formatKSh(total);
    deliveryEstimate.textContent = formatKSh(deliveryFeeFor(total));
  }

  // ---------------- Products ----------------

  function renderProducts() {
    const list = state.products.filter((p) => {
      if (state.category !== 'All' && p.category !== state.category) return false;
      if (state.search) {
        const q = state.search.toLowerCase();
        const hay = (p.name + ' ' + p.description).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    loadingEl.hidden = true;
    emptyState.hidden = list.length > 0;

    if (list.length === 0) {
      productGrid.innerHTML = '';
      return;
    }

    productGrid.innerHTML = list
      .map(
        (p) => `
      <article class="product-card">
        ${p.featured ? '<span class="badge-flag">Featured</span>' : ''}
        <img class="product-img" src="${productImage(p)}" alt="${p.name.replace(/"/g, '&quot;')}" loading="lazy" />
        <div class="product-body">
          <span class="product-cat">${p.category}</span>
          <h3 class="product-name">${p.name}</h3>
          <p class="product-desc">${p.description}</p>
          <div class="product-foot">
            <span class="product-price">${formatKSh(p.price)}</span>
            <button class="add-btn ${p.stock <= 0 ? 'out' : ''}" data-add="${p.id}" ${p.stock <= 0 ? 'disabled' : ''}>
              ${p.stock <= 0 ? 'Sold Out' : 'Add to Cart'}
            </button>
          </div>
          <span class="stock-pill ${stockClass(p.stock)}">${stockLabel(p.stock)}</span>
        </div>
      </article>`
      )
      .join('');
  }

  async function loadProducts() {
    loadingEl.hidden = false;
    emptyState.hidden = true;
    try {
      const params = new URLSearchParams();
      if (state.category !== 'All') params.set('category', state.category);
      if (state.search) params.set('q', state.search);
      const res = await fetch('/api/products?' + params.toString());
      if (!res.ok) throw new Error('Failed to load products.');
      const data = await res.json();
      state.products = data.products || [];
      renderProducts();
    } catch (err) {
      loadingEl.hidden = true;
      productGrid.innerHTML =
        '<div class="loading">😕 Could not load watches. Please refresh the page.</div>';
    }
  }

  // ---------------- Drawer / modals ----------------

  function openCart() {
    cartDrawer.classList.add('open');
    overlay.classList.add('show');
    document.body.style.overflow = 'hidden';
  }

  function closeDrawer() {
    cartDrawer.classList.remove('open');
    overlay.classList.remove('show');
    document.body.style.overflow = '';
  }

  function openModal(modal) {
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeModal(modal) {
    modal.hidden = true;
    document.body.style.overflow = '';
  }

  // ---------------- Checkout ----------------

  function renderOrderSummary() {
    const total = cartTotal();
    const fee = deliveryFeeFor(total);
    orderSummary.innerHTML = `
      <div class="row"><span>Items (${state.cart.reduce((s, i) => s + i.quantity, 0)})</span><span>${formatKSh(total)}</span></div>
      <div class="row"><span>Delivery fee</span><span>${fee === 0 ? 'FREE' : formatKSh(fee)}</span></div>
      <div class="row total"><span>Total</span><span>${formatKSh(total + fee)}</span></div>`;
  }

  function openCheckout() {
    if (state.cart.length === 0) return;
    renderOrderSummary();
    openModal(checkoutModal);
  }

  async function placeOrder(formData) {
    placeOrderBtn.disabled = true;
    placeOrderBtn.textContent = 'Placing order...';
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: formData.get('full_name'),
          phone: formData.get('phone'),
          email: formData.get('email') || null,
          county: formData.get('county'),
          town: formData.get('town'),
          estate: formData.get('estate'),
          landmark: formData.get('landmark') || null,
          notes: formData.get('notes') || null,
          items: state.cart.map((i) => ({
            product_id: i.product_id,
            quantity: i.quantity,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Could not place your order.');
      }
      const o = data.order;
      successName.textContent = o.customer.full_name;
      successRef.textContent = o.ref;
      successTotal.textContent =
        'Total payable on delivery: ' + formatKSh(o.total) +
        (o.deliveryFee > 0 ? ' (incl. KSh 150 delivery)' : ' (free delivery)');
      successPhone.textContent = o.customer.phone;
      successLoc.textContent = o.customer.town + ', ' + o.customer.county;
      closeModal(checkoutModal);
      openModal(successModal);
      state.cart = [];
      saveCart();
      renderCart();
      renderProducts();
      checkoutForm.reset();
    } catch (err) {
      toastMsg(err.message);
    } finally {
      placeOrderBtn.disabled = false;
      placeOrderBtn.textContent = 'Place Order';
    }
  }

  function setupCountyList() {
    $('countyList').innerHTML = KENYAN_COUNTIES.map(
      (c) => '<option value="' + c + '"></option>'
    ).join('');
  }

  // ---------------- Events ----------------

  function bindEvents() {
    // Filters / search
    document.getElementById('filters').addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      document
        .querySelectorAll('#filters .chip')
        .forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      state.category = chip.dataset.category;
      loadProducts();
    });

    let searchTimer;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.search = searchInput.value.trim();
        loadProducts();
      }, 250);
    });

    // Add to cart (event delegation)
    productGrid.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-add]');
      if (!btn) return;
      const id = Number(btn.dataset.add);
      const product = state.products.find((p) => p.id === id);
      if (product) addToCart(product);
    });

    // Cart drawer
    cartBtn.addEventListener('click', openCart);
    closeCart.addEventListener('click', closeDrawer);
    overlay.addEventListener('click', closeDrawer);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeDrawer();
        closeModal(checkoutModal);
        closeModal(successModal);
      }
    });

    // Cart item actions
    cartItems.addEventListener('click', (e) => {
      const el = e.target.closest('[data-act]');
      if (!el) return;
      const id = Number(el.dataset.id);
      const act = el.dataset.act;
      if (act === 'plus') changeQty(id, 1);
      else if (act === 'minus') changeQty(id, -1);
      else if (act === 'remove') removeItem(id);
    });

    // Checkout
    checkoutBtn.addEventListener('click', openCheckout);
    closeCheckout.addEventListener('click', () => closeModal(checkoutModal));

    checkoutForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!checkoutForm.checkValidity()) {
        checkoutForm.reportValidity();
        return;
      }
      const phone = $('phone').value.replace(/[\s-]/g, '');
      if (!/^(\+?254|0)\d{9}$/.test(phone)) {
        $('phone').focus();
        toastMsg('Enter a valid Kenyan phone number, e.g. 07XX XXX XXX.');
        return;
      }
      const email = $('email').value.trim();
      if (email && !/^\S+@\S+\.\S+$/.test(email)) {
        $('email').focus();
        toastMsg('Enter a valid email address.');
        return;
      }
      placeOrder(new FormData(checkoutForm));
    });

    // Success modal
    continueShopping.addEventListener('click', () => closeModal(successModal));
  }

  // ---------------- Init ----------------

  function init() {
    yearEl.textContent = new Date().getFullYear();
    setupCountyList();
    bindEvents();
    renderCart();
    loadProducts();
  }

  init();
})();
