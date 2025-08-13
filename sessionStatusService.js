console.log('Loading SessionStatusService...');

class SessionStatusService {
  constructor() {
    this.endpoints = [
      { name: 'Uchebnik DEV', url: 'https://uchebnik-dev.mos.ru/user-details/api/user' },
      { name: 'Uchebnik TEST', url: 'https://uchebnik-test.mos.ru/user-details/api/user' },
      { name: 'School DEV', url: 'https://school-dev.mos.ru/v3/userinfo' },
      { name: 'School TEST', url: 'https://school-test.mos.ru/v3/userinfo' }
    ];
    this.cacheKey = 'sessionStatusCache';
    this.cacheTimeout = 5 * 60 * 1000; // 5 минут в миллисекундах
  }

  async checkAllStatuses() {
    const promises = this.endpoints.map(endpoint =>
      this.checkSingleStatus(endpoint).catch(error => ({
        endpoint: endpoint.name,
        url: endpoint.url,
        status: 'unavailable',
        error: error.message,
        responseTime: 0
      }))
    );

    return Promise.all(promises);
  }

  async checkSingleStatus(endpoint, retryCount = 0) {
    const startTime = Date.now();
    const maxRetries = 2;

    try {
      const response = await this.sendMessageToBackground({
        action: 'checkSessionStatus',
        url: endpoint.url
      });

      const responseTime = Date.now() - startTime;
      const status = this.parseStatusFromResponse(response);

      const result = {
        endpoint: endpoint.name,
        url: endpoint.url,
        status,
        responseTime,
        lastChecked: Date.now()
      };

      // Добавляем детали ошибки если есть
      if (response.error) {
        result.errorDetails = response.error;
      }

      return result;

    } catch (error) {
      console.error(`Error checking ${endpoint.name}:`, error.message);

      // Retry логика с экспоненциальной задержкой
      if (retryCount < maxRetries) {
        const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
        console.log(`Retrying ${endpoint.name} in ${delay}ms (attempt ${retryCount + 1}/${maxRetries})`);

        await this.delay(delay);
        return this.checkSingleStatus(endpoint, retryCount + 1);
      }

      return {
        endpoint: endpoint.name,
        url: endpoint.url,
        status: 'unavailable',
        error: error.message,
        responseTime: Date.now() - startTime,
        lastChecked: Date.now(),
        retryCount
      };
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  parseStatusFromResponse(response) {
    if (!response.success) {
      // Специфичная обработка различных типов ошибок
      if (response.status === 401 || response.status === 403) {
        return 'expired';
      }
      if (response.status === 408 || response.error === 'Timeout') {
        return 'unavailable'; // Таймаут
      }
      if (response.status === 0) {
        return 'unavailable'; // Сетевая ошибка
      }
      if (response.status >= 500) {
        return 'unavailable'; // Ошибка сервера
      }
      return 'unavailable';
    }
    return 'active';
  }

  sendMessageToBackground(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, response => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  async loadCachedResults() {
    try {
      const result = await chrome.storage.local.get(this.cacheKey);
      const cached = result[this.cacheKey];

      if (!cached || !cached.timestamp) {
        return null;
      }

      const now = Date.now();
      const age = now - cached.timestamp;

      // Проверяем, не устарел ли кэш (более 5 минут)
      if (age > this.cacheTimeout) {
        console.log('Cache expired, age:', age);
        return null;
      }

      console.log('Using cached session statuses, age:', age);
      return cached.data;

    } catch (error) {
      console.error('Error loading cached results:', error);
      return null;
    }
  }

  async saveCachedResults(results) {
    try {
      const cacheData = {
        timestamp: Date.now(),
        data: results
      };

      await chrome.storage.local.set({
        [this.cacheKey]: cacheData
      });

      console.log('Session statuses cached');

    } catch (error) {
      console.error('Error saving cached results:', error);
    }
  }

  async checkAllStatusesWithCache() {
    // Сначала пытаемся загрузить из кэша
    const cachedResults = await this.loadCachedResults();
    if (cachedResults) {
      return cachedResults;
    }

    // Если кэш пустой или устарел, делаем новые запросы
    const results = await this.checkAllStatuses();

    // Сохраняем результаты в кэш
    await this.saveCachedResults(results);

    return results;
  }
}
