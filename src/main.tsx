import ReactDOM from "react-dom/client";
import "./polyfills";

const rootElement = document.getElementById("root") as HTMLElement;

function formatError(error: unknown) {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}\n${error.stack ?? ""}`;
  }

  return String(error);
}

function renderBootError(error: unknown) {
  rootElement.innerHTML = "";
  const container = document.createElement("main");
  container.style.cssText =
    "min-height:100vh;padding:32px;font:14px/1.5 ui-sans-serif,system-ui;color:#172026;background:#f8fafc;";
  const title = document.createElement("h1");
  title.textContent = "PDFLeaf 启动失败";
  title.style.cssText = "margin:0 0 12px;font-size:22px;";
  const detail = document.createElement("pre");
  detail.textContent = formatError(error);
  detail.style.cssText =
    "white-space:pre-wrap;overflow:auto;padding:16px;border:1px solid #d0d7de;border-radius:6px;background:#fff;color:#b42318;";
  container.append(title, detail);
  rootElement.append(container);
}

window.addEventListener("error", (event) => {
  renderBootError(event.error ?? event.message);
});

window.addEventListener("unhandledrejection", (event) => {
  renderBootError(event.reason);
});

void import("./App")
  .then(({ default: App }) => {
    ReactDOM.createRoot(rootElement).render(<App />);
  })
  .catch(renderBootError);
