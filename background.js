// background.js - Service Worker for AIco Buddy

// Initialize default storage values upon installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get([
    'saved_tokens',
    'saved_energy_wh',
    'saved_co2_g',
    'saved_water_ml',
    'consumed_tokens',
    'consumed_energy_wh',
    'consumed_co2_g',
    'consumed_water_ml',
    'total_queries',
    'recent_logs',
    'query_cache'
  ], (result) => {
    const defaults = {};
    if (result.saved_tokens === undefined) defaults.saved_tokens = 0;
    if (result.saved_energy_wh === undefined) defaults.saved_energy_wh = 0;
    if (result.saved_co2_g === undefined) defaults.saved_co2_g = 0;
    if (result.saved_water_ml === undefined) defaults.saved_water_ml = 0;
    if (result.consumed_tokens === undefined) defaults.consumed_tokens = 0;
    if (result.consumed_energy_wh === undefined) defaults.consumed_energy_wh = 0;
    if (result.consumed_co2_g === undefined) defaults.consumed_co2_g = 0;
    if (result.consumed_water_ml === undefined) defaults.consumed_water_ml = 0;
    if (result.total_queries === undefined) defaults.total_queries = 0;
    if (result.recent_logs === undefined) defaults.recent_logs = [];
    if (result.query_cache === undefined) defaults.query_cache = []; // stores recent query hashes for duplicate prevention

    if (Object.keys(defaults).length > 0) {
      chrome.storage.local.set(defaults, () => {
        console.log('AIco Buddy default storage initialized:', defaults);
      });
    }
  });
});

// Communication Hub
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'log_query') {
    // Log a query optimization or consumption
    logQueryStats(request.data, sendResponse);
    return true; // Keep message channel open for async response
  } else if (request.action === 'check_duplicate') {
    // Check if query is duplicate (by checking hash cache)
    checkQueryDuplicate(request.query, sendResponse);
    return true; // Keep message channel open
  } else if (request.action === 'reset_stats') {
    // Reset stats
    resetStats(sendResponse);
    return true;
  }
});

// Helper to hash query string (djb2 implementation)
function getQueryHash(str) {
  let hash = 5381;
  const cleaned = str.trim().toLowerCase().replace(/\s+/g, ' ');
  for (let i = 0; i < cleaned.length; i++) {
    hash = ((hash << 5) + hash) + cleaned.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(16);
}

// Check if query was recently submitted (prevent duplicate AI queries)
function checkQueryDuplicate(queryText, sendResponse) {
  const hash = getQueryHash(queryText);
  chrome.storage.local.get(['query_cache'], (result) => {
    const cache = result.query_cache || [];
    const isDuplicate = cache.includes(hash);
    
    // If not duplicate, we can push to cache, keeping cache size to max 30 entries
    if (!isDuplicate && queryText.trim().length > 5) {
      const updatedCache = [hash, ...cache].slice(0, 30);
      chrome.storage.local.set({ query_cache: updatedCache });
    }
    
    sendResponse({ isDuplicate });
  });
}

// Log metrics in local storage
function logQueryStats(data, sendResponse) {
  chrome.storage.local.get([
    'saved_tokens',
    'saved_energy_wh',
    'saved_co2_g',
    'saved_water_ml',
    'consumed_tokens',
    'consumed_energy_wh',
    'consumed_co2_g',
    'consumed_water_ml',
    'total_queries',
    'recent_logs'
  ], (result) => {
    // Prepare updated stats
    const updated = {
      saved_tokens: (result.saved_tokens || 0) + (data.savedTokens || 0),
      saved_energy_wh: (result.saved_energy_wh || 0) + (data.savedEnergyWh || 0),
      saved_co2_g: (result.saved_co2_g || 0) + (data.savedCo2G || 0),
      saved_water_ml: (result.saved_water_ml || 0) + (data.savedWaterMl || 0),
      
      consumed_tokens: (result.consumed_tokens || 0) + (data.consumedTokens || 0),
      consumed_energy_wh: (result.consumed_energy_wh || 0) + (data.consumedEnergyWh || 0),
      consumed_co2_g: (result.consumed_co2_g || 0) + (data.consumedCo2G || 0),
      consumed_water_ml: (result.consumed_water_ml || 0) + (data.consumedWaterMl || 0),
      
      total_queries: (result.total_queries || 0) + 1
    };

    // Add log entry
    const newLog = {
      timestamp: Date.now(),
      type: data.type || 'compress', // 'compress' | 'route' | 'duplicate' | 'greeting'
      querySnippet: data.querySnippet || '',
      savedCo2G: data.savedCo2G || 0,
      consumedCo2G: data.consumedCo2G || 0,
      savedWaterMl: data.savedWaterMl || 0,
      consumedWaterMl: data.consumedWaterMl || 0,
      savedTokens: data.savedTokens || 0,
      consumedTokens: data.consumedTokens || 0
    };

    const logs = [newLog, ...(result.recent_logs || [])].slice(0, 50); // limit to 50 logs
    updated.recent_logs = logs;

    chrome.storage.local.set(updated, () => {
      sendResponse({ success: true, updated });
    });
  });
}

// Reset all stats
function resetStats(sendResponse) {
  const resetValues = {
    saved_tokens: 0,
    saved_energy_wh: 0,
    saved_co2_g: 0,
    saved_water_ml: 0,
    consumed_tokens: 0,
    consumed_energy_wh: 0,
    consumed_co2_g: 0,
    consumed_water_ml: 0,
    total_queries: 0,
    recent_logs: [],
    query_cache: []
  };

  chrome.storage.local.set(resetValues, () => {
    sendResponse({ success: true });
  });
}
