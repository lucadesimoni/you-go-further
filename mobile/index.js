import { registerRootComponent } from "expo";
import App from "./App";

// Expo entry point (kept as plain JS so the TS project stays free of the
// expo runtime types — App.tsx and src/* only depend on react/react-native).
registerRootComponent(App);
