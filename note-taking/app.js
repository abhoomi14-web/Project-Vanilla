(() => {
  const STORAGE_KEY = 'nova-notes-v1';
  const listEl = document.querySelector('#note-list');
  const countEl = document.querySelector('#note-count');
  const titleEl = document.querySelector('#note-title');
  const bodyEl = document.querySelector('#note-body');
  const metaEl = document.querySelector('#note-meta');
  const statusEl = document.querySelector('#save-status');
  const editorEl = document.querySelector('#editor');
  const emptyEl = document.querySelector('#empty-state');
  const searchEl = document.querySelector('#search');
  const pinButton = document.querySelector('#pin-note');
  const sidebar = document.querySelector('.sidebar');
  const backdrop = document.querySelector('#backdrop');
  let notes = loadNotes();
  let activeId = notes[0]?.id || null;
  let saveTimer;

  function loadNotes() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
    catch { return []; }
  }

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
    statusEl.textContent = 'All changes saved';
  }

  function makeNote(title = '', body = '') {
    const now = new Date().toISOString();
    return { id: crypto.randomUUID(), title, body, pinned: false, createdAt: now, updatedAt: now };
  }

  function createNote(title = '', body = '') {
    const note = makeNote(title, body);
    notes.unshift(note);
    activeId = note.id;
    persist();
    render();
    closeSidebar();
    titleEl.focus();
    return note;
  }

  function formatDate(value) {
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
  }

  function escapeText(value) {
    const span = document.createElement('span');
    span.textContent = value;
    return span.innerHTML;
  }

  function sortedNotes() {
    return [...notes].sort((a, b) => Number(b.pinned) - Number(a.pinned) || new Date(b.updatedAt) - new Date(a.updatedAt));
  }

  function renderList() {
    const query = searchEl.value.trim().toLowerCase();
    const visible = sortedNotes().filter(note => `${note.title} ${note.body}`.toLowerCase().includes(query));
    countEl.textContent = String(visible.length);
    listEl.innerHTML = visible.length ? visible.map(note => `
      <button class="note-card ${note.id === activeId ? 'active' : ''}" type="button" data-id="${note.id}">
        <strong>${note.pinned ? '<span aria-label="Pinned">◆</span>' : ''}${escapeText(note.title || 'Untitled note')}</strong>
        <p>${escapeText(note.body.replace(/\s+/g, ' ').trim() || 'No additional text')}</p>
      </button>`).join('') : '<p class="storage-note">No notes match your search.</p>';
  }

  function renderEditor() {
    const note = notes.find(item => item.id === activeId);
    editorEl.hidden = !note;
    emptyEl.hidden = Boolean(note);
    pinButton.disabled = !note;
    document.querySelector('#delete-note').disabled = !note;
    if (!note) return;
    titleEl.value = note.title;
    bodyEl.value = note.body;
    metaEl.textContent = `Edited ${formatDate(note.updatedAt)} · ${note.body.trim() ? note.body.trim().split(/\s+/).length : 0} words`;
    pinButton.textContent = note.pinned ? 'Pinned' : 'Pin';
    pinButton.setAttribute('aria-pressed', String(note.pinned));
  }

  function render() { renderList(); renderEditor(); }

  function updateActive() {
    const note = notes.find(item => item.id === activeId);
    if (!note) return;
    note.title = titleEl.value;
    note.body = bodyEl.value;
    note.updatedAt = new Date().toISOString();
    statusEl.textContent = 'Saving…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { persist(); renderList(); renderEditor(); }, 300);
  }

  function closeSidebar() { sidebar.classList.remove('open'); backdrop.hidden = true; }
  function openSidebar() { sidebar.classList.add('open'); backdrop.hidden = false; }

  document.querySelectorAll('#new-note, #empty-new-note').forEach(button => button.addEventListener('click', () => createNote()));
  document.querySelector('#delete-note').addEventListener('click', () => {
    const note = notes.find(item => item.id === activeId);
    if (!note || !confirm(`Delete “${note.title || 'Untitled note'}”?`)) return;
    notes = notes.filter(item => item.id !== activeId);
    activeId = sortedNotes()[0]?.id || null;
    persist(); render();
  });
  pinButton.addEventListener('click', () => {
    const note = notes.find(item => item.id === activeId);
    if (!note) return;
    note.pinned = !note.pinned; note.updatedAt = new Date().toISOString(); persist(); render();
  });
  listEl.addEventListener('click', event => {
    const card = event.target.closest('[data-id]');
    if (!card) return;
    activeId = card.dataset.id; render(); closeSidebar();
  });
  [titleEl, bodyEl].forEach(field => field.addEventListener('input', updateActive));
  searchEl.addEventListener('input', renderList);
  document.querySelector('#open-sidebar').addEventListener('click', openSidebar);
  document.querySelector('#close-sidebar').addEventListener('click', closeSidebar);
  backdrop.addEventListener('click', closeSidebar);

  if (!notes.length) {
    const welcome = makeNote('Welcome to Nova Notes', 'Your notes stay on this device. Start typing here, or create a fresh note from the sidebar.');
    notes = [welcome]; activeId = welcome.id; persist();
  }
  render();

  const context = document.modelContext;
  if (context?.registerTool) {
    const lifecycle = new AbortController();
    const register = tool => Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => {});
    register({
      name: 'create_note', title: 'Create note', description: 'Create a new note in Nova Notes and open it in the editor.',
      inputSchema: { type: 'object', properties: { title: { type: 'string' }, body: { type: 'string' } }, required: ['title'], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        if (!input || typeof input.title !== 'string' || !input.title.trim()) throw new Error('A non-empty title is required');
        const note = createNote(input.title.trim(), typeof input.body === 'string' ? input.body : '');
        return { id: note.id, title: note.title };
      }
    });
    register({
      name: 'list_notes', title: 'List notes', description: 'List note titles and pinned status from Nova Notes.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute() { return { notes: sortedNotes().map(({ id, title, pinned, updatedAt }) => ({ id, title: title || 'Untitled note', pinned, updatedAt })) }; }
    });
  }
})();
