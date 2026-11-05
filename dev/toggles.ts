import "../app/global.css";
import { mount } from "svelte";
import TogglesCanvas from "./TogglesCanvas.svelte";

mount(TogglesCanvas, { target: document.getElementById("app")! });
