import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownUp,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Heart,
  Instagram,
  Menu,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  Sparkles,
  Star,
  Truck,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

type ApiProduct = {
  id: number;
  name: string;
  description: string;
  price: number;
  category: string;
  image_url: string | null;
  stock: number;
  featured: number;
  images: { id: number; url: string }[];
};

type Product = {
  id: number;
  name: string;
  category: string;
  price: number;
  oldPrice?: number;
  badge?: string;
  image: string;
  tone: string;
  blurb: string;
  stock: number;
};

type CartLine = Product & { quantity: number };

type OrderResult = {
  ref: string;
  total: number;
  deliveryFee: number;
  customer: { full_name: string; phone: string; county: string; town: string; estate: string };
};

const TONES = ["#e7d3b9", "#e77f61", "#d9d5ce", "#566244", "#8d6677", "#cfb18d", "#b6a98f", "#c9d1c3"];

const hashTone = (name: string) => {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length];
};

const toProduct = (p: ApiProduct): Product => ({
  id: p.id,
  name: p.name,
  category: p.category,
  price: Number(p.price),
  image: p.images[0]?.url ?? p.image_url ?? `/img/placeholder/${p.id}.svg?name=${encodeURIComponent(p.name)}`,
  tone: hashTone(p.name),
  blurb: p.description ? (p.description.length > 52 ? `${p.description.slice(0, 52).trimEnd()}…` : p.description) : "Everyday carry",
  stock: p.stock,
  badge: p.stock === 0 ? "Sold out" : p.featured ? "Collection pick" : p.price <= 1000 ? "Easy on" : undefined,
});

const money = (value: number) => `KSh ${new Intl.NumberFormat("en-KE").format(value)}`;

