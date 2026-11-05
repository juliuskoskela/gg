import "./global.css";
import { mount } from 'svelte';
let { default: App } = await (new URLSearchParams(location.search).has("design-system")
  ? import("./design/DesignSystem.svelte")
  : import("./App.svelte"));

let app = mount(App, {
  target: document.getElementById("app")!,
});

export default app;
