// Unit tests for SessionStatusService
// Эти тесты можно запустить в браузере или с помощью тестового фреймворка

describe('SessionStatusService', () => {
  let service;
  
  beforeEach(() => {
    service = new SessionStatusService();
    
    // Mock chrome.runtime.sendMessage
    global.chrome = {
      runtime: {
        sendMessage: jest.fn(),
        lastError: null
      },
      storage: {
        local: {
          get: jest.fn(),
          set: jest.fn()
        }
      }
    };
  });

  describe('parseStatusFromResponse', () => {
    test('should return active for successful response', () => {
      const response = { success: true, status: 200 };
      expect(service.parseStatusFromResponse(response)).toBe('active');
    });

    test('should return expired for 401 status', () => {
      const response = { success: false, status: 401 };
      expect(service.parseStatusFromResponse(response)).toBe('expired');
    });

    test('should return expired for 403 status', () => {
      const response = { success: false, status: 403 };
      expect(service.parseStatusFromResponse(response)).toBe('expired');
    });

    test('should return unavailable for timeout', () => {
      const response = { success: false, status: 408, error: 'Timeout' };
      expect(service.parseStatusFromResponse(response)).toBe('unavailable');
    });

    test('should return unavailable for network error', () => {
      const response = { success: false, status: 0 };
      expect(service.parseStatusFromResponse(response)).toBe('unavailable');
    });

    test('should return unavailable for server error', () => {
      const response = { success: false, status: 500 };
      expect(service.parseStatusFromResponse(response)).toBe('unavailable');
    });
  });

  describe('checkSingleStatus', () => {
    test('should return active status for successful response', async () => {
      const mockResponse = { success: true, status: 200 };
      chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
        callback(mockResponse);
      });

      const endpoint = { name: 'Test Endpoint', url: 'https://test.com/api' };
      const result = await service.checkSingleStatus(endpoint);

      expect(result.status).toBe('active');
      expect(result.endpoint).toBe('Test Endpoint');
      expect(result.url).toBe('https://test.com/api');
      expect(typeof result.responseTime).toBe('number');
      expect(typeof result.lastChecked).toBe('number');
    });

    test('should handle chrome.runtime.lastError', async () => {
      chrome.runtime.lastError = { message: 'Extension context invalidated' };
      chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
        callback(null);
      });

      const endpoint = { name: 'Test Endpoint', url: 'https://test.com/api' };
      const result = await service.checkSingleStatus(endpoint);

      expect(result.status).toBe('unavailable');
      expect(result.error).toBe('Extension context invalidated');
    });
  });

  describe('caching', () => {
    test('should save results to cache', async () => {
      const results = [
        { endpoint: 'Test', status: 'active', responseTime: 100 }
      ];

      chrome.storage.local.set.mockResolvedValue();

      await service.saveCachedResults(results);

      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        sessionStatusCache: {
          timestamp: expect.any(Number),
          data: results
        }
      });
    });

    test('should load fresh cached results', async () => {
      const cachedData = {
        sessionStatusCache: {
          timestamp: Date.now() - 60000, // 1 minute ago
          data: [{ endpoint: 'Test', status: 'active' }]
        }
      };

      chrome.storage.local.get.mockResolvedValue(cachedData);

      const result = await service.loadCachedResults();

      expect(result).toEqual([{ endpoint: 'Test', status: 'active' }]);
    });

    test('should return null for expired cache', async () => {
      const cachedData = {
        sessionStatusCache: {
          timestamp: Date.now() - (6 * 60 * 1000), // 6 minutes ago (expired)
          data: [{ endpoint: 'Test', status: 'active' }]
        }
      };

      chrome.storage.local.get.mockResolvedValue(cachedData);

      const result = await service.loadCachedResults();

      expect(result).toBeNull();
    });

    test('should return null for missing cache', async () => {
      chrome.storage.local.get.mockResolvedValue({});

      const result = await service.loadCachedResults();

      expect(result).toBeNull();
    });
  });

  describe('checkAllStatuses', () => {
    test('should check all endpoints in parallel', async () => {
      const mockResponse = { success: true, status: 200 };
      chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
        callback(mockResponse);
      });

      const results = await service.checkAllStatuses();

      expect(results).toHaveLength(4); // 4 endpoints
      expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(4);
      
      results.forEach(result => {
        expect(result.status).toBe('active');
        expect(typeof result.endpoint).toBe('string');
        expect(typeof result.url).toBe('string');
      });
    });

    test('should handle mixed success and failure responses', async () => {
      chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
        if (msg.url.includes('uchebnik-dev')) {
          callback({ success: true, status: 200 });
        } else if (msg.url.includes('uchebnik-test')) {
          callback({ success: false, status: 401 });
        } else {
          callback({ success: false, status: 500 });
        }
      });

      const results = await service.checkAllStatuses();

      expect(results).toHaveLength(4);
      
      const devResult = results.find(r => r.endpoint === 'Учебник DEV');
      const testResult = results.find(r => r.endpoint === 'Учебник TEST');
      
      expect(devResult.status).toBe('active');
      expect(testResult.status).toBe('expired');
    });
  });
});

// Простой test runner для браузера (если не используется Jest)
if (typeof window !== 'undefined' && !window.jest) {
  window.runSessionStatusServiceTests = () => {
    console.log('Running SessionStatusService tests...');
    
    // Здесь можно добавить простые тесты для запуска в браузере
    const service = new SessionStatusService();
    
    // Test parseStatusFromResponse
    console.assert(service.parseStatusFromResponse({ success: true, status: 200 }) === 'active', 'Active status test failed');
    console.assert(service.parseStatusFromResponse({ success: false, status: 401 }) === 'expired', 'Expired status test failed');
    console.assert(service.parseStatusFromResponse({ success: false, status: 500 }) === 'unavailable', 'Unavailable status test failed');
    
    console.log('All basic tests passed!');
  };
}