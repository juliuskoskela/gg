let assets = import.meta.glob<string>("../assets/material-file-icons/*.svg", { eager: true, query: "?url", import: "default" });

let names: Record<string, string> = {
    "cargo.lock": "lock", "package-lock.json": "lock", "npm-shrinkwrap.json": "lock", "yarn.lock": "lock", "pnpm-lock.yaml": "lock", "bun.lock": "lock", "bun.lockb": "lock",
    "package.json": "nodejs", ".npmrc": "npm", ".npmignore": "npm",
    ".gitignore": "git", ".gitattributes": "git", ".gitmodules": "git", ".gitconfig": "git",
    "dockerfile": "docker", "containerfile": "docker", ".dockerignore": "docker",
    ".editorconfig": "settings", ".prettierrc": "settings", ".eslintrc": "settings", "license": "document", "licence": "document",
};
let extensions: Record<string, string> = {
    svelte: "svelte", ts: "typescript", mts: "typescript", cts: "typescript", tsx: "react_ts",
    js: "javascript", mjs: "javascript", cjs: "javascript", jsx: "react", rs: "rust", json: "json", jsonc: "json", toml: "toml", md: "markdown", mdx: "markdown", markdown: "markdown",
    css: "css", scss: "css", sass: "css", less: "css", html: "html", htm: "html", svg: "image", png: "image", jpg: "image", jpeg: "image", gif: "image", webp: "image", avif: "image", ico: "image", bmp: "image",
    sh: "console", bash: "console", zsh: "console", fish: "console", ps1: "console", bat: "console", cmd: "console", yaml: "yaml", yml: "yaml", ini: "settings", conf: "settings", cfg: "settings", lock: "lock",
};

export function fileIconName(path: string): string {
    let name = path.replaceAll("\\", "/").split("/").at(-1)?.toLowerCase() ?? "";
    if (names[name]) return names[name];
    if (/^(?:dockerfile|containerfile)\./.test(name)) return "docker";
    if (/^(?:tsconfig|jsconfig)(?:\.[^.]+)?\.json$/.test(name)) return "settings";
    if (/^(?:eslint|prettier|vite|vitest|svelte|webpack|rollup)\.config\./.test(name)) return "settings";
    return extensions[name.split(".").at(-1) ?? ""] ?? "document";
}

export function fileIconUrl(path: string): string {
    return assets[`../assets/material-file-icons/${fileIconName(path)}.svg`];
}
