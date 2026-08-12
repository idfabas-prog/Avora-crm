export function sourceFingerprint(rows: unknown[]) {
  return JSON.stringify(rows.map((row) => {
    if (row && typeof row === "object") {
      const record = row as Record<string, unknown>;
      return { id: record.id, updated_at: record.updated_at, created_at: record.created_at };
    }
    return row;
  })).slice(0, 500);
}

export function protectUntrustedText(text: string) {
  return `<untrusted-crm-text>${text}</untrusted-crm-text>`;
}
