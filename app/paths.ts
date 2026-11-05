export function shortFilename(path: string): string {
    let name = path.split("/").at(-1) ?? path;
    return name.length > 32 ? `${name.slice(0, 13)}…${name.slice(-18)}` : name;
}
