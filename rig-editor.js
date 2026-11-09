(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const button = $('toggleRigEditor');
  const workspace = $('rigEditorWorkspace');
  const mount = $('rigEditorMount');
  if (!button || !workspace || !mount) return;

  const controls = [
    document.querySelector('label[for="motionLayerFiles"]'),
    $('motionLayerFiles'),
    $('motionLayerList'),
    $('motionLivePreview'),
    $('animate')
  ].filter(Boolean);

  controls.forEach((node) => mount.appendChild(node));

  button.addEventListener('click', () => {
    const opening = workspace.hidden;
    workspace.hidden = !opening;
    button.setAttribute('aria-expanded', String(opening));
    button.textContent = opening ? 'بستن ابزار ریگ شخصیت' : 'باز کردن ابزار ریگ شخصیت';
    if (opening) {
      $('motionLayerList')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  });
})();
