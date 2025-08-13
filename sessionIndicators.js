console.log('Loading SessionIndicators...');

class SessionIndicators {
  constructor(container) {
    this.container = container;
    this.indicators = {};
    this.lastCheckTimeElement = document.getElementById('last-check-time');
  }

  render() {
    // Индикаторы уже созданы в HTML, просто получаем ссылки на них
    const indicatorElements = this.container.querySelectorAll('.session-indicator');
    
    indicatorElements.forEach(element => {
      const endpoint = element.dataset.endpoint;
      this.indicators[endpoint] = {
        element: element,
        dot: element.querySelector('.indicator-dot'),
        label: element.querySelector('.indicator-label')
      };
    });
  }

  updateIndicator(endpointName, status, responseTime = null, errorDetails = null) {
    const indicator = this.indicators[endpointName];
    if (!indicator) {
      console.warn(`Indicator not found for endpoint: ${endpointName}`);
      return;
    }

    // Удаляем все классы статуса
    indicator.dot.classList.remove('active', 'expired', 'unavailable', 'loading');
    
    // Добавляем новый класс статуса
    indicator.dot.classList.add(status);

    // Обновляем tooltip с дополнительной информацией
    let title = `${endpointName}: ${this.getStatusText(status)}`;
    if (responseTime !== null) {
      title += ` (${responseTime}ms)`;
    }
    if (errorDetails) {
      title += `\nОшибка: ${errorDetails}`;
    }
    indicator.element.title = title;
  }

  showLoading() {
    Object.keys(this.indicators).forEach(endpointName => {
      this.updateIndicator(endpointName, 'loading');
    });
    
    this.updateLastCheckTime('Проверяю...');
  }

  updateLastCheckTime(timeString = null) {
    if (!this.lastCheckTimeElement) return;

    if (timeString) {
      this.lastCheckTimeElement.textContent = timeString;
      this.lastCheckTimeElement.classList.remove('outdated');
      return;
    }

    const now = new Date();
    const timeStr = now.toLocaleTimeString('ru-RU', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    
    this.lastCheckTimeElement.textContent = `Обновлено: ${timeStr}`;
    
    // Проверяем, не устарело ли время (более 5 минут)
    setTimeout(() => {
      this.checkIfOutdated();
    }, 5 * 60 * 1000); // 5 минут
  }

  checkIfOutdated() {
    if (!this.lastCheckTimeElement) return;
    
    const text = this.lastCheckTimeElement.textContent;
    if (text.includes('Обновлено:')) {
      this.lastCheckTimeElement.classList.add('outdated');
    }
  }

  getStatusText(status) {
    switch (status) {
      case 'active': return 'Активна';
      case 'expired': return 'Протухла';
      case 'unavailable': return 'Недоступен';
      case 'loading': return 'Загрузка...';
      default: return 'Неизвестно';
    }
  }

  setRefreshButtonState(disabled) {
    const refreshButton = document.getElementById('refresh-sessions');
    if (refreshButton) {
      refreshButton.disabled = disabled;
      refreshButton.textContent = disabled ? '⏳ Обновляю...' : '🔄 Обновить';
    }
  }
}