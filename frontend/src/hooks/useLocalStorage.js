import { useState, useEffect } from 'react';

/**
 * useLocalStorage — persists state to localStorage
 * Usage:
 *   const [theme, setTheme] = useLocalStorage('theme', 'dark');
 */
export function useLocalStorage(key, defaultValue) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored !== null ? JSON.parse(stored) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage full or unavailable
    }
  }, [key, value]);

  return [value, setValue];
}

/**
 * useDebounce — debounce a value
 * Usage:
 *   const debouncedSearch = useDebounce(searchTerm, 400);
 */
export function useDebounce(value, delay = 400) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/**
 * useAsync — run async function with loading/error tracking
 * Usage:
 *   const { execute, loading, error, data } = useAsync(myAsyncFn);
 */
export function useAsync(fn) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  const execute = async (...args) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fn(...args);
      setData(result);
      return result;
    } catch (err) {
      setError(err.message || 'Error');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { execute, loading, error, data };
}
