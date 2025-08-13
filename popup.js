// Глобальные переменные для сервисов
let sessionStatusService;
let sessionIndicators;

// Проверяем статус сервера при загрузке popup
document.addEventListener('DOMContentLoaded', () => {
  checkServerStatus();
  initializeSessionStatus();
  updateLocalhostButton();
});

document.getElementById("copy-test").addEventListener("click", () => {
  copyAndPaste("https://uchebnik-test.mos.ru");
});

document.getElementById("copy-dev").addEventListener("click", () => {
  copyAndPaste("https://uchebnik-dev.mos.ru");
});

document.getElementById("open-localhost").addEventListener("click", () => {
  openInLocalhost();
});

document.getElementById("refresh-sessions").addEventListener("click", () => {
  refreshSessionStatuses();
});

// Добавляем обработчики для кликабельных точек (только для School DEV/TEST)
document.addEventListener('click', (event) => {
  if (event.target.classList.contains('indicator-dot') && event.target.classList.contains('clickable')) {
    const authUrl = event.target.dataset.authUrl;
    // Кликабельными делаем только красные точки (expired/unavailable)
    if (authUrl && (event.target.classList.contains('expired') || event.target.classList.contains('unavailable'))) {
      openAuthPage(authUrl);
    }
  }
});

document.getElementById("vvm-dev").addEventListener("click", () => {
  openVVMEnvironment('dev');
});

document.getElementById("vvm-test").addEventListener("click", () => {
  openVVMEnvironment('test');
});

function copyAndPaste(domain) {
  document.getElementById("status").textContent = "Копирую...";

  chrome.runtime.sendMessage({ action: "copyAndPaste", domain }, res => {
    document.getElementById("status").textContent = res?.message || "Ошибка";
  });
}

function openInLocalhost() {
  // Получаем информацию о текущей активной вкладке
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const currentTab = tabs[0];
    const currentUrl = currentTab.url;

    console.log("Current URL:", currentUrl);

    // Проверяем, что мы на одном из нужных доменов
    if (currentUrl.includes('uchebnik-test.mos.ru') || currentUrl.includes('uchebnik-dev.mos.ru')) {
      // Определяем с какого сервера переходим
      let sourceDomain;
      if (currentUrl.includes('uchebnik-test.mos.ru')) {
        sourceDomain = "https://uchebnik-test.mos.ru";
      } else {
        sourceDomain = "https://uchebnik-dev.mos.ru";
      }

      // Извлекаем путь после домена
      const url = new URL(currentUrl);
      const path = url.pathname + url.search + url.hash;

      console.log("Source domain:", sourceDomain);
      console.log("Extracted path:", path);

      document.getElementById("status").textContent = "Копирую куки и открываю...";

      // Сначала копируем куки с исходного сервера
      chrome.runtime.sendMessage({ action: "copyAndPaste", domain: sourceDomain }, res => {
        console.log("Cookies copied:", res);

        // После копирования кук открываем localhost
        const localhostUrl = `http://localhost:3000${path}`;
        console.log("Opening:", localhostUrl);

        chrome.tabs.create({ url: localhostUrl });

        const serverName = sourceDomain.includes('test') ? 'теста' : 'дева';
        document.getElementById("status").textContent = `Куки скопированы с ${serverName}, открыто: ${path}`;
      });

    } else {
      document.getElementById("status").textContent = "Откройте страницу uchebnik-test или uchebnik-dev";
    }
  });
}

function checkServerStatus() {
  const indicator = document.getElementById("status-indicator");
  const statusText = document.getElementById("status-text");

  // Проверяем localhost:3000
  fetch('http://localhost:3000')
    .then(() => {
      // Сервер отвечает
      indicator.style.backgroundColor = '#4CAF50'; // Зеленый
      statusText.textContent = 'Localhost:3000 запущен';
    })
    .catch(() => {
      // Сервер не отвечает
      indicator.style.backgroundColor = '#f44336'; // Красный
      statusText.textContent = 'Localhost:3000 не доступен';
    });
}

function initializeSessionStatus() {
  console.log('Initializing session status...');
  
  try {
    // Проверяем, что классы доступны
    if (typeof SessionStatusService === 'undefined') {
      console.error('SessionStatusService class not found!');
      return;
    }
    
    if (typeof SessionIndicators === 'undefined') {
      console.error('SessionIndicators class not found!');
      return;
    }
    
    // Инициализируем сервисы
    console.log('Creating SessionStatusService...');
    sessionStatusService = new SessionStatusService();
    
    console.log('Creating SessionIndicators...');
    const container = document.getElementById('session-indicators');
    if (!container) {
      console.error('Session indicators container not found!');
      return;
    }
    
    sessionIndicators = new SessionIndicators(container);
    
    // Рендерим UI
    console.log('Rendering indicators...');
    sessionIndicators.render();
    
    // Запускаем автоматическую проверку статусов
    console.log('Starting status check...');
    checkSessionStatuses();
    
  } catch (error) {
    console.error('Error initializing session status:', error);
  }
}

