<script lang="ts">
  import { onMount } from 'svelte';
  import { Agentation } from 'agentation-svelte';
  import { draggable } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';

  type EmailMsg = {
    id: string;
    threadId: string;
    snippet: string;
    from: string;
    subject: string;
    date: string;
  };

  type MarkAction = 'archive' | 'trash';
  type ViewMode = 'emails' | 'marked';
  type MarkedItem = {
    id: string;
    from: string;
    action: MarkAction;
  };

  let emails = $state<EmailMsg[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);
  
  let searchQuery = $state('');
  let sortKey = $state<'date' | 'from' | 'subject'>('date');
  let sortDesc = $state(true);

  let selectedIds = $state<Set<string>>(new Set());
  let lastSelectedId = $state<string | null>(null);
  let markedActions = $state<Record<string, MarkAction>>({});
  let markedItems = $state<MarkedItem[]>([]);
  let viewMode = $state<ViewMode>('emails');
  let queryActive = $state(false);

  let actionInProgress = $state(false);
  let autoApply = $state(false);

  // Column resizing state
  let colWidths = $state([200, 400, 150]);
  let startWidth = 0;
  let startWidthNext = 0;

  // Peek state
  let hoveredEmail = $state<EmailMsg | null>(null);
  let mousePos = $state({ x: 0, y: 0 });
  let editingOpen = $state(false);
  let editingItem = $state<MarkedItem | null>(null);
  let editingFrom = $state('');
  let editingAction = $state<MarkAction>('archive');

  function handleMouseMove(e: MouseEvent, email: EmailMsg) {
    if (e.ctrlKey) {
      hoveredEmail = email;
      mousePos = { x: e.clientX, y: e.clientY };
    } else {
      hoveredEmail = null;
    }
  }

  async function fetchEmails() {
    loading = true;
    error = null;
    try {
      // @ts-ignore
      const res = await window.electron.ipcRenderer.invoke('gmail-fetch-inbox');
      if (res.success) {
        emails = res.data;
        selectedIds = new Set();
        lastSelectedId = null;
        markedActions = {};
        queryActive = false;
      } else {
        error = res.error;
      }
    } catch (err: any) {
      error = err.message;
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    const saved = localStorage.getItem('colWidths');
    if (saved) {
      try {
        colWidths = JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse colWidths', e);
      }
    }
    const savedSort = localStorage.getItem('sortInfo');
    if (savedSort) {
      try {
        const { key, desc } = JSON.parse(savedSort);
        sortKey = key;
        sortDesc = desc;
      } catch (e) {
        console.error('Failed to parse sortInfo', e);
      }
    }
    const savedAuto = localStorage.getItem('autoApply');
    if (savedAuto) {
      autoApply = savedAuto === 'true';
    }
    const savedMarkedItems = localStorage.getItem('markedItems');
    if (savedMarkedItems) {
      try {
        markedItems = JSON.parse(savedMarkedItems);
      } catch (e) {
        console.error('Failed to parse markedItems', e);
      }
    }
    fetchEmails();
  });

  $effect(() => {
    localStorage.setItem('colWidths', JSON.stringify(colWidths));
  });

  $effect(() => {
    localStorage.setItem('sortInfo', JSON.stringify({ key: sortKey, desc: sortDesc }));
  });

  $effect(() => {
    localStorage.setItem('autoApply', autoApply.toString());
  });

  $effect(() => {
    localStorage.setItem('markedItems', JSON.stringify(markedItems));
  });

  const queryEmails = $derived(queryActive ? emails.filter(e => markedActions[e.id]) : emails);

  const filteredEmails = $derived(queryEmails.filter(e => {
    const q = searchQuery.toLowerCase();
    return e.from.toLowerCase().includes(q) || 
           e.subject.toLowerCase().includes(q) ||
           e.snippet.toLowerCase().includes(q);
  }));

  const sortedEmails = $derived([...filteredEmails].sort((a, b) => {
    let valA = a[sortKey].toLowerCase();
    let valB = b[sortKey].toLowerCase();
    
    if (sortKey === 'date') {
      const dateA = new Date(a.date).getTime() || 0;
      const dateB = new Date(b.date).getTime() || 0;
      return sortDesc ? dateB - dateA : dateA - dateB;
    }

    if (valA < valB) return sortDesc ? 1 : -1;
    if (valA > valB) return sortDesc ? -1 : 1;
    return 0;
  }));

  function handleSort(key: typeof sortKey) {
    if (sortKey === key) {
      sortDesc = !sortDesc;
    } else {
      sortKey = key;
      sortDesc = true;
    }
  }

  function handleRowClick(event: MouseEvent | KeyboardEvent, email: EmailMsg) {
    if (event.altKey) {
      event.preventDefault();
      openMarkedItemEditor(email);
      return;
    }
    const id = email.id;
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    selectedIds = newSelected;
    lastSelectedId = id;
  }

  function handleRowRightClick(event: MouseEvent, id: string) {
    event.preventDefault();
    if (!lastSelectedId) {
      selectedIds = new Set([id]);
      lastSelectedId = id;
      return;
    }
    const currentIdx = sortedEmails.findIndex(e => e.id === id);
    const lastIdx = sortedEmails.findIndex(e => e.id === lastSelectedId);
    if (currentIdx !== -1 && lastIdx !== -1) {
      const start = Math.min(currentIdx, lastIdx);
      const end = Math.max(currentIdx, lastIdx);
      const newSelected = new Set(selectedIds);
      for (let i = start; i <= end; i++) {
        newSelected.add(sortedEmails[i].id);
      }
      selectedIds = newSelected;
      lastSelectedId = id;
    }
  }

  async function markSelected(action: MarkAction | 'unmark') {
    if (selectedIds.size === 0) return;

    if (autoApply && action !== 'unmark') {
      actionInProgress = true;
      try {
        const ids = Array.from(selectedIds);
        if (action === 'archive') await window.electron.ipcRenderer.invoke('gmail-archive', ids);
        if (action === 'trash') await window.electron.ipcRenderer.invoke('gmail-trash', ids);
        emails = emails.filter(e => !selectedIds.has(e.id));
        selectedIds = new Set();
      } catch (err: any) {
        error = err.message;
      } finally {
        actionInProgress = false;
      }
      return;
    }

    const newMarks = { ...markedActions };
    for (const id of selectedIds) {
      if (action === 'unmark') {
        delete newMarks[id];
      } else {
        newMarks[id] = action;
      }
    }
    markedActions = newMarks;
    selectedIds = new Set();
  }

  function handleRowMouseDown(event: MouseEvent, id: string) {
    if (event.button === 1) {
      event.preventDefault();
      if (selectedIds.has(id)) {
        selectedIds = new Set();
      } else {
        const newSelected = new Set(selectedIds);
        for (const email of sortedEmails) {
          newSelected.add(email.id);
        }
        selectedIds = newSelected;
      }
    }
  }

  async function executeActions() {
    const archiveIds = Object.entries(markedActions).filter(([_, a]) => a === 'archive').map(([id]) => id);
    const trashIds = Object.entries(markedActions).filter(([_, a]) => a === 'trash').map(([id]) => id);
    if (archiveIds.length === 0 && trashIds.length === 0) return;
    actionInProgress = true;
    try {
      if (archiveIds.length > 0) await window.electron.ipcRenderer.invoke('gmail-archive', archiveIds);
      if (trashIds.length > 0) await window.electron.ipcRenderer.invoke('gmail-trash', trashIds);
      const processedIds = new Set([...archiveIds, ...trashIds]);
      emails = emails.filter(e => !processedIds.has(e.id));
      markedActions = {};
    } catch (err: any) {
      error = err.message;
    } finally {
      actionInProgress = false;
    }
  }

  function findMarkedItem(email: EmailMsg) {
    const from = email.from.toLowerCase();
    return markedItems.find(item => item.from.trim() && from.includes(item.from.trim().toLowerCase()));
  }

  async function runMarkedItemsQuery() {
    if (markedItems.length === 0) return;
    loading = true;
    error = null;
    try {
      // @ts-ignore
      const res = await window.electron.ipcRenderer.invoke('gmail-fetch-inbox');
      if (!res.success) {
        error = res.error;
        return;
      }

      const nextEmails = res.data as EmailMsg[];
      const nextMarks: Record<string, MarkAction> = {};
      for (const email of nextEmails) {
        const item = findMarkedItem(email);
        if (item) nextMarks[email.id] = item.action;
      }

      emails = nextEmails;
      markedActions = nextMarks;
      selectedIds = new Set();
      lastSelectedId = null;
      queryActive = true;
      viewMode = 'emails';
    } catch (err: any) {
      error = err.message;
    } finally {
      loading = false;
    }
  }

  function openMarkedItemEditor(email: EmailMsg) {
    const existing = findMarkedItem(email);
    editingOpen = true;
    editingItem = existing ? { ...existing } : null;
    editingFrom = existing?.from ?? email.from;
    editingAction = existing?.action ?? 'archive';
  }

  function saveMarkedItem() {
    const from = editingFrom.trim();
    if (!from) return;

    if (editingItem) {
      markedItems = markedItems.map(item =>
        item.id === editingItem?.id ? { ...item, from, action: editingAction } : item
      );
    } else {
      markedItems = [{ id: crypto.randomUUID(), from, action: editingAction }, ...markedItems];
    }
    closeMarkedItemEditor();
  }

  function deleteMarkedItem(id: string) {
    markedItems = markedItems.filter(item => item.id !== id);
    if (editingItem?.id === id) closeMarkedItemEditor();
  }

  function closeMarkedItemEditor() {
    editingOpen = false;
    editingItem = null;
    editingFrom = '';
    editingAction = 'archive';
  }

  function resizable(node: HTMLElement, index: number) {
    return draggable({
      element: node,
      onDragStart: () => {
        startWidth = colWidths[index];
        if (index === 0) startWidthNext = colWidths[1];
      },
      onDrag: ({ location }) => {
        const deltaX = location.current.input.clientX - location.initial.input.clientX;
        
        if (index === 0) {
          // Resize From (col 0), take from Subject (col 1)
          let newWidth = Math.max(50, startWidth + deltaX);
          let actualDelta = newWidth - startWidth;
          
          if (startWidthNext - actualDelta < 50) {
            actualDelta = startWidthNext - 50;
            newWidth = startWidth + actualDelta;
          }
          
          colWidths[0] = newWidth;
          colWidths[1] = startWidthNext - actualDelta;
        } else {
          // Resize Subject (col 1), take from Date (1fr)
          colWidths[1] = Math.max(50, startWidth + deltaX);
        }
      },
      onGenerateDragPreview: ({ nativeSetDragImage }) => {
        nativeSetDragImage(new Image(), 0, 0);
      }
    });
  }

  const markedCount = $derived(Object.keys(markedActions).length);
  const markedItemCount = $derived(markedItems.length);
  const gridStyle = $derived(`grid-template-columns: ${colWidths[0]}px 4px ${colWidths[1]}px 4px 1fr;`);
  let authCode = $state('');
  async function handleAuthorize() {
    if (!authCode) return;
    actionInProgress = true;
    try {
      // @ts-ignore
      const res = await window.electron.ipcRenderer.invoke('gmail-submit-code', authCode);
      if (res.success) {
        authCode = '';
        fetchEmails();
      } else {
        error = res.error;
      }
    } catch (err: any) {
      error = err.message;
    } finally {
      actionInProgress = false;
    }
  }
