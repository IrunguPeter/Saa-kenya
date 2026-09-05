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

  // Lightbox (click-to-view image gallery)
  const lightbox = $('lightbox');
  const lightboxStage = $('lightboxStage');
  const lightboxClose = $('lightboxClose');
  const lightboxPrev = $('lightboxPrev');
  const lightboxNext = $('lightboxNext');
  const lightboxDots = $('lightboxDots');
  const lightboxCount = $('lightboxCount');

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

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c]);
  }

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

  // Ordered list of image URLs for a product (used by the swipeable carousel).
  // Falls back to a single image (image_url or placeholder) when no photos exist.
  function productSlides(p) {
    if (p.images && p.images.length) return p.images.map((img) => img.url);
    return [productImage(p)];
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
        <img src="${productImage(i)}" alt="${escapeHtml(i.name)}" loading="lazy" />
        <div class="cart-item-info">
          <div class="cart-item-name">${escapeHtml(i.name)}</div>
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
      <article class="product-card" data-id="${p.id}">
        ${p.featured ? '<span class="badge-flag">Featured</span>' : ''}
        ${
          (() => {
            const slides = productSlides(p);
            const safeAlt = escapeHtml(p.name);
            const imgs = slides
              .map((s) => `<img class="product-img" src="${s}" alt="${safeAlt}" loading="lazy" />`)
              .join('');
            const multi = slides.length > 1;
            const controls = multi
              ? `<button type="button" class="car-btn prev" aria-label="Previous image">&#8249;</button>
                 <button type="button" class="car-btn next" aria-label="Next image">&#8250;</button>
                 <div class="car-dots">${slides.map((s, i) => `<span data-i="${i}"></span>`).join('')}</div>`
              : '';
            return `<div class="img-carousel"${multi ? ' data-carousel="1"' : ''}>
              <div class="carousel-track">${imgs}</div>
              ${controls}
            </div>`;
          })()
        }
        <div class="product-body">
          <span class="product-cat">${escapeHtml(p.category)}</span>
          <h3 class="product-name">${escapeHtml(p.name)}</h3>
          <p class="product-desc">${escapeHtml(p.description)}</p>
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
    initCarousels();
  }

  // Wire up carousel controls + touch swipe for product image galleries.
  function initCarousels() {
    productGrid.querySelectorAll('.img-carousel[data-carousel]').forEach((carousel) => {
      if (carousel.dataset.bound) return;
      carousel.dataset.bound = '1';
      const track = carousel.querySelector('.carousel-track');
      const slides = Array.from(carousel.querySelectorAll('.carousel-track > img'));
      const dots = Array.from(carousel.querySelectorAll('.car-dots span'));
      const total = slides.length;
      let index = 0;

      const goTo = (i) => {
        index = (i + total) % total;
        carousel.dataset.index = index;
        track.style.transform = 'translateX(' + -index * 100 + '%)';
        dots.forEach((d, di) => d.classList.toggle('active', di === index));
      };

      const next = () => goTo(index + 1);
      const prev = () => goTo(index - 1);

      const prevBtn = carousel.querySelector('.car-btn.prev');
      const nextBtn = carousel.querySelector('.car-btn.next');
      if (prevBtn) prevBtn.addEventListener('click', (e) => { e.stopPropagation(); prev(); });
      if (nextBtn) nextBtn.addEventListener('click', (e) => { e.stopPropagation(); next(); });

      dots.forEach((d) =>
        d.addEventListener('click', (e) => { e.stopPropagation(); goTo(Number(d.dataset.i)); })
      );

      // Touch swipe
      let x0 = null;
      carousel.addEventListener('touchstart', (e) => {
        x0 = e.touches[0].clientX;
      }, { passive: true });
      carousel.addEventListener('touchend', (e) => {
        if (x0 == null) return;
        const dx = e.changedTouches[0].clientX - x0;
        if (Math.abs(dx) > 40) dx < 0 ? next() : prev();
        x0 = null;
      }, { passive: true });

      goTo(0);
    });
  }

  // ---------------- Lightbox (enlarged image viewer) ----------------

  let lbSlides = [];
  let lbIndex = 0;

  function openLightbox(slides, startIndex) {
    lbSlides = slides;
    lbIndex = Math.max(0, Math.min(startIndex || 0, slides.length - 1));
    renderLightbox();
    lightbox.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox() {
    lightbox.hidden = true;
    document.body.style.overflow = '';
  }

  function renderLightbox() {
    lightboxStage.innerHTML =
      '<div class="lightbox-track">' +
      lbSlides
        .map(
          (s, i) =>
            '<img class="lightbox-img" src="' + s + '" alt="Product image ' +
            (i + 1) + '" loading="lazy" />'
        )
        .join('') +
      '</div>';
    updateLightbox();
  }

  function updateLightbox() {
    const track = lightboxStage.querySelector('.lightbox-track');
    if (track) track.style.transform = 'translateX(' + -lbIndex * 100 + '%)';
    const total = lbSlides.length;
    lightboxDots.innerHTML =
      total > 1
        ? lbSlides
            .map(
              (_, i) =>
                '<span data-i="' + i + '"' + (i === lbIndex ? ' class="active"' : '') + '></span>'
            )
            .join('')
        : '';
    lightboxPrev.hidden = total <= 1;
    lightboxNext.hidden = total <= 1;
    lightboxCount.textContent = total > 1 ? lbIndex + 1 + ' / ' + total : '';
  }

  function lbGoTo(i) {
    lbIndex = (i + lbSlides.length) % lbSlides.length;
    updateLightbox();
  }

  // Open the lightbox on the slide the customer was viewing in the card carousel.
  function openLightboxForCard(card) {
    const product = state.products.find(
      (p) => p.id === Number(card && card.dataset.id)
    );
    if (!product) return;
    const carousel = card.querySelector('[data-carousel]');
    openLightbox(
      productSlides(product),
      carousel ? Number(carousel.dataset.index) || 0 : 0
    );
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

    // Open image lightbox when a product image is clicked.
    productGrid.addEventListener('click', (e) => {
      if (!e.target.closest('.img-carousel .product-img')) return;
      openLightboxForCard(e.target.closest('.product-card'));
    });

    // Lightbox controls
    lightboxClose.addEventListener('click', closeLightbox);
    lightboxPrev.addEventListener('click', () => lbGoTo(lbIndex - 1));
    lightboxNext.addEventListener('click', () => lbGoTo(lbIndex + 1));
    lightboxDots.addEventListener('click', (e) => {
      const dot = e.target.closest('span[data-i]');
      if (dot) lbGoTo(Number(dot.dataset.i));
    });
    lightbox.addEventListener('click', (e) => {
      if (e.target === lightbox) closeLightbox();
    });

    // Touch swipe inside the lightbox
    let lbX0 = null;
    lightbox.addEventListener('touchstart', (e) => {
      lbX0 = e.touches[0].clientX;
    }, { passive: true });
    lightbox.addEventListener('touchend', (e) => {
      if (lbX0 == null) return;
      const dx = e.changedTouches[0].clientX - lbX0;
      if (Math.abs(dx) > 40) dx < 0 ? lbGoTo(lbIndex + 1) : lbGoTo(lbIndex - 1);
      lbX0 = null;
    }, { passive: true });

    // Cart drawer
    cartBtn.addEventListener('click', openCart);
    closeCart.addEventListener('click', closeDrawer);
    overlay.addEventListener('click', closeDrawer);
    document.addEventListener('keydown', (e) => {
      if (!lightbox.hidden) {
        if (e.key === 'Escape') closeLightbox();
        else if (e.key === 'ArrowRight') lbGoTo(lbIndex + 1);
        else if (e.key === 'ArrowLeft') lbGoTo(lbIndex - 1);
        return;
      }
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
