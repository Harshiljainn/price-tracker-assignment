import { useState, useEffect } from 'react';
import { Search, Plus, Trash2, RefreshCw, ExternalLink, Activity } from 'lucide-react';
import { api } from '../services/api';

export default function Dashboard({ onViewDetails }) {
  const [allProducts, setAllProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [alertEmail, setAlertEmail] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');
  const [fetchError, setFetchError] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);

  // Delete modal state
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, productId: null, isDeleting: false });
  const [settingAlert, setSettingAlert] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');

  const fetchProducts = async () => {
    try {
      setFetchError('');
      const data = await api.getProducts();
      setAllProducts(data);
    } catch (err) {
      setFetchError(err.message || 'Failed to fetch products');
    } finally {
      setLoading(false);
    }
  };

  const fetchGlobalAlertEmail = async () => {
    try {
      const data = await api.getAlertEmail();
      if (data && data.email) {
        setAlertEmail(data.email);
      }
    } catch (err) {
      console.error('Failed to fetch global alert email', err);
    }
  };

  // Derive filtered list client-side instantly on every render — no debounce needed.
  const products = search
    ? allProducts.filter(p =>
        (p.name || '').toLowerCase().includes(search.toLowerCase())
      )
    : allProducts;

  useEffect(() => {
    setLoading(true);
    fetchProducts();
    fetchGlobalAlertEmail();
  }, []);

  // Briefly show a loading indicator on each search keystroke for visual feedback.
  // Does NOT make any API request — client-side filtering above runs synchronously.
  useEffect(() => {
    if (search === '') return; // clearing the box: no flash needed
    setSearchLoading(true);
    const t = setTimeout(() => setSearchLoading(false), 275);
    return () => clearTimeout(t);
  }, [search]);

  const handleAddProduct = async (e) => {
    e.preventDefault();
    if (!newUrl) return;
    
    // Very basic frontend validation to allow either URL or SKU format
    const isUrl = newUrl.startsWith('http://') || newUrl.startsWith('https://');
    if (!isUrl && !newUrl.match(/^[a-z]+-\d+$/i) && !newUrl.match(/^sku\s+[a-z]+-\d+$/i)) {
      setAddError('Please enter a valid URL or SKU (e.g., SKU HEL-10018)');
      return;
    }

    setAdding(true);
    setAddError('');
    try {
      // 1. Create Tracked Product
      const product = await api.createProduct(newUrl, null);
      
      // 2. Immediately trigger scrape
      let scrapeFailed = false;
      try {
        const scrapeRes = await api.scrapeProduct(product.id);
        if (scrapeRes && !scrapeRes.success) {
          scrapeFailed = true;
        }
      } catch (scrapeErr) {
        // We log it but don't fail the creation, the UI will show it as unknown/failed
        console.error('Initial scrape failed:', scrapeErr);
        scrapeFailed = true;
      }

      setNewUrl('');
      setAlertEmail('');
      await fetchProducts(); // Refresh list with new data
      
      if (scrapeFailed) {
        setAddError('Product added, but the initial price fetch failed. Please try Scrape Now again.');
      }
    } catch (err) {
      if (err.message === 'DUPLICATE_PRODUCT') {
        setAddError('Product already added to track');
      } else {
        setAddError(err.message || 'Failed to add product');
      }
    } finally {
      setAdding(false);
    }
  };

  const promptDelete = (e, productId) => {
    e.stopPropagation(); // Prevent opening details
    setDeleteModal({ isOpen: true, productId, isDeleting: false });
  };

  const confirmDelete = async () => {
    if (!deleteModal.productId || deleteModal.isDeleting) return;
    
    setDeleteModal(prev => ({ ...prev, isDeleting: true }));
    try {
      await api.deleteProduct(deleteModal.productId);
      fetchProducts();
      setDeleteModal({ isOpen: false, productId: null, isDeleting: false });
    } catch (err) {
      alert(err.message || 'Failed to untrack product');
      setDeleteModal(prev => ({ ...prev, isDeleting: false }));
    }
  };

  const cancelDelete = () => {
    setDeleteModal({ isOpen: false, productId: null, isDeleting: false });
  };

  const handleSetAlert = async () => {
    if (alertEmail && !/^\S+@\S+\.\S+$/.test(alertEmail)) {
      setAlertMessage('Please enter a valid email address');
      return;
    }
    setSettingAlert(true);
    setAlertMessage('');
    try {
      await api.setAlertEmail(alertEmail || '');
      setAlertMessage('Alert email updated!');
      setAlertEmail('');
      setTimeout(() => setAlertMessage(''), 3000);
    } catch (err) {
      setAlertMessage(err.message || 'Failed to update alert email');
    } finally {
      setSettingAlert(false);
    }
  };



  const formatPrice = (price) => {
    if (price === null || price === undefined) return 'Unknown';
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(price);
  };

  const formatStock = (inStock, quantity) => {
    if (inStock === null || inStock === undefined) {
      return (
        <div className="stock-container">
          <span className="status unknown">Unknown</span>
        </div>
      );
    }
    
    if (!inStock) {
      return (
        <div className="stock-container">
          <span className="status out-of-stock">Unavailable</span>
          <div className="quantity-text text-muted">Quantity: Unavailable</div>
        </div>
      );
    }

    return (
      <div className="stock-container">
        <span className="status in-stock">In Stock</span>
        <div className="quantity-text text-muted">
          {quantity !== null ? `Quantity: ${quantity} left` : 'Quantity: Available'}
        </div>
      </div>
    );
  };

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1>Tracked Products</h1>
        
        <div className="add-product-wrapper" style={{ width: '100%', maxWidth: '700px' }}>
          <form id="add-product-form" onSubmit={handleAddProduct} style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
            
            {/* Top Row: URL + Track */}
            <div style={{ position: 'relative' }}>
              <div className="add-product-form" style={{ maxWidth: '100%' }}>
                <input
                  type="text"
                  placeholder="Paste product URL or SKU (e.g. SKU HEL-10018)"
                  value={newUrl}
                  onChange={(e) => { setNewUrl(e.target.value); setAddError(''); }}
                  disabled={adding}
                  className="input-primary url-input"
                  required
                />
                <button type="submit" disabled={adding} className="btn-primary">
                  {adding ? <RefreshCw className="spin icon-small" /> : <Plus className="icon-small" />}
                  <span>{adding ? 'Adding & Scraping...' : 'Track'}</span>
                </button>
              </div>
              {addError && <div className="error-message" style={{ position: 'absolute', top: '100%', left: '0', marginTop: '4px' }}>{addError}</div>}
            </div>
            
          </form>
        </div>
      </header>

      <div className="dashboard-controls">
        <div className="search-box">
          <Search className="icon-small text-muted" />
          <input
            type="text"
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Bottom Row: Email + Set Alert */}
        <div style={{ position: 'relative', display: 'flex', flex: '1 1 400px', maxWidth: '600px' }}>
          <div className="add-product-form" style={{ width: '100%' }}>
            <input
              type="email"
              placeholder="Enter email for price & stock alerts (optional)"
              value={alertEmail}
              onChange={(e) => { setAlertEmail(e.target.value); setAlertMessage(''); }}
              disabled={settingAlert}
              className="input-primary url-input"
            />
            <button type="button" onClick={handleSetAlert} disabled={settingAlert} className="btn-primary">
              {settingAlert ? <RefreshCw className="spin icon-small" /> : <Activity className="icon-small" />}
              <span>{settingAlert ? 'Setting...' : 'Set Alert'}</span>
            </button>
          </div>
          {alertMessage && <div className="error-message" style={{ position: 'absolute', top: '100%', left: '0', marginTop: '4px', color: alertMessage.includes('updated') ? 'green' : 'var(--danger)' }}>{alertMessage}</div>}
        </div>
      </div>

      {fetchError && <div className="error-banner">{fetchError}</div>}

      <div className="products-grid">
        {(loading || searchLoading) ? (
          <div className="loading-state">
            <RefreshCw className="spin icon-large" />
            <p>Loading products...</p>
          </div>
        ) : products.length === 0 ? (
          <div className="empty-state">
            <p>{search ? 'No products found matching your search.' : 'You are not tracking any products yet.'}</p>
          </div>
        ) : (
          products.map(product => (
            <div key={product.id} className="product-card" onClick={() => onViewDetails(product.id)}>
              <div className="product-card-header">
                <h3>{product.name || 'Unknown Product'}</h3>
                <a href={product.url} target="_blank" rel="noopener noreferrer" className="external-link" onClick={e => e.stopPropagation()}>
                  <ExternalLink className="icon-small" />
                </a>
              </div>
              <div className="product-card-body">
                <div className="price-info">
                  <span className="price-label">Latest Price</span>
                  <span className="price-value">{formatPrice(product.price)}</span>
                  {product.mrp && <span className="mrp-value">MRP: {formatPrice(product.mrp)}</span>}
                </div>
                <div className="stock-info">
                  {formatStock(product.in_stock, product.quantity)}
                </div>
              </div>
              <div className="product-card-footer">
                <button 
                  className="btn-icon danger" 
                  onClick={(e) => promptDelete(e, product.id)}
                  title="Untrack Product"
                >
                  <Trash2 className="icon-small" />
                </button>
                <button 
                  className="btn-secondary" 
                  onClick={(e) => { e.stopPropagation(); onViewDetails(product.id); }}
                >
                  View Details & Scrape
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {deleteModal.isOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Untrack Product</h3>
            <p>Are you sure you want to stop tracking this product? This will also remove its price history.</p>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={cancelDelete} disabled={deleteModal.isDeleting}>Cancel</button>
              <button className="btn btn-danger" onClick={confirmDelete} disabled={deleteModal.isDeleting}>
                {deleteModal.isDeleting ? 'Deleting...' : 'Untrack'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
