
document.getElementById("copy-test").addEventListener("click", () => {
  copyAndPaste("https://uchebnik-test.mos.ru");
});

document.getElementById("copy-dev").addEventListener("click", () => {
  copyAndPaste("https://uchebnik-dev.mos.ru");
});

function copyAndPaste(domain) {
  console.log("Copy button clicked for domain:", domain);
  document.getElementById("status").textContent = "Копирую...";
  
  chrome.runtime.sendMessage({ action: "copyAndPaste", domain }, res => {
    console.log("Copy response:", res);
    document.getElementById("status").textContent = res?.message || "Ошибка";
  });
}
