const COOKIE_NAMES = [
  "eom_profile_id",
  "eom_session_id"
];

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
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