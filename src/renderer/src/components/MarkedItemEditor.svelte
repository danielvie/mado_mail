<script lang="ts">
  import type { MarkAction } from '../types';

  let {
    from,
    action,
    onFromChange,
    onActionChange,
    onCancel,
    onSave
  }: {
    from: string;
    action: MarkAction;
    onFromChange: (value: string) => void;
    onActionChange: (value: MarkAction) => void;
    onCancel: () => void;
    onSave: () => void;
  } = $props();
</script>

<div class="fixed inset-0 z-50 bg-base/60 flex items-center justify-center p-4" onclick={onCancel}>
  <div class="w-full max-w-md rounded-xl border border-surface-active bg-surface shadow-2xl" onclick={(e) => e.stopPropagation()}>
    <div class="border-b border-surface-active px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-accent-dim">
      Marked Item
    </div>
    <div class="p-4 flex flex-col gap-4">
      <label class="flex flex-col gap-2">
        <span class="font-mono text-[10px] uppercase tracking-wider text-accent-dim">From</span>
        <input
          type="text"
          value={from}
          oninput={(event) => onFromChange(event.currentTarget.value)}
          class="w-full rounded-lg border border-surface-active bg-surface-hover px-3 py-2 text-sm text-accent focus:border-brand focus:outline-none"
        />
      </label>

      <div class="flex flex-col gap-2">
        <span class="font-mono text-[10px] uppercase tracking-wider text-accent-dim">Mark</span>
        <div class="grid grid-cols-2 gap-2">
          <button onclick={() => onActionChange('archive')} class="rounded-lg border px-3 py-2 font-mono text-[10px] uppercase transition-all {action === 'archive' ? 'border-brand bg-brand text-base' : 'border-surface-active bg-surface-hover text-accent-dim hover:text-accent'}">Archive</button>
          <button onclick={() => onActionChange('trash')} class="rounded-lg border px-3 py-2 font-mono text-[10px] uppercase transition-all {action === 'trash' ? 'border-danger bg-danger text-white' : 'border-surface-active bg-surface-hover text-accent-dim hover:text-accent'}">Delete</button>
        </div>
      </div>

      <div class="flex justify-between gap-2 pt-2">
        <button onclick={onCancel} class="px-3 py-2 rounded-lg bg-surface-active text-accent-dim hover:text-accent font-mono text-[10px] uppercase">Cancel</button>
        <button onclick={onSave} disabled={!from.trim()} class="px-4 py-2 rounded-lg bg-brand text-base font-mono text-[10px] font-bold uppercase disabled:opacity-30">Save</button>
      </div>
    </div>
  </div>
</div>
