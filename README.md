# Saa Kenya

An E-commerce store for selling affordable watches in Kenya (KSh 500–5,000).

Customers can browse the catalogue, pay securely through **IntaSend** (including M-Pesa STK push), sign in with their **Google** account or a **Keycloak** SSO account, refer friends through the **affiliate program**, and stay connected via our **WhatsApp group** and **social media** pages.

## Features

### Customer Features
- 🛍️ Browse products by category or search
- 🛒 Shopping cart and checkout with delivery details
- 📱 Payments via **IntaSend** — M-Pesa STK push, cards and PayPal buttons
- 🔐 Optional **SSO login** with Google, or a corporate **Keycloak** realm
- 📦 Order confirmation and tracking
- 🧑‍🤝‍🧑 **Affiliate program** — earn commission for every sale you refer
- 💬 Join our **WhatsApp community** and follow us on Instagram, X (Twitter), Facebook and TikTok

### Admin Portal
- 📊 Dashboard with sales statistics and inventory overview
- 📦 Product management (add, edit, delete, image uploads)
- 🧾 Order tracking with status updates
- 🔐 **Secure admin authentication** with password management

## Customer Accounts & SSO

Customers can create an account so we can remember their details, show order history and (with consent) use their data for offers and support. Two single sign-on options are supported:

- **Google Sign-In** — the simplest for consumers. Customers log in with their existing Google account in one click.
- **Keycloak SSO** — for corporate customers or organisations that want to manage access to your store from their own identity provider. Keycloak speaks standard OIDC, so any IdP (Google, Azure AD, Okta, LDAP-backed Keycloak) can be bridged through it.

### How accounts are used

| Data | Purpose |
|------|---------|
| Name, email | Order confirmation, account identification |
| Phone | Delivery coordination, M-Pesa payment receipt |
| Address (county, town, estate) | Shipping & delivery |
| Order history | Order tracking and re-ordering |

Customer data is never sold. Data collection happens only after the customer signs up and agrees to the consent notice.

### 1. Google Sign-In setup

