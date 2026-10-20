import './common.js';

const dialog = document.querySelector<HTMLDialogElement>('#image-dialog')!;
const openImage = () => dialog.showModal();
document.querySelector('#enlarge')!.addEventListener('click', openImage);
document.querySelector('#enlarge-text')!.addEventListener('click', openImage);
document.querySelector('#close-image')!.addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => {
  if (event.target === dialog) dialog.close();
});
