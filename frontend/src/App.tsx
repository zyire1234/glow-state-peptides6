import React, { useState, useEffect } from 'react';
import { 
  ShoppingBag, Calculator, ClipboardList, Truck, Mail, 
  MapPin, HelpCircle, Check, X, ArrowRight, UserCheck, ChevronRight, ShoppingCart
} from 'lucide-react';
import { Logo } from './components/Logo';
import { ReconstitutionCalculator } from './components/ReconstitutionCalculator';
import { AdminPanel } from './components/AdminPanel';
import { PayPalButton } from './components/PayPalButton';
import { API_BASE_URL } from './lib/apiConfig';
// Connected to the real Django + SQLite backend. All `/api/...` calls below
// use the browser's native `fetch` and are routed to the backend via the
// Netlify redirect configured in netlify.toml (see backend/README.md).

interface Product {
  id: number;
  name: string;
  description: string;
  price: number;
  image_url: string;
  is_best_selling: boolean;
  is_discounted: boolean;
  discount_price?: number;
  category: string;
  stock: number;
}

interface CartItem {
  product: Product;
  quantity: number;
}

interface PaymentDetails {
  bank_name: string;
  account_name: string;
  bsb: string;
  account_number: string;
  paypal_email: string;
  paypal_client_id: string;
}

