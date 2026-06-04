const $ = (id: string) => document.getElementById(id) as HTMLInputElement;
(async () => {
  const cfg = await chrome.storage.local.get(['port', 'token']);
  if (cfg.port) $('port').value = String(cfg.port);
  if (cfg.token) $('token').value = String(cfg.token);
})();
document.getElementById('save')!.addEventListener('click', async () => {
  await chrome.storage.local.set({ port: Number($('port').value), token: $('token').value.trim() });
  document.getElementById('status')!.textContent = 'saved — reload the extension';
});