const DELIVERY_FREE_OVER = 2000;
const DELIVERY_FEE = 150;

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [category, setCategory] = useState("All watches");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("featured");
  const [maxPrice, setMaxPrice] = useState(5000);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [liked, setLiked] = useState<number[]>([]);
  const [mobileNav, setMobileNav] = useState(false);
  const [email, setEmail] = useState("");

  const [form, setForm] = useState({ full_name: "", phone: "", email: "", county: "", town: "", estate: "", landmark: "", notes: "" });
  const [submitting, setSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [orderResult, setOrderResult] = useState<OrderResult | null>(null);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch("/api/products");
      if (!res.ok) throw new Error("Could not load the collection.");
      const data = await res.json();
      setProducts((data.products ?? []).map(toProduct));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load the collection.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) set.add(p.category);
    return ["All watches", ...Array.from(set)];
  }, [products]);

  const visibleProducts = useMemo(() => {
    const filtered = products.filter((product) => {
      const matchesCategory = category === "All watches" || product.category === category;
      const matchesSearch = product.name.toLowerCase().includes(search.toLowerCase());
      return matchesCategory && matchesSearch && product.price <= maxPrice;
    });
    if (sort === "low") return [...filtered].sort((a, b) => a.price - b.price);
    if (sort === "high") return [...filtered].sort((a, b) => b.price - a.price);
    return [...filtered].sort((a, b) => Number(b.badge === "Collection pick") - Number(a.badge === "Collection pick") || a.id - b.id);
  }, [category, maxPrice, search, sort, products]);

  const cartCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const cartTotal = cart.reduce((sum, line) => sum + line.price * line.quantity, 0);
  const deliveryFee = cartTotal >= DELIVERY_FREE_OVER ? 0 : DELIVERY_FEE;
  const orderTotal = cartTotal + deliveryFee;

  const addToCart = (product: Product) => {
    if (product.stock <= 0) return;
    setCart((current) => {
      const existing = current.find((line) => line.id === product.id);
      if (existing) {
        return current.map((line) => (line.id === product.id ? { ...line, quantity: line.quantity + 1 } : line));
      }
      return [...current, { ...product, quantity: 1 }];
    });
    toast.success(`${product.name} added to bag`, { description: "Free delivery over KSh 2,000." });
  };

  const updateQuantity = (id: number, delta: number) => {
    setCart((current) =>
      current
        .map((line) => (line.id === id ? { ...line, quantity: Math.max(1, line.quantity + delta) } : line))
        .filter((line) => line.quantity > 0),
    );
  };

  const toggleLike = (id: number) => {
    setLiked((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const scrollToShop = () => document.getElementById("shop")?.scrollIntoView({ behavior: "smooth" });

  const submitNewsletter = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim()) return;
    toast.success("You're on the list", { description: "A little good timekeeping is headed your way." });
    setEmail("");
  };

  const openCheckout = () => {
    if (cart.length === 0) return;
    setCheckoutError("");
    setOrderResult(null);
    setCartOpen(false);
    setCheckoutOpen(true);
  };

  const setField = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((current) => ({ ...current, [key]: event.target.value }));
  };

  const placeOrder = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCheckoutError("");

    if (!form.full_name.trim() || !form.phone.trim() || !form.county.trim() || !form.town.trim() || !form.estate.trim()) {
      setCheckoutError("Please fill in your full name, phone number, county, town and estate/address.");
      return;
    }
    if (!/^(\+?254|0)\d{9}$/.test(form.phone.replace(/[\s-]/g, ""))) {
      setCheckoutError("Please enter a valid Kenyan phone number, e.g. 07XX XXX XXX or +2547XX XXX XXX.");
      return;
    }
    if (form.email.trim() && !/^\S+@\S+\.\S+$/.test(form.email)) {
      setCheckoutError("Please enter a valid email address.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          items: cart.map((line) => ({ product_id: line.id, quantity: line.quantity })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not place your order. Please try again.");
      setOrderResult(data.order);
      setCart([]);
      toast.success("Order placed", { description: `Reference ${data.order.ref}` });
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : "Could not place your order. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f4f0e8] text-[#151612]">
      <div className="announcement flex items-center justify-center gap-2 bg-[#151612] px-4 py-2 text-center text-[11px] font-bold uppercase tracking-[0.18em] text-[#f4f0e8]">
        <Sparkles size={13} className="text-[#f3ad3d]" />
        Free delivery in Kenya over KSh 2,000 · 7-day easy returns
        <Sparkles size={13} className="text-[#f3ad3d]" />
      </div>

      <header className="relative z-30 border-b border-[#151612]/10 bg-[#f4f0e8]/95 backdrop-blur-md">
        <div className="mx-auto flex h-[78px] max-w-[1340px] items-center justify-between px-5 sm:px-8 lg:px-12">
          <a href="#top" className="flex items-center gap-3" aria-label="Saa Kenya home">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-[#151612] text-sm font-black text-[#f3ad3d]">S</span>
            <span className="font-display text-[22px] font-bold tracking-[-0.05em]">saa kenya<span className="text-[#e55d3d]">.</span></span>
          </a>

          <nav className="hidden items-center gap-8 text-[12px] font-bold uppercase tracking-[0.16em] md:flex">
            <a className="nav-link" href="#shop">Shop all</a>
            <a className="nav-link" href="#story">Our story</a>
            <a className="nav-link" href="#journal">Journal</a>
          </nav>

          <div className="flex items-center gap-2">
            <button onClick={() => setMobileNav((open) => !open)} className="icon-button md:hidden" aria-label="Toggle menu">
              {mobileNav ? <X size={19} /> : <Menu size={19} />}
            </button>
            <button onClick={() => toast("Search is ready", { description: "Type in the shop search bar to browse by name." })} className="icon-button hidden sm:grid" aria-label="Search">
              <Search size={18} />
            </button>
            <button onClick={() => setCartOpen(true)} className="bag-button" aria-label={`Open shopping bag with ${cartCount} items`}>
              <ShoppingBag size={18} />
              <span className="hidden sm:inline">Bag</span>
              <span className="bag-count">{cartCount}</span>
            </button>
          </div>
        </div>
        {mobileNav && (
          <nav className="mobile-nav md:hidden">
            <a href="#shop" onClick={() => setMobileNav(false)}>Shop all <ArrowRight size={15} /></a>
            <a href="#story" onClick={() => setMobileNav(false)}>Our story <ArrowRight size={15} /></a>
            <a href="#journal" onClick={() => setMobileNav(false)}>Journal <ArrowRight size={15} /></a>
          </nav>
        )}
      </header>

      <main id="top">
        <section className="hero-shell mx-auto max-w-[1340px] px-5 pb-16 pt-10 sm:px-8 lg:px-12 lg:pb-24 lg:pt-16">
          <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,0.95fr)_minmax(400px,1.05fr)] lg:gap-20">
            <div className="hero-copy max-w-[650px]">
              <p className="eyebrow mb-6"><span className="eyebrow-dot" /> Good watches, fair prices</p>
              <h1 className="font-display max-w-[680px] text-[clamp(3.7rem,8.3vw,7.55rem)] font-bold leading-[0.88] tracking-[-0.075em]">
                Keep good<br /><span className="serif-italic text-[#e55d3d]">time.</span> Wear it
                <span className="relative ml-3 inline-block">well<span className="hero-underline" /></span>
              </h1>
              <p className="mt-8 max-w-[440px] text-[16px] leading-7 text-[#151612]/65 sm:text-[18px]">Thoughtfully chosen watches that look like a million, without costing one. Every piece from <strong className="font-bold text-[#151612]">KSh 500 to KSh 5,000.</strong></p>
              <div className="mt-9 flex flex-wrap items-center gap-4">
                <button onClick={scrollToShop} className="primary-button">Shop the collection <ArrowRight size={16} /></button>
                <a href="#story" className="quiet-link">Why Saa Kenya <ArrowRight size={15} /></a>
              </div>
              <div className="mt-11 flex flex-wrap items-center gap-x-7 gap-y-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[#151612]/55">
                <span className="flex items-center gap-2"><Check size={15} className="text-[#e55d3d]" /> No markups</span>
                <span className="flex items-center gap-2"><Check size={15} className="text-[#e55d3d]" /> 7-day returns</span>
                <span className="flex items-center gap-2"><Check size={15} className="text-[#e55d3d]" /> Nairobi & nationwide</span>
              </div>
            </div>

            <div className="hero-visual relative mx-auto w-full max-w-[610px] lg:ml-auto">
              <div className="hero-image-wrap">
                <img src="/manus-storage/safi-sundial_9aca1c47.jpg" alt="Saa Kenya black leather watch" className="hero-image" />
                <div className="hero-image-tint" />
                <div className="hero-card-label">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#151612]/55">New in / 01</p>
                  <p className="mt-2 font-display text-2xl font-bold tracking-[-0.04em]">The Sundial</p>
                  <p className="mt-1 text-sm text-[#151612]/60">Black leather · KSh 2,450</p>
                </div>
                <div className="floating-stamp"><span>Everyday<br />essentials</span><Star size={14} fill="currentColor" /></div>
              </div>
              <p className="vertical-note">designed for your everyday / 2026</p>
            </div>
          </div>
        </section>

        <section className="benefit-strip border-y border-[#151612]/10 bg-[#e9e3d7]">
          <div className="mx-auto grid max-w-[1340px] divide-y divide-[#151612]/10 px-5 sm:px-8 md:grid-cols-3 md:divide-x md:divide-y-0 lg:px-12">
            <div className="flex items-center gap-4 py-5 md:pr-8"><span className="benefit-icon"><Truck size={19} /></span><div><p className="font-display text-lg font-bold">Free delivery, always</p><p className="text-xs text-[#151612]/55">On orders over KSh 2,000</p></div></div>
            <div className="flex items-center gap-4 py-5 md:px-8"><span className="benefit-icon"><Zap size={19} /></span><div><p className="font-display text-lg font-bold">Made for real life</p><p className="text-xs text-[#151612]/55">Reliable, not precious</p></div></div>
            <div className="flex items-center gap-4 py-5 md:pl-8"><span className="benefit-icon"><Heart size={18} /></span><div><p className="font-display text-lg font-bold">Easy on the wallet</p><p className="text-xs text-[#151612]/55">Nothing over KSh 5,000</p></div></div>
          </div>
        </section>

        <section id="shop" className="mx-auto max-w-[1340px] scroll-mt-8 px-5 py-20 sm:px-8 lg:px-12 lg:py-28">
          <div className="mb-10 flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div><p className="eyebrow mb-4"><span className="eyebrow-dot" /> The collection</p><h2 className="font-display text-5xl font-bold tracking-[-0.07em] sm:text-6xl">Find your <span className="serif-italic text-[#e55d3d]">everyday</span></h2></div>
            <p className="max-w-[285px] text-sm leading-6 text-[#151612]/55">Small details, considered materials, and an easy price point. Pick one for every version of you.</p>
          </div>

          <div className="shop-toolbar mb-8 flex flex-col gap-4 rounded-[20px] border border-[#151612]/10 bg-[#ede8df] p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {categories.map((item) => <button key={item} onClick={() => setCategory(item)} className={`filter-chip ${category === item ? "filter-chip-active" : ""}`}>{item}</button>)}
            </div>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <label className="price-range flex min-w-[220px] items-center gap-3 text-xs font-bold uppercase tracking-[0.13em] text-[#151612]/55">Up to <span className="text-[#151612]">{money(maxPrice)}</span><input aria-label="Maximum price" type="range" min="500" max="5000" step="250" value={maxPrice} onChange={(event) => setMaxPrice(Number(event.target.value))} /></label>
              <div className="relative"><ArrowDownUp size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#151612]/45" /><select className="sort-select" value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort products"><option value="featured">Featured</option><option value="low">Price: low to high</option><option value="high">Price: high to low</option></select><ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#151612]/45" /></div>
            </div>
          </div>

          <div className="mb-8 flex items-center justify-between gap-4"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#151612]/45">{loading ? "Loading watches..." : `${visibleProducts.length} watches · all under KSh 5,000`}</p><label className="search-field hidden items-center gap-2 sm:flex"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search the collection" aria-label="Search the collection" /></label></div>

          {loading ? (
            <div className="empty-state"><p className="font-display text-2xl font-bold">Fetching the collection…</p><p className="mt-2 text-sm text-[#151612]/55">One moment.</p></div>
          ) : loadError ? (
            <div className="empty-state"><p className="font-display text-2xl font-bold">Couldn't load the watches.</p><p className="mt-2 text-sm text-[#151612]/55">{loadError}</p><button className="primary-button mt-5" onClick={loadProducts}>Try again</button></div>
          ) : visibleProducts.length ? <div className="product-grid">{visibleProducts.map((product, index) => <ProductCard key={product.id} product={product} index={index} liked={liked.includes(product.id)} onLike={() => toggleLike(product.id)} onAdd={() => addToCart(product)} />)}</div> : <div className="empty-state"><p className="font-display text-2xl font-bold">Nothing in that lane yet.</p><p className="mt-2 text-sm text-[#151612]/55">Try easing up the price range or choosing another edit.</p><button className="primary-button mt-5" onClick={() => { setCategory("All watches"); setMaxPrice(5000); setSearch(""); }}>Reset filters</button></div>}
        </section>

        <section id="story" className="story-section scroll-mt-10 bg-[#151612] text-[#f4f0e8]">
          <div className="mx-auto grid max-w-[1340px] items-center gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-24 lg:px-12 lg:py-28">
            <div className="relative order-2 lg:order-1"><div className="story-card"><img src="/manus-storage/safi-fig_1f581205.jpg" alt="Gold and brown leather Fig and Gold watch" /><div className="story-card-sticker">Good<br />taste<br /><span>≠</span><br />big spend</div></div></div>
            <div className="order-1 lg:order-2"><p className="eyebrow mb-6 text-[#f3ad3d]"><span className="eyebrow-dot bg-[#f3ad3d]" /> Our point of view</p><h2 className="font-display max-w-[620px] text-5xl font-bold leading-[0.94] tracking-[-0.07em] sm:text-7xl">The little luxury<br />of being <span className="serif-italic text-[#f3ad3d]">on time.</span></h2><p className="mt-8 max-w-[490px] text-[16px] leading-7 text-[#f4f0e8]/65">Saa means “time” in Swahili. It’s how we like our design, our prices, and the promise behind every watch we send out. No loud logos. No inflated margins. Just good pieces that earn their place on your wrist.</p><a href="#journal" className="mt-9 inline-flex items-center gap-3 border-b border-[#f4f0e8]/35 pb-2 text-sm font-bold uppercase tracking-[0.13em] transition-colors hover:border-[#f3ad3d] hover:text-[#f3ad3d]">Read the Saa Kenya story <ArrowRight size={16} /></a></div>
          </div>
        </section>

        <section id="journal" className="mx-auto max-w-[1340px] scroll-mt-10 px-5 py-20 sm:px-8 lg:px-12 lg:py-28">
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="eyebrow mb-4"><span className="eyebrow-dot" /> From the journal</p><h2 className="font-display text-5xl font-bold tracking-[-0.07em]">Time well <span className="serif-italic text-[#e55d3d]">spent.</span></h2></div><a href="#shop" className="quiet-link">See all notes <ArrowRight size={15} /></a></div>
          <div className="journal-grid mt-10"><article className="journal-card journal-card-large"><div className="journal-number">01</div><div className="journal-card-content"><p className="eyebrow">Style notes</p><h3 className="font-display mt-3 text-3xl font-bold leading-[0.98] tracking-[-0.05em]">How to choose<br />your everyday watch</h3><a href="#shop" className="quiet-link mt-6">Read note <ArrowRight size={15} /></a></div></article><article className="journal-card journal-card-sand"><div className="journal-number">02</div><div className="journal-card-content"><p className="eyebrow">Small rituals</p><h3 className="font-display mt-3 text-3xl font-bold leading-[0.98] tracking-[-0.05em]">The five-minute<br />morning reset</h3><a href="#shop" className="quiet-link mt-6">Read note <ArrowRight size={15} /></a></div></article><article className="journal-card journal-card-coral"><div className="journal-number">03</div><div className="journal-card-content"><p className="eyebrow">Good objects</p><h3 className="font-display mt-3 text-3xl font-bold leading-[0.98] tracking-[-0.05em]">Why we love<br />a quiet face</h3><a href="#shop" className="quiet-link mt-6">Read note <ArrowRight size={15} /></a></div></article></div>
        </section>

        <section className="newsletter border-t border-[#151612]/10 bg-[#e9e3d7]">
          <div className="mx-auto flex max-w-[1340px] flex-col items-start justify-between gap-8 px-5 py-16 sm:px-8 md:flex-row md:items-center lg:px-12"><div><p className="eyebrow mb-4"><span className="eyebrow-dot" /> The good times club</p><h2 className="font-display text-4xl font-bold tracking-[-0.06em] sm:text-5xl">A little style, <span className="serif-italic text-[#e55d3d]">on time.</span></h2></div><form onSubmit={submitNewsletter} className="flex w-full max-w-[450px] border-b-2 border-[#151612] pb-2"><input className="newsletter-input" type="email" placeholder="Your email address" value={email} onChange={(event) => setEmail(event.target.value)} aria-label="Email address" required /><button className="flex shrink-0 items-center gap-2 text-xs font-black uppercase tracking-[0.14em] transition-colors hover:text-[#e55d3d]" type="submit">Join us <ArrowRight size={16} /></button></form></div>
        </section>
      </main>

      <footer className="bg-[#151612] text-[#f4f0e8]">
        <div className="mx-auto grid max-w-[1340px] gap-12 px-5 py-14 sm:px-8 md:grid-cols-[1.3fr_1fr_1fr_1fr] lg:px-12"><div><a href="#top" className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-[#f4f0e8] text-sm font-black text-[#151612]">S</span><span className="font-display text-[22px] font-bold tracking-[-0.05em]">saa kenya<span className="text-[#f3ad3d]">.</span></span></a><p className="mt-6 max-w-[240px] text-sm leading-6 text-[#f4f0e8]/55">For the commute, the coffee run, and everything worth showing up for.</p></div><div><p className="footer-label">Explore</p><a href="#shop">Shop all</a><a href="#story">Our story</a><a href="#journal">Journal</a></div><div><p className="footer-label">Help</p><a href="/admin.html">Admin portal</a><a href="/affiliates.html">Become an affiliate</a><a href="#top" onClick={() => toast("Returns are easy — 7 days, no drama")}>Returns</a></div><div><p className="footer-label">Follow along</p><a href="#top" onClick={() => toast("Instagram link coming soon")}>Instagram <Instagram size={14} /></a><a href="#top" onClick={() => toast("TikTok link coming soon")}>TikTok</a><a href="#top" onClick={() => toast("Pinterest link coming soon")}>Pinterest</a></div></div><div className="mx-auto flex max-w-[1340px] flex-col justify-between gap-2 border-t border-[#f4f0e8]/10 px-5 py-5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#f4f0e8]/35 sm:flex-row sm:px-8 lg:px-12"><span>© 2026 Saa Kenya, Nairobi</span><span>Good design. Fair prices. Better days.</span></div>
      </footer>

      {cartOpen && <div className="cart-layer"><button className="cart-overlay" onClick={() => setCartOpen(false)} aria-label="Close shopping bag" /><aside className="cart-drawer" aria-label="Shopping bag"><div className="flex items-center justify-between border-b border-[#151612]/10 px-6 py-5"><div><p className="eyebrow">Your bag</p><h2 className="font-display mt-1 text-3xl font-bold tracking-[-0.06em]">Good choice.</h2></div><button className="icon-button" onClick={() => setCartOpen(false)} aria-label="Close shopping bag"><X size={19} /></button></div><div className="flex-1 overflow-y-auto px-6 py-5">{cart.length ? <div className="space-y-5">{cart.map((line) => <div key={line.id} className="flex gap-4"><img src={line.image} alt={line.name} className="h-24 w-20 rounded-[12px] object-cover" /><div className="min-w-0 flex-1"><div className="flex justify-between gap-3"><div><p className="font-display text-lg font-bold leading-none">{line.name}</p><p className="mt-2 text-xs text-[#151612]/55">{line.blurb}</p></div><p className="text-sm font-black">{money(line.price)}</p></div><div className="mt-4 flex items-center justify-between"><div className="quantity-control"><button onClick={() => updateQuantity(line.id, -1)} aria-label={`Decrease ${line.name} quantity`}><Minus size={13} /></button><span>{line.quantity}</span><button onClick={() => updateQuantity(line.id, 1)} aria-label={`Increase ${line.name} quantity`}><Plus size={13} /></button></div><button onClick={() => updateQuantity(line.id, -line.quantity)} className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#151612]/45 hover:text-[#e55d3d]">Remove</button></div></div></div>)}</div> : <div className="grid h-full place-items-center pb-20 text-center"><div><div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#e9e3d7]"><ShoppingBag size={24} /></div><p className="mt-5 font-display text-2xl font-bold">Your bag is empty.</p><p className="mt-2 text-sm text-[#151612]/55">Time to find something worth showing up for.</p><button onClick={() => { setCartOpen(false); scrollToShop(); }} className="primary-button mt-6">Shop the collection <ArrowRight size={15} /></button></div></div>}</div><div className="border-t border-[#151612]/10 px-6 py-5">{cart.length > 0 && <><div className="space-y-2 text-sm"><div className="flex items-center justify-between text-[#151612]/60"><span>Subtotal</span><span className="font-black text-[#151612]">{money(cartTotal)}</span></div><div className="flex items-center justify-between text-[#151612]/60"><span>Delivery{deliveryFee === 0 ? " (free)" : ""}</span><span className="font-black text-[#151612]">{deliveryFee === 0 ? "Free" : money(deliveryFee)}</span></div>{deliveryFee > 0 && <p className="text-[11px] text-[#151612]/45">Free delivery on orders over KSh 2,000.</p>}<div className="mt-3 flex items-center justify-between border-t border-[#151612]/10 pt-3"><span className="text-xs font-bold uppercase tracking-[0.14em]">Total</span><span className="font-display text-xl font-bold">{money(orderTotal)}</span></div></div><button onClick={openCheckout} className="primary-button mt-4 w-full">Checkout <ArrowRight size={15} /></button><p className="mt-3 text-center text-[11px] text-[#151612]/45">Pay on delivery · M-PESA or cash</p></>}</div></aside></div>}

      {checkoutOpen && <div className="cart-layer"><button className="cart-overlay" onClick={() => !submitting && setCheckoutOpen(false)} aria-label="Close checkout" /><aside className="cart-drawer checkout-drawer" aria-label="Checkout">{orderResult ? <div className="flex flex-1 flex-col items-center justify-center px-8 text-center"><div className="grid h-16 w-16 place-items-center rounded-full bg-[#e9e3d7]"><CheckCircle2 size={30} className="text-[#e55d3d]" /></div><p className="eyebrow mt-6"><span className="eyebrow-dot" /> Tuma confirmed</p><h2 className="font-display mt-2 text-4xl font-bold tracking-[-0.06em]">Order received.</h2><p className="mt-4 max-w-[300px] text-sm leading-6 text-[#151612]/60">Thank you, <strong className="text-[#151612]">{orderResult.customer.full_name}</strong>. Your order <strong className="text-[#151612]">{orderResult.ref}</strong> is in.</p><p className="mt-1 text-sm text-[#151612]/60">Total <strong className="text-[#151612]">{money(orderResult.total)}</strong> · {orderResult.deliveryFee === 0 ? "free delivery" : `delivery ${money(orderResult.deliveryFee)}`}</p><p className="mt-3 text-xs leading-5 text-[#151612]/45">We'll call <strong className="text-[#151612]/70">{orderResult.customer.phone}</strong> shortly to confirm delivery to {orderResult.customer.estate}, {orderResult.customer.town}, {orderResult.customer.county}.</p><button className="primary-button mt-8" onClick={() => { setOrderResult(null); setCheckoutOpen(false); }}>Continue shopping <ArrowRight size={15} /></button></div> : <form onSubmit={placeOrder} className="flex h-full flex-col"><div className="flex items-center justify-between border-b border-[#151612]/10 px-6 py-5"><div><p className="eyebrow">Checkout</p><h2 className="font-display mt-1 text-3xl font-bold tracking-[-0.06em]">Where to?</h2></div><button type="button" className="icon-button" onClick={() => !submitting && setCheckoutOpen(false)} aria-label="Close checkout"><X size={19} /></button></div><div className="flex-1 overflow-y-auto px-6 py-5"><div className="space-y-4">{cart.length > 0 && <div className="border-b border-[#151612]/10 pb-4"><p className="form-label">Your order</p>{cart.map((line) => <div key={line.id} className="mt-2 flex items-center justify-between gap-3 text-sm"><span className="min-w-0 truncate text-[#151612]/70">{line.quantity} × {line.name}</span><span className="font-bold">{money(line.price * line.quantity)}</span></div>)}</div>}<div className="form-field"><label className="form-label" htmlFor="of_full_name">Full name *</label><input id="of_full_name" className="form-input" value={form.full_name} onChange={setField("full_name")} placeholder="e.g. Wanjiku Kamau" autoComplete="name" required /></div><div className="form-grid-2"><div className="form-field"><label className="form-label" htmlFor="of_phone">Phone number *</label><input id="of_phone" className="form-input" value={form.phone} onChange={setField("phone")} placeholder="07XX XXX XXX" autoComplete="tel" inputMode="tel" required /></div><div className="form-field"><label className="form-label" htmlFor="of_email">Email</label><input id="of_email" className="form-input" type="email" value={form.email} onChange={setField("email")} placeholder="you@example.com" autoComplete="email" /></div></div><div className="form-grid-2"><div className="form-field"><label className="form-label" htmlFor="of_county">County *</label><input id="of_county" className="form-input" value={form.county} onChange={setField("county")} placeholder="e.g. Nairobi" required /></div><div className="form-field"><label className="form-label" htmlFor="of_town">Town / City *</label><input id="of_town" className="form-input" value={form.town} onChange={setField("town")} placeholder="e.g. Ruiru" required /></div></div><div className="form-field"><label className="form-label" htmlFor="of_estate">Estate / Building / Street *</label><input id="of_estate" className="form-input" value={form.estate} onChange={setField("estate")} placeholder="e.g. Kihunguro Estate, House 12" required /></div><div className="form-field"><label className="form-label" htmlFor="of_landmark">Landmark (optional)</label><input id="of_landmark" className="form-input" value={form.landmark} onChange={setField("landmark")} placeholder="e.g. Near Quickmart" /></div><div className="form-field"><label className="form-label" htmlFor="of_notes">Delivery notes (optional)</label><textarea id="of_notes" className="form-input" rows={2} value={form.notes} onChange={setField("notes")} placeholder="Any instructions for the rider..." /></div><p className="text-[11px] leading-5 text-[#151612]/45">📞 We'll call you to confirm your order and arrange delivery. Pay on delivery.</p>{checkoutError && <p className="border border-[#e55d3d]/35 bg-[#e55d3d]/10 px-4 py-3 text-sm text-[#c0392b]" role="alert">{checkoutError}</p>}</div></div><div className="border-t border-[#151612]/10 px-6 py-5"><div className="space-y-1.5 text-sm"><div className="flex items-center justify-between text-[#151612]/60"><span>Subtotal</span><span className="font-black text-[#151612]">{money(cartTotal)}</span></div><div className="flex items-center justify-between text-[#151612]/60"><span>Delivery{deliveryFee === 0 ? " (free)" : ""}</span><span className="font-black text-[#151612]">{deliveryFee === 0 ? "Free" : money(deliveryFee)}</span></div><div className="mt-2 flex items-center justify-between border-t border-[#151612]/10 pt-2"><span className="text-xs font-bold uppercase tracking-[0.14em]">Total</span><span className="font-display text-xl font-bold">{money(orderTotal)}</span></div></div><button className="primary-button mt-4 w-full" type="submit" disabled={submitting || cart.length === 0}>{submitting ? "Placing your order…" : `Place order · ${money(orderTotal)}`}</button></div></form>}</aside></div>}
    </div>
  );
}

function ProductCard({ product, index, liked, onLike, onAdd }: { product: Product; index: number; liked: boolean; onLike: () => void; onAdd: () => void }) {
  return <article className="product-card" style={{ "--card-tone": product.tone, "--delay": `${index * 60}ms` } as React.CSSProperties}><div className="product-image-wrap"><img src={product.image} alt={product.name} className="product-image" /><div className="product-topline"><span className="product-number">0{index + 1}</span>{product.badge && <span className="product-badge">{product.badge}</span>}<button onClick={onLike} className={`heart-button ${liked ? "heart-liked" : ""}`} aria-label={liked ? `Remove ${product.name} from wishlist` : `Add ${product.name} to wishlist`}><Heart size={17} fill={liked ? "currentColor" : "none"} /></button></div><button onClick={onAdd} disabled={product.stock <= 0} className={`quick-add ${product.stock <= 0 ? "quick-add-out" : ""}`}>{product.stock <= 0 ? "Sold out" : "Add to bag"}{product.stock > 0 && <Plus size={15} />}</button></div><div className="mt-4 flex items-start justify-between gap-3"><div><h3 className="font-display text-xl font-bold tracking-[-0.04em]">{product.name}</h3><p className="mt-1 text-xs text-[#151612]/50">{product.blurb}</p></div><div className="text-right"><p className="text-sm font-black">{money(product.price)}</p>{product.oldPrice && <p className="mt-1 text-xs text-[#151612]/35 line-through">{money(product.oldPrice)}</p>}</div></div></article>;
}