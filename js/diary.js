/**
 * diary.js — LocalStorage diary management for Session Debrief AI
 * Stores full session data: date, stats, notes, AI report.
 */
const Diary = (() => {
  const KEY = 'sda_diary_v1';

  function getAll() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; }
    catch { return []; }
  }

  function save(entry) {
    // entry: { id, date, stats, notes, report }
    const all = getAll();
    const idx = all.findIndex(e => e.id === entry.id);
    if (idx >= 0) all[idx] = entry;
    else all.unshift(entry);
    localStorage.setItem(KEY, JSON.stringify(all));
  }

  function getById(id) {
    return getAll().find(e => e.id === id) || null;
  }

  function remove(id) {
    const all = getAll().filter(e => e.id !== id);
    localStorage.setItem(KEY, JSON.stringify(all));
  }

  function exportJSON() {
    const data = JSON.stringify(getAll(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `session_debrief_backup_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importJSON(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const entries = JSON.parse(e.target.result);
          if (!Array.isArray(entries)) throw new Error('Invalid format');
          const existing = getAll();
          const merged   = [...entries];
          existing.forEach(ex => {
            if (!merged.find(m => m.id === ex.id)) merged.push(ex);
          });
          merged.sort((a,b) => b.id - a.id);
          localStorage.setItem(KEY, JSON.stringify(merged));
          resolve(merged.length);
        } catch(err) { reject(err); }
      };
      reader.onerror = () => reject(new Error('File read error'));
      reader.readAsText(file);
    });
  }

  return { getAll, save, getById, remove, exportJSON, importJSON };
})();
