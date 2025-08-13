// Проверяем статус сервера при загрузке popup
document.addEventListener('DOMContentLoaded', () => {
  checkServerStatus();
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