async function checkSessionStatuses(forceRefresh = false) {
  try {
    // Показываем состояние загрузки
    sessionIndicators.showLoading();
    sessionIndicators.setRefreshButtonState(true);
    
    // Проверяем все статусы (с кэшированием или принудительно)
    const results = forceRefresh 
      ? await sessionStatusService.checkAllStatuses()
      : await sessionStatusService.checkAllStatusesWithCache();
    
    // Обновляем индикаторы
    results.forEach(result => {
      sessionIndicators.updateIndicator(
        result.endpoint, 
        result.status, 
        result.responseTime,
        result.error || result.errorDetails
      );
    });
    
    // Обновляем время последней проверки
    sessionIndicators.updateLastCheckTime();
    
    console.log('Session statuses checked:', results);
    
  } catch (error) {
    console.error('Error checking session statuses:', error);
    sessionIndicators.updateLastCheckTime('Ошибка проверки');
  } finally {
    sessionIndicators.setRefreshButtonState(false);
  }
}

function refreshSessionStatuses() {
  checkSessionStatuses(true); // Принудительное обновление без кэша
}

function openVVMEnvironment(environment) {
  // Получаем информацию о текущей активной вкладке
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const currentTab = tabs[0];
    const currentUrl = currentTab.url;

    console.log("Current URL for VVM:", currentUrl);

    // Определяем целевой домен
    let targetDomain;
    if (environment === 'dev') {
      targetDomain = 'https://uchebnik-dev.mos.ru';
    } else {
      targetDomain = 'https://uchebnik-test.mos.ru';
    }

    // Извлекаем путь из текущего URL
    let path = '/materials/choice/test'; // путь по умолчанию
    
    if (currentUrl) {
      try {
        const url = new URL(currentUrl);
        if (url.pathname && url.pathname !== '/') {
          let extractedPath = url.pathname + url.search + url.hash;
          
          // Если путь начинается с /choice (с слэшем или без), добавляем /materials в начало
          if (extractedPath.startsWith('/choice/') || extractedPath === '/choice') {
            path = '/materials' + extractedPath;
            // Если путь просто /choice, добавляем /test в конец
            if (extractedPath === '/choice') {
              path = '/materials/choice/test';
            }
          } else {
            path = extractedPath;
          }
        }
      } catch (error) {
        console.error('Error parsing URL for VVM:', error);
      }
    }

    // Определяем целевой домен ВВМ
    let vvmDomain;
    if (environment === 'dev') {
      vvmDomain = 'https://school-dev.mos.ru';
    } else {
      vvmDomain = 'https://school-test.mos.ru';
    }
    
    const vvmUrl = `${vvmDomain}${path}`;
    
    console.log("VVM URL:", vvmUrl);
    console.log("Target domain for cookies:", targetDomain);

    document.getElementById("status").textContent = `Настраиваю ВВМ ${environment.toUpperCase()}...`;

    // Сначала устанавливаем куку test=123 для целевого ВВМ домена
    chrome.cookies.set({
      url: vvmDomain,
      name: 'test',
      value: '123'
    }, () => {
      console.log(`Test cookie set for ${vvmDomain}`);
      
      // Затем копируем куки с целевого домена
      chrome.runtime.sendMessage({ action: "copyAndPaste", domain: targetDomain }, res => {
        console.log("Cookies copied from", targetDomain, ":", res);

        // Открываем ВВМ окружение
        chrome.tabs.create({ url: vvmUrl });

        const envName = environment === 'dev' ? 'DEV' : 'TEST';
        document.getElementById("status").textContent = `ВВМ ${envName} открыто: ${path}`;
      });
    });
  });
}

function updateLocalhostButton() {
  // Получаем информацию о текущей активной вкладке
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const currentTab = tabs[0];
    const currentUrl = currentTab.url;
    const buttonText = document.getElementById('localhost-button-text');

    if (!buttonText) return;

    // Проверяем, что мы на одном из нужных доменов
    if (currentUrl && (currentUrl.includes('uchebnik-test.mos.ru') || currentUrl.includes('uchebnik-dev.mos.ru'))) {
      try {
        const url = new URL(currentUrl);
        const path = url.pathname + url.search + url.hash;
        
        // Определяем тип приложения по пути
        let appName = 'localhost';
        if (path.includes('/composer3/')) {
          appName = 'Composer3';
        } else if (path.includes('/lesson/')) {
          appName = 'Lesson';
        } else if (path.includes('/material/')) {
          appName = 'Material';
        }

        // Обновляем текст кнопки
        if (path && path !== '/') {
          buttonText.textContent = `Открыть ${appName}: ${path}`;
        } else {
          buttonText.textContent = `Открыть в localhost`;
        }
      } catch (error) {
        console.error('Error parsing URL:', error);
        buttonText.textContent = 'Открыть в localhost';
      }
    } else {
      buttonText.textContent = 'Открыть в localhost';
    }
  });
}

function openAuthPage(logoutUrl) {
  console.log(`Opening auth page via logout: ${logoutUrl}`);
  
  // Открываем страницу logout, которая перебросит на авторизацию
  chrome.tabs.create({ 
    url: logoutUrl,
    active: true 
  });
}