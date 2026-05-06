<script lang="ts">
  import type { MarkedItem } from '../types';

  let {
    markedItems,
    onEdit,
    onDelete
  }: {
    markedItems: MarkedItem[];
    onEdit: (item: MarkedItem) => void;
    onDelete: (id: string) => void;
  } = $props();
</script>

<div class="grid grid-cols-[1fr_140px_120px] gap-0 border-b border-surface-active bg-surface-active/30 font-mono text-[10px] text-accent-dim uppercase tracking-widest shrink-0">
  <div class="p-3 truncate">FROM MATCH</div>
  <div class="p-3">MARK</div>
  <div class="p-3 text-right">ACTION</div>
</div>

<div class="flex-1 overflow-y-auto overflow-x-hidden relative">
  {#if markedItems.length === 0}
    <div class="absolute inset-0 flex items-center justify-center text-accent-dim font-mono text-[10px]">NO_MARKED_ITEMS</div>
  {:else}
    {#each markedItems as item (item.id)}
      <div class="grid grid-cols-[1fr_140px_120px] gap-0 border-b border-surface-active text-sm hover:bg-surface-hover/50">
        <div class="p-3 truncate text-accent/90">{item.from}</div>
        <div class="p-3 font-mono text-[11px] uppercase {item.action === 'archive' ? 'text-brand' : 'text-danger'}">{item.action === 'archive' ? 'Archive' : 'Delete'}</div>
        <div class="p-2 flex justify-end gap-2">
          <button onclick={() => onEdit(item)} class="px-2 py-1 rounded bg-surface-active text-accent-dim hover:text-accent font-mono text-[10px] uppercase">Edit</button>
          <button onclick={() => onDelete(item.id)} class="px-2 py-1 rounded bg-danger/10 text-danger hover:bg-danger/20 font-mono text-[10px] uppercase">Drop</button>
        </div>
      </div>
    {/each}
  {/if}
</div>
