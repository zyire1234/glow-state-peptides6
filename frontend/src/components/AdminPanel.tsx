import React, { useState, useEffect } from 'react';
import { 
  ShoppingBag, ClipboardList, Package, Activity as ActivityIcon, Mail, 
  LogIn, LogOut, Plus, Trash2, Edit, Check, AlertCircle, RefreshCw, X, TrendingUp, DollarSign, KeyRound
} from 'lucide-react';
import { API_BASE_URL } from '../lib/apiConfig';
// Connected to the real Django + SQLite backend. All API calls below use the
// browser's native `fetch` against API_BASE_URL (see src/lib/apiConfig.ts).

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

interface OrderItem {
  id: number;
  product_name: string;
  quantity: number;
  price: number;
}

interface Order {
  id: number;
  customer_name: string;
  customer_email: string;
  customer_address: string;
  payment_method: 'bank_transfer' | 'paypal_invoice';
  status: 'pending' | 'invoice_sent' | 'paid' | 'shipped' | 'cancelled';
  total_amount: number;
  created_at: string;
  items?: OrderItem[];
}

interface Activity {
  id: number;
  type: string;
  description: string;
  created_at: string;
}

interface SimulatedEmail {
  id: number;
  to: string;
  subject: string;
  html: string;
  created_at: string;
}

