/**
 * JobAI — Data-fetching hooks
 *
 * useApi      — GET with optional polling, abort-on-unmount, transform
 * useMutation — POST / PUT / DELETE
 * useStats    — dashboard stats shortcut with optional polling
 *
 * Import ENDPOINTS from '../services/endpoints' to avoid hardcoding strings.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../services/api';
import { ENDPOINTS } from '../services/endpoints';

/**
 * useApi — data fetching hook
 *
 * @param {string}  endpoint  - API path, e.g. ENDPOINTS.resume.list
 * @param {object}  options
 * @param {boolean} options.immediate  - fetch on mount (default true)
 * @param {Function} options.transform - (data) => transformedData
 *
 * @returns {{ data, loading, error, refetch }}
 *
 * @example
 *   const { data: resumes, loading } = useApi(ENDPOINTS.resume.list);
 *   const { data, refetch } = useApi(ENDPOINTS.jobs.list, { immediate: false });
 */
export function useApi(endpoint, { immediate = true, transform } = {}) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(immediate);
  const [error, setError]     = useState(null);
  const abortRef = useRef(null);

  const fetch = useCallback(async (params) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const res    = await api.get(endpoint, { signal: controller.signal, params });
      const result = transform ? transform(res.data) : res.data;
      setData(result);
      return result;
    } catch (err) {
      if (err.name === 'CanceledError' || err.name === 'AbortError') return;
      const msg = err.message || 'Request failed';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [endpoint, transform]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (immediate) fetch();
    return () => abortRef.current?.abort();
  }, [immediate, fetch]);

  return { data, loading, error, refetch: fetch };
}

/**
 * useMutation — POST / PUT / DELETE
 *
 * @param {string} endpoint - default endpoint
 * @param {string} method   - 'POST' | 'PUT' | 'DELETE' (default 'POST')
 *
 * @example
 *   const { mutate, loading, error } = useMutation(ENDPOINTS.jobs.analyze);
 *   const result = await mutate({ jobs: [...] });
 *
 *   // Override URL at call time:
 *   const { mutate } = useMutation(ENDPOINTS.applications.update, 'PUT');
 *   await mutate({ status: 'applied' }, `/applications/${id}`);
 */
export function useMutation(endpoint, method = 'POST') {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const mutate = useCallback(async (body, urlOverride) => {
    setLoading(true);
    setError(null);
    try {
      const url = urlOverride || endpoint;
      const res = method === 'DELETE'
        ? await api.delete(url, { data: body })
        : await api[method.toLowerCase()](url, body);
      return res.data;
    } catch (err) {
      const msg = err.message || 'Operation failed';
      setError(msg);
      throw new Error(msg);
    } finally {
      setLoading(false);
    }
  }, [endpoint, method]);   // eslint-disable-line react-hooks/exhaustive-deps

  return { mutate, loading, error, clearError: () => setError(null) };
}

/**
 * useStats — dashboard stats with optional polling
 *
 * @param {number} interval - ms between polls; 0 = no polling
 */
export function useStats(interval = 0) {
  const { data, loading, refetch } = useApi(ENDPOINTS.applications.stats);

  useEffect(() => {
    if (!interval) return;
    const id = setInterval(refetch, interval);
    return () => clearInterval(id);
  }, [interval, refetch]);

  return { stats: data, loading, refresh: refetch };
}