export default function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Layout states
  const [activePage, setActivePage] = useState<'home' | 'shop' | 'calculator' | 'policies' | 'payment-info'>('home');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);
  const [isAdminOpen, setIsAdminOpen] = useState<boolean>(false);

  // Filter category state
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  // Checkout state
  const [checkoutStep, setCheckoutStep] = useState<'cart' | 'details' | 'success'>('cart');
  const [paymentMethod, setPaymentMethod] = useState<'bank_transfer' | 'paypal_invoice'>('bank_transfer');
  const [shippingDetails, setShippingDetails] = useState({
    name: '',
    email: '',
    address: '',
    postcode: '',
  });
  const [placedOrder, setPlacedOrder] = useState<any>(null);
  const [paymentDetails, setPaymentDetails] = useState<PaymentDetails | null>(null);
  const [paypalError, setPaypalError] = useState<string>('');

  useEffect(() => {
    fetchProducts();
  }, [isAdminOpen]); // Refetch products when closing admin panel in case details were updated

  useEffect(() => {
    fetchPaymentDetails();
  }, [isAdminOpen]); // Refetch in case admin updated bank/PayPal details

  const fetchPaymentDetails = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/payment-details`);
      if (res.ok) {
        const data = await res.json();
        setPaymentDetails(data);
      }
    } catch (err) {
      console.error('Error fetching payment details:', err);
    }
  };

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE_URL}/products/`);
      if (res.ok) {
        const data = await res.json();
        // The Django REST Framework endpoint serializes DecimalField values
        // (price, discount_price) as strings (e.g. "49.99"), not numbers.
        // Coerce them to real numbers here, once, so every .toFixed() call
        // below the app safely works instead of crashing the whole page.
        const normalized: Product[] = (data as any[]).map((p) => ({
          ...p,
          price: Number(p.price),
          discount_price:
            p.discount_price === null || p.discount_price === undefined
              ? p.discount_price
              : Number(p.discount_price),
        }));
        setProducts(normalized);
      }
    } catch (err) {
      console.error('Error fetching products:', err);
    } finally {
      setLoading(false);
    }
  };

  // Cart operations
  const addToCart = (product: Product, quantity = 1) => {
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        return prev.map(item => 
          item.product.id === product.id 
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      }
      return [...prev, { product, quantity }];
    });
    setIsCartOpen(true);
  };

  const removeFromCart = (productId: number) => {
    setCart(prev => prev.filter(item => item.product.id !== productId));
  };

  const updateCartQty = (productId: number, qty: number) => {
    if (qty <= 0) {
      removeFromCart(productId);
      return;
    }
    setCart(prev => prev.map(item => 
      item.product.id === productId ? { ...item, quantity: qty } : item
    ));
  };

  const getCartTotal = () => {
    return cart.reduce((sum, item) => {
      const price = item.product.is_discounted && item.product.discount_price 
        ? item.product.discount_price 
        : item.product.price;
      return sum + (price * item.quantity);
    }, 0);
  };

  // Flat-rate shipping fee applied to every order once there's something in the cart.
  // Orders over the free-shipping threshold ship free (express).
  const SHIPPING_FEE = 10;
  const FREE_SHIPPING_THRESHOLD = 160;
  const getShippingFee = () => {
    if (cart.length === 0) return 0;
    return getCartTotal() >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
  };

  // Total the customer actually owes: subtotal + flat shipping fee, automatically
  // including the 3% PayPal surcharge whenever PayPal is the selected payment route.
  const getOrderTotal = () => {
    const subtotal = getCartTotal() + getShippingFee();
    return paymentMethod === 'paypal_invoice' ? subtotal * 1.03 : subtotal;
  };

  const getCartCount = () => {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  };

  // Builds a direct PayPal payment redirect link using the business email.
  // Opening this link sends the customer straight to PayPal to pay Glow State Peptides.
  const getPaypalPayUrl = (amount?: number) => {
    const params = new URLSearchParams({
      cmd: '_xclick',
      business: paymentDetails?.paypal_email || 'Glowstatepeps@hotmail.com',
      item_name: 'Glow State Peptides Order',
      currency_code: 'AUD',
    });
    if (amount && amount > 0) {
      params.set('amount', amount.toFixed(2));
    }
    return `https://www.paypal.com/cgi-bin/webscr?${params.toString()}`;
  };

  // Submit Order Request
  const handlePlaceOrderRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) return;

    const orderTotal = getOrderTotal();
    const itemsPayload = cart.map(item => ({
      product_id: item.product.id,
      product_name: item.product.name,
      quantity: item.quantity,
      price: item.product.is_discounted && item.product.discount_price ? item.product.discount_price : item.product.price
    }));

    const payload = {
      customer_name: shippingDetails.name,
      customer_email: shippingDetails.email,
      customer_address: `${shippingDetails.address}, QLD, Postcode: ${shippingDetails.postcode}`,
      payment_method: paymentMethod,
      total_amount: orderTotal,
      items: itemsPayload
    };

    try {
      const res = await fetch(`${API_BASE_URL}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const orderData = await res.json();
        setPlacedOrder(orderData);
        setCheckoutStep('success');
        setCart([]); // Clear cart
      } else {
        alert('Failed to submit order request. Please review details and try again.');
      }
    } catch (err) {
      alert('Network failure. Could not connect to order dispatch server.');
    }
  };

  const getCategories = () => {
    const categories = ['All', 'Best Sellers', 'Discounted'];
    products.forEach(p => {
      if (!categories.includes(p.category)) {
        categories.push(p.category);
      }
    });
    return categories;
  };

  const getFilteredProducts = () => {
    if (selectedCategory === 'All') return products;
    if (selectedCategory === 'Best Sellers') return products.filter(p => p.is_best_selling);
    if (selectedCategory === 'Discounted') return products.filter(p => p.is_discounted);
    return products.filter(p => p.category === selectedCategory);
  };

  return (
    <div className="min-h-screen bg-[#050510] text-gray-100 flex flex-col font-sans selection:bg-purple-600 selection:text-white">
      {/* 2. Primary Navigation Bar */}
      <nav className="sticky top-0 z-40 bg-[#08081a]/90 backdrop-blur-md border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="cursor-pointer" onClick={() => { setActivePage('home'); setSelectedProduct(null); }}>
            <Logo size={62} />
          </div>

          {/* Nav links */}
          <div className="hidden md:flex items-center gap-8 text-sm font-medium">
            <button
              onClick={() => { setActivePage('shop'); setSelectedProduct(null); }}
              className={`transition-all ${activePage === 'shop' ? 'text-purple-400 font-semibold' : 'text-slate-400 hover:text-purple-400'}`}
            >
              Shop Peptides
            </button>
            <button
              onClick={() => setActivePage('calculator')}
              className={`transition-all ${activePage === 'calculator' ? 'text-purple-400 font-semibold' : 'text-slate-400 hover:text-purple-400'}`}
            >
              Reconstitution Tool
            </button>
            <button
              onClick={() => setActivePage('payment-info')}
              className={`transition-all ${activePage === 'payment-info' ? 'text-purple-400 font-semibold' : 'text-slate-400 hover:text-purple-400'}`}
            >
              Payment Steps
            </button>
            <button
              onClick={() => setActivePage('policies')}
              className={`transition-all ${activePage === 'policies' ? 'text-purple-400 font-semibold' : 'text-slate-400 hover:text-purple-400'}`}
            >
              Refund / Policy
            </button>
          </div>

          <div className="flex items-center gap-4">
            {/* Cart trigger */}
            <button
              onClick={() => setIsCartOpen(true)}
              className="relative p-2.5 rounded-xl bg-white/5 border border-white/10 hover:border-purple-500/50 text-slate-300 hover:text-purple-300 transition-all flex items-center gap-2 shadow-xl backdrop-blur-sm"
              id="cart-trigger"
            >
              <ShoppingCart className="h-4 w-4" />
              <span className="hidden sm:inline text-xs font-semibold">Cart</span>
              {getCartCount() > 0 && (
                <span className="absolute -top-1.5 -right-1.5 h-5 w-5 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center border border-slate-950">
                  {getCartCount()}
                </span>
              )}
            </button>
          </div>
        </div>
      </nav>

      {/* 3. Main content viewport */}
      <main className="flex-1">
        {/* HOME PAGE */}
        {activePage === 'home' && (
          <div className="animate-fade-in min-h-[70vh] flex flex-col items-center justify-center text-center px-4 py-20 space-y-8">
            <Logo size={140} />
            <p className="max-w-xl text-slate-300 text-sm sm:text-base leading-relaxed">
              Glow State Peptides delivers ultra-pure compounds Australia-wide. Third-party tested. Australian owned and operated.
            </p>
            <button
              onClick={() => setActivePage('shop')}
              className="py-3 px-8 bg-gradient-to-r from-blue-600 to-purple-600 hover:brightness-110 text-white font-bold rounded-xl text-sm transition-all shadow-lg shadow-purple-500/10 cursor-pointer"
            >
              Enter Shop (18+)
            </button>
          </div>
        )}

        {/* SHOP PAGE */}
        {activePage === 'shop' && (
          <div className="animate-fade-in space-y-12 pb-20">
            
            {/* Elegant Hero Section */}
            <section className="relative overflow-hidden py-12 border-b border-white/10">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(147,51,234,0.08),rgba(0,0,0,0))]" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_70%,rgba(59,130,246,0.08),rgba(0,0,0,0))]" />
              
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                <div className="border-l-2 border-purple-600 pl-8 py-6 bg-gradient-to-r from-purple-900/10 to-transparent rounded-r-2xl">
                  <span className="inline-flex items-center gap-1.5 py-1 px-3 bg-purple-500/10 text-purple-400 rounded-full text-xs font-semibold border border-purple-500/20 mb-3">
                    <MapPin className="h-3 w-3" /> Based in Brisbane, Queensland
                  </span>

                  <h1 className="font-display font-extrabold text-3xl sm:text-4xl lg:text-5xl text-white tracking-tight leading-[1.1] max-w-4xl uppercase mb-3">
                    Premium Scientific Peptides For{' '}
                    <span className="bg-gradient-to-r from-purple-400 via-indigo-400 to-blue-400 bg-clip-text text-transparent text-glow-purple">
                      Advanced Research
                    </span>
                  </h1>

                  <p className="text-slate-400 text-sm sm:text-base max-w-3xl leading-relaxed">
                    Glow State Peptides delivers ultra-pure compounds Australia-wide. Third-party tested. Australian owned and operated.
                  </p>
                </div>

                {/* Trust Badges banner */}
                <div className="pt-8 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl text-xs text-slate-400">
                  <div className="bg-white/5 border border-white/10 p-4 rounded-xl flex items-center gap-3 backdrop-blur-sm shadow-xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-16 h-16 bg-purple-600/5 blur-xl group-hover:bg-purple-600/10 transition-colors duration-300" />
                    <div className="h-8 w-8 bg-purple-500/10 rounded-lg flex items-center justify-center text-purple-400 shrink-0">
                      <Truck className="h-4 w-4" />
                    </div>
                    <div className="text-left">
                      <h4 className="font-semibold text-white">Fast Dispatch and Delivery</h4>
                      <p className="text-[10px] text-slate-500">Orders are dispatched the next business day. Most parcels arrive within 1–3 business days, so you can enjoy your order sooner.</p>
                    </div>
                  </div>

                  <div className="bg-white/5 border border-white/10 p-4 rounded-xl flex items-center gap-3 backdrop-blur-sm shadow-xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-16 h-16 bg-blue-600/5 blur-xl group-hover:bg-blue-600/10 transition-colors duration-300" />
                    <div className="h-8 w-8 bg-blue-500/10 rounded-lg flex items-center justify-center text-blue-400 shrink-0">
                      <ClipboardList className="h-4 w-4" />
                    </div>
                    <div className="text-left">
                      <h4 className="font-semibold text-white">99% Purity Premium Peptides</h4>
                      <p className="text-[10px] text-slate-500">Third party tested</p>
                    </div>
                  </div>

                  <div className="bg-white/5 border border-white/10 p-4 rounded-xl flex items-center gap-3 backdrop-blur-sm shadow-xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-16 h-16 bg-pink-600/5 blur-xl group-hover:bg-pink-600/10 transition-colors duration-300" />
                    <div className="h-8 w-8 bg-pink-500/10 rounded-lg flex items-center justify-center text-pink-400 shrink-0">
                      <Calculator className="h-4 w-4" />
                    </div>
                    <div className="text-left">
                      <h4 className="font-semibold text-white">Reconstitution Helper</h4>
                      <p className="text-[10px] text-slate-500">Precision dosing calculators</p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Catalog Grid Section */}
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              {/* Category tabs */}
              <div className="flex flex-wrap items-center justify-center gap-2 pb-8 border-b border-white/10">
                {getCategories().map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all border cursor-pointer ${
                      selectedCategory === cat
                        ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white border-transparent shadow-lg shadow-purple-500/15'
                        : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Loader */}
              {loading ? (
                <div className="text-center py-20 text-slate-400 text-sm">
                  <div className="inline-block h-6 w-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                  <p>Sterilizing laboratory inventory...</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 pt-10">
                  {getFilteredProducts().map(prod => (
                    <div 
                      key={prod.id} 
                      className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden shadow-xl hover:border-purple-500/40 transition-all duration-300 flex flex-col relative group backdrop-blur-sm"
                    >
                      <div className="absolute top-0 right-0 w-24 h-24 bg-purple-600/5 blur-3xl pointer-events-none group-hover:bg-purple-600/10 transition-colors duration-300" />
                      {/* Image header */}
                      <div className="relative aspect-[4/3] overflow-hidden bg-[#050510]">
                        <img 
                          src={prod.image_url} 
                          alt={prod.name} 
                          className="w-full h-full object-cover group-hover:scale-105 transition-all duration-500"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-900 to-transparent opacity-80" />
                        
                        {/* Badges */}
                        <div className="absolute top-4 left-4 flex flex-col gap-1.5">
                          <span className="px-2.5 py-1 bg-[#050510]/80 backdrop-blur-md text-[10px] uppercase font-bold tracking-wider text-slate-300 border border-white/10 rounded-md">
                            {prod.category}
                          </span>
                          {prod.is_best_selling && (
                            <span className="px-2.5 py-1 bg-purple-600 text-[10px] uppercase font-bold tracking-wider text-white rounded-md">
                              Best Selling
                            </span>
                          )}
                          {prod.is_discounted && (
                            <span className="px-2.5 py-1 bg-emerald-500 text-[10px] uppercase font-bold tracking-wider text-white rounded-md">
                              Special Offer
                            </span>
                          )}
                        </div>

                        {prod.stock <= 5 && (
                          <span className="absolute bottom-4 right-4 px-2 py-0.5 bg-rose-500/25 border border-rose-500/30 backdrop-blur-md rounded text-[10px] text-rose-300 font-bold uppercase tracking-wider">
                            Low Stock
                          </span>
                        )}
                      </div>

                      {/* Info body */}
                      <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
                        <div className="space-y-2">
                          <h3 className="font-display font-bold text-lg text-white group-hover:text-purple-400 transition-colors">
                            {prod.name}
                          </h3>
                          <p className="text-slate-400 text-xs leading-relaxed line-clamp-3">
                            {prod.description}
                          </p>
                        </div>

                        <div className="pt-4 border-t border-white/10 flex items-center justify-between">
                          <div className="flex flex-col">
                            <span className="text-[10px] uppercase tracking-wider text-slate-500">Research Fee</span>
                            <div className="flex items-center gap-2">
                              {prod.is_discounted && prod.discount_price ? (
                                <>
                                  <span className="font-mono text-lg font-bold text-emerald-400">${prod.discount_price.toFixed(2)}</span>
                                  <span className="font-mono text-xs text-slate-500 line-through">${prod.price.toFixed(2)}</span>
                                </>
                              ) : (
                                <span className="font-mono text-lg font-bold text-white">${prod.price.toFixed(2)}</span>
                              )}
                              <span className="text-[10px] text-slate-400 uppercase font-bold">AUD</span>
                            </div>
                          </div>

                          <button
                            onClick={() => setSelectedProduct(prod)}
                            className="py-2 px-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:brightness-110 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-md shadow-purple-500/10 cursor-pointer"
                          >
                            <span>Add to Cart</span>
                            <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

          </div>
        )}

        {/* RECONSTITUTION CALCULATOR PAGE */}
        {activePage === 'calculator' && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16 animate-fade-in space-y-8">
            <div className="text-center space-y-2 max-w-xl mx-auto">
              <h2 className="font-display font-extrabold text-3xl text-white uppercase tracking-wider">LABORATORY UTILITY ENGINE</h2>
              <p className="text-slate-400 text-sm">Calculate peptide reconstitution parameters to determine syringe drawing lines cleanly and mathematically.</p>
            </div>
            <ReconstitutionCalculator />
          </div>
        )}

        {/* PAYMENT INFO PAGE */}
        {activePage === 'payment-info' && (
          <div className="max-w-3xl mx-auto px-4 py-16 animate-fade-in space-y-8">
            <div className="text-center space-y-2">
              <span className="text-purple-400 font-bold uppercase text-xs tracking-widest">Step-By-Step Guidelines</span>
              <h2 className="font-display font-extrabold text-3xl text-white uppercase tracking-wider">HOW TO PLACE YOUR ORDER REQUEST</h2>
              <p className="text-slate-400 text-xs">Our system is manual and transparent. No online credit card charges will occur.</p>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 md:p-8 space-y-8 backdrop-blur-sm relative overflow-hidden shadow-2xl">
              <div className="absolute top-0 right-0 w-32 h-32 bg-purple-600/5 blur-3xl pointer-events-none" />
              <div className="flex gap-4 items-start relative z-10">
                <div className="h-8 w-8 bg-purple-500/15 text-purple-400 font-display font-bold rounded-lg flex items-center justify-center shrink-0 border border-purple-500/25 shadow-lg">
                  1
                </div>
                <div className="space-y-1">
                  <h3 className="font-display font-semibold text-white">Select Vials & Place Order</h3>
                  <p className="text-slate-400 text-xs leading-relaxed">
                    Browse our catalog, choose quantities, and click <strong>"Place Order"</strong> inside the cart. Fill in your name, email, and shipping address details.
                  </p>
                </div>
              </div>

              <div className="flex gap-4 items-start relative z-10">
                <div className="h-8 w-8 bg-purple-500/15 text-purple-400 font-display font-bold rounded-lg flex items-center justify-center shrink-0 border border-purple-500/25 shadow-lg">
                  2
                </div>
                <div className="space-y-1">
                  <h3 className="font-display font-semibold text-white">Select Your Manual Payment Route</h3>
                  <p className="text-slate-400 text-xs leading-relaxed">
                    Choose between a <strong>Bank Transfer</strong> or requesting a <strong>PayPal Invoice</strong>. 
                  </p>
                  <ul className="list-disc pl-4 text-slate-500 text-xs space-y-1.5 pt-1.5">
                    <li><strong className="text-slate-300">Bank Transfer route:</strong> Complete manual transfer using details in receipt, then email us the screenshot.</li>
                    <li><strong className="text-slate-300">PayPal Invoice route:</strong> A manual email invoice containing the pay link will be issued to your mailbox shortly (+3% fee applies).</li>
                  </ul>
                </div>
              </div>

              <div className="flex gap-4 items-start relative z-10">
                <div className="h-8 w-8 bg-purple-500/15 text-purple-400 font-display font-bold rounded-lg flex items-center justify-center shrink-0 border border-purple-500/25 shadow-lg">
                  3
                </div>
                <div className="space-y-1">
                  <h3 className="font-display font-semibold text-white">Immediate Dispatch Validation</h3>
                  <p className="text-slate-400 text-xs leading-relaxed">
                    Once our administration logs manual payment receipt confirmation, we package and ship your laboratory materials within 24 hours. Express Tracking numbers are issued directly via email.
                  </p>
                </div>
              </div>

              <div className="border-t border-white/10 pt-6 relative z-10 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex flex-col md:border-r border-white/10 md:pr-6 justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></div>
                      <h4 className="text-sm font-bold text-blue-400 uppercase tracking-wider">Bank Transfer Details</h4>
                    </div>
                    <p className="text-xs text-slate-400 mb-3">Secure local Queensland bank details for secure nationwide processing:</p>
                    <div className="text-xs text-gray-300 space-y-1.5 font-mono bg-black/40 p-3 rounded-xl border border-white/5">
                      <p><span className="text-slate-500">Account Name:</span> {paymentDetails?.account_name || 'Glow State'}</p>
                      <p><span className="text-slate-500">Bank:</span> {paymentDetails?.bank_name || 'Commonwealth Bank'}</p>
                      <p><span className="text-slate-500">BSB:</span> {paymentDetails?.bsb || '064 437'}</p>
                      <p><span className="text-slate-500">Account No:</span> {paymentDetails?.account_number || '10013757'}</p>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">
                      Note: your bank may say the Glow State dose not match the account number, <strong className="text-slate-300"> This is normal</strong>,.Please continue with the transfer.
                    </p>
                  </div>
                  <p className="text-[11px] text-yellow-400/90 italic mt-4 font-sans">
                    Please use your name as the reference and we will match your payment to your order.
                  </p>
                </div>
                <div className="flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-2 h-2 rounded-full bg-purple-400"></div>
                      <h4 className="text-sm font-bold text-purple-400 uppercase tracking-wider">PayPal Invoice Details</h4>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed mb-4">
                      Submit details via the checkout drawer and our admin team will generate and dispatch a direct payment link invoice.
                    </p>
                  </div>
                  <div className="bg-purple-900/10 p-3.5 rounded-xl border border-purple-500/20 text-[11px] text-purple-300 leading-relaxed">
                    <strong>PayPal Notice:</strong> A 3% merchant processing surcharge applies to all PayPal invoices to cover administration overheads.
                  </div>
                </div>
              </div>

              <a
                href={getPaypalPayUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-3.5 bg-gradient-to-r from-yellow-400 to-yellow-500 hover:brightness-105 text-slate-900 font-bold rounded-xl text-sm transition-all shadow-lg shadow-yellow-500/10 relative z-10"
              >
                Pay with PayPal
              </a>
            </div>
          </div>
        )}

        {/* POLICIES PAGE */}
        {activePage === 'policies' && (
          <div className="max-w-3xl mx-auto px-4 py-16 animate-fade-in space-y-8">
            <h2 className="font-display font-extrabold text-3xl text-white text-center uppercase tracking-wider">LABORATORY COMPLIANCE & REFUNDS POLICY</h2>
            
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 md:p-8 space-y-6 text-sm text-slate-300 leading-relaxed backdrop-blur-sm relative overflow-hidden shadow-2xl">
              <div className="absolute top-0 right-0 w-32 h-32 bg-purple-600/5 blur-3xl pointer-events-none" />
              <section className="space-y-2 relative z-10">
                <h3 className="font-display font-semibold text-white uppercase text-xs tracking-wider">1. Return and Refund Rules</h3>
                <p className="text-xs text-slate-400">
                  Because our materials are sterile lyophilized laboratory compounds, returns are strictly limited to damaged or incorrect vial shipments. Once a peptide vial has been opened or its outer seal is compromised, we cannot accept returns due to scientific safety standards.
                </p>
              </section>

              <section className="space-y-2 relative z-10">
                <h3 className="font-display font-semibold text-white uppercase text-xs tracking-wider">2. Damage During Dispatch</h3>
                <p className="text-xs text-slate-400">
                  Should a vial break or sustain integrity damage during Australia-wide transit, immediately snap a photograph and send it to our administration email: <strong className="text-purple-400">Glowstatepeps@hotmail.com</strong>. We will expedite a zero-cost replacement shipment immediately.
                </p>
              </section>

              <section className="space-y-2 relative z-10">
                <h3 className="font-display font-semibold text-white uppercase text-xs tracking-wider">3. Fast Dispatch and Delivery</h3>
                <p className="text-xs text-slate-400">
                  Orders are dispatched the next business day. Most parcels arrive within 1–3 business days, so you can enjoy your order sooner.
                </p>
              </section>
            </div>
          </div>
        )}
      </main>

      {/* 4. Footer Brand Area */}
      <footer className="bg-[#03030d] border-t border-white/10 py-12 mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="space-y-3">
            <Logo size={54} />
            <p className="text-slate-500 text-[11px] leading-relaxed">
              Premium scientific research peptide formulations. Based in Brisbane, Queensland, shipping nationwide.
            </p>
          </div>

          <div>
            <h4 className="text-xs font-bold uppercase text-slate-300 tracking-wider mb-3">Service Navigation</h4>
            <div className="flex flex-col gap-2 text-xs text-slate-500">
              <button onClick={() => { setActivePage('shop'); setSelectedProduct(null); }} className="hover:text-white text-left cursor-pointer">Shop Catalog</button>
              <button onClick={() => setActivePage('calculator')} className="hover:text-white text-left cursor-pointer">Dilution Calculator</button>
              <button onClick={() => setActivePage('payment-info')} className="hover:text-white text-left cursor-pointer">Payment Guide</button>
              <button onClick={() => setActivePage('policies')} className="hover:text-white text-left cursor-pointer">Policies</button>
            </div>
          </div>

          <div>
            <h4 className="text-xs font-bold uppercase text-slate-300 tracking-wider mb-3">Contact Support</h4>
            <div className="space-y-2 text-xs text-slate-500">
              <p className="flex items-center gap-1.5 text-slate-400">
                <Mail className="h-3.5 w-3.5 text-purple-400" />
                <a href="mailto:Glowstatepeps@hotmail.com" className="hover:underline">Glowstatepeps@hotmail.com</a>
              </p>
              <p>Brisbane, Australia</p>
              <p className="text-[10px] text-slate-600">Australia-wide Tracked Shipping</p>
            </div>
          </div>

          <div>
            <h4 className="text-xs font-bold uppercase text-slate-300 tracking-wider mb-3">Compliance Advisory</h4>
            <p className="text-slate-600 text-[10px] leading-relaxed">
              All listed peptides are intended exclusively for research laboratory trials. Practice absolute safety standards. Keep out of reach of children.
            </p>
          </div>
        </div>
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 border-t border-white/10 mt-8 pt-6 flex flex-col sm:flex-row justify-between items-center text-[10px] text-slate-600 gap-4">
          <p>© 2026 Glow State Peptides. All Rights Reserved. Brisbane, QLD.</p>
          <div className="flex gap-4">
            <button onClick={() => setIsAdminOpen(true)} className="hover:text-white cursor-pointer">Admin System Access</button>
          </div>
        </div>
      </footer>

      {/* MODAL: Product Details & Order Request Trigger */}
      {selectedProduct && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl relative flex flex-col md:flex-row max-h-[90vh]">
            <button 
              onClick={() => setSelectedProduct(null)}
              className="absolute top-4 right-4 z-10 p-2 bg-slate-950/80 border border-slate-800 rounded-full text-slate-400 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Left side: Image */}
            <div className="w-full md:w-1/2 aspect-[4/3] md:aspect-auto relative bg-slate-950">
              <img 
                src={selectedProduct.image_url} 
                alt={selectedProduct.name}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-t md:bg-gradient-to-r from-[#050510] to-transparent" />
            </div>

            {/* Right side: details */}
            <div className="w-full md:w-1/2 p-6 md:p-8 overflow-y-auto space-y-6 relative">
              <div className="absolute top-0 right-0 w-24 h-24 bg-purple-600/5 blur-3xl pointer-events-none" />
              <div className="space-y-1 relative z-10">
                <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400 bg-purple-500/10 py-1 px-2.5 rounded border border-white/10 inline-block">
                  {selectedProduct.category}
                </span>
                <h2 className="font-display font-extrabold text-2xl text-white uppercase tracking-tight mt-2">{selectedProduct.name}</h2>
              </div>

              <p className="text-slate-300 text-xs leading-relaxed relative z-10">
                {selectedProduct.description}
              </p>

              {/* Research Specification Data */}
              <div className="bg-[#0a0a25]/60 border border-white/10 rounded-xl p-4 space-y-2 relative z-10">
                <h4 className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Compound Profile Data</h4>
                <div className="grid grid-cols-2 gap-3 text-[11px]">
                  <p className="text-slate-400">Purity Grade: <strong className="text-white">99.8% Premium</strong></p>
                  <p className="text-slate-400">Vial Formulation: <strong className="text-white">Lyophilized Powder</strong></p>
                  <p className="text-slate-400">Recommended Temp: <strong className="text-white">Refrigerate (2-8°C)</strong></p>
                  <p className="text-slate-400">Reconstitution Sol: <strong className="text-white">Bacteriostatic Water</strong></p>
                </div>
              </div>

              <div className="pt-4 border-t border-white/10 flex items-center justify-between relative z-10">
                <div>
                  <span className="text-[10px] uppercase text-slate-500 tracking-wider">Acquisition Fee</span>
                  <div className="flex items-baseline gap-1.5">
                    {selectedProduct.is_discounted && selectedProduct.discount_price ? (
                      <>
                        <span className="font-mono text-xl font-bold text-emerald-400">${selectedProduct.discount_price.toFixed(2)}</span>
                        <span className="font-mono text-xs text-slate-500 line-through">${selectedProduct.price.toFixed(2)}</span>
                      </>
                    ) : (
                      <span className="font-mono text-xl font-bold text-white">${selectedProduct.price.toFixed(2)}</span>
                    )}
                    <span className="text-[9px] text-slate-400 font-bold uppercase">AUD</span>
                  </div>
                </div>

                <button
                  onClick={() => {
                    addToCart(selectedProduct, 1);
                    setSelectedProduct(null);
                  }}
                  className="py-3 px-5 bg-gradient-to-r from-blue-600 to-purple-600 hover:brightness-110 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-lg shadow-purple-500/15 cursor-pointer"
                >
                  <ShoppingBag className="h-4 w-4" />
                  <span>Add to Cart</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DRAWER: Shopping Cart & Custom Checkout Options */}
      {isCartOpen && (
        <div className="fixed inset-0 bg-[#050510]/90 backdrop-blur-sm z-50 flex justify-end animate-fade-in" id="cart-drawer">
          <div className="w-full max-w-md bg-[#08081a]/95 border-l border-white/10 flex flex-col justify-between h-full shadow-2xl relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-600/5 blur-3xl pointer-events-none" />
            {/* Header */}
            <div className="p-5 border-b border-white/10 flex items-center justify-between relative z-10">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-purple-400" />
                <h3 className="font-display font-bold text-lg text-white">Your Order Request</h3>
              </div>
              <button 
                onClick={() => { setIsCartOpen(false); setCheckoutStep('cart'); }}
                className="p-1.5 hover:bg-white/5 text-slate-400 hover:text-white rounded-lg transition-all cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Content Switcher */}
            <div className="flex-1 overflow-y-auto p-5 relative z-10">
              {checkoutStep === 'cart' && (
                <div className="space-y-5 h-full flex flex-col justify-between">
                  <div className="space-y-4">
                    {cart.map(item => {
                      const price = item.product.is_discounted && item.product.discount_price 
                        ? item.product.discount_price 
                        : item.product.price;
                      return (
                        <div key={item.product.id} className="bg-black/40 border border-white/10 rounded-xl p-3 flex justify-between gap-4 text-xs items-center">
                          <img 
                            src={item.product.image_url} 
                            alt={item.product.name} 
                            className="h-12 w-12 rounded-lg object-cover border border-white/10 shrink-0"
                            referrerPolicy="no-referrer"
                          />
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-white truncate">{item.product.name}</h4>
                            <p className="text-slate-400 font-mono mt-0.5">${price.toFixed(2)} AUD</p>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={() => updateCartQty(item.product.id, item.quantity - 1)}
                              className="h-6 w-6 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-white flex items-center justify-center font-bold cursor-pointer"
                            >
                              -
                            </button>
                            <span className="font-mono text-white font-bold w-5 text-center">{item.quantity}</span>
                            <button 
                              onClick={() => updateCartQty(item.product.id, item.quantity + 1)}
                              className="h-6 w-6 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-white flex items-center justify-center font-bold cursor-pointer"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {cart.length === 0 && (
                      <div className="text-center py-24 text-slate-500 space-y-3">
                        <ShoppingBag className="h-12 w-12 mx-auto text-slate-700 animate-pulse" />
                        <p className="text-xs">Your shopping cart is currently empty.</p>
                      </div>
                    )}
                  </div>

                  {cart.length > 0 && (
                    <div className="border-t border-white/10 pt-5 space-y-4">
                      <div className="flex justify-between items-center font-mono font-bold text-white text-base">
                        <span>ESTIMATED TOTAL:</span>
                        <span className="text-purple-400">${getCartTotal().toFixed(2)} AUD</span>
                      </div>
                      {getCartTotal() >= FREE_SHIPPING_THRESHOLD ? (
                        <p className="text-[10px] text-emerald-400 font-semibold -mt-2">Free express shipping unlocked! 🎉</p>
                      ) : (
                        <p className="text-[10px] text-slate-500 -mt-2">
                          Free Shipping: Enjoy free shipping on all orders over ${FREE_SHIPPING_THRESHOLD}
                        </p>
                      )}
                      
                      <div className="bg-black/40 border border-white/10 rounded-xl p-3 text-[10px] text-slate-400 leading-relaxed flex gap-2">
                        <UserCheck className="h-4 w-4 text-purple-400 shrink-0" />
                        <span>
                         Free Shipping: Enjoy free shipping on all orders over $160
                        </span>
                      </div>

                      <button
                        onClick={() => setCheckoutStep('details')}
                        className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-purple-600 hover:brightness-110 text-white font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-2 shadow-lg shadow-purple-500/10 cursor-pointer"
                      >
                        <span>Checkout</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              )}

              {checkoutStep === 'details' && (
                <form onSubmit={handlePlaceOrderRequest} className="space-y-5 text-xs text-slate-300">
                  <div className="space-y-1">
                    <h4 className="font-display font-semibold text-white uppercase text-xs tracking-wider">Select Payment Route</h4>
                    <p className="text-slate-500 text-[10px]">Verify how you want to complete payment after validation.</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('bank_transfer')}
                      className={`p-3.5 rounded-xl border text-left transition-all flex flex-col gap-1 cursor-pointer ${
                        paymentMethod === 'bank_transfer'
                          ? 'bg-gradient-to-r from-blue-600/10 to-purple-600/10 border-purple-500 text-purple-300 shadow-md shadow-purple-500/5'
                          : 'bg-black/40 border-white/10 text-slate-400 hover:border-white/20'
                      }`}
                    >
                      <span className="font-semibold text-xs">Bank Transfer</span>
                      <span className="text-[9px] font-normal">Manually transfer with order reference</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPaymentMethod('paypal_invoice')}
                      className={`p-3.5 rounded-xl border text-left transition-all flex flex-col gap-1 cursor-pointer ${
                        paymentMethod === 'paypal_invoice'
                          ? 'bg-gradient-to-r from-blue-600/10 to-purple-600/10 border-purple-500 text-purple-300 shadow-md shadow-purple-500/5'
                          : 'bg-black/40 border-white/10 text-slate-400 hover:border-white/20'
                      }`}
                    >
                      <span className="font-semibold text-xs">PayPal</span>
                      <span className="text-[9px] font-normal">(+3% fee)</span>
                    </button>
                  </div>

                  {/* Payment instructions warning */}
                  {paymentMethod === 'bank_transfer' ? (
                    <div className="bg-blue-950/20 border border-blue-800/30 rounded-xl p-4 text-xs space-y-1 text-slate-300 leading-relaxed">
                      <h5 className="font-bold text-blue-300">Bank Transfer Account Details:</h5>
                      <p><strong>Account Name:</strong> {paymentDetails?.account_name || 'Glow State'}</p>
                      <p><strong>Bank:</strong> {paymentDetails?.bank_name || 'Commonwealth Bank'}</p>
                      <p><strong>BSB:</strong> {paymentDetails?.bsb || '064 437'}</p>
                      <p><strong>Account Number:</strong> {paymentDetails?.account_number || '10013757'}</p>
                      <p className="text-[10px] text-slate-400 pt-1 leading-relaxed">
                        Note:your bank may say that Glow State does not match the account name, <strong className="text-slate-300">This
                          is normal.</strong>, Please continue with the transfer.
                      </p>
                      <p className="text-[11px] text-yellow-400 font-semibold pt-1.5">
                        Please use your name as the reference and we will match your payment to your order.
                      </p>
                    </div>
                  ) : (
                    <div className="bg-purple-950/20 border border-purple-800/30 rounded-xl p-4 text-xs space-y-2 text-slate-300 leading-relaxed">
                      <h5 className="font-bold text-purple-300">Pay with PayPal</h5>
                      <p>A 3% PayPal fee applies to cover manual merchant overhead. Enter your delivery details below, then place your order to proceed to payment.</p>
                      <p className="font-mono font-bold text-white text-sm pt-1">
                        Total with fee: <span className="text-purple-400">${getOrderTotal().toFixed(2)} AUD</span>
                      </p>
                    </div>
                  )}

                  <div className="border-t border-white/10 pt-4 space-y-4">
                    <h4 className="font-display font-semibold text-white uppercase text-xs tracking-wider">Research Delivery Address</h4>
                    
                    <div className="space-y-3.5">
                      <div>
                        <label className="block text-slate-400 text-[10px] font-semibold uppercase tracking-wider mb-1">Full Name</label>
                        <input
                          type="text"
                          required
                          value={shippingDetails.name}
                          onChange={(e) => setShippingDetails({ ...shippingDetails, name: e.target.value })}
                          placeholder="John Doe"
                          className="w-full bg-[#0a0a25]/60 border border-white/10 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-purple-500"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-400 text-[10px] font-semibold uppercase tracking-wider mb-1">Email Address</label>
                        <input
                          type="email"
                          required
                          value={shippingDetails.email}
                          onChange={(e) => setShippingDetails({ ...shippingDetails, email: e.target.value })}
                          placeholder="john.doe@gmail.com"
                          className="w-full bg-[#0a0a25]/60 border border-white/10 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-purple-500 font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-400 text-[10px] font-semibold uppercase tracking-wider mb-1">Shipping Address (QLD/NSW/VIC/etc.)</label>
                        <input
                          type="text"
                          required
                          value={shippingDetails.address}
                          onChange={(e) => setShippingDetails({ ...shippingDetails, address: e.target.value })}
                          placeholder="123 Queen Street, Brisbane"
                          className="w-full bg-[#0a0a25]/60 border border-white/10 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-purple-500"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-slate-400 text-[10px] font-semibold uppercase tracking-wider mb-1">Postcode</label>
                          <input
                            type="text"
                            required
                            value={shippingDetails.postcode}
                            onChange={(e) => setShippingDetails({ ...shippingDetails, postcode: e.target.value })}
                            placeholder="4000"
                            className="w-full bg-[#0a0a25]/60 border border-white/10 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-purple-500 font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-400 text-[10px] font-semibold uppercase tracking-wider mb-1">Shipping Region</label>
                          <input
                            type="text"
                            disabled
                            value="Australia Nationwide"
                            className="w-full bg-white/5 border border-white/10 text-slate-500 rounded-xl px-3.5 py-2.5 font-bold"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-white/10 pt-4 space-y-2">
                    <h4 className="font-display font-semibold text-white uppercase text-xs tracking-wider">Order Summary</h4>
                    <div className="bg-black/40 border border-white/10 rounded-xl p-3.5 space-y-1.5">
                      <div className="flex justify-between text-slate-400">
                        <span>Subtotal</span>
                        <span className="font-mono">${getCartTotal().toFixed(2)} AUD</span>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Shipping</span>
                        <span className="font-mono">${getShippingFee().toFixed(2)} AUD</span>
                      </div>
                      {paymentMethod === 'paypal_invoice' && (
                        <div className="flex justify-between text-slate-400">
                          <span>PayPal Fee (3%)</span>
                          <span className="font-mono">${((getCartTotal() + getShippingFee()) * 0.03).toFixed(2)} AUD</span>
                        </div>
                      )}
                      <div className="flex justify-between font-mono font-bold text-white text-sm pt-1.5 border-t border-white/10">
                        <span>Total</span>
                        <span className="text-purple-400">${getOrderTotal().toFixed(2)} AUD</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-white/10 flex gap-3">
                    <button
                      type="button"
                      onClick={() => setCheckoutStep('cart')}
                      className="py-3 px-4 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl font-semibold transition-all shrink-0 cursor-pointer"
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      className="flex-1 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:brightness-110 text-white font-bold rounded-xl transition-all cursor-pointer"
                    >
                      Place Order
                    </button>
                  </div>
                </form>
              )}

              {checkoutStep === 'success' && placedOrder && (
                <div className="space-y-6 text-xs text-slate-300 leading-relaxed text-center">
                  <div className="h-12 w-12 bg-emerald-500/10 text-emerald-400 rounded-full flex items-center justify-center mx-auto border border-emerald-500/20">
                    <Check className="h-6 w-6" />
                  </div>

                  <div className="space-y-2">
                    <h3 className="font-display font-extrabold text-xl text-white uppercase tracking-wider">ORDER RECEIVED</h3>
                    <p className="text-slate-400 text-xs">Your purchase has been submitted to Glow State.</p>
                  </div>

                  <div className="bg-[#050510]/80 border border-white/10 rounded-2xl p-4 text-left space-y-2 font-mono text-[11px]">
                    <p><strong className="text-slate-500">Order Reference:</strong> <span className="text-emerald-400">#00{placedOrder.id}</span></p>
                    <p><strong className="text-slate-500">Receipt Recipient:</strong> <span className="text-slate-300">{placedOrder.customer_email}</span></p>
                    <p><strong className="text-slate-500">Total Amount:</strong> <span className="text-purple-400">${Number(placedOrder.total_amount).toFixed(2)} AUD</span></p>
                    <p><strong className="text-slate-500">Chosen route:</strong> <span className="text-slate-300 uppercase">{placedOrder.payment_method.replace('_', ' ')}</span></p>
                  </div>

                  {placedOrder.payment_method === 'bank_transfer' ? (
                    <div className="bg-blue-950/20 border border-blue-800/30 rounded-xl p-4 text-left space-y-2 leading-relaxed">
                      <h4 className="font-bold text-blue-300">Action Required: Complete Bank Transfer</h4>
                      <p><strong>Account Name:</strong> {paymentDetails?.account_name || 'Glow State'}</p>
                      <p><strong>Bank:</strong> {paymentDetails?.bank_name || 'Commonwealth Bank'}</p>
                      <p><strong>BSB:</strong> {paymentDetails?.bsb || '064 437'}</p>
                      <p><strong>Account Number:</strong> {paymentDetails?.account_number || '10013757'}</p>
                      <p className="font-bold text-yellow-400">
                        Please use your name as the reference and we will match your payment to your order.
                      </p>
                    </div>
                  ) : placedOrder.status === 'paid' ? (
                    <div className="bg-emerald-950/20 border border-emerald-800/30 rounded-xl p-4 text-left leading-relaxed space-y-2">
                      <h4 className="font-bold text-emerald-300 flex items-center gap-1.5">
                        <Check className="h-4 w-4" /> Payment Received
                      </h4>
                      <p>Your PayPal payment was successfully processed.</p>
                      {placedOrder.transaction_id && (
                        <p className="font-mono text-[11px] text-slate-400">Transaction ID: {placedOrder.transaction_id}</p>
                      )}
                    </div>
                  ) : (
                    <div className="bg-purple-950/20 border border-purple-800/30 rounded-xl p-4 text-left leading-relaxed space-y-3">
                      <h4 className="font-bold text-purple-300">Pay with PayPal:</h4>
                      <p>Complete your payment of <strong>${Number(placedOrder.total_amount).toFixed(2)} AUD</strong> securely with PayPal below.</p>
                      <PayPalButton
                        clientId={paymentDetails?.paypal_client_id || ''}
                        orderId={placedOrder.id}
                        onSuccess={(updatedOrder) => {
                          setPlacedOrder(updatedOrder);
                          setPaypalError('');
                        }}
                        onError={(msg) => setPaypalError(msg)}
                      />
                      {paypalError && (
                        <p className="text-[11px] text-red-400">{paypalError}</p>
                      )}
                      <a
                        href={getPaypalPayUrl(placedOrder.total_amount)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 w-full py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 rounded-xl text-[11px] transition-all"
                      >
                        Or pay manually via PayPal.me link
                      </a>
                    </div>
                  )}

                  <div className="border-t border-white/10 pt-5">
                    <p className="text-slate-500 text-[10px] mb-4">You can inspect sent simulated email files in the Admin Panel Outbox.</p>
                    <button
                      onClick={() => {
                        setIsCartOpen(false);
                        setCheckoutStep('cart');
                        setActivePage('shop');
                        setPaypalError('');
                      }}
                      className="py-2.5 px-6 bg-white/5 hover:bg-white/10 text-white rounded-xl font-semibold transition-all w-full cursor-pointer border border-white/10"
                    >
                      Return to Research Catalog
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* POPUP: Admin Dashboard Overlay */}
      {isAdminOpen && (
        <AdminPanel onClose={() => setIsAdminOpen(false)} />
      )}
    </div>
  );
}
