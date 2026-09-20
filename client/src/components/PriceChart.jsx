import React from 'react';

export default function PriceChart({ history }) {
  if (!history || history.length === 0) {
    return <div className="chart-empty">No price history available to chart.</div>;
  }

  if (history.length === 1) {
    return (
      <div className="chart-empty">
        <p>Only 1 data point available.</p>
        <p><strong>{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(history[0].price)}</strong></p>
      </div>
    );
  }

  // Ensure chronological order (oldest first) for plotting
  const sortedHistory = [...history].sort((a, b) => new Date(a.scraped_at) - new Date(b.scraped_at));

  // Determine bounds
  const minPrice = Math.min(...sortedHistory.map(h => h.price));
  const maxPrice = Math.max(...sortedHistory.map(h => h.price));
  const minTime = new Date(sortedHistory[0].scraped_at).getTime();
  const maxTime = new Date(sortedHistory[sortedHistory.length - 1].scraped_at).getTime();

  // Add padding to Y axis
  const priceRange = Math.max(maxPrice - minPrice, 100);
  const yMin = Math.max(0, minPrice - priceRange * 0.1);
  const yMax = maxPrice + priceRange * 0.1;
  const yRange = yMax - yMin;

  const timeRange = maxTime - minTime || 1; // avoid division by zero

  const width = 800;
  const height = 300;
  const paddingX = 40;
  const paddingY = 20;

  const innerWidth = width - paddingX * 2;
  const innerHeight = height - paddingY * 2;

  const points = sortedHistory.map(h => {
    const x = paddingX + ((new Date(h.scraped_at).getTime() - minTime) / timeRange) * innerWidth;
    const y = paddingY + innerHeight - ((h.price - yMin) / yRange) * innerHeight;
    return { x, y, price: h.price, date: new Date(h.scraped_at) };
  });

  const pathD = `M ${points.map(p => `${p.x},${p.y}`).join(' L ')}`;

  const formatPrice = (p) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(p);

  return (
    <div className="price-chart-container" style={{ width: '100%', overflowX: 'auto', marginBottom: '20px' }}>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" style={{ width: '100%', minWidth: '400px', backgroundColor: '#fafafa', borderRadius: '8px' }}>
        {/* Y Axis Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map(tick => {
          const y = paddingY + innerHeight * tick;
          const val = yMax - (yRange * tick);
          return (
            <g key={tick}>
              <line x1={paddingX} y1={y} x2={width - paddingX} y2={y} stroke="#eaeaea" strokeWidth="1" />
              <text x={paddingX - 5} y={y + 4} fontSize="12" fill="#888" textAnchor="end">
                {formatPrice(val)}
              </text>
            </g>
          );
        })}

        {/* The Line */}
        <path d={pathD} fill="none" stroke="#2563eb" strokeWidth="2" />

        {/* Data Points */}
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="4" fill="#2563eb" />
            <text x={p.x} y={p.y - 10} fontSize="12" fill="#333" textAnchor="middle">
              {formatPrice(p.price)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
