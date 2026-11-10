/** 12 KB, 14.2 MB; binary units, one decimal only when it says something */
export function formatSize(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes < 1024) return `${Math.max(0, Math.round(bytes || 0))} ${bytes === 1 ? "byte" : "bytes"}`;
    let units = ["KB", "MB", "GB", "TB"];
    let value = bytes / 1024;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
    return `${Number(value.toFixed(1))} ${units[unit]}`;
}