interface AdminPanelProps {
  onClose: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ onClose }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [loginError, setLoginError] = useState<string>('');
  const [token, setToken] = useState<string>('');

  const [activeTab, setActiveTab] = useState<'dashboard' | 'products' | 'orders' | 'activities' | 'emails' | 'settings'>('dashboard');

  // Admin states
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [emails, setEmails] = useState<SimulatedEmail[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  // Form states for Add/Edit Product
  const [showProductModal, setShowProductModal] = useState<boolean>(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [prodForm, setProdForm] = useState({
    name: '',
    description: '',
    price: 0,
    image_url: '',
    is_best_selling: false,
    is_discounted: false,
    discount_price: 0,
    category: 'Healing & Recovery',
    stock: 20
  });

  // Selected email for visual preview modal
  const [selectedEmail, setSelectedEmail] = useState<SimulatedEmail | null>(null);

  // Change Password form state
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [pwMessage, setPwMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [pwSubmitting, setPwSubmitting] = useState<boolean>(false);

  useEffect(() => {
    const savedToken = localStorage.getItem('glow_admin_token');
    const savedUsername = localStorage.getItem('glow_admin_username');
    if (savedToken) {
      setToken(savedToken);
      if (savedUsername) setUsername(savedUsername);
      setIsAuthenticated(true);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchAdminData();
    }
  }, [isAuthenticated, activeTab]);

  // The Django REST Framework endpoints serialize DecimalField values
  // (price, discount_price, total_amount, order item price) as strings
  // (e.g. "49.99"), not numbers. Coerce them to real numbers right after
  // fetching so every .toFixed() call below the app is safe instead of
  // crashing the whole Admin Panel with a blank screen.
  const normalizeProducts = (data: any[]): Product[] =>
    data.map((p) => ({
      ...p,
      price: Number(p.price),
      discount_price:
        p.discount_price === null || p.discount_price === undefined
          ? p.discount_price
          : Number(p.discount_price),
    }));

  const normalizeOrders = (data: any[]): Order[] =>
    data.map((o) => ({
      ...o,
      total_amount: Number(o.total_amount),
      items: o.items?.map((it: any) => ({ ...it, price: Number(it.price) })),
    }));

  const fetchAdminData = async () => {
    setLoading(true);
    try {
      const headers = { 'Authorization': `Bearer ${token}` };

      if (activeTab === 'dashboard') {
        const pRes = await fetch(`${API_BASE_URL}/products/`);
        const oRes = await fetch(`${API_BASE_URL}/orders/`, { headers });
        const aRes = await fetch(`${API_BASE_URL}/activities`, { headers });
        if (pRes.ok) setProducts(normalizeProducts(await pRes.json()));
        if (oRes.ok) setOrders(normalizeOrders(await oRes.json()));
        if (aRes.ok) setActivities(await aRes.json());
      } else if (activeTab === 'products') {
        const res = await fetch(`${API_BASE_URL}/products/`);
        if (res.ok) setProducts(normalizeProducts(await res.json()));
      } else if (activeTab === 'orders') {
        const res = await fetch(`${API_BASE_URL}/orders/`, { headers });
        if (res.ok) setOrders(normalizeOrders(await res.json()));
      } else if (activeTab === 'activities') {
        const res = await fetch(`${API_BASE_URL}/activities`, { headers });
        if (res.ok) setActivities(await res.json());
      } else if (activeTab === 'emails') {
        const res = await fetch(`${API_BASE_URL}/email-preview`, { headers });
        if (res.ok) setEmails(await res.json());
      }
    } catch (err) {
      console.error('Error fetching admin details', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('glow_admin_token', data.token);
        localStorage.setItem('glow_admin_username', username);
        setToken(data.token);
        setIsAuthenticated(true);
      } else {
        setLoginError(data.error || 'Authentication failed');
      }
    } catch (err) {
      setLoginError('Could not reach backend authentication endpoint.');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('glow_admin_token');
    localStorage.removeItem('glow_admin_username');
    setToken('');
    setIsAuthenticated(false);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMessage(null);

    if (pwForm.newPassword !== pwForm.confirmPassword) {
      setPwMessage({ type: 'error', text: 'New password and confirmation do not match.' });
      return;
    }
    if (pwForm.newPassword.length < 8) {
      setPwMessage({ type: 'error', text: 'New password must be at least 8 characters.' });
      return;
    }

    setPwSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          username,
          current_password: pwForm.currentPassword,
          new_password: pwForm.newPassword,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setPwMessage({ type: 'success', text: 'Password updated successfully.' });
        setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      } else {
        setPwMessage({ type: 'error', text: data.error || 'Unable to update password.' });
      }
    } catch (err) {
      setPwMessage({ type: 'error', text: 'Could not reach the authentication service.' });
    } finally {
      setPwSubmitting(false);
    }
  };

  // Product actions
  const openAddProduct = () => {
    setEditingProduct(null);
    setProdForm({
      name: '',
      description: '',
      price: 100,
      image_url: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&q=80&w=600',
      is_best_selling: false,
      is_discounted: false,
      discount_price: 0,
      category: 'Healing & Recovery',
      stock: 20
    });
    setShowProductModal(true);
  };

  const openEditProduct = (prod: Product) => {
    setEditingProduct(prod);
    setProdForm({
      name: prod.name,
      description: prod.description,
      price: prod.price,
      image_url: prod.image_url,
      is_best_selling: prod.is_best_selling,
      is_discounted: prod.is_discounted,
      discount_price: prod.discount_price || 0,
      category: prod.category,
      stock: prod.stock
    });
    setShowProductModal(true);
  };

  const saveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = editingProduct ? `${API_BASE_URL}/products/${editingProduct.id}/` : `${API_BASE_URL}/products/`;
      const method = editingProduct ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ...prodForm,
          discount_price: prodForm.is_discounted ? prodForm.discount_price : null
        })
      });

      if (res.ok) {
        setShowProductModal(false);
        fetchAdminData();
      } else {
        const err = await res.json();
        alert(`Error: ${err.error}`);
      }
    } catch (err) {
      alert('Network failure saving product.');
    }
  };

  const deleteProduct = async (id: number) => {
    if (!confirm('Are you sure you want to delete this product from the catalog?')) return;
    try {
      const res = await fetch(`${API_BASE_URL}/products/${id}/`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        fetchAdminData();
      } else {
        alert('Could not delete product.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Order actions
  const updateOrderStatus = async (id: number, status: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/orders/${id}/`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        fetchAdminData();
      } else {
        alert('Could not update status');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Stats calculators
  const getTotalEarnings = () => {
    return orders
      .filter(o => o.status === 'paid' || o.status === 'shipped')
      .reduce((sum, o) => sum + Number(o.total_amount), 0);
  };

  const getPendingRequestCount = () => {
    return orders.filter(o => o.status === 'pending').length;
  };

  const getStatusBadgeClass = (status: Order['status']) => {
    switch (status) {
      case 'pending': return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
      case 'invoice_sent': return 'bg-purple-500/10 text-purple-400 border border-purple-500/20';
      case 'paid': return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
      case 'shipped': return 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
      case 'cancelled': return 'bg-rose-500/10 text-rose-400 border border-rose-500/20';
      default: return 'bg-slate-500/10 text-slate-400 border border-slate-500/20';
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="fixed inset-0 bg-slate-950/95 flex items-center justify-center p-4 z-50 animate-fade-in">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 md:p-8 w-full max-w-md shadow-2xl relative">
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-400 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="text-center mb-6">
            <h2 className="font-display font-bold text-2xl text-white bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
              ADMIN PORTAL ACCESS
            </h2>
            <p className="text-slate-400 text-xs mt-1.5">Secure management backend for Glow State Peptides</p>
          </div>

          {loginError && (
            <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 flex items-center gap-2.5 text-rose-400 text-xs mb-4">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-slate-300 text-xs font-semibold mb-1 uppercase tracking-wider">Username</label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-purple-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-300 text-xs font-semibold mb-1 uppercase tracking-wider">Security Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-purple-500 font-mono"
              />
            </div>
            <button
              type="submit"
              className="w-full py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:opacity-95 text-white font-medium rounded-xl text-sm transition-all flex items-center justify-center gap-2"
            >
              <LogIn className="h-4 w-4" />
              Authenticate Administrator
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-[#050510] flex flex-col z-50 animate-fade-in">
      {/* Admin Nav Bar */}
      <header className="bg-[#08081a] border-b border-white/10 py-4 px-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="font-display font-extrabold text-lg tracking-wider bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent uppercase flex items-center gap-2">
            <span>GLOW STATE ADMIN PANEL</span>
          </div>
          <span className="bg-purple-500/15 text-purple-400 text-[10px] uppercase font-bold py-1 px-2 rounded-full border border-purple-500/25">
            Security Active
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchAdminData}
            className="p-2 text-slate-400 hover:text-white rounded-lg bg-white/5 hover:bg-white/10 transition-all cursor-pointer"
            title="Refresh Data Feed"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 py-1.5 px-3 bg-white/5 hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 rounded-lg text-xs font-semibold transition-all border border-white/10 hover:border-rose-900/30 cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Sign Out</span>
          </button>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg bg-white/5 hover:bg-white/10 transition-all cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Tabs */}
        <aside className="w-64 bg-white/5 border-r border-white/10 p-4 space-y-1 hidden md:block">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all cursor-pointer ${
              activeTab === 'dashboard'
                ? 'bg-gradient-to-r from-blue-600/10 to-purple-600/10 text-purple-300 border border-white/10 font-semibold shadow-md shadow-purple-500/5'
                : 'text-slate-400 hover:bg-white/5 hover:text-white border border-transparent'
            }`}
          >
            <TrendingUp className="h-4 w-4" />
            <span>Dashboard Overview</span>
          </button>
          <button
            onClick={() => setActiveTab('orders')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all cursor-pointer ${
              activeTab === 'orders'
                ? 'bg-gradient-to-r from-blue-600/10 to-purple-600/10 text-purple-300 border border-white/10 font-semibold shadow-md shadow-purple-500/5'
                : 'text-slate-400 hover:bg-white/5 hover:text-white border border-transparent'
            }`}
          >
            <ClipboardList className="h-4 w-4" />
            <span>Order Requests ({orders.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('products')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all cursor-pointer ${
              activeTab === 'products'
                ? 'bg-gradient-to-r from-blue-600/10 to-purple-600/10 text-purple-300 border border-white/10 font-semibold shadow-md shadow-purple-500/5'
                : 'text-slate-400 hover:bg-white/5 hover:text-white border border-transparent'
            }`}
          >
            <Package className="h-4 w-4" />
            <span>Product Catalog</span>
          </button>
          <button
            onClick={() => setActiveTab('activities')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all cursor-pointer ${
              activeTab === 'activities'
                ? 'bg-gradient-to-r from-blue-600/10 to-purple-600/10 text-purple-300 border border-white/10 font-semibold shadow-md shadow-purple-500/5'
                : 'text-slate-400 hover:bg-white/5 hover:text-white border border-transparent'
            }`}
          >
            <ActivityIcon className="h-4 w-4" />
            <span>Activity Logs</span>
          </button>
          <button
            onClick={() => setActiveTab('emails')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all cursor-pointer ${
              activeTab === 'emails'
                ? 'bg-gradient-to-r from-blue-600/10 to-purple-600/10 text-purple-300 border border-white/10 font-semibold shadow-md shadow-purple-500/5'
                : 'text-slate-400 hover:bg-white/5 hover:text-white border border-transparent'
            }`}
          >
            <Mail className="h-4 w-4" />
            <span>Email Outbox Simulator</span>
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all cursor-pointer ${
              activeTab === 'settings'
                ? 'bg-gradient-to-r from-blue-600/10 to-purple-600/10 text-purple-300 border border-white/10 font-semibold shadow-md shadow-purple-500/5'
                : 'text-slate-400 hover:bg-white/5 hover:text-white border border-transparent'
            }`}
          >
            <KeyRound className="h-4 w-4" />
            <span>Account Security</span>
          </button>
        </aside>

        {/* Content Panel */}
        <main className="flex-1 overflow-y-auto p-6 bg-[#050510]">
          {/* Mobile Tab Selector */}
          <div className="md:hidden flex gap-2 overflow-x-auto pb-4 mb-2">
            {(['dashboard', 'orders', 'products', 'activities', 'emails', 'settings'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap border capitalize cursor-pointer ${
                  activeTab === tab
                    ? 'bg-purple-500/20 border-purple-500 text-purple-300'
                    : 'bg-white/5 border-white/10 text-slate-400'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {loading && (
            <div className="flex items-center gap-3 py-3 px-4 bg-purple-500/10 border border-purple-500/15 rounded-xl text-purple-300 text-xs mb-4">
              <RefreshCw className="h-4 w-4 animate-spin shrink-0" />
              <span>Synchronizing database assets...</span>
            </div>
          )}

          {/* Tab 1: Dashboard Overview */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              <h2 className="text-xl font-display font-bold text-white uppercase tracking-wider">Metrics & Performance</h2>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white/5 border border-white/10 rounded-xl p-5 shadow-xl relative overflow-hidden backdrop-blur-sm">
                  <div className="absolute top-0 right-0 w-16 h-16 bg-purple-600/5 blur-xl pointer-events-none" />
                  <div className="flex items-center justify-between mb-3 relative z-10">
                    <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Revenue (Confirmed)</span>
                    <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg">
                      <DollarSign className="h-4 w-4" />
                    </div>
                  </div>
                  <h3 className="font-mono text-2xl font-bold text-white relative z-10">${getTotalEarnings().toFixed(2)}</h3>
                  <p className="text-[10px] text-slate-500 mt-1 relative z-10">Paid or Shipped requests</p>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-xl p-5 shadow-xl relative overflow-hidden backdrop-blur-sm">
                  <div className="absolute top-0 right-0 w-16 h-16 bg-blue-600/5 blur-xl pointer-events-none" />
                  <div className="flex items-center justify-between mb-3 relative z-10">
                    <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Total Orders</span>
                    <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg">
                      <ShoppingBag className="h-4 w-4" />
                    </div>
                  </div>
                  <h3 className="font-mono text-2xl font-bold text-white relative z-10">{orders.length}</h3>
                  <p className="text-[10px] text-slate-500 mt-1 relative z-10">Total customer queries submitted</p>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-xl p-5 shadow-xl relative overflow-hidden backdrop-blur-sm">
                  <div className="absolute top-0 right-0 w-16 h-16 bg-amber-600/5 blur-xl pointer-events-none" />
                  <div className="flex items-center justify-between mb-3 relative z-10">
                    <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Needs Invoice</span>
                    <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg">
                      <ClipboardList className="h-4 w-4" />
                    </div>
                  </div>
                  <h3 className="font-mono text-2xl font-bold text-white relative z-10">{getPendingRequestCount()}</h3>
                  <p className="text-[10px] text-slate-500 mt-1 relative z-10">Awaiting bank proof/PayPal issue</p>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-xl p-5 shadow-xl relative overflow-hidden backdrop-blur-sm">
                  <div className="absolute top-0 right-0 w-16 h-16 bg-pink-600/5 blur-xl pointer-events-none" />
                  <div className="flex items-center justify-between mb-3 relative z-10">
                    <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Products Registered</span>
                    <div className="p-2 bg-purple-500/10 text-purple-400 rounded-lg">
                      <Package className="h-4 w-4" />
                    </div>
                  </div>
                  <h3 className="font-mono text-2xl font-bold text-white relative z-10">{products.length}</h3>
                  <p className="text-[10px] text-slate-500 mt-1 relative z-10">Active laboratory catalog rows</p>
                </div>
              </div>

              {/* Two Column details */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Recent activity */}
                <div className="bg-[#08081a]/40 border border-white/10 rounded-2xl p-5 shadow-xl flex flex-col h-[400px]">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                    <h4 className="font-display font-semibold text-white uppercase tracking-wider text-sm flex items-center gap-2">
                      <ActivityIcon className="h-4 w-4 text-purple-400" />
                      <span>Live Website Monitoring Feed</span>
                    </h4>
                    <button onClick={() => setActiveTab('activities')} className="text-xs text-purple-400 hover:text-purple-300">View All</button>
                  </div>
                  <div className="flex-1 overflow-y-auto space-y-3.5 pr-2">
                    {activities.slice(0, 8).map(act => (
                      <div key={act.id} className="text-xs flex gap-2.5 items-start">
                        <span className="text-[10px] font-mono text-slate-500 shrink-0 mt-0.5">{new Date(act.created_at).toLocaleTimeString()}</span>
                        <div className="space-y-0.5">
                          <p className="text-slate-300 font-sans">{act.description}</p>
                          <span className="text-[10px] uppercase font-mono text-slate-500 tracking-wider font-bold">{act.type.replace('_', ' ')}</span>
                        </div>
                      </div>
                    ))}
                    {activities.length === 0 && (
                      <p className="text-slate-500 text-xs text-center py-10">No recent logs reported.</p>
                    )}
                  </div>
                </div>

                {/* Quick Orders pending */}
                <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 shadow-xl flex flex-col h-[400px]">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                    <h4 className="font-display font-semibold text-white uppercase tracking-wider text-sm flex items-center gap-2">
                      <ClipboardList className="h-4 w-4 text-purple-400" />
                      <span>Action Required Order Requests</span>
                    </h4>
                    <button onClick={() => setActiveTab('orders')} className="text-xs text-purple-400 hover:text-purple-300">Manage Orders</button>
                  </div>
                  <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                    {orders.filter(o => o.status === 'pending').slice(0, 5).map(order => (
                      <div key={order.id} className="bg-slate-950/40 border border-slate-800/60 rounded-xl p-3 flex justify-between items-center text-xs">
                        <div>
                          <p className="font-semibold text-white">#{order.id} - {order.customer_name}</p>
                          <p className="text-slate-400 text-[10px]">{order.customer_email}</p>
                          <span className="text-purple-400 font-mono font-medium text-[10px] tracking-wider mt-1 inline-block uppercase">
                            {order.payment_method.replace('_', ' ')}
                          </span>
                        </div>
                        <div className="text-right">
                          <p className="font-mono text-white font-bold">${Number(order.total_amount).toFixed(2)}</p>
                          <p className="text-[9px] text-slate-500">{new Date(order.created_at).toLocaleDateString()}</p>
                        </div>
                      </div>
                    ))}
                    {orders.filter(o => o.status === 'pending').length === 0 && (
                      <div className="flex flex-col items-center justify-center py-20 text-slate-500 text-xs">
                        <Check className="h-6 w-6 text-emerald-500 mb-2" />
                        <p>Excellent! Zero pending tasks.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Orders List */}
          {activeTab === 'orders' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-display font-bold text-white uppercase tracking-wider">Purchase & Invoice Requests</h2>
                <span className="text-slate-400 text-xs font-mono">{orders.length} order requests logged</span>
              </div>

              <div className="space-y-4">
                {orders.map(order => (
                  <div key={order.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-3 gap-3">
                      <div>
                        <div className="flex items-center gap-2.5">
                          <h3 className="font-display font-bold text-lg text-white">Order ID: #{order.id}</h3>
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${getStatusBadgeClass(order.status)}`}>
                            {order.status.replace('_', ' ')}
                          </span>
                        </div>
                        <p className="text-slate-500 text-[11px] font-mono mt-0.5">
                          Submitted: {new Date(order.created_at).toLocaleString('en-AU', { timeZone: 'Australia/Brisbane' })} (Brisbane time)
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-slate-400 text-xs uppercase tracking-wider">Update Status:</span>
                        <select
                          value={order.status}
                          onChange={(e) => updateOrderStatus(order.id, e.target.value)}
                          className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-purple-500"
                        >
                          <option value="pending">Pending Request</option>
                          <option value="invoice_sent">Invoice Issued</option>
                          <option value="paid">Mark as Paid</option>
                          <option value="shipped">Mark as Dispatched</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                      </div>
                    </div>

                    {/* Customer info & items */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                      <div className="space-y-2">
                        <h4 className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Customer Details</h4>
                        <p className="text-white"><strong className="text-slate-400">Name:</strong> {order.customer_name}</p>
                        <p className="text-white"><strong className="text-slate-400">Email:</strong> {order.customer_email}</p>
                        <p className="text-white"><strong className="text-slate-400">Address:</strong> {order.customer_address}</p>
                        <p className="text-white"><strong className="text-slate-400">Chosen Flow:</strong> <span className="bg-purple-600/10 text-purple-300 font-bold px-2 py-0.5 rounded border border-purple-500/20 text-xs uppercase">{order.payment_method.replace('_', ' ')}</span></p>
                      </div>

                      <div className="space-y-2">
                        <h4 className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Requested Products</h4>
                        <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-3 divide-y divide-slate-800/60 max-h-40 overflow-y-auto">
                          {order.items?.map((item, idx) => (
                            <div key={idx} className="py-2 flex justify-between text-xs gap-3">
                              <span className="text-slate-300 font-medium">{item.product_name} <strong className="text-purple-400 font-bold">x{item.quantity}</strong></span>
                              <span className="text-white font-mono font-semibold">${(Number(item.price) * item.quantity).toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                        <div className="flex justify-between items-center font-mono font-bold text-white text-base pt-1 px-1">
                          <span>TOTAL REQUEST:</span>
                          <span className="text-purple-400">${Number(order.total_amount).toFixed(2)} AUD</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {orders.length === 0 && (
                  <p className="text-slate-500 text-xs text-center py-20">No orders logged yet.</p>
                )}
              </div>
            </div>
          )}

          {/* Tab 3: Products Catalog */}
          {activeTab === 'products' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-display font-bold text-white uppercase tracking-wider font-semibold">Active Laboratories Inventory</h2>
                <button
                  onClick={openAddProduct}
                  className="flex items-center gap-2 py-2 px-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl text-xs font-semibold hover:opacity-95 transition-all"
                >
                  <Plus className="h-4 w-4" />
                  <span>Register Peptide</span>
                </button>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-950 border-b border-slate-800 text-xs text-slate-400 uppercase font-semibold tracking-wider">
                        <th className="p-4">Thumbnail</th>
                        <th className="p-4">Peptide Name</th>
                        <th className="p-4">Category</th>
                        <th className="p-4">Base Price</th>
                        <th className="p-4">Discount status</th>
                        <th className="p-4">Stock</th>
                        <th className="p-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-xs text-slate-300">
                      {products.map(prod => (
                        <tr key={prod.id} className="hover:bg-slate-800/40">
                          <td className="p-4">
                            <img
                              src={prod.image_url}
                              alt={prod.name}
                              className="h-10 w-10 object-cover rounded-lg border border-slate-700"
                              referrerPolicy="no-referrer"
                            />
                          </td>
                          <td className="p-4 font-semibold text-white max-w-xs">{prod.name}</td>
                          <td className="p-4">{prod.category}</td>
                          <td className="p-4 font-mono font-medium">${Number(prod.price).toFixed(2)}</td>
                          <td className="p-4">
                            {prod.is_discounted && prod.discount_price !== null && prod.discount_price !== undefined ? (
                              <span className="text-emerald-400 font-mono font-bold">${Number(prod.discount_price).toFixed(2)} <span className="text-[9px] uppercase font-bold text-slate-500">(Active)</span></span>
                            ) : (
                              <span className="text-slate-500">None</span>
                            )}
                          </td>
                          <td className="p-4 font-mono">{prod.stock} Units</td>
                          <td className="p-4 text-right">
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => openEditProduct(prod)}
                                className="p-2 text-slate-400 hover:text-white rounded-lg bg-slate-800 transition-all"
                                title="Edit Peptide Profile"
                              >
                                <Edit className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => deleteProduct(prod.id)}
                                className="p-2 text-slate-400 hover:text-rose-400 rounded-lg bg-slate-800 transition-all"
                                title="Remove Peptide"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Tab 4: Activity Logs */}
          {activeTab === 'activities' && (
            <div className="space-y-6">
              <h2 className="text-xl font-display font-bold text-white uppercase tracking-wider">Audit logs & Events logs</h2>
              
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg divide-y divide-slate-800 max-h-[600px] overflow-y-auto">
                {activities.map(act => (
                  <div key={act.id} className="py-3.5 first:pt-0 last:pb-0 flex justify-between items-start text-xs gap-4">
                    <div className="space-y-1">
                      <p className="text-slate-200">{act.description}</p>
                      <div className="flex gap-2 items-center">
                        <span className="bg-purple-950 text-purple-400 px-2 py-0.5 rounded font-mono font-bold text-[9px] uppercase tracking-wider">
                          {act.type.replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                    <span className="text-slate-500 font-mono text-[10px] shrink-0">{new Date(act.created_at).toLocaleString()}</span>
                  </div>
                ))}
                {activities.length === 0 && (
                  <p className="text-slate-500 text-xs text-center py-20">No system activities recorded.</p>
                )}
              </div>
            </div>
          )}

          {/* Tab 5: Email Simulator */}
          {activeTab === 'emails' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-display font-bold text-white uppercase tracking-wider">Simulated Automated Email Log</h2>
                <p className="text-slate-400 text-xs mt-1">Review exactly what automated HTML alerts and receipts were fired to `Glowstatepeps@hotmail.com` and customer mailboxes.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* List */}
                <div className="md:col-span-1 bg-slate-900 border border-slate-800 rounded-2xl p-4 h-[500px] overflow-y-auto space-y-2.5">
                  <h3 className="text-slate-400 text-[11px] font-bold uppercase tracking-wider mb-2">Dispatched Outbox</h3>
                  {emails.map(mail => (
                    <button
                      key={mail.id}
                      onClick={() => setSelectedEmail(mail)}
                      className={`w-full text-left p-3 rounded-xl border text-xs transition-all flex flex-col gap-1 ${
                        selectedEmail?.id === mail.id
                          ? 'bg-purple-600/15 border-purple-500 text-purple-300 font-semibold'
                          : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:bg-slate-900 hover:text-white'
                      }`}
                    >
                      <div className="flex justify-between items-center w-full">
                        <span className="font-semibold text-slate-300">To: {mail.to}</span>
                        <span className="text-[9px] font-mono text-slate-500">{new Date(mail.created_at).toLocaleTimeString()}</span>
                      </div>
                      <span className="font-medium text-white truncate w-full">{mail.subject}</span>
                    </button>
                  ))}
                  {emails.length === 0 && (
                    <p className="text-slate-500 text-xs text-center py-20">No emails dispatched yet. Submit an order request to trigger simulated emails.</p>
                  )}
                </div>

                {/* Display */}
                <div className="md:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6 h-[500px] flex flex-col">
                  {selectedEmail ? (
                    <div className="flex flex-col h-full">
                      <div className="border-b border-slate-800 pb-3 mb-4 space-y-1">
                        <h3 className="text-white font-semibold text-sm">Subject: {selectedEmail.subject}</h3>
                        <p className="text-xs text-slate-400">Recipient Address: <strong className="text-purple-400 font-bold">{selectedEmail.to}</strong></p>
                        <p className="text-[10px] text-slate-500 font-mono">Dispatched Timestamp: {new Date(selectedEmail.created_at).toLocaleString()}</p>
                      </div>
                      <div className="flex-1 bg-white rounded-xl overflow-y-auto p-4 border border-slate-700 shadow-inner">
                        <div dangerouslySetInnerHTML={{ __html: selectedEmail.html }} />
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-500 text-xs gap-2">
                      <Mail className="h-10 w-10 text-slate-600 animate-pulse" />
                      <p>Select a simulated email from the sidebar to inspect its styling and transaction details.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Tab: Account Security / Change Password */}
          {activeTab === 'settings' && (
            <div className="space-y-6 max-w-lg">
              <div>
                <h2 className="text-xl font-display font-bold text-white uppercase tracking-wider">Account Security</h2>
                <p className="text-slate-400 text-xs mt-1">
                  Change your admin password. This site has no backend server, so this password is only ever stored (hashed) in this browser's local storage — it is never shown on any public page.
                </p>
              </div>

              <form onSubmit={handleChangePassword} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
                {pwMessage && (
                  <div className={`rounded-xl p-3 flex items-center gap-2.5 text-xs ${
                    pwMessage.type === 'success'
                      ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                      : 'bg-rose-500/10 border border-rose-500/20 text-rose-400'
                  }`}>
                    {pwMessage.type === 'success' ? <Check className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
                    <span>{pwMessage.text}</span>
                  </div>
                )}

                <div>
                  <label className="block text-slate-300 text-xs font-semibold mb-1 uppercase tracking-wider">Current Password</label>
                  <input
                    type="password"
                    required
                    value={pwForm.currentPassword}
                    onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })}
                    placeholder="••••••••"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-purple-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 text-xs font-semibold mb-1 uppercase tracking-wider">New Password</label>
                  <input
                    type="password"
                    required
                    value={pwForm.newPassword}
                    onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })}
                    placeholder="At least 8 characters"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-purple-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 text-xs font-semibold mb-1 uppercase tracking-wider">Confirm New Password</label>
                  <input
                    type="password"
                    required
                    value={pwForm.confirmPassword}
                    onChange={(e) => setPwForm({ ...pwForm, confirmPassword: e.target.value })}
                    placeholder="Repeat new password"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-purple-500 font-mono"
                  />
                </div>

                <button
                  type="submit"
                  disabled={pwSubmitting}
                  className="w-full py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:opacity-95 disabled:opacity-50 text-white font-medium rounded-xl text-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <KeyRound className="h-4 w-4" />
                  {pwSubmitting ? 'Updating…' : 'Update Password'}
                </button>
              </form>
            </div>
          )}
        </main>
      </div>

      {/* MODAL: Add/Edit Product */}
      {showProductModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 md:p-8 w-full max-w-lg shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-5">
              <h3 className="font-display font-bold text-lg text-white">
                {editingProduct ? 'EDIT PEPTIDE RECORD' : 'REGISTER NEW PEPTIDE'}
              </h3>
              <button onClick={() => setShowProductModal(false)} className="text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={saveProduct} className="space-y-4 text-xs text-slate-300">
              <div>
                <label className="block text-slate-400 font-semibold mb-1 uppercase tracking-wider">Peptide Compound Name</label>
                <input
                  type="text"
                  required
                  value={prodForm.name}
                  onChange={(e) => setProdForm({ ...prodForm, name: e.target.value })}
                  placeholder="e.g. CJC-1295 (5mg vial)"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1 uppercase tracking-wider">Laboratory Description</label>
                <textarea
                  required
                  value={prodForm.description}
                  onChange={(e) => setProdForm({ ...prodForm, description: e.target.value })}
                  rows={3}
                  placeholder="Describe its research parameters, molecular structure details, or recovery acceleration factors..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1 uppercase tracking-wider">Category Classification</label>
                  <select
                    value={prodForm.category}
                    onChange={(e) => setProdForm({ ...prodForm, category: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="Healing & Recovery">Healing & Recovery</option>
                    <option value="Anti-Aging & Wellness">Anti-Aging & Wellness</option>
                    <option value="Aesthetics">Aesthetics</option>
                    <option value="Metabolic Support">Metabolic Support</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1 uppercase tracking-wider">Vial Stock Units</label>
                  <input
                    type="number"
                    required
                    value={prodForm.stock}
                    onChange={(e) => setProdForm({ ...prodForm, stock: parseInt(e.target.value) || 0 })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1 uppercase tracking-wider">Peptide Photo URL</label>
                <input
                  type="text"
                  required
                  value={prodForm.image_url}
                  onChange={(e) => setProdForm({ ...prodForm, image_url: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-purple-500 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-4 border-t border-slate-800/80 pt-4">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1 uppercase tracking-wider">Base Price ($ AUD)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={prodForm.price}
                    onChange={(e) => setProdForm({ ...prodForm, price: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-purple-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1 uppercase tracking-wider">Is Discounted?</label>
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      type="checkbox"
                      id="is_discounted"
                      checked={prodForm.is_discounted}
                      onChange={(e) => setProdForm({ ...prodForm, is_discounted: e.target.checked })}
                      className="accent-purple-500 h-4 w-4"
                    />
                    <label htmlFor="is_discounted" className="text-slate-300 font-medium">Activate Sale Price</label>
                  </div>
                </div>
              </div>

              {prodForm.is_discounted && (
                <div className="bg-purple-950/20 border border-purple-800/20 rounded-xl p-3">
                  <label className="block text-purple-300 font-semibold mb-1 uppercase tracking-wider">Discount Sale Price ($ AUD)</label>
                  <input
                    type="number"
                    step="0.01"
                    required={prodForm.is_discounted}
                    value={prodForm.discount_price}
                    onChange={(e) => setProdForm({ ...prodForm, discount_price: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-slate-950 border border-purple-800/40 rounded-xl px-3 py-2 text-emerald-400 focus:outline-none focus:border-purple-500 font-mono"
                  />
                </div>
              )}

              <div className="flex gap-2">
                <input
                  type="checkbox"
                  id="is_best_selling"
                  checked={prodForm.is_best_selling}
                  onChange={(e) => setProdForm({ ...prodForm, is_best_selling: e.target.checked })}
                  className="accent-purple-500 h-4 w-4"
                />
                <label htmlFor="is_best_selling" className="text-slate-300 font-medium">Flag as "Best Selling" on Homepage</label>
              </div>

              <div className="flex gap-3 justify-end border-t border-slate-800 pt-4 mt-6">
                <button
                  type="button"
                  onClick={() => setShowProductModal(false)}
                  className="py-2.5 px-4 bg-slate-850 hover:bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="py-2.5 px-5 bg-gradient-to-r from-purple-600 to-blue-600 hover:opacity-95 text-white rounded-xl text-xs font-semibold"
                >
                  Save Peptide Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
