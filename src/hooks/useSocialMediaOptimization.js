import { useState, useEffect, useCallback, useRef } from 'react';
import { debounce, throttle } from 'lodash';

// Performance optimization hooks for social media features

export const useInfiniteScroll = (loadMore, hasMore, threshold = 100) => {
  const [loading, setLoading] = useState(false);
  const observerRef = useRef();

  const lastElementRef = useCallback(node => {
    if (loading) return;
    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        setLoading(true);
        loadMore().finally(() => setLoading(false));
      }
    }, { threshold: threshold / 100 });

    if (node) observerRef.current.observe(node);
  }, [loading, hasMore, loadMore, threshold]);

  return { lastElementRef, loading };
};

export const useDebounceSearch = (searchFunction, delay = 300) => {
  const debouncedSearch = useCallback(
    debounce(searchFunction, delay),
    [searchFunction]
  );

  return debouncedSearch;
};

export const useThrottledScroll = (callback, delay = 100) => {
  const throttledCallback = useCallback(
    throttle(callback, delay),
    [callback]
  );

  useEffect(() => {
    const handleScroll = throttledCallback;
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [throttledCallback]);
};

export const useVirtualizedList = (items, itemHeight = 80, containerHeight = 400) => {
  const [scrollTop, setScrollTop] = useState(0);
  const [containerRef, setContainerRef] = useState(null);

  const visibleStart = Math.floor(scrollTop / itemHeight);
  const visibleEnd = Math.min(
    visibleStart + Math.ceil(containerHeight / itemHeight) + 1,
    items.length
  );

  const visibleItems = items.slice(visibleStart, visibleEnd);
  const totalHeight = items.length * itemHeight;
  const offsetY = visibleStart * itemHeight;

  const handleScroll = useCallback((e) => {
    setScrollTop(e.target.scrollTop);
  }, []);

  return {
    visibleItems,
    totalHeight,
    offsetY,
    containerRef: setContainerRef,
    onScroll: handleScroll,
    startIndex: visibleStart,
    endIndex: visibleEnd
  };
};

export const useCachedAPI = (apiFunction, cacheKey, ttl = 300000) => {
  const [cache, setCache] = useState(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const getCached = useCallback(async (...args) => {
    const key = `${cacheKey}:${JSON.stringify(args)}`;
    const cached = cache.get(key);

    if (cached && Date.now() - cached.timestamp < ttl) {
      return cached.data;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await apiFunction(...args);
      setCache(prev => new Map(prev).set(key, {
        data: result,
        timestamp: Date.now()
      }));
      return result;
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [apiFunction, cacheKey, ttl, cache]);

  const invalidateCache = useCallback(() => {
    setCache(new Map());
  }, []);

  return { getCached, loading, error, invalidateCache };
};

export const useRealtimeSubscription = (channelName, eventHandler, deps = []) => {
  const [subscription, setSubscription] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    // This would integrate with Supabase real-time subscriptions
    // Implementation depends on your Supabase client setup
    const setupSubscription = async () => {
      try {
        // const { data: { subscription } } = await supabaseClient
        //   .channel(channelName)
        //   .on('postgres_changes', { event: '*', schema: 'public' }, eventHandler)
        //   .subscribe();
        
        // setSubscription(subscription);
        // setConnected(true);
        
        // return () => subscription.unsubscribe();
      } catch (error) {
        console.error('Realtime subscription error:', error);
        setConnected(false);
      }
    };

    const cleanup = setupSubscription();
    return cleanup;
  }, [channelName, ...deps]);

  return { connected, subscription };
};

export const useImageOptimization = () => {
  const [loadedImages, setLoadedImages] = useState(new Set());

  const optimizeImage = useCallback((src, width = 300, height = 300) => {
    // This would integrate with your image optimization service
    // For now, return the original src
    return src;
  }, []);

  const preloadImage = useCallback((src) => {
    if (loadedImages.has(src)) return Promise.resolve();

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        setLoadedImages(prev => new Set(prev).add(src));
        resolve();
      };
      img.onerror = reject;
      img.src = src;
    });
  }, [loadedImages]);

  return { optimizeImage, preloadImage, loadedImages };
};

export const usePerformanceMetrics = () => {
  const [metrics, setMetrics] = useState({
    renderTime: 0,
    apiCallTime: 0,
    memoryUsage: 0,
    errorCount: 0
  });

  const measureRender = useCallback((fn) => {
    const start = performance.now();
    const result = fn();
    const end = performance.now();
    
    setMetrics(prev => ({
      ...prev,
      renderTime: prev.renderTime + (end - start)
    }));
    
    return result;
  }, []);

  const measureAPICall = useCallback(async (apiCall) => {
    const start = performance.now();
    try {
      const result = await apiCall();
      const end = performance.now();
      
      setMetrics(prev => ({
        ...prev,
        apiCallTime: prev.apiCallTime + (end - start)
      }));
      
      return result;
    } catch (error) {
      setMetrics(prev => ({
        ...prev,
        errorCount: prev.errorCount + 1
      }));
      throw error;
    }
  }, []);

  const trackMemory = useCallback(() => {
    if (performance.memory) {
      setMetrics(prev => ({
        ...prev,
        memoryUsage: performance.memory.usedJSHeapSize
      }));
    }
  }, []);

  useEffect(() => {
    const interval = setInterval(trackMemory, 5000);
    return () => clearInterval(interval);
  }, [trackMemory]);

  return { metrics, measureRender, measureAPICall, trackMemory };
};

// Utility function to optimize API calls with retry logic
export const createOptimizedAPI = (apiFunction, maxRetries = 3, retryDelay = 1000) => {
  return async (...args) => {
    let lastError;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await apiFunction(...args);
      } catch (error) {
        lastError = error;
        
        if (attempt === maxRetries) {
          throw error;
        }
        
        // Exponential backoff
        const delay = retryDelay * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  };
};

// Batch API calls to reduce network requests
export const createBatchAPI = (apiFunction, batchSize = 10) => {
  const queue = [];
  let processing = false;

  const processBatch = async () => {
    if (processing || queue.length === 0) return;
    
    processing = true;
    const batch = queue.splice(0, batchSize);
    
    try {
      // Execute all calls in parallel
      const results = await Promise.allSettled(
        batch.map(({ args, resolve, reject }) => 
          apiFunction(...args)
            .then(resolve)
            .catch(reject)
        )
      );
      
      // Resolve/reject based on results
      results.forEach((result, index) => {
        const { resolve, reject } = batch[index];
        if (result.status === 'fulfilled') {
          resolve(result.value);
        } else {
          reject(result.reason);
        }
      });
    } catch (error) {
      // Reject all in batch if there's a system error
      batch.forEach(({ reject }) => reject(error));
    } finally {
      processing = false;
      
      // Process next batch if queue has items
      if (queue.length > 0) {
        setTimeout(processBatch, 0);
      }
    }
  };

  return (...args) => {
    return new Promise((resolve, reject) => {
      queue.push({ args, resolve, reject });
      processBatch();
    });
  };
};
