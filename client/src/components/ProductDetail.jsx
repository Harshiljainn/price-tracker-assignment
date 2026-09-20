import { useState, useEffect } from 'react';
import { ArrowLeft, RefreshCw, Trash2, ExternalLink, Activity, AlertCircle, CheckCircle2 } from 'lucide-react';
import { api } from '../services/api';
import PriceChart from './PriceChart';

export default function ProductDetail({ productId, onBack }) {
  const [product, setProduct] = useState(null);
  const [history, setHistory] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState(false);
  const [scrapeError, setScrapeError] = useState('');
  const [scrapeSuccess, setScrapeSuccess] = useState('');
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, isDeleting: false });
  const [fetchError, setFetchError] = useState('');

  const fetchData = async () => {
    try {
      setFetchError('');
      const [pData, hData, lData] = await Promise.all([
        api.getProduct(productId),
        api.getProductHistory(productId),
        api.getProductLogs(productId)
      ]);
      setProduct(pData);
      setHistory(hData);
      setLogs(lData);
    } catch (err) {
      setFetchError('Failed to load product details.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [productId]);

  const handleScrape = async () => {
    setScraping(true);
    setScrapeError('');
    setScrapeSuccess('');
    try {
      const result = await api.scrapeProduct(productId);
      if (result.success) {
        setScrapeSuccess(`Scraped successfully in ${result.durationMs}ms`);
      } else {
        setScrapeError(result.error || 'Scrape failed without a clear error.');
      }
      await fetchData(); // Refresh data regardless of success/fail to get new logs
    } catch (err) {
      setScrapeError(err.message || 'Scrape request failed completely.');
    } finally {
      setScraping(false);
    }
  };

  const promptDelete = () => {
    setDeleteModal({ isOpen: true, isDeleting: false });
  };

  const confirmDelete = async () => {
    if (deleteModal.isDeleting) return;
    setDeleteModal({ isOpen: true, isDeleting: true });
    try {
      await api.deleteProduct(productId);
      onBack();
    } catch (err) {
      alert(err.message || 'Failed to delete product');
      setDeleteModal({ isOpen: true, isDeleting: false });
    }
  };

  const cancelDelete = () => {
    setDeleteModal({ isOpen: false, isDeleting: false });
  };

  const formatPrice = (price) => {
    if (price === null || price === undefined) return 'Unknown';
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(price);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown';
    return new Intl.DateTimeFormat('en-US', { 
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit'
    }).format(new Date(dateString));
  };

  if (loading) {
    return (
      <div className="loading-state centered">
        <RefreshCw className="spin icon-xlarge" />
        <p>Loading details...</p>
      </div>
    );
  }

  if (fetchError || !product) {
    return (
      <div className="error-state centered">
        <AlertCircle className="icon-xlarge" />
        <h2>Error</h2>
        <p>{fetchError || 'Product not found.'}</p>
        <button onClick={onBack} className="btn-secondary">Go Back</button>
      </div>
    );
  }

  return (
    <div className="detail-container">
      <header className="detail-header">
        <button onClick={onBack} className="btn-icon">
          <ArrowLeft className="icon-medium" />
          <span>Back to Dashboard</span>
        </button>
        <div className="detail-actions">
          <button 
            onClick={handleScrape} 
            disabled={scraping} 
            className="btn-primary"
          >
            {scraping ? <RefreshCw className="spin icon-small" /> : <Activity className="icon-small" />}
            <span>{scraping ? 'Scraping...' : 'Scrape Now'}</span>
          </button>
          <button onClick={promptDelete} className="btn-icon danger">
            <Trash2 className="icon-small" />
            <span>Untrack</span>
          </button>
        </div>
      </header>

      {(scrapeError || scrapeSuccess) && (
        <div className={`scrape-banner ${scrapeError ? 'error' : 'success'}`}>
          {scrapeError ? <AlertCircle className="icon-small" /> : <CheckCircle2 className="icon-small" />}
          <span>{scrapeError || scrapeSuccess}</span>
        </div>
      )}

      <div className="detail-hero panel">
        <h2>{product.name || 'Unknown Product'}</h2>
        <a href={product.url} target="_blank" rel="noopener noreferrer" className="external-link">
          {product.url} <ExternalLink className="icon-small inline" />
        </a>
      </div>

      <div className="grid-2">
        <div className="panel">
          <h3 className="panel-title">Price History</h3>
          <PriceChart history={history} />
          {history.length === 0 ? (
            <p className="text-muted">No successful scrapes yet.</p>
          ) : (
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Price</th>
                    <th>MRP</th>
                    <th>Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map(record => (
                    <tr key={record.id}>
                      <td>{formatDate(record.scraped_at)}</td>
                      <td className="font-bold">{formatPrice(record.price)}</td>
                      <td className="text-muted">{formatPrice(record.mrp)}</td>
                      <td>
                        {record.in_stock === null 
                          ? 'Unknown' 
                          : (record.in_stock 
                              ? (record.quantity !== null ? `${record.quantity} left` : 'In Stock')
                              : 'Unavailable')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="panel">
          <h3 className="panel-title">Scrape Logs</h3>
          {logs.length === 0 ? (
            <p className="text-muted">No logs available.</p>
          ) : (
            <div className="table-responsive">
              <table className="data-table logs-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Status</th>
                    <th>Msg</th>
                    <th>Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => (
                    <tr key={log.id} className={log.status === 'SUCCESS' ? 'row-success' : 'row-error'}>
                      <td className="nowrap">{formatDate(log.scraped_at)}</td>
                      <td>
                        <span className={`badge badge-${log.status.toLowerCase()}`}>
                          {log.status}
                        </span>
                      </td>
                      <td className="truncate-text" title={log.message}>{log.message}</td>
                      <td>{log.duration_ms ? `${log.duration_ms}ms` : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
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
