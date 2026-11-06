export function compactDescription(description: string): string {
    return description.replace(/\b[0-9a-f]{16,}\b/gi, id => id.slice(0, 8));
}
