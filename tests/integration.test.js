// Integration tests for Session Status Indicators
// Эти тесты проверяют взаимодействие между компонентами

describe('Session Status Integration Tests', () => {
  let mockChrome;
  
  beforeEach(() => {
    // Setup DOM
    document.body.innerHTML = `
      <div id="session-indicators">
        <div class="session-indicator" data-endpoint="Учебник DEV">
          <span class="indicator-dot loading"></span>
          <span class="indicator-label">Учебник DEV</span>
        </div>
        <div class="session-indicator" data-endpoint="Учебник TEST">
          <span class="indicator-dot loading"></span>
          <span class="indicator-label">Учебник TEST</span>
        </div>
        <div class="session-indicator" data-endpoint="School DEV">
          <span class="indicator-dot loading"></span>
          <span class="indicator-label">School DEV</span>
        </div>
        <div class="session-indicator" data-endpoint="School TEST">
          <span class="indicator-dot loading"></span>
          <span class="indicator-label">School TEST</span>
        </div>
      </div>
      <div id="last-check-time">Обновлено: --:--:--</div>
      <button id="refresh-sessions">🔄 Обновить</button>
    `;

    // Mock Chrome APIs
    mockChrome = {
      runtime: {
        sendMessage: jest.fn(),
        lastError: null
      },
      storage: {
        local: {
          get: jest.fn().mockResolvedValue({}),
          set: jest.fn().mockResolvedValue()
        }
      }
    };
    
    global.chrome = mockChrome;
  });

  test('should initialize and render all indicators', () => {
    const sessionIndicators = new SessionIndicators(document.getElementById('session-indicators'));
    sessionIndicators.render();

    expect(Object.keys(sessionIndicators.indicators)).toHaveLength(4);
    expect(sessionIndicators.indicators['Учебник DEV']).toBeDefined();
    expect(sessionIndicators.indicators['Учебник TEST']).toBeDefined();
    expect(sessionIndicators.indicators['School DEV']).toBeDefined();
    expect(sessionIndicators.indicators['School TEST']).toBeDefined();
  });

  test('should update indicator status correctly', () => {
    const sessionIndicators = new SessionIndicators(document.getElementById('session-indicators'));
    sessionIndicators.render();

    sessionIndicators.updateIndicator('Учебник DEV', 'active', 150);

    const indicator = sessionIndicators.indicators['Учебник DEV'];
    expect(indicator.dot.classList.contains('active')).toBe(true);
    expect(indicator.dot.classList.contains('loading')).toBe(false);
    expect(indicator.element.title).toContain('Активна');
    expect(indicator.element.title).toContain('150ms');
  });

  test('should show loading state for all indicators', () => {
    const sessionIndicators = new SessionIndicators(document.getElementById('session-indicators'));
    sessionIndicators.render();

    sessionIndicators.showLoading();

    Object.values(sessionIndicators.indicators).forEach(indicator => {
      expect(indicator.dot.classList.contains('loading')).toBe(true);
    });

    const lastCheckTime = document.getElementById('last-check-time');
    expect(lastCheckTime.textContent).toBe('Проверяю...');
  });

  test('should update last check time correctly', () => {
    const sessionIndicators = new SessionIndicators(document.getElementById('session-indicators'));
    sessionIndicators.render();

    sessionIndicators.updateLastCheckTime();

    const lastCheckTime = document.getElementById('last-check-time');
    expect(lastCheckTime.textContent).toMatch(/Обновлено: \d{2}:\d{2}:\d{2}/);
    expect(lastCheckTime.classList.contains('outdated')).toBe(false);
  });

  test('should handle refresh button state changes', () => {
    const sessionIndicators = new SessionIndicators(document.getElementById('session-indicators'));
    const refreshButton = document.getElementById('refresh-sessions');

    sessionIndicators.setRefreshButtonState(true);
    expect(refreshButton.disabled).toBe(true);
    expect(refreshButton.textContent).toBe('⏳ Обновляю...');

    sessionIndicators.setRefreshButtonState(false);
    expect(refreshButton.disabled).toBe(false);
    expect(refreshButton.textContent).toBe('🔄 Обновить');
  });

  test('should integrate SessionStatusService with SessionIndicators', async () => {
    // Mock successful responses
    mockChrome.runtime.sendMessage.mockImplementation((msg, callback) => {
      setTimeout(() => {
        if (msg.url.includes('uchebnik-dev')) {
          callback({ success: true, status: 200 });
        } else if (msg.url.includes('uchebnik-test')) {
          callback({ success: false, status: 401 });
        } else {
          callback({ success: false, status: 500 });
        }
      }, 10);
    });

    const sessionStatusService = new SessionStatusService();
    const sessionIndicators = new SessionIndicators(document.getElementById('session-indicators'));
    sessionIndicators.render();

    // Simulate the full flow
    sessionIndicators.showLoading();
    const results = await sessionStatusService.checkAllStatuses();
    
    results.forEach(result => {
      sessionIndicators.updateIndicator(
        result.endpoint, 
        result.status, 
        result.responseTime
      );
    });

    sessionIndicators.updateLastCheckTime();

    // Verify results
    expect(results).toHaveLength(4);
    
    const devIndicator = sessionIndicators.indicators['Учебник DEV'];
    const testIndicator = sessionIndicators.indicators['Учебник TEST'];
    
    expect(devIndicator.dot.classList.contains('active')).toBe(true);
    expect(testIndicator.dot.classList.contains('expired')).toBe(true);
    
    const lastCheckTime = document.getElementById('last-check-time');
    expect(lastCheckTime.textContent).toMatch(/Обновлено: \d{2}:\d{2}:\d{2}/);
  });

  test('should handle caching integration', async () => {
    const cachedData = {
      sessionStatusCache: {
        timestamp: Date.now() - 60000, // 1 minute ago
        data: [
          { endpoint: 'Учебник DEV', status: 'active', responseTime: 100 },
          { endpoint: 'Учебник TEST', status: 'expired', responseTime: 200 }
        ]
      }
    };

    mockChrome.storage.local.get.mockResolvedValue(cachedData);

    const sessionStatusService = new SessionStatusService();
    const results = await sessionStatusService.checkAllStatusesWithCache();

    expect(results).toHaveLength(2);
    expect(mockChrome.runtime.sendMessage).not.toHaveBeenCalled(); // Should use cache
    expect(results[0].status).toBe('active');
    expect(results[1].status).toBe('expired');
  });

  test('should handle storage errors gracefully', async () => {
    mockChrome.storage.local.get.mockRejectedValue(new Error('Storage error'));
    mockChrome.storage.local.set.mockRejectedValue(new Error('Storage error'));

    mockChrome.runtime.sendMessage.mockImplementation((msg, callback) => {
      callback({ success: true, status: 200 });
    });

    const sessionStatusService = new SessionStatusService();
    
    // Should not throw error even if storage fails
    const results = await sessionStatusService.checkAllStatusesWithCache();
    expect(results).toHaveLength(4);
    expect(results[0].status).toBe('active');
  });
});

// Browser test runner
if (typeof window !== 'undefined' && !window.jest) {
  window.runIntegrationTests = async () => {
    console.log('Running integration tests...');
    
    try {
      // Test basic initialization
      const container = document.getElementById('session-indicators');
      if (!container) {
        console.error('Session indicators container not found');
        return;
      }

      const sessionIndicators = new SessionIndicators(container);
      sessionIndicators.render();
      
      console.log('✓ SessionIndicators initialized successfully');
      
      // Test status updates
      sessionIndicators.updateIndicator('Учебник DEV', 'active', 150);
      sessionIndicators.updateIndicator('Учебник TEST', 'expired', 200);
      sessionIndicators.updateIndicator('School DEV', 'unavailable', 5000);
      
      console.log('✓ Status indicators updated successfully');
      
      // Test time update
      sessionIndicators.updateLastCheckTime();
      
      console.log('✓ Last check time updated successfully');
      
      console.log('All integration tests passed!');
      
    } catch (error) {
      console.error('Integration test failed:', error);
    }
  };
}