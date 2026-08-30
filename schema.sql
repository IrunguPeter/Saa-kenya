-- ============================================================
--  Saa Kenya - PostgreSQL schema (Supabase)
--  Paste this into the Supabase SQL Editor and run it once.
-- ============================================================

-- Admin credentials (stored separately for secure password management)
CREATE TABLE IF NOT EXISTS admin_credentials (
  id            SERIAL PRIMARY KEY,
  username      VARCHAR(50) NOT NULL DEFAULT 'admin' UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------
-- Products (watches priced KSh 500 - 5,000)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(120)   NOT NULL,
  description TEXT           NOT NULL,
  price       NUMERIC(10,2)  NOT NULL,
  category    VARCHAR(50)    NOT NULL DEFAULT 'Men',
  image_url   VARCHAR(500)   DEFAULT NULL,
  stock       INT            NOT NULL DEFAULT 0,
  featured    SMALLINT       NOT NULL DEFAULT 0,
  created_at  TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------
-- Customers (collected at checkout for delivery/shipping)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
  id         SERIAL PRIMARY KEY,
  full_name  VARCHAR(120)  NOT NULL,
  phone      VARCHAR(30)   NOT NULL,
  email      VARCHAR(120)  DEFAULT NULL,
  county     VARCHAR(80)   NOT NULL,
  town       VARCHAR(120)  NOT NULL,
  estate     VARCHAR(150)  NOT NULL,
  landmark   VARCHAR(200)  DEFAULT NULL,
  notes      TEXT          DEFAULT NULL,
  created_at TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------
-- Orders
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id           SERIAL PRIMARY KEY,
  ref          VARCHAR(20)   NOT NULL UNIQUE,
  customer_id  INT           NOT NULL,
  total        NUMERIC(10,2) NOT NULL,
  delivery_fee NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  status       VARCHAR(20)   NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','confirmed','shipped','delivered','cancelled')),
  created_at   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_orders_customer
    FOREIGN KEY (customer_id) REFERENCES customers(id)
    ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- Product images (uploaded photos stored as blobs so they work
-- on any host, including serverless / Vercel)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_images (
  id           SERIAL PRIMARY KEY,
  product_id   INT NOT NULL,
  data         BYTEA NOT NULL,
  content_type VARCHAR(80) NOT NULL,
  sort_order   INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_image_product
    FOREIGN KEY (product_id) REFERENCES products(id)
    ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- Order items (snapshot of product so history survives edits)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_items (
  id           SERIAL PRIMARY KEY,
  order_id     INT           NOT NULL,
  product_id   INT           DEFAULT NULL,
  product_name VARCHAR(120)  NOT NULL,
  price        NUMERIC(10,2) NOT NULL,
  quantity     INT           NOT NULL DEFAULT 1,
  CONSTRAINT fk_items_order
    FOREIGN KEY (order_id) REFERENCES orders(id)
    ON DELETE CASCADE
);

-- Keep updated_at current whenever admin_credentials changes.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_admin_updated ON admin_credentials;
CREATE TRIGGER trg_admin_updated
  BEFORE UPDATE ON admin_credentials
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- Seed data - sample watches between KSh 500 and KSh 5,000
-- ------------------------------------------------------------
INSERT INTO products (name, description, price, category, stock, featured) VALUES
('Tempo Classic Leather Watch', 'Genuine leather strap with a minimal analog dial. Perfect for work and everyday wear.', 950.00, 'Men', 25, 1),
('Urban Sport Digital Watch', 'Durable digital watch with stopwatch, alarm and water resistance. Great value.', 750.00, 'Men', 40, 1),
('Silverline Analog Steel Watch', 'Stainless steel case and bracelet with a scratch-resistant mineral glass face.', 1450.00, 'Men', 18, 1),
('FitPulse Basic Smartwatch', 'Bluetooth smartwatch with step counter, heart-rate monitor and phone notifications.', 3200.00, 'Smart', 15, 1),
('Racer Chronograph Watch', 'Three-dial chronograph with bold tachymeter bezel. Sporty statement piece.', 2400.00, 'Men', 12, 0),
('RoseBlush Ladies Watch', 'Elegant rose-gold finish with a slim profile and genuine leather strap.', 1900.00, 'Women', 22, 1),
('Minimal Slim Watch', 'Ultra-thin minimalist design with mesh strap. Fits any outfit.', 1200.00, 'Women', 30, 0),
('Kinder Time Kids Watch', 'Fun, colourful and splash-proof watch made for kids hands. Easy to read.', 550.00, 'Kids', 35, 0),
('DeepBlue Diver Watch', '200m water resistance with luminous hands and rotating bezel.', 2800.00, 'Men', 10, 0),
('Executive Gold Watch', 'Gold-tone dress watch that looks premium at a pocket-friendly price.', 3900.00, 'Men', 8, 0),
('Bella Trend Ladies Watch', 'Ladies quartz watch with crystal-set bezel and chain-link strap.', 1650.00, 'Women', 20, 0),
('Titan Ultra Smartwatch', '1.83 inch HD display, sleep tracking and 7-day battery life.', 4600.00, 'Smart', 12, 0),
('Everyday Casual Watch', 'Comfortable resin strap analog watch for daily use. Comes in 4 colours.', 850.00, 'Unisex', 28, 0),
('Classic Twin Watch Set', 'Matching couple watch set - his and hers. Great gift idea.', 2950.00, 'Unisex', 6, 0);

-- ------------------------------------------------------------
-- Migrations
-- ------------------------------------------------------------
ALTER TABLE product_images DROP CONSTRAINT IF EXISTS product_images_product_id_key;
ALTER TABLE product_images ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;