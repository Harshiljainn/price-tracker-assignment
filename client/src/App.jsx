import { useState } from 'react';
import Dashboard from './components/Dashboard';
import ProductDetail from './components/ProductDetail';
import { Activity } from 'lucide-react';
import './index.css';

function App() {
  const [selectedProductId, setSelectedProductId] = useState(null);

  return (
    <div className="app-layout">
      <nav className="top-nav">
        <div className="logo-container" onClick={() => setSelectedProductId(null)}>
          <Activity className="logo-icon" />
          <span className="logo-text">PriceTracker</span>
        </div>
      </nav>
      
      <main className="main-content">
        {selectedProductId ? (
          <ProductDetail 
            productId={selectedProductId} 
            onBack={() => setSelectedProductId(null)} 
          />
        ) : (
          <Dashboard 
            onViewDetails={setSelectedProductId} 
          />
        )}
      </main>
    </div>
  );
}

export default App;
