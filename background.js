chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  console.log("Received message:", msg);

  if (msg.action === "copyAndPaste" && msg.domain) {
    console.log("Copying cookies from:", msg.domain);

    // Сначала очищаем все куки с localhost (HTTP и HTTPS)
    const urls = ["http://localhost:3001", "https://localhost:3001"];
    let allExistingCookies = [];
    let pendingUrls = urls.length;

    urls.forEach(url => {
      chrome.cookies.getAll({ url }, (cookies) => {
        if (chrome.runtime.lastError) {
          console.error(`Error getting cookies from ${url}:`, chrome.runtime.lastError);
        } else {
          allExistingCookies = allExistingCookies.concat(cookies);
        }

        if (--pendingUrls === 0) {
          console.log("Found", allExistingCookies.length, "existing cookies on localhost");

          if (allExistingCookies.length === 0) {
            // Если нет кук для удаления, сразу копируем
            copyAllCookies(msg.domain, sendResponse);
          } else {
            // Удаляем существующие куки
            let pendingRemove = allExistingCookies.length;
            allExistingCookies.forEach(cookie => {
              const protocol = cookie.secure ? "https" : "http";
              chrome.cookies.remove({
                url: `${protocol}://localhost:3001${cookie.path}`,
                name: cookie.name
              }, () => {
                if (chrome.runtime.lastError) {
                  console.error("Error removing cookie:", chrome.runtime.lastError);
                }
                if (--pendingRemove === 0) {
                  console.log("All existing cookies removed, now copying new ones");
                  copyAllCookies(msg.domain, sendResponse);
                }
              });
            });
          }
        }
      });
    });

    return true; // async
  }


});

function copyAllCookies(domain, sendResponse) {
  console.log("Getting all cookies from:", domain);

  // Получаем ВСЕ куки для домена mos.ru (включая поддомены)
  console.log("Searching cookies for all mos.ru domains");

  chrome.cookies.getAll({ domain: "mos.ru" }, (cookies) => {
    if (chrome.runtime.lastError) {
      console.error("Error getting source cookies:", chrome.runtime.lastError);
      sendResponse({ message: "Ошибка получения кук с " + domain });
      return;
    }

    console.log("Found", cookies.length, "cookies on mos.ru domain");

    // Логируем детали каждой куки
    cookies.forEach(cookie => {
      console.log(`Cookie: ${cookie.name}`, {
        domain: cookie.domain,
        path: cookie.path,
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        sameSite: cookie.sameSite,
        value: cookie.value.substring(0, 50) + "..."
      });
    });

    // Специально проверяем session-cookie
    const sessionCookie = cookies.find(c => c.name === 'session-cookie');
    if (sessionCookie) {
      console.log("🍪 FOUND session-cookie:", sessionCookie);
    } else {
      console.log("❌ session-cookie NOT FOUND in cookies list");
      console.log("Available cookie names:", cookies.map(c => c.name));
    }

    // Продолжаем копирование
    continueCopying(cookies, sendResponse);
  });
}

function continueCopying(cookies, sendResponse) {
  if (!cookies.length) {
    sendResponse({ message: "Нет куков для копирования" });
    return;
  }

  // Фильтруем куки - оставляем только нужные для приложения
  const importantCookieNames = [
    'JSESSIONID', 'session-cookie', 'profile_id', 'user_id',
    'eom_session_id', 'eom_profile_id', 'aupd_current_role',
    'aupd_token', 'sudir_sculp', 'auth_flag'
  ];

  const filteredCookies = cookies.filter(cookie => {
    // Копируем только важные куки или куки с домена mos.ru
    return importantCookieNames.includes(cookie.name) ||
      (cookie.domain && cookie.domain.includes('mos.ru'));
  });

  console.log(`Filtered ${cookies.length} cookies down to ${filteredCookies.length} important ones`);

  if (!filteredCookies.length) {
    sendResponse({ message: "Нет важных куков для копирования" });
    return;
  }

  let pending = filteredCookies.length;
  let successCount = 0;
  let errors = [];

  filteredCookies.forEach(cookie => {
    console.log(`Attempting to copy cookie: ${cookie.name}`);

    // Пропускаем куки с проблемными доменами или путями
    if (cookie.domain && (cookie.domain.includes('google') || cookie.domain.includes('yandex') || cookie.domain.includes('facebook'))) {
      console.log(`Skipping cookie ${cookie.name} from domain ${cookie.domain}`);
      pending--; // Уменьшаем счетчик для пропущенной куки
      if (pending === 0) {
        finalizeCopying(successCount, cookies.length, errors, sendResponse);
      }
      return;
    }

    // Выбираем протокол - для localhost лучше использовать http для большинства кук
    const protocol = "http"; // Упрощаем - используем только http
    const cookieData = {
      url: `${protocol}://localhost:3001`,
      name: cookie.name,
      value: cookie.value,
      path: cookie.path || "/",
      secure: false // Для http localhost secure должен быть false
    };

    // Копируем httpOnly если есть
    if (cookie.httpOnly) {
      cookieData.httpOnly = true;
    }

    // Для localhost используем более совместимые настройки sameSite
    cookieData.sameSite = "lax";

    // Копируем expiration date если есть
    if (cookie.expirationDate) {
      cookieData.expirationDate = cookie.expirationDate;
    }

    console.log(`Setting cookie with data:`, cookieData);

    chrome.cookies.set(cookieData, (result) => {
      if (chrome.runtime.lastError) {
        const errorMsg = chrome.runtime.lastError.message || "Unknown error";
        console.warn(`⚠️ Could not set cookie ${cookie.name}:`, errorMsg);
        // Не добавляем в errors - это нормально для некоторых кук
      } else if (result) {
        successCount++;
        console.log(`✅ Successfully set cookie: ${cookie.name}`);
      } else {
        console.warn(`⚠️ Cookie ${cookie.name} not set (browser restrictions)`);
        // Не добавляем в errors - это ожидаемо для localhost
      }

      if (--pending === 0) {
        finalizeCopying(successCount, filteredCookies.length, errors, sendResponse);
      }
    });
  });
}

function finalizeCopying(successCount, totalCount, errors, sendResponse) {
  let message = `Скопировано ${successCount} из ${totalCount} важных куков`;
  if (errors.length > 0) {
    console.log(`Errors encountered (${errors.length}):`, errors.slice(0, 5)); // Показываем только первые 5 ошибок
    message += ` (ошибки: ${errors.length})`;
  }
  console.log("✅ Copying completed:", message);
  sendResponse({ message });
}