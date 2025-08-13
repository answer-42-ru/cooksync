const COOKIE_NAMES = [
  "eom_profile_id",
  "eom_session_id"
];

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === "checkSessionStatus" && msg.url) {
    checkEndpointStatus(msg.url).then(sendResponse);
    return true; // async
  }
  
  if (msg.action === "copyAndPaste" && msg.domain) {
    console.log("Copying cookies from:", msg.domain);

    let savedCookies = [];
    let pending = COOKIE_NAMES.length;

    COOKIE_NAMES.forEach(name => {
      // Ищем куку сначала по URL, потом по домену mos.ru
      chrome.cookies.get({ url: msg.domain, name }, cookie => {
        if (cookie) {
          savedCookies.push(cookie);
          console.log(`Found ${name} on ${msg.domain}`);

          if (--pending === 0) {
            copyCookies(savedCookies, sendResponse);
          }
        } else {
          // Если не нашли, ищем в домене mos.ru
          console.log(`Cookie ${name} not found on ${msg.domain}, searching in mos.ru domain`);
          chrome.cookies.getAll({ domain: "mos.ru", name }, cookies => {
            if (cookies.length > 0) {
              savedCookies.push(cookies[0]);
              console.log(`Found ${name} in mos.ru domain`);
            } else {
              console.log(`Cookie ${name} not found anywhere`);
            }

            if (--pending === 0) {
              copyCookies(savedCookies, sendResponse);
            }
          });
        }
      });
    });

    return true; // async
  }
});

function copyCookies(savedCookies, sendResponse) {
  if (!savedCookies.length) {
    sendResponse({ message: "Нет нужных куков для копирования" });
    return;
  }

  console.log(`Copying ${savedCookies.length} cookies to localhost`);

  let pendingSet = savedCookies.length;
  savedCookies.forEach(cookie => {
    chrome.cookies.set({
      url: "http://localhost:3001",
      name: cookie.name,
      value: cookie.value,
      path: cookie.path || "/",
      secure: false,
      httpOnly: cookie.httpOnly || false,
      sameSite: "lax"
    }, (result) => {
      if (chrome.runtime.lastError) {
        console.error(`Error setting ${cookie.name}:`, chrome.runtime.lastError.message);
      } else if (result) {
        console.log(`✅ Successfully set cookie: ${cookie.name}`);
      }

      if (--pendingSet === 0) {
        sendResponse({ message: `Скопировано ${savedCookies.length} куков` });
      }
    });
  });
}

async function checkEndpointStatus(url) {
  console.log(`🔍 Starting session check for: ${url}`);
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const startTime = Date.now();
    
    // Получаем Bearer токен из куков
    const bearerToken = await getBearerToken(url);
    console.log(`🔑 Bearer token for ${url}:`, bearerToken ? 'Found' : 'Not found');
    
    if (!bearerToken) {
      console.warn(`⚠️ No Bearer token found for ${url}`);
      return {
        success: false,
        status: 401,
        responseTime: Date.now() - startTime,
        url,
        error: 'No token'
      };
    }

    // Готовим заголовки
    const headers = {
      'Accept': 'application/json, text/plain, */*',
      'Authorization': `Bearer ${bearerToken}`,
      'Cache-Control': 'no-cache'
    };

    // Для uchebnik-test добавляем дополнительные заголовки
    if (url.includes('uchebnik-test.mos.ru')) {
      const additionalHeaders = await getUchebnikHeaders(url);
      Object.assign(headers, additionalHeaders);
      console.log(`📋 Additional headers for uchebnik-test:`, additionalHeaders);
    }

    console.log(`📤 Making API request to ${url}`);

    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      signal: controller.signal,
      headers
    });

    clearTimeout(timeoutId);
    const responseTime = Date.now() - startTime;

    console.log(`📥 API Response from ${url}: ${response.status} ${response.statusText} (${responseTime}ms)`);

    return {
      success: response.ok,
      status: response.status,
      responseTime,
      url
    };

  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      console.log(`⏰ API request timeout for ${url}`);
      return {
        success: false,
        status: 408,
        responseTime: 5000,
        error: 'Timeout',
        url
      };
    }

    console.error(`💥 API request error for ${url}:`, error);
    return {
      success: false,
      status: 0,
      responseTime: 0,
      error: error.message,
      url
    };
  }
}

