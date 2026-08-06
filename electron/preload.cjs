const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktopShell', {
  navigateAcademy: (url) => ipcRenderer.invoke('academy:navigate', url),
  captureAcademyPage: () => ipcRenderer.invoke('academy:capture-page'),
  getAcademyCaptures: () => ipcRenderer.invoke('academy:get-captures'),
  deleteAcademyCapture: (id) => ipcRenderer.invoke('academy:delete-capture', id),
  getAcademyStudyMaterials: () => ipcRenderer.invoke('academy:get-study-materials'),
  generateAcademyFlashcards: (ids) => ipcRenderer.invoke('academy:generate-flashcards', ids),
  deleteAcademyStudyMaterial: (id) => ipcRenderer.invoke('academy:delete-study-material', id),
  getAcademyStudyReviews: () => ipcRenderer.invoke('academy:get-study-reviews'),
  setAcademyStudyReview: (id, status) => ipcRenderer.invoke('academy:set-study-review', id, status),
  setAcademyVisible: (visible) => ipcRenderer.invoke('academy:set-visible', Boolean(visible)),
  setAcademyBounds: (bounds) => ipcRenderer.invoke('academy:set-bounds', bounds)
});
