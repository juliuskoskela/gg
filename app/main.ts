import "./global.css";
import { mount } from 'svelte';
import { trackHairline } from "./hairline";

trackHairline();
let { default: App } = await (new URLSearchParams(location.search).has("design-system")
  ? import("./design/DesignSystem.svelte")
  : import("./App.svelte"));

let app = mount(App, {
  target: document.getElementById("app")!,
});

export default app;
