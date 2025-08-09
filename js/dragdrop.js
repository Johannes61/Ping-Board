// dragdrop.js - vanilla HTML5 DnD between Available and Active
const DragDrop = (() => {
  let draggingId = null;

  function makeDraggable(li) {
    li.setAttribute('draggable', 'true');
    li.addEventListener('dragstart', (e) => {
      draggingId = li.dataset.id;
      li.classList.add('dragging');
      e.dataTransfer.setData('text/plain', draggingId);
    });
    li.addEventListener('dragend', () => {
      draggingId = null;
      li.classList.remove('dragging');
    });
  }

  function makeDroppable(listEl, onDropCb) {
    ['dragenter','dragover'].forEach(ev => {
      listEl.addEventListener(ev, (e) => {
        if (!draggingId) return;
        e.preventDefault();
        listEl.classList.add('drag-over');
      });
    });
    ['dragleave','drop'].forEach(ev => {
      listEl.addEventListener(ev, (e) => {
        if (!draggingId) return;
        e.preventDefault();
        listEl.classList.remove('drag-over');
        if (ev === 'drop') {
          onDropCb(draggingId, listEl.dataset.list);
        }
      });
    });
  }

  return { makeDraggable, makeDroppable };
})();