1. Go to the [Google Cloud Console](https://console.cloud.google.com).
2. Create a project (or reuse one) and enable the **OAuth consent screen** (External user type).
3. Add your app, logo and the authorized redirect URI:
   ```
   https://your-domain.com/api/auth/google/callback
   ```
   (use `http://localhost:3000/...` for local development)
4. Create **OAuth client ID** credentials → **Web application**.
5. Copy the Client ID and Client Secret into your environment:

   ```
   GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-xxxx
   GOOGLE_CALLBACK_URL=https://your-domain.com/api/auth/google/callback
   ```

### 2. Keycloak SSO setup

Option A — **use a hosted Keycloak** (e.g. `keycloak.io`, or a self-hosted instance on a cloud VM).

Option B — **use Keycloak to federate Google**: instead of wiring OAuth directly, you can point Keycloak at Google as an identity provider; customers then see a Keycloak login that forwards to Google.

1. Install and run Keycloak, then create a **Realm** for your store.
2. Create a **Client** of type `openid-connect`, access type **public**, and set redirect URIs:
   ```
   https://your-domain.com/api/auth/keycloak/callback
   ```
3. Create a Client ID (e.g. `saa-store`) and copy the realm's **Well-Known OpenID Configuration** URL:
   ```
   https://your-keycloak.example/realms/<realm>/.well-known/openid-configuration
   ```
4. Set the environment variables:

   ```
   KEYCLOAK_URL=https://your-keycloak.example
   KEYCLOAK_REALM=your-realm
   KEYCLOAK_CLIENT_ID=saa-store
   REDIRECT_URI=https://your-domain.com/api/auth/keycloak/callback
   ```

5. Create users (or connect a user federation / LDAP / Azure AD) inside the realm. They will then be able to sign in to the store.

### Auth-related API endpoints
- `POST /api/auth/google` — start Google OAuth flow
- `GET /api/auth/google/callback` — Google OAuth callback
- `POST /api/auth/keycloak` — start Keycloak login (OIDC authorization)
- `GET /api/auth/keycloak/callback` — Keycloak OIDC callback
- `POST /api/auth/logout` — sign the customer out
- `GET /api/auth/me` — current signed-in customer profile and consent status

## Payments (IntaSend)

[IntaSend](https://intasend.com) handles checkout payments so customers can pay the way they prefer:

- **M-Pesa STK push** — customer approves payment on their phone
- **Card payments** — local and international cards
- **PayPal buttons** — for international customers

### IntaSend setup

1. Create a free account at [intasend.com](https://intasend.com).
2. From the dashboard, create a **Publishable key** (for the frontend, `is_pk_...`) and a **Secret key** (for the server, `is_sk_...`).
3. Set the webhook URL so order statuses update automatically:
   ```
   https://your-domain.com/api/payments/intasend/webhook
   ```
   Enable the **MPESA STK Pay** and **Collection** event types.
4. Add the keys + callback URLs to your environment:

   ```
   INTASEND_PUBLISHABLE_KEY=is_pk_your_key
   INTASEND_SECRET_KEY=is_sk_your_key
   INTASEND_API_BASE=https://payment.intasend.com
   INTASEND_WEBHOOK_SECRET=your-signature-secret
   INTASEND_REDIRECT_URL=https://your-domain.com/order/confirmation
   ```

5. Add the IntaSend JavaScript widget to the storefront:
   ```html
   <script src="https://unpkg.com/intasend-inlinejs-sdk@3/build/intasend-inline.js"></script>
   ```
   Configure it with your publishable key and the checkout amount, then call
   `intasendCheckoutJS({ ... })` on the "Pay" button. The inline SDK handles the
   M-Pesa / card flow and returns a `tracking_id` for verification.

> **Tip:** In sandbox, use the test keys (`is_pk_test_...`, `is_sk_test_...`) and
> check the [IntaSend sandbox guide](https://developers.intasend.com) for test M-Pesa numbers.

### Payment flows
- **Checkout (STK push):** store creates the amount via `POST /api/payments/intasend/stk` → IntaSend triggers the M-Pesa prompt → webhook marks the order `confirmed`.
- **Inline widget:** frontend collects the money via the IntaSend iframe/JS → you verify the `tracking_id` on the server → order is confirmed.
- **Payouts (affiliates & refunds):** use the IntaSend payouts API to send commission/refunds to an M-Pesa number.

### Payment API endpoints
- `POST /api/payments/intasend/stk` — initiate an M-Pesa STK push for the cart total
- `POST /api/payments/intasend/webhook` — payment status updates (protected by webhook signature)
- `POST /api/payments/intasend/verify` — verify a completed payment by `tracking_id`

## Affiliate Program

The **Affiliates** tab lets anyone advertise Saa Kenya and earn a commission on the sales they refer. It is a self-service model: no contract needed, just sign up and start sharing your link.

### How it works for affiliates
1. Open the **Affiliates** tab on the storefront and click **Become an Affiliate**.
2. Sign in (Google / Keycloak) or create an affiliate account with your M-Pesa number.
3. You get a unique referral link, e.g.:
   ```
   https://your-domain.com/?ref=affiliate123
   ```
4. Share it anywhere — WhatsApp, Instagram, TikTok, X, Facebook, YouTube.
5. When someone uses your link:
   - The `?ref=` code is saved in a cookie so the referral survives the whole visit.
   - When they checkout and pay successfully, a **10% commission** is credited to you.
6. See earnings and stats on your affiliate dashboard, and request payout to your M-Pesa / bank number (paid out via IntaSend).

### Affiliate rules
- Commission: **10%** of the paid order total (excluding delivery fee).
- Earned when the referred order is **paid** (not just placed) and not cancelled.
- Store cookies for **30 days** — any purchase within 30 days of the first visit still counts.
- Payouts are processed monthly, or on request once you reach the KSh 500 minimum.

### Affiliate API endpoints
- `POST /api/affiliates/register` — create an affiliate account (or link referral code to SSO login)
- `GET /api/affiliates/dashboard` — stats: clicks, conversions, earnings, payout balance
- `GET /api/affiliates/links` — generate/manage referral links and promo banners
- `POST /api/affiliates/payout` — request payout to M-Pesa (IntaSend payouts)
- `GET /api/affiliates/payments` — track approved payouts and commissions

## Community & Social Media

Stay in touch with Saa Kenya — the fastest way to hear about new arrivals, restocks and flash sales.

- 💬 **WhatsApp Community group** — deals, restock alerts and direct support:
  **[click here to join](https://chat.whatsapp.com/REPLACE_WITH_YOUR_GROUP_INVITE_LINK)**
- 📸 **Instagram** — daily watch photos & stories:
  [@saa.kenya](https://instagram.com/REPLACE_WITH_YOUR_HANDLE)
- ✖️ **X (Twitter)** — announcements and customer support:
  [@saa_kenya](https://x.com/REPLACE_WITH_YOUR_HANDLE)
- 📘 **Facebook** — page for product drops and community posts:
  [facebook.com/REPLACE_WITH_YOUR_PAGE](https://facebook.com/REPLACE_WITH_YOUR_PAGE)
- 🎵 **TikTok** — short product videos & watch unboxings:
  [@saa.kenya](https://tiktok.com/REPLACE_WITH_YOUR_HANDLE)

> Replace the `REPLACE_WITH_...` placeholder links with the real handles/URLs for the store.

The same links appear in the storefront footer and on the product pages, next to the "Share this watch" buttons.

## Admin Password Management

Admins can securely change their password through the admin portal:

1. **Login** to the admin portal at `/admin.html`
2. Click the **Settings** tab
3. Fill in the "Change Admin Password" form:
   - Current password
   - New password (with requirements shown)
   - Confirm new password

### Password Requirements
- **Minimum 8 characters**
- **Uppercase letters** (A-Z)
- **Lowercase letters** (a-z)
- **Numbers** (0-9)
- **Must differ** from current password

**Note:** After changing your password, you'll be signed out and must log in again with the new password.

### Initial Setup
- Default password: Set via `ADMIN_PASSWORD` environment variable in `.env`
- On first app start, the password is automatically hashed and stored in the database
- The system supports both database and env var passwords for backward compatibility

## Tech Stack

- **Backend:** Node.js + Express
- **Database:** PostgreSQL (Supabase)
- **Frontend:** Vanilla JS + CSS
- **Auth:** Google OAuth 2.0 / OIDC, Keycloak (OIDC), JWT session cookies
- **Payments:** IntaSend (M-Pesa STK push, cards, PayPal) with webhooks
- **Affiliates:** referral cookie tracking + commission ledger
- **Security:** bcrypt password hashing, HMAC-SHA256 tokens
- **Hosting:** Vercel (with serverless-friendly connection pooling)

## Setup

### Prerequisites
- Node.js 18+
- PostgreSQL (free tier: Supabase)
- npm
- IntaSend account (free) — for payments
- Google Cloud console project **or** a Keycloak realm — for SSO (optional at first)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/IrunguPeter/Saa-kenya.git
   cd Saa-kenya
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Create the Supabase database:**
   - Create a free project at [supabase.com](https://supabase.com)
   - Open **SQL Editor**, paste the contents of `schema.sql`, and run it
   - Copy your connection string from **Project Settings → Database → Connection pooling** (Transaction pooler URL, port 6543)

4. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and set your database connection, payment keys and (optionally) SSO keys:
   ```
   DATABASE_URL=postgresql://postgres.yourref:password@aws-0-region.pooler.supabase.com:6543/postgres?ssl=true
   ADMIN_PASSWORD=YourSecurePassword123

   # Payments (IntaSend)
   INTASEND_PUBLISHABLE_KEY=is_pk_your_key
   INTASEND_SECRET_KEY=is_sk_your_key

   # SSO (both optional)
   GOOGLE_CLIENT_ID=
   GOOGLE_CLIENT_SECRET=
   KEYCLOAK_URL=
   KEYCLOAK_REALM=
   KEYCLOAK_CLIENT_ID=
   ```

5. **Start the server:**
   ```bash
   npm start
   ```

   The app will be available at:
   - **Store:** http://localhost:3000
   - **Admin:** http://localhost:3000/admin.html

## API Endpoints

### Public
- `GET /api/products` - List products with filtering
- `POST /api/orders` - Create new order

### Customer Auth
- `POST /api/auth/google` - Start Google SSO login
- `GET /api/auth/google/callback` - Google OAuth callback
- `POST /api/auth/keycloak` - Start Keycloak login
- `GET /api/auth/keycloak/callback` - Keycloak OIDC callback
- `POST /api/auth/logout` - Customer logout
- `GET /api/auth/me` - Current customer profile

### Payments (IntaSend)
- `POST /api/payments/intasend/stk` - Start M-Pesa STK push
- `POST /api/payments/intasend/webhook` - Payment status webhook
- `POST /api/payments/intasend/verify` - Verify payment by tracking id

### Affiliates
- `POST /api/affiliates/register` - Register as an affiliate
- `GET /api/affiliates/dashboard` - Affiliate earnings + stats
- `GET /api/affiliates/links` - Referral links and banners
- `POST /api/affiliates/payout` - Request M-Pesa payout
- `GET /api/affiliates/payments` - Commission/payout history

### Admin (requires authentication)
- `POST /api/admin/login` - Authenticate and get token
- `POST /api/admin/change-password` - Change admin password
- `GET /api/admin/stats` - Dashboard statistics
- `GET /api/admin/orders` - List all orders
- `PUT /api/admin/orders/:id/status` - Update order status
- `POST /api/admin/products` - Create product
- `PUT /api/admin/products/:id` - Update product
- `DELETE /api/admin/products/:id` - Delete product
- `POST /api/admin/products/:id/image` - Upload product image
- `DELETE /api/admin/products/:id/image` - Remove product image

## Deployment

### Vercel

1. Push to GitHub
2. Connect repository to Vercel
3. Set the environment variables in Vercel dashboard:
   ```
   DATABASE_URL=<your Supabase transaction pooler connection string with ?ssl=true>
   ADMIN_PASSWORD=YourSecurePassword123
   INTASEND_PUBLISHABLE_KEY=is_pk_your_key
   INTASEND_SECRET_KEY=is_sk_your_key
   GOOGLE_CLIENT_ID=<optional>
   GOOGLE_CLIENT_SECRET=<optional>
   KEYCLOAK_URL=<optional>
   KEYCLOAK_REALM=<optional>
   KEYCLOAK_CLIENT_ID=<optional>
   ```
4. Add the webhook URL in the IntaSend dashboard:
   ```
   https://your-domain.vercel.app/api/payments/intasend/webhook
   ```
5. Deploy

The app is serverless-optimized with connection pooling and stateless authentication.

## Security Notes

- All passwords are hashed with bcrypt (10 rounds)
- Admin tokens use HMAC-SHA256 signatures and expire after 12 hours
- Customer SSO sessions use signed tokens/cookies with `httpOnly` and `SameSite`
- IntaSend webhooks are verified by signature before order status is changed
- Database passwords and secret keys are never exposed in logs or responses
- SQL injection protected via parameterized queries
- File uploads validated by type and size (10MB maximum)
- Customer data is only collected with explicit consent (see the signup notice)

## License

MIT