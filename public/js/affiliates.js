(function () {
  'use strict';

  // ---------------- DOM refs ----------------

  const $ = (id) => document.getElementById(id);
  const toast = $('toast');
  const affRoot = $('affRoot');

  // ---------------- Utilities ----------------

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

  function toastMsg(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.hidden = false;
    clearTimeout(toastMsg._t);
    toastMsg._t = setTimeout(() => {
      toast.hidden = true;
    }, 3200);
  }

  async function apiFetch(url, options) {
    const res = await fetch(url, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Something went wrong. Please try again.');
    }
    return data;
  }

  function affStatusLabel(status) {
    return {
      earned: 'Earned',
      pending: 'Pending',
      void: 'Void',
      requested: 'Requested',
      paid: 'Paid',
      rejected: 'Rejected',
    }[status] || status;
  }

  // ---------------- Portal ----------------

  function renderAffAuth() {
    affRoot.innerHTML = `
      <div class="auth-card">
        <div class="auth-tabs">
          <button type="button" class="aff-tab active" data-aff-tab="login">Log in</button>
          <button type="button" class="aff-tab" data-aff-tab="register">Sign up</button>
        </div>
        <form id="affForm" data-aff-mode="login" novalidate>
          <div class="form-grid">
            <div class="field full aff-name-field" hidden>
              <label for="affName">Full name</label>
              <input type="text" id="affName" name="name" placeholder="e.g. Kevin Otieno" autocomplete="name" />
            </div>
            <div class="field">
              <label for="affEmail">Email</label>
              <input type="email" id="affEmail" name="email" placeholder="you@example.com" autocomplete="email" required />
            </div>
            <div class="field aff-phone-field" hidden>
              <label for="affPhone">M-Pesa number</label>
              <input type="tel" id="affPhone" name="phone" placeholder="07XX XXX XXX / +254..." autocomplete="tel" />
            </div>
            <div class="field full">
              <label for="affPassword">Password</label>
              <input type="password" id="affPassword" name="password" placeholder="8+ chars with letters & numbers" required />
            </div>
          </div>
          <button type="submit" class="btn btn-primary btn-block">Log in</button>
        </form>
        <p class="form-note">Earn 10% commission on every sale your link brings.<br />Payout to your M-Pesa once you reach KSh 500.</p>
      </div>`;
  }

  function renderAffDashboard(data, links) {
    const aff = data.affiliate;
    const commissionRows = (data.commissions || [])
      .map(
        (c) => `
        <tr>
          <td>${escapeHtml(c.order_ref)}</td>
          <td>${formatKSh(c.amount)}</td>
          <td><span class="aff-badge ${escapeHtml(c.status)}">${affStatusLabel(c.status)}</span></td>
          <td>${escapeHtml(c.created_at || '')}</td>
        </tr>`
      )
      .join('');

    const payoutRows = (data.payouts || [])
      .map(
        (p) => `
        <tr>
          <td>${formatKSh(p.amount)}</td>
          <td><span class="aff-badge ${escapeHtml(p.status)}">${affStatusLabel(p.status)}</span></td>
          <td>${escapeHtml(p.created_at || '')}</td>
        </tr>`
      )
      .join('');

    const share = links && links.shareLinks ? links.shareLinks : {};
    const canPayout = data.available >= data.minPayout;

    affRoot.innerHTML = `
      <div class="aff-dash">
        <div class="aff-dash-head">
          <div>
            <h3>Hi, ${escapeHtml(aff.name)} 👋</h3>
            <p class="sub">Referral code: <strong>${escapeHtml(aff.code)}</strong> &middot; Commission: ${Math.round((data.rate || 0.1) * 100)}%</p>
          </div>
          <button type="button" class="btn btn-ghost" id="affLogoutBtn">Log out</button>
        </div>

        <div class="aff-stats">
          <div class="stat"><span>${Number(data.clicks) || 0}</span><label>Link clicks</label></div>
          <div class="stat"><span>${data.conversions}</span><label>Referred orders</label></div>
          <div class="stat"><span>${formatKSh(data.earned)}</span><label>Earned</label></div>
          <div class="stat highlight"><span>${formatKSh(data.available)}</span><label>Available</label></div>
        </div>

        <div class="aff-share">
          <label for="affRefLink">Your referral link</label>
          <div class="ref-row">
            <input type="text" id="affRefLink" readonly value="${escapeHtml(data.referralLink)}" />
            <button type="button" class="btn btn-primary" id="affCopyBtn">Copy</button>
          </div>
          <div class="share-row">
            <a class="share-chip" href="${escapeHtml(share.whatsapp)}" target="_blank" rel="noopener" data-share="WhatsApp">💬 WhatsApp</a>
            <a class="share-chip" href="${escapeHtml(share.x)}" target="_blank" rel="noopener" data-share="X">✖️ X</a>
            <a class="share-chip" href="${escapeHtml(share.facebook)}" target="_blank" rel="noopener" data-share="Facebook">📘 Facebook</a>
            <a class="share-chip" href="${escapeHtml(share.telegram)}" target="_blank" rel="noopener" data-share="Telegram">✈️ Telegram</a>
          </div>
        </div>

        <div class="aff-cta">
          <p>${canPayout ? 'Your available balance is ready to be paid to your M-Pesa.' : 'Earn at least KSh ' + (data.minPayout).toLocaleString() + ' to request a payout.'}</p>
          <button type="button" class="btn btn-primary" id="affPayoutBtn" ${canPayout ? '' : 'disabled'}>
            Request payout (${formatKSh(data.available)})
          </button>
        </div>

        ${commissionRows ? `
        <div class="aff-table">
          <h4>Commissions</h4>
          <table>
            <thead><tr><th>Order</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead>
            <tbody>${commissionRows}</tbody>
          </table>
        </div>` : '<p class="form-note">No referred orders yet — share your link to get started!</p>'}

        ${payoutRows ? `
        <div class="aff-table">
          <h4>Payouts</h4>
          <table>
            <thead><tr><th>Amount</th><th>Status</th><th>Date</th></tr></thead>
            <tbody>${payoutRows}</tbody>
          </table>
        </div>` : ''}
      </div>`;
  }

  async function loadAffPortal() {
    renderAffAuth();
    try {
      const [data, links] = await Promise.all([
        apiFetch('/api/affiliates/dashboard'),
        apiFetch('/api/affiliates/links'),
      ]);
      renderAffDashboard(data, links);
    } catch (err) {
      // Not logged in - the sign up / log in form stays visible.
    }
  }

  function affTab(mode) {
    document
      .querySelectorAll('#affRoot .aff-tab')
      .forEach((t) => t.classList.toggle('active', t.dataset.affTab === mode));
    const form = $('affForm');
    if (!form) return;
    form.dataset.affMode = mode;
    const isRegister = mode === 'register';
    document.querySelectorAll('#affRoot .aff-name-field, #affRoot .aff-phone-field').forEach((f) => {
      f.hidden = !isRegister;
    });
    const btn = form.querySelector('button[type="submit"]');
    if (btn) btn.textContent = isRegister ? 'Create affiliate account' : 'Log in';
    const pw = form.querySelector('[name="password"]');
    if (pw) pw.autocomplete = isRegister ? 'new-password' : 'current-password';
  }

  async function submitAffForm(form) {
    const mode = form.dataset.affMode || 'login';
    const email = $('affEmail').value.trim();
    const password = $('affPassword').value;

    if (!email || !password) {
      toastMsg('Email and password are required.');
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      toastMsg('Enter a valid email address.');
      return;
    }

    const url =
      mode === 'register' ? '/api/affiliates/register' : '/api/affiliates/login';
    const body = { email, password };

    if (mode === 'register') {
      const name = $('affName').value.trim();
      const phone = $('affPhone').value.replace(/[\s-]/g, '');
      if (!name) {
        toastMsg('Please enter your full name.');
        return;
      }
      if (!/^(\+?254|0)\d{9}$/.test(phone)) {
        toastMsg('Enter a valid Kenyan M-Pesa number.');
        return;
      }
      body.name = name;
      body.phone = phone;
    }

    try {
      await apiFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      toastMsg(mode === 'register' ? 'Welcome! Your affiliate account is ready.' : 'Welcome back!');
      await loadAffPortal();
    } catch (err) {
      toastMsg(err.message);
    }
  }

  async function logoutAff() {
    try {
      await apiFetch('/api/affiliates/logout', { method: 'POST' });
    } catch (e) {
      // ignore
    }
    renderAffAuth();
  }

  function copyAffLink() {
    const input = $('affRefLink');
    if (!input) return;
    input.select();
    input.setSelectionRange(0, input.value.length);
    const done = () => {
      toastMsg('Referral link copied! 🎉');
      input.blur();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(input.value).then(done).catch(() => done());
    } else {
      try {
        document.execCommand('copy');
        done();
      } catch (e) {
        toastMsg('Select the link and copy it manually.');
      }
    }
  }

  async function requestPayout() {
    try {
      const data = await apiFetch('/api/affiliates/payout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      toastMsg('Payout requested! We will send ' + formatKSh(data.payout.amount) + ' to your M-Pesa.');
      await loadAffPortal();
    } catch (err) {
      toastMsg(err.message);
    }
  }

  function bindAffiliateEvents() {
    affRoot.addEventListener('click', (e) => {
      const tab = e.target.closest('[data-aff-tab]');
      if (tab) {
        affTab(tab.dataset.affTab);
        return;
      }
      if (e.target.id === 'affCopyBtn') {
        copyAffLink();
        return;
      }
      if (e.target.id === 'affPayoutBtn') {
        e.target.disabled = true;
        requestPayout();
        return;
      }
      if (e.target.id === 'affLogoutBtn') {
        logoutAff();
      }
    });

    affRoot.addEventListener('submit', (e) => {
      const form = e.target.closest('#affForm');
      if (!form) return;
      e.preventDefault();
      submitAffForm(form);
    });
  }

  // ---------------- Init ----------------

  function init() {
    const year = $('year');
    if (year) year.textContent = new Date().getFullYear();
    bindAffiliateEvents();
    loadAffPortal();
  }

  init();
})();