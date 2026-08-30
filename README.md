# Saa-kenya

An E-commerce store for selling affordable watches in Kenya (KSh 500–5,000).

## Features

### Admin Portal
- 📊 Dashboard with sales statistics and inventory overview
- 📦 Product management (add, edit, delete, image uploads)
- 🧾 Order tracking with status updates
- 🔐 **Secure admin authentication** with password management

### Customer Features
- 🛍️ Browse products by category or search
- 🛒 Shopping cart and checkout
- 📍 Delivery address collection
- 📧 Order confirmation emails

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
- **Database:** MariaDB (MySQL compatible)
- **Frontend:** Vanilla JS + CSS
- **Security:** bcrypt password hashing, HMAC-SHA256 tokens
- **Hosting:** Vercel (with serverless-friendly connection pooling)

## Setup

### Prerequisites
- Node.js 18+
- MariaDB or MySQL
- npm

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

3. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and set your database connection details:
   ```
   DB_HOST=127.0.0.1
   DB_PORT=3306
   DB_USER=watch_user
   DB_PASSWORD=watch_pass
   DB_NAME=watch_store
   ADMIN_PASSWORD=YourSecurePassword123
   ```

4. **Initialize the database:**
   ```bash
   npm run setup-db
   # Or manually: mysql -u root -p < schema.sql
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

### Vercel (Recommended)

1. Push to GitHub
2. Connect repository to Vercel
3. Set environment variables in Vercel dashboard
4. Deploy

The app is serverless-optimized with connection pooling and stateless authentication.

## Security Notes

- All passwords are hashed with bcrypt (10 rounds)
- Admin tokens use HMAC-SHA256 signatures
- Tokens expire after 12 hours
- Database passwords are never exposed in logs or responses
- SQL injection protected via parameterized queries
- File uploads validated by type and size (4MB limit)

## License

MIT
