// theme tokens are defined on #shell, so component tests render inside one
export function mountShell(width = 480): HTMLDivElement {
    document.getElementById("shell")?.remove();
    let shell = document.createElement("div");
    shell.id = "shell";
    shell.style.cssText = `width: ${width}px; background: var(--surface); color: var(--text)`;
    document.body.append(shell);
    return shell;
}
