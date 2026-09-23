// Piccoli pezzi d'interfaccia condivisi: finestre, avvisi, formato del tempo.

export function formatTime(sec) {
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

// Finestra con pulsanti: buttons = [{ label, primary, action }]
export function modal({ html, buttons }) {
  const back = document.createElement("div");
  back.className = "modal-back";
  back.innerHTML = `<div class="modal">${html}<div class="modal-buttons"></div></div>`;
  const box = back.querySelector(".modal-buttons");
  const close = () => back.remove();
  for (const b of buttons) {
    const btn = document.createElement("button");
    btn.className = "btn" + (b.primary ? " btn-primary" : "");
    btn.textContent = b.label;
    btn.addEventListener("click", () => { close(); b.action?.(); });
    box.appendChild(btn);
  }
  document.body.appendChild(back);
  return close;
}

// Avviso breve in basso
let toastEl = null, toastTimer = 0;
export function toast(text) {
  if (!toastEl) {
    toastEl = document.createElement("div");
    toastEl.className = "toast";
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = text;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2200);
}
