// Saves a generated file. In a normal browser this triggers a download.
// When running as a published Claude page, the page asks the viewer to confirm the save.

export async function saveFile(filename: string, data: Blob | string): Promise<'saved' | 'declined' | 'failed'> {
  const blob = typeof data === 'string' ? new Blob([data], { type: guessType(filename) }) : data;
  if (typeof window.claude?.use === 'function') {
    try {
      const dl = (await window.claude.use('downloads')) as { save(r: { filename: string; data: Blob }): Promise<unknown> } | null;
      if (dl) {
        await dl.save({ filename, data: blob });
        return 'saved';
      }
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code === 'declined') return 'declined';
      return 'failed';
    }
  }
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return 'saved';
  } catch {
    return 'failed';
  }
}

function guessType(name: string) {
  if (name.endsWith('.csv')) return 'text/csv;charset=utf-8';
  if (name.endsWith('.json')) return 'application/json';
  return 'text/plain';
}

export function safeFileName(s: string) {
  return s.replace(/[^\w\- ]+/g, '').replace(/\s+/g, ' ').trim().replace(/ /g, '_').slice(0, 80) || 'export';
}
