const webpush = require('web-push');
const { Resend } = require('resend');

const MAIL_FROM = process.env.MAIL_FROM || 'Saa Kenya <onboarding@resend.dev>';

const webPushVapid = {
  publicKey: process.env.WEB_PUSH_VAPID_PUBLIC_KEY,
  privateKey: process.env.WEB_PUSH_VAPID_PRIVATE_KEY,
  email: process.env.WEB_PUSH_VAPID_EMAIL || 'mailto:admin@saakenya.xyz',
};

function webPushConfigured() {
  return Boolean(webPushVapid.publicKey && webPushVapid.privateKey);
}

function initWebPush() {
  if (webPushConfigured()) {
    webpush.setVapidDetails(webPushVapid.email, webPushVapid.publicKey, webPushVapid.privateKey);
  }
}

initWebPush();

// Fire-and-forget email notification of a new order to the admin.
async function sendOrderEmail(order) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.ADMIN_EMAIL;
  if (!apiKey || !to) return;

  const resend = new Resend(apiKey);

  const itemsHtml = order.items
    .map(
      (it) =>
        `<tr>
          <td style="padding:8px 0;border-bottom:1px solid #eee;">${escapeHtml(it.product_name)} × ${it.quantity}</td>
          <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;">KSh ${Number(it.price * it.quantity).toLocaleString('en-KE')}</td>
        </tr>`
    )
    .join('');

  const body = {
    from: MAIL_FROM,
    to: [to],
    subject: `🛒 New Order: ${order.ref}`,
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1f2937;">
        <h2 style="color:#111827;">New order received 🎉</h2>
        <p>An order has just been placed on the Saa Kenya store.</p>

        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr style="background:#f3f4f6;"><td style="padding:8px 12px;font-weight:bold;">Order reference</td><td style="padding:8px 12px;">${order.ref}</td></tr>
          <tr><td style="padding:8px 12px;font-weight:bold;">Customer</td><td style="padding:8px 12px;">${escapeHtml(order.customer.full_name)}</td></tr>
          <tr style="background:#f3f4f6;"><td style="padding:8px 12px;font-weight:bold;">Phone</td><td style="padding:8px 12px;">${escapeHtml(order.customer.phone)}</td></tr>
          <tr><td style="padding:8px 12px;font-weight:bold;">Delivery address</td><td style="padding:8px 12px;">${escapeHtml(order.customer.estate)}, ${escapeHtml(order.customer.town)}, ${escapeHtml(order.customer.county)}</td></tr>
        </table>

        <h3 style="margin:20px 0 8px;color:#111827;">Items</h3>
        <table style="width:100%;border-collapse:collapse;">${itemsHtml}</table>

        <div style="margin-top:16px;padding:12px;background:#f9fafb;border-radius:8px;">
          <div style="display:flex;justify-content:space-between;">
            <span>Delivery${order.deliveryFee > 0 ? '' : ' (free)'}</span>
            <span>${order.deliveryFee > 0 ? 'KSh ' + Number(order.deliveryFee).toLocaleString('en-KE') : 'Free'}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:18px;font-weight:bold;margin-top:8px;border-top:2px solid #e5e7eb;padding-top:8px;">
            <span>Total</span><span>KSh ${Number(order.total).toLocaleString('en-KE')}</span>
          </div>
        </div>

        <p style="margin-top:24px;">
          <a href="${escapeHtml(process.env.SITE_URL || '')}/admin.html" style="background:#111827;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;">View order in admin</a>
        </p>
      </div>`,
  };

  try {
    await resend.emails.send(body);
  } catch (err) {
    console.error('Failed to send order email:', err);
  }
}

// Send a web push notification to every subscribed admin endpoint.
async function sendOrderPush(order) {
  if (!webPushConfigured()) return;

  const db = require('./db');
  const payload = JSON.stringify({
    title: `New order: ${order.ref}`,
    body: `${order.customer.full_name} · ${order.items
      .map((it) => `${it.product_name} × ${it.quantity}`)
      .join(', ')} · KSh ${Number(order.total).toLocaleString('en-KE')}`,
    data: { url: '/admin.html' },
  });

  let subs;
  try {
    const [rows] = await db.query('SELECT endpoint, p256dh, auth FROM push_subscriptions');
    subs = rows || [];
  } catch (err) {
    console.error('Failed to load push subscriptions:', err);
    return;
  }

  const results = await Promise.allSettled(
    subs.map((s) =>
      webpush
        .sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload
        )
        .catch(async (err) => {
          if (err && err.statusCode === 404) {
            await db.query('DELETE FROM push_subscriptions WHERE endpoint = ?', [s.endpoint]);
          }
          throw err;
        })
    )
  );

  for (const r of results) {
    if (r.status === 'rejected') {
      console.error('Push notification failed:', r.reason && r.reason.message);
    }
  }
}

// Handle both channels for a new order. Never throws so order placement is
// not affected by notification failures.
async function notifyAdmin(order) {
  initWebPush();
  const tasks = [];
  if (process.env.RESEND_API_KEY && process.env.ADMIN_EMAIL) {
    tasks.push(sendOrderEmail(order));
  }
  tasks.push(sendOrderPush(order));
  await Promise.allSettled(tasks);
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[c]);
}

module.exports = { notifyAdmin, sendOrderEmail, sendOrderPush, webPushConfigured, initWebPush };