</script>

<main class="h-screen w-screen flex flex-col p-4 bg-base text-accent">
  <!-- Header / Controls -->
  <header class="flex justify-between items-center mb-6 gap-4 shrink-0 p-2 rounded-xl bg-surface border border-surface-active shadow-sm">
    <div class="flex items-center gap-3 w-3/12 relative">
      <svg class="w-5 h-5 absolute left-3 text-accent-dim pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input 
        type="text" 
        bind:value={searchQuery} 
        placeholder="Search..."
        class="w-full bg-surface-hover text-accent pl-10 pr-10 py-2 rounded-lg border border-transparent focus:border-brand focus:outline-none transition-all placeholder:text-accent-dim text-sm"
      />
      {#if searchQuery}
        <button 
          aria-label="Clear search"
          onclick={() => searchQuery = ''} 
          class="absolute right-3 text-accent-dim hover:text-brand transition-colors p-1"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      {/if}
    </div>

    <div class="flex items-center gap-4">
      <label class="flex items-center gap-2 cursor-pointer select-none">
        <input type="checkbox" bind:checked={autoApply} class="w-4 h-4 accent-brand bg-surface border-surface-active rounded" />
        <span class="text-[10px] font-mono uppercase tracking-wider {autoApply ? 'text-brand' : 'text-accent-dim'}">Auto-Apply</span>
      </label>

      <div class="flex items-center gap-2">
        <div class="text-[10px] text-accent-dim font-mono flex flex-col items-end mr-2">
          <span>{emails.length} emails</span>
          <span>{selectedIds.size} selected</span>
          <span class="text-brand/80">{markedCount} marked</span>
          <span>{markedItemCount} items</span>
        </div>
        <button onclick={() => viewMode = viewMode === 'emails' ? 'marked' : 'emails'} disabled={actionInProgress} class="px-3 py-1.5 bg-surface-active text-accent rounded-lg border border-accent/20 hover:bg-surface-hover transition-all disabled:opacity-20 text-xs font-mono font-bold uppercase shadow-sm">
          {viewMode === 'emails' ? 'List+' : 'List-'}
        </button>
        <button onclick={runMarkedItemsQuery} disabled={markedItemCount === 0 || actionInProgress || loading} class="px-3 py-1.5 bg-surface-hover text-brand rounded-lg border border-brand/40 hover:bg-brand/10 transition-all disabled:opacity-20 text-xs font-mono font-bold uppercase shadow-sm">Run_Query</button>
        <button onclick={() => markSelected('archive')} disabled={selectedIds.size === 0 || actionInProgress} class="px-3 py-1.5 bg-brand text-base rounded-lg border border-brand/50 hover:bg-brand/80 transition-all disabled:opacity-20 text-xs font-mono font-bold uppercase shadow-sm">ARCHIVE_SEL</button>
        <button onclick={() => markSelected('trash')} disabled={selectedIds.size === 0 || actionInProgress} class="px-3 py-1.5 bg-danger text-white rounded-lg border border-danger/50 hover:bg-danger/80 transition-all disabled:opacity-20 text-xs font-mono font-bold uppercase shadow-sm">DELETE_SEL</button>
        <button onclick={() => markSelected('unmark')} disabled={selectedIds.size === 0 || actionInProgress} class="px-3 py-1.5 bg-surface-active text-accent rounded-lg border border-accent/20 hover:bg-surface-active/80 transition-all disabled:opacity-20 text-xs font-mono font-bold uppercase shadow-sm">UNMARK_SEL</button>
        <div class="w-px h-6 bg-surface-active mx-1"></div>
        <button onclick={executeActions} disabled={markedCount === 0 || actionInProgress} class="px-4 py-1.5 bg-brand text-base rounded-lg border border-brand/50 hover:bg-brand/80 transition-all disabled:opacity-20 font-bold shadow-[0_0_15px_rgba(214,255,0,0.15)] text-xs font-mono uppercase">Apply_All</button>
      </div>

      <button 
        aria-label="Refresh"
        onclick={fetchEmails} 
        disabled={loading} 
        class="p-2 bg-surface-hover text-accent-dim rounded-lg hover:text-brand transition-all"
        title="Refresh"
      >
        <svg class="w-5 h-5 {loading ? 'animate-spin' : ''}" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </button>
    </div>
  </header>

  {#if error}
    <div class="mb-4 p-4 bg-danger/10 border border-danger/50 text-danger rounded-lg text-xs font-mono shrink-0 whitespace-pre-wrap break-all leading-relaxed flex flex-col gap-3">
      <div>
        <strong>ERROR:</strong>
        {@html error.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" class="underline hover:text-white transition-colors">$1</a>')}
      </div>
      
      {#if error.includes('TOKEN REQUIRED')}
        <div class="flex gap-2 items-center p-2 bg-danger/20 rounded border border-danger/30">
          <input 
            type="text" 
            bind:value={authCode} 
            placeholder="Paste authorization code here..."
            class="flex-1 bg-surface text-danger px-3 py-1.5 rounded border border-danger/50 focus:outline-none focus:border-brand text-xs"
          />
          <button 
            onclick={handleAuthorize}
            disabled={!authCode || actionInProgress}
            class="px-4 py-1.5 bg-brand text-base font-bold rounded uppercase text-[10px] hover:bg-brand/80 transition-all disabled:opacity-50"
          >
            Authorize
          </button>
        </div>
      {/if}
    </div>
  {/if}

  {#if queryActive && viewMode === 'emails'}
    <div class="mb-3 flex items-center justify-between shrink-0 rounded-lg border border-brand/30 bg-brand/5 px-3 py-2 font-mono text-[10px] uppercase text-brand">
      <span>QUERY_RESULT: {markedCount} matched inbox emails</span>
      <button onclick={() => queryActive = false} class="text-accent-dim hover:text-accent">SHOW_ALL</button>
    </div>
  {/if}

  <div class="flex-1 overflow-hidden border border-surface-active rounded-xl bg-surface flex flex-col shadow-xl">
    <!-- Header -->
    {#if viewMode === 'emails'}
      <div class="grid gap-0 p-0 border-b border-surface-active bg-surface-active/30 font-mono text-[10px] text-accent-dim uppercase tracking-widest shrink-0" style={gridStyle}>
        <div 
          role="button"
          tabindex="0"
          class="p-3 cursor-pointer hover:text-accent select-none truncate" 
          onclick={() => handleSort('from')}
          onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleSort('from'); }}
        >
          FROM {#if sortKey === 'from'}<span class="text-brand">{sortDesc ? '↓' : '↑'}</span>{/if}
        </div>
        <div use:resizable={0} class="cursor-col-resize hover:bg-brand/20 transition-colors w-1 bg-surface-active/50"></div>
        
        <div 
          role="button"
          tabindex="0"
          class="p-3 cursor-pointer hover:text-accent select-none truncate" 
          onclick={() => handleSort('subject')}
          onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleSort('subject'); }}
        >
          SUBJECT {#if sortKey === 'subject'}<span class="text-brand">{sortDesc ? '↓' : '↑'}</span>{/if}
        </div>
        <div use:resizable={1} class="cursor-col-resize hover:bg-brand/20 transition-colors w-1 bg-surface-active/50"></div>

        <div 
          role="button"
          tabindex="0"
          class="p-3 cursor-pointer hover:text-accent select-none text-right" 
          onclick={() => handleSort('date')}
          onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleSort('date'); }}
        >
          {#if sortKey === 'date'}<span class="text-brand">{sortDesc ? '↓' : '↑'}</span>{/if} DATE
        </div>
      </div>
    {:else}
      <div class="grid grid-cols-[1fr_140px_120px] gap-0 border-b border-surface-active bg-surface-active/30 font-mono text-[10px] text-accent-dim uppercase tracking-widest shrink-0">
        <div class="p-3 truncate">FROM MATCH</div>
        <div class="p-3">MARK</div>
        <div class="p-3 text-right">ACTION</div>
      </div>
    {/if}

    <!-- Body -->
    <div class="flex-1 overflow-y-auto overflow-x-hidden relative">
      {#if viewMode === 'marked'}
        {#if markedItems.length === 0}
          <div class="absolute inset-0 flex items-center justify-center text-accent-dim font-mono text-[10px]">NO_MARKED_ITEMS</div>
        {:else}
          {#each markedItems as item (item.id)}
            <div class="grid grid-cols-[1fr_140px_120px] gap-0 border-b border-surface-active text-sm hover:bg-surface-hover/50">
              <div class="p-3 truncate text-accent/90">{item.from}</div>
              <div class="p-3 font-mono text-[11px] uppercase {item.action === 'archive' ? 'text-brand' : 'text-danger'}">{item.action === 'archive' ? 'Archive' : 'Delete'}</div>
              <div class="p-2 flex justify-end gap-2">
                <button onclick={() => { editingOpen = true; editingItem = { ...item }; editingFrom = item.from; editingAction = item.action; }} class="px-2 py-1 rounded bg-surface-active text-accent-dim hover:text-accent font-mono text-[10px] uppercase">Edit</button>
                <button onclick={() => deleteMarkedItem(item.id)} class="px-2 py-1 rounded bg-danger/10 text-danger hover:bg-danger/20 font-mono text-[10px] uppercase">Drop</button>
              </div>
            </div>
          {/each}
        {/if}
      {:else if loading && emails.length === 0}
        <div class="absolute inset-0 flex items-center justify-center text-accent-dim font-mono text-[10px] animate-pulse">CONNECTING...</div>
      {:else if sortedEmails.length === 0}
        <div class="absolute inset-0 flex items-center justify-center text-accent-dim font-mono text-[10px]">NO_DATA</div>
      {:else}
        {#each sortedEmails as email (email.id)}
          <div 
            role="button"
            tabindex="0"
            class="grid gap-0 p-0 border-b border-surface-active cursor-pointer transition-all hover:bg-surface-hover/50 text-sm group relative
                   {selectedIds.has(email.id) ? 'bg-surface-active' : ''}"
            style={gridStyle}
            onclick={(e) => handleRowClick(e, email)}
            oncontextmenu={(e) => handleRowRightClick(e, email.id)}
            onmousedown={(e) => handleRowMouseDown(e, email.id)}
            onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleRowClick(e, email); }}
          >
            {#if markedActions[email.id]}
              <div class="absolute left-0 top-0 bottom-0 w-1 {markedActions[email.id] === 'archive' ? 'bg-brand' : 'bg-danger'} z-10"></div>
            {/if}

            <div class="p-3 truncate font-medium flex items-center gap-2">
              {#if markedActions[email.id]}
                <span class="text-[11px] px-1 rounded bg-surface-active font-mono {markedActions[email.id] === 'archive' ? 'text-brand' : 'text-danger'}">
                  {markedActions[email.id] === 'archive' ? 'A' : 'D'}
                </span>
              {/if}
              <span class="truncate {selectedIds.has(email.id) ? 'text-brand' : 'text-accent/90'}">{email.from}</span>
            </div>
            <div class="bg-transparent w-1"></div>

            <div 
              role="tooltip"
              aria-label="Subject with peek"
              class="p-3 truncate flex items-center gap-2"
              onmousemove={(e) => handleMouseMove(e, email)}
              onmouseleave={() => hoveredEmail = null}
            >
              <span class="truncate {selectedIds.has(email.id) ? 'text-accent' : 'text-accent/80'}">{email.subject || '(No Subject)'}</span>
            </div>
            <div class="bg-transparent w-1"></div>

            <div class="p-3 text-right text-accent-dim font-mono text-[11px] whitespace-nowrap self-center">
              {new Date(email.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        {/each}
      {/if}
    </div>
  </div>

  {#if hoveredEmail}
    <div 
      class="fixed z-50 p-4 bg-surface-active border border-brand/50 rounded-lg shadow-2xl max-w-md pointer-events-none"
      style="left: {mousePos.x + 20}px; top: {mousePos.y + 20}px;"
    >
      <div class="text-[10px] text-brand font-mono mb-2 uppercase tracking-tighter">Snippet Peek</div>
      <div class="text-xs text-accent/90 italic leading-relaxed">
        {hoveredEmail.snippet}
      </div>
    </div>
  {/if}

  {#if editingOpen}
    <div class="fixed inset-0 z-50 bg-base/60 flex items-center justify-center p-4" onclick={closeMarkedItemEditor}>
      <div class="w-full max-w-md rounded-xl border border-surface-active bg-surface shadow-2xl" onclick={(e) => e.stopPropagation()}>
        <div class="border-b border-surface-active px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-accent-dim">
          Marked Item
        </div>
        <div class="p-4 flex flex-col gap-4">
          <label class="flex flex-col gap-2">
            <span class="font-mono text-[10px] uppercase tracking-wider text-accent-dim">From</span>
            <input
              type="text"
              bind:value={editingFrom}
              class="w-full rounded-lg border border-surface-active bg-surface-hover px-3 py-2 text-sm text-accent focus:border-brand focus:outline-none"
            />
          </label>

          <div class="flex flex-col gap-2">
            <span class="font-mono text-[10px] uppercase tracking-wider text-accent-dim">Mark</span>
            <div class="grid grid-cols-2 gap-2">
              <button onclick={() => editingAction = 'archive'} class="rounded-lg border px-3 py-2 font-mono text-[10px] uppercase transition-all {editingAction === 'archive' ? 'border-brand bg-brand text-base' : 'border-surface-active bg-surface-hover text-accent-dim hover:text-accent'}">Archive</button>
              <button onclick={() => editingAction = 'trash'} class="rounded-lg border px-3 py-2 font-mono text-[10px] uppercase transition-all {editingAction === 'trash' ? 'border-danger bg-danger text-white' : 'border-surface-active bg-surface-hover text-accent-dim hover:text-accent'}">Delete</button>
            </div>
          </div>

          <div class="flex justify-between gap-2 pt-2">
            <button onclick={closeMarkedItemEditor} class="px-3 py-2 rounded-lg bg-surface-active text-accent-dim hover:text-accent font-mono text-[10px] uppercase">Cancel</button>
            <button onclick={saveMarkedItem} disabled={!editingFrom.trim()} class="px-4 py-2 rounded-lg bg-brand text-base font-mono text-[10px] font-bold uppercase disabled:opacity-30">Save</button>
          </div>
        </div>
      </div>
    </div>
  {/if}

  <Agentation endpoint="http://localhost:4747" />
</main>
