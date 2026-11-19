import "@fontsource-variable/archivo/wdth.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "./ui/tokens.css";
import "./ui/app.css";
import { App } from "./app";

const root = document.getElementById("app");
if (root) {
  const app = new App(root);
  // Dev builds only: lets the e2e test and debugging read game state.
  if (import.meta.env.DEV) (window as unknown as { __game: App }).__game = app;
}