async function checkSessionCookies(url) {
  try {
    // Определяем домен
    let domain;
    if (url.includes('school-dev.mos.ru')) {
      domain = 'school-dev.mos.ru';
    } else if (url.includes('school-test.mos.ru')) {
      domain = 'school-test.mos.ru';
    } else if (url.includes('uchebnik-dev.mos.ru')) {
      domain = 'uchebnik-dev.mos.ru';
    } else if (url.includes('uchebnik-test.mos.ru')) {
      domain = 'uchebnik-test.mos.ru';
    }

    console.log(`🔍 Checking cookies for domain: ${domain}`);

    let requiredCookies = [];
    let info = [];

    if (domain.includes('school-')) {
      // Для school доменов проверяем aupd_token
      requiredCookies = ['aupd_token'];
    } else if (domain.includes('uchebnik-')) {
      // Для uchebnik доменов проверяем eom_session_id и eom_profile_id
      requiredCookies = ['eom_session_id', 'eom_profile_id'];
    }

    let validCookies = 0;
    
    for (const cookieName of requiredCookies) {
      // Ищем куку на точном домене
      let cookies = await chrome.cookies.getAll({ 
        domain: domain,
        name: cookieName 
      });

      // Если не найдено, ищем в родительском домене
      if (cookies.length === 0) {
        cookies = await chrome.cookies.getAll({ 
          domain: '.mos.ru',
          name: cookieName 
        });
      }
      
      if (cookies.length > 0 && cookies[0].value) {
        // Дополнительная проверка для JWT токенов
        if (cookieName.includes('token') || cookieName.includes('session')) {
          const isExpired = isJWTExpired(cookies[0].value);
          if (isExpired) {
            info.push(`${cookieName}: expired`);
            console.log(`⏰ ${cookieName} is expired for ${domain}`);
          } else {
            validCookies++;
            info.push(`${cookieName}: valid`);
            console.log(`✅ ${cookieName} is valid for ${domain}`);
          }
        } else {
          validCookies++;
          info.push(`${cookieName}: present`);
          console.log(`✅ ${cookieName} found for ${domain}`);
        }
      } else {
        info.push(`${cookieName}: missing`);
        console.log(`❌ ${cookieName} not found for ${domain}`);
      }
    }

    const hasValidSession = validCookies === requiredCookies.length;
    console.log(`🎯 Session check result for ${domain}: ${hasValidSession ? 'VALID' : 'INVALID'} (${validCookies}/${requiredCookies.length})`);

    return {
      hasValidSession,
      info: info.join(', ')
    };

  } catch (error) {
    console.error('💥 Error checking cookies:', error);
    return {
      hasValidSession: false,
      info: `Error: ${error.message}`
    };
  }
}

async function getBearerToken(url) {
  try {
    // Определяем домен
    let domain;
    if (url.includes('school-dev.mos.ru')) {
      domain = 'school-dev.mos.ru';
    } else if (url.includes('school-test.mos.ru')) {
      domain = 'school-test.mos.ru';
    } else if (url.includes('uchebnik-dev.mos.ru')) {
      domain = 'uchebnik-dev.mos.ru';
    } else if (url.includes('uchebnik-test.mos.ru')) {
      domain = 'uchebnik-test.mos.ru';
    }

    console.log(`🔍 Looking for aupd_token cookie on domain: ${domain}`);

    // Ищем aupd_token куку - сначала точное совпадение домена
    let cookies = await chrome.cookies.getAll({ 
      domain: domain,
      name: 'aupd_token' 
    });

    // Если не найдено, ищем в родительском домене .mos.ru
    if (cookies.length === 0) {
      console.log(`🔍 Token not found on ${domain}, trying .mos.ru`);
      cookies = await chrome.cookies.getAll({ 
        domain: '.mos.ru',
        name: 'aupd_token' 
      });
    }

    // Если все еще не найдено, ищем без указания домена
    if (cookies.length === 0) {
      console.log(`🔍 Token not found on .mos.ru, searching all domains`);
      cookies = await chrome.cookies.getAll({ 
        name: 'aupd_token' 
      });
      console.log(`🔍 Found ${cookies.length} aupd_token cookies across all domains`);
    }

    if (cookies.length > 0 && cookies[0].value) {
      console.log(`✅ Found Bearer token for ${domain} on domain: ${cookies[0].domain}`);
      
      // Проверяем, не истек ли JWT токен
      if (isJWTExpired(cookies[0].value)) {
        console.warn(`⚠️ Bearer token for ${domain} is expired`);
        return null;
      }
      
      return cookies[0].value;
    }

    console.warn(`❌ No Bearer token found for ${domain}`);
    return null;

  } catch (error) {
    console.error('💥 Error getting Bearer token:', error);
    return null;
  }
}

function isJWTExpired(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const now = Math.floor(Date.now() / 1000);
    const isExpired = payload.exp && payload.exp < now;
    
    if (isExpired) {
      console.log(`⏰ JWT token expired. Exp: ${payload.exp}, Now: ${now}`);
    }
    
    return isExpired;
  } catch (error) {
    console.warn('⚠️ Could not parse JWT token:', error.message);
    return true;
  }
}

async function getUchebnikHeaders(url) {
  try {
    const headers = {};
    
    // Получаем profile-id из куков
    const profileCookies = await chrome.cookies.getAll({ 
      domain: 'uchebnik-test.mos.ru',
      name: 'eom_profile_id' 
    });
    
    if (profileCookies.length > 0 && profileCookies[0].value) {
      headers['profile-id'] = profileCookies[0].value;
    }

    // Для user-id можно попробовать извлечь из JWT токена или использовать фиксированное значение
    // Из твоего примера видно user-id: 1000200000
    headers['user-id'] = '1000200000';

    console.log(`Uchebnik headers:`, headers);
    return headers;

  } catch (error) {
    console.error('Error getting Uchebnik headers:', error);
    return {};
  }
}