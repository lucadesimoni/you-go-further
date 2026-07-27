import { createRoot } from "react-dom/client";
import { createElement } from "react";
import App from "../App";
import { setApiBase } from "../src/api";

const base = new URLSearchParams(location.search).get("api");
if (base) setApiBase(base);

createRoot(document.getElementById("root")!).render(createElement(App));
