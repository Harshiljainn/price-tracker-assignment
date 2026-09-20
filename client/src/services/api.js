const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

async function fetchWithHandler(url, options = {}) {
  try {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || `HTTP error! status: ${response.status}`);
    }

    return data;
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

export const api = {
  getProducts: (search = '') => {
    const url = new URL(`${API_BASE_URL}/products`);
    if (search) {
      url.searchParams.append('search', search);
    }
    return fetchWithHandler(url.toString());
  },

  getProduct: (id) => {
    return fetchWithHandler(`${API_BASE_URL}/products/${id}`);
  },

  createProduct: (url, alertEmail, name = null) => {
    return fetchWithHandler(`${API_BASE_URL}/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url, alertEmail, ...(name ? { name } : {}) }),
    });
  },

  deleteProduct: (id) => {
    return fetchWithHandler(`${API_BASE_URL}/products/${id}`, {
      method: 'DELETE',
    });
  },

  scrapeProduct: (id) => {
    return fetchWithHandler(`${API_BASE_URL}/products/${id}/scrape`, {
      method: 'POST',
    });
  },

  getProductHistory: (id) => {
    return fetchWithHandler(`${API_BASE_URL}/products/${id}/history`);
  },

  getProductLogs: (id) => {
    return fetchWithHandler(`${API_BASE_URL}/products/${id}/logs`);
  }
};
