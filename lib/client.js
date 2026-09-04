window.__ModuleLoader__.load({ id: "@Tinnikx/dsh-operation-improve", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.js
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject,
  name: () => name,
  selection: () => selection
});
module.exports = __toCommonJS(index_exports);

// src/shared/selection-store.js
function createSelectionStore() {
  let kind = null;
  let ids = /* @__PURE__ */ new Set();
  const listeners = /* @__PURE__ */ new Set();
  const emit = () => {
    for (const listener of [...listeners]) listener();
  };
  const normalize = () => {
    if (ids.size === 0) kind = null;
  };
  return {
    getKind: () => kind,
    getIds: () => [...ids],
    has: (k, id) => kind === k && ids.has(id),
    size: () => ids.size,
    toggle(k, id) {
      if (kind !== k) {
        kind = k;
        ids = /* @__PURE__ */ new Set([id]);
        emit();
        return;
      }
      if (ids.has(id)) ids.delete(id);
      else ids.add(id);
      normalize();
      emit();
    },
    set(k, nextIds) {
      kind = nextIds.length > 0 ? k : null;
      ids = new Set(nextIds);
      emit();
    },
    clear() {
      if (ids.size === 0 && kind === null) return;
      kind = null;
      ids = /* @__PURE__ */ new Set();
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      let done = false;
      return () => {
        if (done) return;
        done = true;
        listeners.delete(listener);
      };
    }
  };
}

// src/shared/context-menu.js
var ROOT_CLASS = "dsh-oi-menu";
var OWNER_ATTR = "data-dsh-oi-owner";
var activeClose = null;
function openContextMenu(options) {
  closeContextMenu();
  const { x, y, items, onSelect, onClose, owner } = options;
  const anchor = options.anchor ?? null;
  const root = document.createElement("div");
  root.className = ROOT_CLASS;
  root.setAttribute("role", "menu");
  if (owner !== void 0) root.setAttribute(OWNER_ATTR, owner);
  root.style.left = "0px";
  root.style.top = "0px";
  for (const item of items) {
    if (item.separator === true) {
      const hr = document.createElement("div");
      hr.className = `${ROOT_CLASS}__sep`;
      root.append(hr);
      continue;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = `${ROOT_CLASS}__item`;
    button.setAttribute("role", "menuitem");
    if (item.icon !== void 0) {
      const icon = document.createElement("span");
      icon.className = `${ROOT_CLASS}__icon`;
      icon.innerHTML = item.icon;
      button.append(icon);
    }
    const label = document.createElement("span");
    label.className = `${ROOT_CLASS}__label`;
    label.textContent = item.label ?? item.id ?? "";
    button.append(label);
    if (item.danger === true) button.dataset.danger = "";
    if (item.disabled === true) button.disabled = true;
    button.addEventListener("click", () => {
      const id = item.id;
      close();
      if (id !== void 0 && onSelect !== void 0) onSelect(id);
    });
    root.append(button);
  }
  document.body.append(root);
  place(root, x, y);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    activeClose = null;
    window.removeEventListener("pointerdown", onPointerDown, true);
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("scroll", onScroll, true);
    window.removeEventListener("blur", close);
    window.removeEventListener("resize", close);
    root.remove();
    if (onClose !== void 0) onClose();
  };
  const onPointerDown = (event) => {
    if (event.target instanceof Node && root.contains(event.target)) return;
    close();
  };
  const onKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  };
  const onScroll = (event) => {
    if (anchor === null) {
      close();
      return;
    }
    const target = event.target;
    if (target === document || target === document.documentElement || target === document.body) {
      close();
      return;
    }
    if (target instanceof Element && target.contains(anchor)) close();
  };
  window.addEventListener("pointerdown", onPointerDown, true);
  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("scroll", onScroll, true);
  window.addEventListener("blur", close);
  window.addEventListener("resize", close);
  activeClose = close;
  return close;
}
function closeContextMenu() {
  if (activeClose !== null) activeClose();
}
function place(root, x, y) {
  const rect = root.getBoundingClientRect();
  const margin = 8;
  let left = x;
  let top = y;
  if (left + rect.width + margin > window.innerWidth) left = Math.max(margin, x - rect.width);
  if (top + rect.height + margin > window.innerHeight) top = Math.max(margin, y - rect.height);
  root.style.left = `${left}px`;
  root.style.top = `${top}px`;
}
var MENU_CSS = `
.${ROOT_CLASS} {
  /* \u6D6E\u5C42\u5E95\u8272\u53EA\u80FD\u53D6 surface token\u3002--dsw-alias-bg-base \u662F\u9875\u9762\u5E95\u8272\uFF0C\u81EA\u5B9A\u4E49\u4E3B\u9898\u4F1A\u7ED9\u5B83
     alpha\uFF08\u5B9E\u6D4B\u67D0\u4E3B\u9898\u4E3A 0.58\uFF09\u597D\u8BA9\u58C1\u7EB8\u900F\u4E0A\u6765\uFF0C\u83DC\u5355\u7ED1\u5B83\u5C31\u7B49\u4E8E\u8DDF\u7740\u4E00\u8D77\u900F\u3002 */
  --dsw-oi-surface: var(--dsw-specific-menu, var(--dsw-alias-bg-layer-3, #2c2c2e));
  box-sizing: border-box;
  position: fixed;
  z-index: 2147483000;
  display: flex;
  flex-direction: column;
  min-width: 218px;
  max-width: 360px;
  padding: 4px;
  border-radius: 12px;
  border: 1px solid var(--dsw-alias-border-inverted, rgba(128,128,128,0.3));
  /* \u4E24\u5C42\uFF1A\u4E3B\u9898\u8272\u753B\u5728 background-image \u4E0A\uFF0C\u57AB\u5728\u5B83\u4E0B\u9762\u7684 background-color \u662F\u540C\u65CF\u7684\u53E6\u4E00\u4E2A
     surface\u3002\u4E3B\u9898\u771F\u628A --dsw-specific-menu \u5B9A\u6210\u534A\u900F\u660E\u65F6\uFF0C\u5408\u6210\u7ED3\u679C\u4ECD\u6BD4\u9875\u9762\u5E95\u8272\u5B9E\u3002 */
  background-color: var(--dsw-alias-bg-layer-1, #2c2c2e);
  background-image: linear-gradient(var(--dsw-oi-surface), var(--dsw-oi-surface));
  box-shadow: var(--dsw-shadow-lv3, 0 8px 24px rgba(0, 0, 0, 0.28));
  color: var(--dsw-alias-label-primary, inherit);
  pointer-events: auto;
  user-select: none;
}
.${ROOT_CLASS}__item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 40px;
  padding: 8px 10px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--dsw-alias-label-primary, inherit);
  font-size: 14px;
  line-height: 22px;
  text-align: left;
  cursor: pointer;
}
.${ROOT_CLASS}__item:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.18)); }
.${ROOT_CLASS}__item:disabled { opacity: 0.4; cursor: not-allowed; }
.${ROOT_CLASS}__item[data-danger] { color: var(--dsw-alias-state-error-primary, #e5484d); }
.${ROOT_CLASS}__item[data-danger]:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover-danger, rgba(229, 72, 77, 0.16)); }
.${ROOT_CLASS}__icon {
  display: inline-flex;
  flex: none;
  width: 16px;
  height: 16px;
  align-items: center;
  justify-content: center;
  color: var(--dsw-alias-label-tertiary, inherit);
}
.${ROOT_CLASS}__item[data-danger] .${ROOT_CLASS}__icon { color: var(--dsw-alias-state-error-primary, #e5484d); }
.${ROOT_CLASS}__label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.${ROOT_CLASS}__sep {
  height: 1px;
  margin: 4px 2px;
  background: var(--dsw-alias-border-l1, rgba(128,128,128,0.25));
}
[data-dsh-oi-selected] {
  background: var(--dsw-alias-bg-multi-select, rgba(77, 107, 254, 0.22)) !important;
  border-radius: 6px;
}
`;

// src/shared/locale.js
var UPSTREAM_NS = "workspace";
var COMMON_NS = "common";
var OWN_NS = "@Tinnikx/dsh-operation-improve";
var zh = {
  "batch.deleteWorkspaces": "\u5220\u9664 {n} \u4E2A\u5DE5\u4F5C\u533A",
  "batch.archiveSessions": "\u5F52\u6863 {n} \u4E2A\u4F1A\u8BDD",
  "confirm.deleteWorkspaces": "\u5220\u9664 {n} \u4E2A\u5DE5\u4F5C\u533A\uFF1F\u5176\u4F1A\u8BDD\u5C06\u663E\u793A\u5728\u201C{group}\u201D\u4E0B\u3002",
  "confirm.archiveSessions": "\u5F52\u6863 {n} \u4E2A\u4F1A\u8BDD\uFF1F",
  "selection.paste": "\u7C98\u8D34",
  "settings.title": "Harness \u9AD8\u7EA7\u914D\u7F6E",
  "settings.subtitle": "\u538B\u7F29\u3001\u88C1\u526A\u3001\u5DE5\u5177\u4E0A\u9650\u7B49\u53EA\u80FD\u624B\u6539\u914D\u7F6E\u6587\u4EF6\u7684\u9879\u76EE",
  "settings.loading": "\u6B63\u5728\u8BFB\u53D6\u5F53\u524D\u914D\u7F6E\u2026",
  "settings.file": "\u5199\u5165 {path}",
  "settings.keep": "\u6539\u5B8C\u79BB\u5F00\u8F93\u5165\u6846\u5373\u81EA\u52A8\u4FDD\u5B58\uFF0C\u65E0\u9700\u91CD\u542F\uFF1B\u672A\u8BBE\u7F6E\u7684\u9879\u76EE\u8D70 harness \u9ED8\u8BA4\uFF08\u6574\u884C\u7070\u663E\uFF09\uFF0C\u79FB\u9664\u672C\u63D2\u4EF6\u4E0D\u4F1A\u6E05\u7A7A\u5DF2\u5199\u4E0B\u7684\u914D\u7F6E\u3002",
  "settings.absent": "\u8FD9\u4E2A\u63D2\u4EF6\u4E0D\u5728\u5F53\u524D profile \u7684\u7EC4\u5408\u91CC\uFF0C\u65E0\u6CD5\u914D\u7F6E\u3002",
  "settings.defaultHint": "\u9ED8\u8BA4 {value}",
  "settings.clear": "\u6E05\u9664",
  "settings.saving": "\u4FDD\u5B58\u4E2D\u2026",
  "settings.saved": "\u5DF2\u4FDD\u5B58\uFF0C\u65E0\u9700\u91CD\u542F",
  "settings.dirty": "{n} \u9879\u5F85\u4FDD\u5B58",
  "settings.source.panel": "\u672C\u9762\u677F",
  "settings.source.manual": "\u624B\u5199",
  "settings.source.bundle": "\u7EC4\u5408\u9ED8\u8BA4",
  "settings.source.system": "\u7CFB\u7EDF\u9ED8\u8BA4"
};
var en = {
  "batch.deleteWorkspaces": "Delete {n} workspaces",
  "batch.archiveSessions": "Archive {n} sessions",
  "confirm.deleteWorkspaces": "Delete {n} workspaces? Their sessions will appear under {group}.",
  "confirm.archiveSessions": "Archive {n} sessions?",
  "selection.paste": "Paste",
  "settings.title": "Harness advanced configuration",
  "settings.subtitle": "Compaction, pruning and tool limits \u2014 settings that otherwise need a hand-edited config file",
  "settings.loading": "Reading the current configuration\u2026",
  "settings.file": "Written to {path}",
  "settings.keep": "Edits save themselves when the field loses focus, no restart needed. Unset fields are dimmed and fall back to the harness defaults; removing this plugin does not clear what you wrote.",
  "settings.absent": "This plugin is not part of the current profile composition.",
  "settings.defaultHint": "default {value}",
  "settings.clear": "Clear",
  "settings.saving": "Saving\u2026",
  "settings.saved": "Saved, no restart needed",
  "settings.dirty": "{n} pending",
  "settings.source.panel": "this panel",
  "settings.source.manual": "hand-written",
  "settings.source.bundle": "composition",
  "settings.source.system": "harness default"
};
function installLocale(ctx) {
  const disposeDict = ctx.locale.register(OWN_NS, { zh, en });
  const upstream = ctx.locale.bind(UPSTREAM_NS);
  const common = ctx.locale.bind(COMMON_NS);
  const tOwn = ctx.locale.bind(OWN_NS);
  const warned2 = /* @__PURE__ */ new Set();
  const guard = (ns, bound) => (key, params) => {
    const text = bound(key, params);
    if (text === key && !warned2.has(`${ns}:${key}`)) {
      warned2.add(`${ns}:${key}`);
      console.warn(
        `[@Tinnikx/dsh-operation-improve] \u4E0A\u6E38\u8BCD\u5178 "${ns}" \u91CC\u6CA1\u6709\u952E "${key}"\uFF0C\u83DC\u5355\u4F1A\u628A\u8FD9\u4E2A\u952E\u540D\u672C\u8EAB\u663E\u793A\u51FA\u6765`
      );
    }
    return text;
  };
  let disposed = false;
  return {
    t: guard(UPSTREAM_NS, upstream),
    tCommon: guard(COMMON_NS, common),
    tOwn,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      disposeDict();
    }
  };
}

// src/shared/row-probe.js
function rowKind(el) {
  const cls = el.className;
  const name2 = typeof cls === "string" ? cls : "";
  if (name2.includes("_sessionRow") || name2.includes("_searchResultRow")) return "session";
  if (name2.includes("_projectRow")) return "workspace";
  return null;
}
function closestRow(target) {
  if (!(target instanceof Element)) return null;
  let node = target;
  while (node !== null) {
    const kind = rowKind(node);
    if (kind !== null && node instanceof HTMLElement) return { element: node, kind };
    node = node.parentElement;
  }
  return null;
}
function fiberOf(el) {
  for (const key of Object.keys(el)) {
    if (key.startsWith("__reactFiber$")) return (
      /** @type {any} */
      el[key]
    );
  }
  return null;
}
function rowId(el, kind) {
  let fiber = fiberOf(el);
  let depth = 0;
  while (fiber !== null && fiber !== void 0 && depth < 24) {
    const id = idFromProps(fiber.memoizedProps, kind);
    if (id !== null) return id;
    fiber = fiber.return;
    depth += 1;
  }
  return null;
}
function idFromProps(props, kind) {
  if (props === null || typeof props !== "object") return null;
  const candidates = kind === "session" ? [props.sessionId, props.node?.id, props.row?.id, props.item?.id, props.session?.id] : [props.workspaceId, props.group?.workspaceId, props.workspace?.id, props.node?.workspaceId, props.project?.id];
  for (const value of candidates) {
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}
function rowTitle(el, kind) {
  let fiber = fiberOf(el);
  let depth = 0;
  while (fiber !== null && fiber !== void 0 && depth < 24) {
    const props = fiber.memoizedProps;
    if (props !== null && typeof props === "object") {
      const candidates = kind === "session" ? [props.node?.title, props.row?.title, props.session?.title] : [props.group?.label, props.workspace?.title, props.node?.label];
      for (const value of candidates) {
        if (typeof value === "string" && value.length > 0) return value;
      }
    }
    fiber = fiber.return;
    depth += 1;
  }
  const span = el.querySelector('[class*="_title"]');
  return span === null ? "" : (span.textContent ?? "").trim();
}
function allRows(scope) {
  return [...scope.querySelectorAll('[role="treeitem"], [class*="_searchResultRow"]')].filter((el) => el instanceof HTMLElement && rowKind(el) !== null);
}

// src/multi-select/index.js
function installMultiSelect(deps) {
  const { store } = deps;
  const onClick = (event) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    const row = closestRow(event.target);
    if (row === null) return;
    const id = rowId(row.element, row.kind);
    if (id === null) return;
    event.preventDefault();
    event.stopPropagation();
    store.toggle(row.kind, id);
  };
  const onPlainClick = (event) => {
    if (event.ctrlKey || event.metaKey || event.button !== 0) return;
    if (store.size() === 0) return;
    const row = closestRow(event.target);
    if (row === null) return;
    store.clear();
  };
  document.addEventListener("click", onClick, true);
  document.addEventListener("click", onPlainClick, false);
  const unsubscribe = store.subscribe(() => paint(store));
  paint(store);
  const observer = new MutationObserver(() => {
    if (store.size() > 0) paint(store);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("click", onPlainClick, false);
    observer.disconnect();
    unsubscribe();
    store.clear();
    for (const el of allRows(document)) el.removeAttribute("data-dsh-oi-selected");
  };
}
function paint(store) {
  const kind = store.getKind();
  for (const el of allRows(document)) {
    const k = kind === null ? null : kind;
    const id = k === null ? null : rowId(
      el,
      /** @type {'session'|'workspace'} */
      k
    );
    const selected = id !== null && store.has(
      /** @type {any} */
      k,
      id
    );
    if (selected) el.setAttribute("data-dsh-oi-selected", "");
    else el.removeAttribute("data-dsh-oi-selected");
  }
}

// src/shared/menu-icons.js
var EDIT = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9.94076 1.34942C10.7047 0.90231 11.6503 0.902415 12.4143 1.34942C12.7061 1.52015 12.9688 1.79118 13.3104 2.13284C13.6521 2.47448 13.9231 2.73721 14.0939 3.02894C14.5408 3.79294 14.5409 4.73856 14.0939 5.50251C13.9231 5.79415 13.652 6.05704 13.3104 6.39861L6.65932 13.0497C6.28068 13.4284 6.00695 13.7108 5.66543 13.9097C5.32391 14.1085 4.94315 14.2074 4.42705 14.3498L3.24394 14.6761C2.77527 14.8054 2.34538 14.9262 2.00131 14.9684C1.65196 15.0112 1.17964 15.0013 0.810764 14.6325C0.441921 14.2637 0.432107 13.7913 0.47486 13.442C0.517035 13.0979 0.6379 12.668 0.767181 12.1993L1.09352 11.0162C1.23588 10.5001 1.33481 10.1193 1.5336 9.77784C1.7325 9.43632 2.0149 9.1626 2.39355 8.78395L9.04466 2.13284C9.38625 1.79126 9.64911 1.52016 9.94076 1.34942ZM15.5427 14.8398H7.55223L8.96707 13.425H15.5427V14.8398ZM3.39382 9.78422C2.965 10.213 2.84244 10.3436 2.75709 10.49C2.67183 10.6366 2.61862 10.8079 2.45733 11.3925L2.13099 12.5756C2.00183 13.0439 1.92194 13.3419 1.88863 13.5536C2.10041 13.5204 2.39872 13.4416 2.86764 13.3123L4.05075 12.9859C4.63544 12.8246 4.80669 12.7715 4.95323 12.6862C5.09968 12.6008 5.23022 12.4783 5.65905 12.0494L10.721 6.98644L8.45577 4.72121L3.39382 9.78422ZM11.7 2.57079C11.3774 2.38198 10.9777 2.38198 10.6551 2.57079C10.5602 2.62647 10.4487 2.72931 10.0449 3.13311L9.45604 3.72094L11.7213 5.98617L12.3102 5.39833C12.7139 4.99457 12.8168 4.88307 12.8725 4.78818C13.0613 4.46561 13.0612 4.06585 12.8725 3.74326C12.8169 3.64827 12.7146 3.53752 12.3102 3.13311C11.9057 2.72863 11.795 2.6264 11.7 2.57079Z" fill="currentColor"/></svg>';
var BRANCH = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M13.0762 1.37207C14.0846 1.37228 14.9021 2.19077 14.9023 3.19922C14.9022 4.20772 14.0847 5.02518 13.0762 5.02539C12.2967 5.02539 11.6325 4.53691 11.3701 3.84961H4.35547C4.79397 4.26458 5.15861 4.7644 5.41699 5.33496L7.10645 9.06738C7.88526 10.7875 9.55104 11.9228 11.4189 12.0371C11.7085 11.4109 12.3411 10.9756 13.0762 10.9756C14.0843 10.9759 14.9023 11.7936 14.9023 12.8018C14.9023 13.81 14.0843 14.6277 13.0762 14.6279C12.2534 14.6279 11.5574 14.0832 11.3291 13.335C8.9868 13.1879 6.89981 11.7612 5.92285 9.60352L4.23242 5.87109C3.67503 4.64033 2.44878 3.84961 1.09766 3.84961V2.54883C1.10665 2.54883 1.11601 2.54975 1.125 2.5498L11.3701 2.54883C11.6326 1.86151 12.2969 1.37207 13.0762 1.37207ZM13.0762 12.2764C12.7858 12.2764 12.5508 12.5114 12.5508 12.8018C12.5508 13.0921 12.7858 13.3281 13.0762 13.3281C13.3664 13.3279 13.6025 13.092 13.6025 12.8018C13.6025 12.5115 13.3664 12.2766 13.0762 12.2764ZM13.0762 2.67285C12.7855 2.67285 12.55 2.90861 12.5498 3.19922C12.5499 3.48987 12.7855 3.72559 13.0762 3.72559C13.3667 3.72538 13.6024 3.48975 13.6025 3.19922C13.6023 2.90874 13.3666 2.67306 13.0762 2.67285Z" fill="currentColor"/></svg>';
var ARCHIVE = '<svg width="16" height="16" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M15.8659 2.05975C17.2603 2.05995 18.3913 3.19096 18.3914 4.58527V5.4874C18.3914 6.02747 18.2192 6.52672 17.9303 6.93735C17.9336 6.96524 17.9388 6.99318 17.9388 7.02195V12.8884C17.9388 13.6345 17.9395 14.2379 17.8996 14.7254C17.8642 15.1593 17.7936 15.5499 17.6373 15.9141L17.5654 16.0685C17.278 16.6328 16.8405 17.1046 16.3038 17.434L16.0679 17.5661C15.66 17.7739 15.2196 17.8598 14.7237 17.9003C14.2362 17.9401 13.6327 17.9405 12.8867 17.9405H7.11122C6.36511 17.9405 5.76171 17.9401 5.27418 17.9003C4.84051 17.8649 4.44949 17.7952 4.08545 17.6391L3.93104 17.5661C3.36673 17.2785 2.89392 16.8414 2.56465 16.3044L2.43245 16.0685C2.22473 15.6608 2.13878 15.2211 2.09825 14.7254C2.05841 14.2379 2.05912 13.6345 2.05912 12.8884V7.02195C2.05912 6.99284 2.06422 6.96449 2.06758 6.93629C1.77931 6.52592 1.60858 6.02687 1.60858 5.4874V4.58527C1.60876 3.19084 2.73962 2.05975 4.1341 2.05975H15.8659ZM16.4984 7.92936C16.296 7.98169 16.0847 8.01288 15.8659 8.01291H4.1341C3.91478 8.01291 3.70246 7.98194 3.49955 7.92936V12.8884C3.49955 13.6582 3.50053 14.1927 3.53445 14.608C3.56769 15.0146 3.62923 15.244 3.71635 15.415L3.7925 15.5514C3.98339 15.8627 4.25749 16.1165 4.58464 16.2833L4.72529 16.3435C4.88095 16.3993 5.08638 16.4402 5.39158 16.4651C5.80685 16.4991 6.34138 16.5001 7.11122 16.5001H12.8867C13.6564 16.5001 14.1911 16.499 14.6063 16.4651C15.0128 16.432 15.2423 16.3703 15.4133 16.2833L15.5508 16.2061C15.8618 16.0152 16.116 15.7419 16.2827 15.415L16.3429 15.2732C16.3985 15.1177 16.4396 14.9128 16.4645 14.608C16.4985 14.1927 16.4984 13.6583 16.4984 12.8884V7.92936ZM4.1341 3.50019C3.53511 3.50019 3.0492 3.98631 3.04902 4.58527V5.4874C3.04902 6.08649 3.535 6.57248 4.1341 6.57248H15.8659C16.4648 6.57228 16.951 6.08638 16.951 5.4874V4.58527C16.9509 3.98644 16.4647 3.50038 15.8659 3.50019H4.1341Z" fill="currentColor"/><path d="M12.7962 12.5661V11.0832H7.20548V12.5661L12.7962 12.5661Z" fill="currentColor"/></svg>';
var TRASH = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14.4782 4.84067L14.2138 10.1152C14.1102 12.1872 14.067 13.0115 13.3866 13.9607C13.1044 14.3546 12.7498 14.6912 12.3424 14.9535C11.8239 15.2872 11.2415 15.4316 10.5585 15.4998C9.88727 15.5668 9.04946 15.5656 7.99998 15.5656C6.95051 15.5656 6.1127 15.5668 5.44142 15.4998C4.75851 15.4316 4.17602 15.2872 3.65753 14.9535C3.25012 14.6912 2.89559 14.3546 2.61332 13.9607C1.93296 13.0115 1.88979 12.1872 1.78619 10.1152L1.52179 4.84067L2.89006 4.77277L3.15343 10.0463C3.26221 12.2218 3.32452 12.6015 3.72646 13.1624C3.90825 13.4161 4.13686 13.6334 4.39927 13.8023C4.66204 13.9714 5.00263 14.0792 5.57825 14.1367C6.16562 14.1953 6.92298 14.1963 7.99998 14.1963C9.07699 14.1963 9.83434 14.1953 10.4217 14.1367C10.9973 14.0792 11.3379 13.9714 11.6007 13.8023C11.8631 13.6334 12.0917 13.4161 12.2735 13.1624C12.6755 12.6015 12.7378 12.2218 12.8465 10.0463L13.1099 4.77277L14.4782 4.84067ZM5.43011 6.22849H6.7994V11.3909H5.43011V6.22849ZM9.20056 6.22849H10.5699V11.3909H9.20056V6.22849ZM8.53597 0.434431C9.17976 0.434431 9.6522 0.426926 10.0966 0.571258C10.2357 0.616451 10.3717 0.672554 10.502 0.738948C10.9182 0.951107 11.2464 1.29099 11.7015 1.74612L12.4978 2.54136H15.3742V3.91169H0.625732V2.54136H3.50218L4.29845 1.74612C4.75358 1.29099 5.08174 0.951107 5.49801 0.738948C5.62831 0.672554 5.76425 0.616451 5.90334 0.571258C6.34776 0.426926 6.82021 0.434431 7.46399 0.434431H8.53597ZM7.46399 1.80476C6.73208 1.80476 6.51641 1.81187 6.32617 1.87369C6.25545 1.89667 6.18668 1.92533 6.12041 1.95907C5.96398 2.03878 5.82348 2.16253 5.44142 2.54136H10.5585C10.1765 2.16253 10.036 2.03878 9.87955 1.95907C9.81329 1.92533 9.74452 1.89667 9.6738 1.87369C9.48356 1.81187 9.26789 1.80476 8.53597 1.80476H7.46399Z" fill="currentColor"/></svg>';
var COPY = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6.14929 4.02032C7.11197 4.02032 7.87983 4.02016 8.49597 4.07598C9.12128 4.13269 9.65792 4.25188 10.1415 4.53106C10.7202 4.8653 11.2008 5.3459 11.535 5.92462C11.8142 6.40818 11.9334 6.94481 11.9901 7.57012C12.0459 8.18625 12.0458 8.95419 12.0458 9.9168C12.0458 10.8795 12.0459 11.6473 11.9901 12.2635C11.9334 12.8888 11.8142 13.4254 11.535 13.909C11.2008 14.4877 10.7202 14.9683 10.1415 15.3025C9.65792 15.5817 9.12128 15.7009 8.49597 15.7576C7.87984 15.8134 7.11196 15.8133 6.14929 15.8133C5.18667 15.8133 4.41874 15.8134 3.80261 15.7576C3.1773 15.7009 2.64067 15.5817 2.1571 15.3025C1.5784 14.9683 1.09778 14.4877 0.76355 13.909C0.484366 13.4254 0.365184 12.8888 0.308472 12.2635C0.252649 11.6473 0.252808 10.8795 0.252808 9.9168C0.252808 8.95418 0.252664 8.18625 0.308472 7.57012C0.365184 6.94481 0.484366 6.40818 0.76355 5.92462C1.09777 5.34589 1.57839 4.86529 2.1571 4.53106C2.64067 4.25188 3.1773 4.13269 3.80261 4.07598C4.41874 4.02017 5.18666 4.02032 6.14929 4.02032ZM6.14929 5.37774C5.16181 5.37774 4.46634 5.37761 3.92566 5.42657C3.39434 5.47472 3.07859 5.56574 2.83582 5.70587C2.4632 5.92106 2.15354 6.2307 1.93835 6.60333C1.79823 6.8461 1.70721 7.16185 1.65906 7.69317C1.6101 8.23385 1.61023 8.92933 1.61023 9.9168C1.61023 10.9043 1.61009 11.5998 1.65906 12.1404C1.70721 12.6717 1.79823 12.9875 1.93835 13.2303C2.15356 13.6029 2.46321 13.9126 2.83582 14.1277C3.07859 14.2679 3.39434 14.3589 3.92566 14.407C4.46634 14.456 5.16182 14.4559 6.14929 14.4559C7.13682 14.4559 7.83224 14.456 8.37292 14.407C8.90425 14.3589 9.21999 14.2679 9.46277 14.1277C9.83535 13.9126 10.145 13.6029 10.3602 13.2303C10.5004 12.9875 10.5914 12.6717 10.6395 12.1404C10.6885 11.5998 10.6884 10.9043 10.6884 9.9168C10.6884 8.92934 10.6885 8.23384 10.6395 7.69317C10.5914 7.16185 10.5004 6.8461 10.3602 6.60333C10.1451 6.23071 9.83536 5.92107 9.46277 5.70587C9.21999 5.56574 8.90424 5.47472 8.37292 5.42657C7.83224 5.3776 7.13682 5.37774 6.14929 5.37774ZM9.80164 0.367975C10.7638 0.367975 11.5314 0.36788 12.1473 0.423639C12.7726 0.480307 13.3093 0.598759 13.7928 0.877741C14.3717 1.21192 14.8521 1.69355 15.1864 2.27227C15.4655 2.75574 15.5857 3.29164 15.6425 3.9168C15.6983 4.53301 15.6971 5.3016 15.6971 6.26446V7.82989C15.6971 8.29264 15.6989 8.58993 15.6649 8.84844C15.4668 10.3525 14.401 11.5738 12.9833 11.9988V10.5467C13.6973 10.1903 14.2105 9.49662 14.3192 8.67169C14.3387 8.52347 14.3407 8.3358 14.3407 7.82989V6.26446C14.3407 5.27706 14.3398 4.58149 14.2909 4.04083C14.2428 3.50968 14.1526 3.19372 14.0126 2.95098C13.7974 2.57849 13.4876 2.26869 13.1151 2.05352C12.8724 1.91347 12.5564 1.82237 12.0253 1.77423C11.4847 1.72528 10.7888 1.7254 9.80164 1.7254H7.71472C6.7562 1.72558 5.92665 2.27697 5.52332 3.07891H4.07019C4.54221 1.51132 5.9932 0.368186 7.71472 0.367975H9.80164Z" fill="currentColor"/></svg>';
var PASTE = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M4.3 2.6H11.7A2.6 2.6 0 0 1 14.3 5.2V12.8A2.6 2.6 0 0 1 11.7 15.4H4.3A2.6 2.6 0 0 1 1.7 12.8V5.2A2.6 2.6 0 0 1 4.3 2.6ZM4.3 3.957H11.7A1.243 1.243 0 0 1 12.943 5.2V12.8A1.243 1.243 0 0 1 11.7 14.043H4.3A1.243 1.243 0 0 1 3.057 12.8V5.2A1.243 1.243 0 0 1 4.3 3.957Z" fill="currentColor"/><path d="M6.2 0.6H9.8A1.2 1.2 0 0 1 11 1.8V3A1.2 1.2 0 0 1 9.8 4.2H6.2A1.2 1.2 0 0 1 5 3V1.8A1.2 1.2 0 0 1 6.2 0.6Z" fill="currentColor"/></svg>';
var MENU_ICONS = { edit: EDIT, branch: BRANCH, archive: ARCHIVE, trash: TRASH, copy: COPY, paste: PASTE };

// src/context-menu-feature/index.js
function installContextMenu(deps) {
  const { store, workspaces, sessions, owner, t, tOwn } = deps;
  const ask = deps.confirm ?? ((m) => window.confirm(m));
  const askText = deps.prompt ?? ((m, v) => window.prompt(m, v));
  const onContextMenu = (event) => {
    const row = closestRow(event.target);
    if (row === null) return;
    const id = rowId(row.element, row.kind);
    if (id === null) return;
    event.preventDefault();
    event.stopPropagation();
    const batch = store.getKind() === row.kind && store.has(row.kind, id) && store.size() > 1;
    const targets = batch ? store.getIds() : [id];
    const items = buildItems(row.kind, targets);
    if (items.length === 0) return;
    openContextMenu({
      x: event.clientX,
      y: event.clientY,
      items,
      owner,
      anchor: row.element,
      onSelect: (actionId) => {
        void run(actionId, row.kind, targets, row.element);
      }
    });
  };
  function buildItems(kind, targets) {
    const many = targets.length > 1;
    if (kind === "workspace") {
      if (many) {
        return [{ id: "delete", label: tOwn("batch.deleteWorkspaces", { n: targets.length }), icon: MENU_ICONS.trash, danger: true }];
      }
      return [
        { id: "rename", label: t("rename"), icon: MENU_ICONS.edit },
        { id: "delete", label: t("delete.workspace"), icon: MENU_ICONS.trash, danger: true }
      ];
    }
    if (many) {
      return [{ id: "archive", label: tOwn("batch.archiveSessions", { n: targets.length }), icon: MENU_ICONS.archive, danger: true }];
    }
    return [
      { id: "rename", label: t("rename"), icon: MENU_ICONS.edit },
      { id: "fork", label: t("menu.fork"), icon: MENU_ICONS.branch },
      // 上游这一项**没有** `danger`，跟着不标：单选菜单是照着那个「...」菜单对齐的，
      // 多标一层红字就是又一处只有这里才有的说法。批量那条才标红。
      { id: "archive", label: t("menu.archiveSession"), icon: MENU_ICONS.archive }
    ];
  }
  async function renameSession(sessionId, title) {
    const session = sessions.binding(sessionId)?.session;
    if (session === void 0) throw new Error(`unknown session "${sessionId}"`);
    const result = await session.rename(title);
    if (!result.ok) throw new Error(result.error.message);
  }
  async function run(actionId, kind, targets, rowElement) {
    const current = rowTitle(rowElement, kind);
    if (actionId === "rename") {
      const title = kind === "session" ? t("rename.session.title") : t("rename.workspace.title");
      const next = askText(title, current);
      if (next === null || next.trim() === "") return;
      if (kind === "session") await renameSession(targets[0], next.trim());
      else await workspaces.rename(targets[0], next.trim());
      return;
    }
    if (actionId === "delete") {
      const message = targets.length > 1 ? tOwn("confirm.deleteWorkspaces", { n: targets.length, group: t("group.ungrouped") }) : `${t("delete.workspace")}

${t("delete.desc", { name: current })}`;
      if (!ask(message)) return;
      for (const target of targets) await workspaces.delete(target);
      store.clear();
      return;
    }
    if (actionId === "archive") {
      if (targets.length > 1 && !ask(tOwn("confirm.archiveSessions", { n: targets.length }))) return;
      for (const target of targets) await workspaces.archiveSession(target);
      store.clear();
      return;
    }
    if (actionId === "fork") {
      const childId = await sessions.fork({ sessionId: targets[0], increaseTitle: true });
      sessions.open(childId);
    }
  }
  document.addEventListener("contextmenu", onContextMenu, true);
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    document.removeEventListener("contextmenu", onContextMenu, true);
  };
}

// src/selection-menu/clipboard.js
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
var warned = /* @__PURE__ */ new Set();
async function copySelection(text) {
  const ok = await (0, import_dsh_client_ui_primitives.writeClipboard)(text);
  if (!ok) warnOnce("write", "[@Tinnikx/dsh-operation-improve] \u590D\u5236\u5931\u8D25\uFF1A\u526A\u8D34\u677F\u4E0D\u53EF\u5199");
}
async function pasteInto(snapshot) {
  let text;
  try {
    text = await navigator.clipboard.readText();
  } catch (error) {
    warnOnce("read", `[@Tinnikx/dsh-operation-improve] \u7C98\u8D34\u5931\u8D25\uFF1A\u8BFB\u4E0D\u5230\u526A\u8D34\u677F\uFF08${error}\uFF09`);
    return;
  }
  if (text === "") return;
  if (!restore(snapshot)) return;
  const data = new DataTransfer();
  data.setData("text/plain", text);
  const target = snapshot.kind === "field" ? snapshot.field : activeEditable();
  if (target === null) return;
  const event = new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  if (!event.defaultPrevented) document.execCommand("insertText", false, text);
}
function restore(snapshot) {
  if (snapshot.kind === "field") {
    if (!snapshot.field.isConnected) return false;
    snapshot.field.focus();
    snapshot.field.setSelectionRange(snapshot.start, snapshot.end);
    return true;
  }
  const container = snapshot.range.commonAncestorContainer;
  if (!container.isConnected) return false;
  const host = container instanceof Element ? container : container.parentElement;
  if (host === null) return false;
  const editable = host.closest('[contenteditable=""], [contenteditable="true"]');
  if (!(editable instanceof HTMLElement)) return false;
  editable.focus();
  const selection2 = window.getSelection();
  if (selection2 === null) return false;
  selection2.removeAllRanges();
  selection2.addRange(snapshot.range);
  return true;
}
function activeEditable() {
  const active = document.activeElement;
  return active instanceof HTMLElement && active.isContentEditable ? active : null;
}
function warnOnce(id, message) {
  if (warned.has(id)) return;
  warned.add(id);
  console.warn(message);
}

// src/selection-menu/index.js
var TEXT_INPUT_TYPES = /* @__PURE__ */ new Set(["text", "search", "url", "tel", "password", ""]);
function installSelectionMenu(deps) {
  const { tCommon, tOwn, owner } = deps;
  const onContextMenu = (event) => {
    if (closestRow(event.target) !== null) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target === null) return;
    const hit = probeField(target) ?? probeSelection(target, event.clientX, event.clientY);
    if (hit === null) return;
    const items = [];
    if (hit.text !== "") items.push({ id: "copy", label: tCommon("copy"), icon: MENU_ICONS.copy });
    if (hit.editable) items.push({ id: "paste", label: tOwn("selection.paste"), icon: MENU_ICONS.paste });
    if (items.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    openContextMenu({
      x: event.clientX,
      y: event.clientY,
      items,
      owner,
      anchor: hit.anchor,
      onSelect: (actionId) => {
        if (actionId === "copy") void copySelection(hit.text);
        else if (actionId === "paste") void pasteInto(hit.snapshot);
      }
    });
  };
  document.addEventListener("contextmenu", onContextMenu, true);
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    document.removeEventListener("contextmenu", onContextMenu, true);
  };
}
function probeField(target) {
  const field = target.closest("input, textarea");
  if (field === null) return null;
  if (field instanceof HTMLInputElement && !TEXT_INPUT_TYPES.has(field.type)) return null;
  if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) return null;
  if (field.disabled) return null;
  const start = field.selectionStart ?? 0;
  const end = field.selectionEnd ?? 0;
  return {
    text: field.value.slice(start, end),
    editable: !field.readOnly,
    anchor: field,
    snapshot: { kind: "field", field, start, end }
  };
}
function probeSelection(target, x, y) {
  const selection2 = window.getSelection();
  if (selection2 === null || selection2.rangeCount === 0 || selection2.isCollapsed) return null;
  const range = selection2.getRangeAt(0);
  const text = selection2.toString();
  if (text === "") return null;
  if (!containsPoint(range, x, y)) return null;
  const container = range.commonAncestorContainer;
  const anchor = container instanceof Element ? container : container.parentElement;
  if (anchor === null) return null;
  const editable = target.closest('[contenteditable=""], [contenteditable="true"]') !== null;
  return { text, editable, anchor, snapshot: { kind: "range", range: range.cloneRange() } };
}
function containsPoint(range, x, y) {
  let caret = null;
  if (typeof document.caretPositionFromPoint === "function") {
    caret = document.caretPositionFromPoint(x, y);
  } else if (typeof document.caretRangeFromPoint === "function") {
    const r = document.caretRangeFromPoint(x, y);
    if (r !== null) caret = { offsetNode: r.startContainer, offset: r.startOffset };
  } else {
    return true;
  }
  if (caret === null) return false;
  try {
    return range.comparePoint(caret.offsetNode, caret.offset) === 0;
  } catch {
    return false;
  }
}

// src/timestamps/format-clock.js
function pad2(value) {
  return String(value).padStart(2, "0");
}
function formatClockSeconds(time, now = Date.now()) {
  if (typeof time !== "number" || !Number.isFinite(time)) return null;
  const d = new Date(time);
  if (Number.isNaN(d.getTime())) return null;
  const n = new Date(typeof now === "number" && Number.isFinite(now) ? now : Date.now());
  const clock = `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  if (d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()) {
    return clock;
  }
  const md = `${d.getMonth() + 1}/${d.getDate()}`;
  const date = d.getFullYear() === n.getFullYear() ? md : `${d.getFullYear()}/${md}`;
  return `${date} ${clock}`;
}

// src/timestamps/index.js
var LABEL_CLASS = "dsh-oi-ts";
var ROW_ATTR = "data-dsh-oi-ts";
var UPSTREAM_TIME_KINDS = /* @__PURE__ */ new Set(["user", "steering", "turn-tail"]);
var FIBER_MAX_DEPTH = 12;
var FIRST_LINE_EPS = 8;
function thinkAnchors(row) {
  const out = [];
  const rowTop = row.getBoundingClientRect().top;
  for (const think of row.querySelectorAll('[data-variant="think"]')) {
    if (!(think instanceof HTMLElement)) continue;
    const host = think.querySelector('[class*="_row"]');
    if (!(host instanceof HTMLElement)) continue;
    if (think.getBoundingClientRect().top - rowTop < FIRST_LINE_EPS) continue;
    out.push({ think, host });
  }
  return out;
}
function installTimestamps(options) {
  const now = options?.now ?? (() => Date.now());
  const decorated = /* @__PURE__ */ new Map();
  let rebuildQueued = false;
  let disposed = false;
  const queueRebuild = () => {
    if (rebuildQueued || disposed) return;
    rebuildQueued = true;
    requestAnimationFrame(() => {
      rebuildQueued = false;
      if (!disposed) rebuild();
    });
  };
  function rebuild() {
    const plan = [];
    for (const row of document.querySelectorAll("[data-chat-flow-key]")) {
      if (!(row instanceof HTMLElement)) continue;
      const text = textFor(row, now());
      if (text === null) {
        plan.push({ row, text: null, thinks: [] });
        continue;
      }
      plan.push({ row, text, thinks: thinkAnchors(row) });
    }
    const seen = /* @__PURE__ */ new Set();
    for (const { row, text, thinks } of plan) {
      if (text === null) {
        undecorate(row);
        continue;
      }
      decorate(row, text, thinks);
      seen.add(row);
    }
    for (const row of [...decorated.keys()]) {
      if (!seen.has(row)) undecorate(row);
    }
  }
  function decorate(row, text, thinks) {
    let entry = decorated.get(row);
    if (entry === void 0) {
      entry = { label: createLabel("row"), thinks: /* @__PURE__ */ new Map() };
      decorated.set(row, entry);
    }
    if (row.getAttribute(ROW_ATTR) !== "row") row.setAttribute(ROW_ATTR, "row");
    if (entry.label.textContent !== text) entry.label.textContent = text;
    if (entry.label.parentElement !== row) row.append(entry.label);
    const live = /* @__PURE__ */ new Set();
    for (const { think, host } of thinks) {
      live.add(think);
      let label = entry.thinks.get(think);
      if (label === void 0) {
        label = createLabel("think");
        entry.thinks.set(think, label);
      }
      if (label.textContent !== text) label.textContent = text;
      if (label.parentElement !== host) host.append(label);
    }
    for (const [think, label] of [...entry.thinks]) {
      if (live.has(think)) continue;
      label.remove();
      entry.thinks.delete(think);
    }
  }
  function undecorate(row) {
    const entry = decorated.get(row);
    if (entry === void 0) return;
    entry.label.remove();
    for (const label of entry.thinks.values()) label.remove();
    decorated.delete(row);
    row.removeAttribute(ROW_ATTR);
  }
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (isSelfInflicted(record)) continue;
      queueRebuild();
      return;
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  rebuild();
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    observer.disconnect();
    for (const row of [...decorated.keys()]) undecorate(row);
  };
  return {
    dispose,
    refresh: () => rebuild(),
    snapshot: () => {
      let thinks = 0;
      const labels = [];
      for (const [row, entry] of decorated) {
        thinks += entry.thinks.size;
        labels.push({
          kind: row.getAttribute("data-chat-flow-kind"),
          key: row.getAttribute("data-chat-flow-key"),
          text: entry.label.textContent ?? ""
        });
      }
      return { rows: decorated.size, thinks, labels };
    }
  };
}
function createLabel(anchor) {
  const label = document.createElement("span");
  label.className = LABEL_CLASS;
  label.dataset.anchor = anchor;
  return label;
}
function isSelfInflicted(record) {
  const target = record.target;
  if (target instanceof Element && target.closest(`.${LABEL_CLASS}`) !== null) return true;
  if (record.type !== "childList") return false;
  const touched = [...record.addedNodes, ...record.removedNodes];
  return touched.length > 0 && touched.every((node) => node instanceof Element && node.classList.contains(LABEL_CLASS));
}
function textFor(row, nowMs) {
  const kind = row.getAttribute("data-chat-flow-kind");
  if (kind !== null && UPSTREAM_TIME_KINDS.has(kind)) return null;
  if (!hasForeignChild(row)) return null;
  const node = chatNodeOf(row);
  if (node === null) return null;
  return formatClockSeconds(resolveTime(node), nowMs);
}
function hasForeignChild(row) {
  for (const child of row.children) {
    if (!child.classList.contains(LABEL_CLASS)) return true;
  }
  return false;
}
function fiberOf2(el) {
  for (const key of Object.keys(el)) {
    if (key.startsWith("__reactFiber$")) return (
      /** @type {any} */
      el[key]
    );
  }
  return null;
}
function chatNodeOf(row) {
  const wanted = row.getAttribute("data-chat-flow-key");
  if (wanted === null) return null;
  const root = fiberOf2(row);
  if (root === null || root === void 0) return null;
  const stack = [{ fiber: root, depth: 0 }];
  while (stack.length > 0) {
    const { fiber, depth } = stack.pop();
    if (fiber === null || fiber === void 0 || depth > FIBER_MAX_DEPTH) continue;
    const node = fiber.memoizedProps?.node;
    if (node !== null && node !== void 0 && typeof node === "object" && node.key === wanted && "data" in node) {
      return node;
    }
    if (fiber.child !== null && fiber.child !== void 0) stack.push({ fiber: fiber.child, depth: depth + 1 });
    if (fiber.sibling !== null && fiber.sibling !== void 0) stack.push({ fiber: fiber.sibling, depth });
  }
  return null;
}
function resolveTime(node) {
  const data = node.data;
  const location = node.location;
  const isStep = data?.finalNode !== void 0 && data?.finalNode !== null;
  const candidates = [
    data?.root?.callTime,
    data?.root?.time,
    data?.finalNode?.timing?.stepStartTime,
    isStep ? location?.step?.start?.time : void 0,
    data?.finalNode?.timing?.firstTokenTime,
    data?.time,
    data?.command?.time,
    data?.current?.time,
    location?.step?.start?.time,
    location?.turn?.start?.time
  ];
  for (const value of candidates) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return void 0;
}
var TIMESTAMP_CSS = `
[data-chat-flow-key] { padding-right: var(--dsh-oi-ts-gutter, 56px); }
[${ROW_ATTR}] { position: relative; }
.${LABEL_CLASS} {
  color: var(--dsw-alias-label-caption, #8b8b8b);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  pointer-events: none;
  user-select: none;
}
.${LABEL_CLASS}[data-anchor='row'] {
  position: absolute;
  top: 0;
  right: 0;
  line-height: 24px;
}
.${LABEL_CLASS}[data-anchor='think'] {
  flex: 0 0 auto;
  margin-left: auto;
  padding-left: 8px;
  line-height: 24px;
}
[data-time-hover-root] [class*='_timeStart'],
[data-time-hover-root] [class*='_timeEnd'] { opacity: 1 !important; }
`;

// src/active-dot/index.js
var ACTIVE_DOT_CSS = `
svg[data-state='ongoing'] {
  --dsh-state-ongoing: rgb(21, 94, 117);
}

body[data-ds-dark-theme] svg[data-state='ongoing'] {
  --dsh-state-ongoing: rgb(34, 211, 238);
}

svg[data-state='ongoing'] rect {
  animation-name: dsh-oi-state-dot-chase;
}

@keyframes dsh-oi-state-dot-chase {
  0%, 12.4% { opacity: 1; }
  12.5%, 24.9% { opacity: 0.85; }
  25%, 37.4% { opacity: 0.7; }
  37.5%, 100% { opacity: 0.6; }
}
`;

// src/think-scroll/index.js
var THINK_SCROLL_CSS = `
[data-variant='think'] [class*='_thinkBody'] {
  max-height: var(--dsh-oi-think-max-height, 60vh);
  overflow-y: auto;
}
`;

// src/client/settings/index.jsx
var import_react2 = require("react");

// src/harness-config/route-path.js
var HARNESS_CONFIG_ROUTE = "/operation-improve/harness-config";

// src/client/settings/api.js
async function loadHarnessConfig(signal) {
  return request({ method: "GET", signal });
}
async function saveHarnessConfig(ops, signal) {
  return request({
    method: "POST",
    signal,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ops })
  });
}
async function request(init) {
  let response;
  try {
    response = await fetch(HARNESS_CONFIG_ROUTE, init);
  } catch (error) {
    throw withErrors(new Error(String(error?.message ?? error)), [
      `\u8FDE\u4E0D\u4E0A harness\uFF1A${error?.message ?? error}`
    ]);
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw withErrors(new Error("\u54CD\u5E94\u4E0D\u662F JSON"), [
      `${HARNESS_CONFIG_ROUTE} \u6CA1\u6709\u56DE JSON\uFF08HTTP ${response.status}\uFF09\uFF1A\u5F53\u524D harness \u53EF\u80FD\u6CA1\u6709\u52A0\u8F7D\u672C\u63D2\u4EF6\u7684 host \u534A\u8FB9\u3002`
    ]);
  }
  if (!response.ok || payload?.ok !== true) {
    const errors = Array.isArray(payload?.errors) && payload.errors.length > 0 ? payload.errors : [`\u8BF7\u6C42\u5931\u8D25\uFF08HTTP ${response.status}\uFF09`];
    throw withErrors(new Error(errors[0]), errors);
  }
  return payload;
}
function withErrors(error, errors) {
  error.errors = errors;
  return error;
}

// src/client/settings/panel.jsx
var import_react = require("react");

// src/harness-config/catalog-limits.js
var PRUNE_MARKER_CHARS = 39;
var MAX_TIMER_DELAY_MS = 2147483647;
var IMAGE_OFFLOAD_BYTE_QUANTUM = 67108864;
var INLINE_IMAGE_OFFLOAD_BYTE_QUANTUM = 10485760;
var FILE_REFRESH_MARGIN_SECONDS = 3600;
var SQLITE_MAX_PAGE_LIMIT = Number.MAX_SAFE_INTEGER - 1;

// src/harness-config/catalog-model.js
var MODEL_ENTRIES = [
  {
    id: "llm-deepseek",
    title: "DeepSeek \u6A21\u578B\u63A5\u5165",
    plugin: "@deepseek-ai/dsh-llm-deepseek",
    description: "\u8BF7\u6C42\u4FA7\u7684 token\u3001\u8D85\u65F6\u4E0E\u6587\u4EF6\u914D\u989D\u3002\u6A21\u578B\u5217\u8868\u4E0E API key \u4E0D\u8D70\u8FD9\u91CC\u3002",
    fields: [
      {
        key: "maxTokens",
        type: "integer",
        default: 256e3,
        min: 1,
        label: "\u5355\u6B21\u8F93\u51FA token \u4E0A\u9650",
        help: "\u6A21\u578B\u76EE\u5F55\u6CA1\u4E3A\u67D0\u4E2A\u6A21\u578B\u5355\u72EC\u58F0\u660E\u65F6\u7528\u5B83\u3002"
      },
      {
        key: "defaultContextWindow",
        type: "integer",
        default: 1e6,
        min: 1,
        label: "\u9ED8\u8BA4\u4E0A\u4E0B\u6587\u7A97\u53E3\uFF08token\uFF09",
        help: "\u6A21\u578B\u76EE\u5F55\u6CA1\u58F0\u660E\u7A97\u53E3\u65F6\u7528\u5B83\uFF0C\u4E0A\u4E0B\u6587\u5360\u7528\u7EDF\u8BA1\u4E5F\u6309\u5B83\u7B97\u3002"
      },
      {
        key: "streamIdleTimeoutMs",
        type: "integer",
        default: 3e5,
        min: 1,
        max: MAX_TIMER_DELAY_MS,
        label: "\u6D41\u7A7A\u95F2\u8D85\u65F6\uFF08\u6BEB\u79D2\uFF09",
        help: "\u4E24\u4E2A\u6570\u636E\u5757\u4E4B\u95F4\u8D85\u8FC7\u8FD9\u4E48\u4E45\u5C31\u5224\u5B9A\u65AD\u6D41\u3002"
      },
      {
        key: "maxImagesPerRequest",
        type: "integer",
        default: 600,
        min: 1,
        label: "\u5355\u6B21\u8BF7\u6C42\u56FE\u7247\u6570\u4E0A\u9650",
        help: ""
      },
      {
        key: "maxRequestFilesBytes",
        type: "integer",
        default: 134217728,
        min: IMAGE_OFFLOAD_BYTE_QUANTUM,
        label: "\u5355\u6B21\u8BF7\u6C42\u6587\u4EF6\u603B\u4E0A\u9650\uFF08\u5B57\u8282\uFF09",
        help: `\u4E0D\u80FD\u5C0F\u4E8E\u56FE\u7247\u8F6C\u5B58\u914D\u989D ${IMAGE_OFFLOAD_BYTE_QUANTUM}\uFF0C\u5426\u5219 llm-deepseek \u52A0\u8F7D\u5931\u8D25\u3002`
      },
      {
        key: "maxInlineRequestImageBytes",
        type: "integer",
        default: 20971520,
        min: INLINE_IMAGE_OFFLOAD_BYTE_QUANTUM,
        label: "\u5185\u8054\u56FE\u7247\u4E0A\u9650\uFF08\u5B57\u8282\uFF09",
        help: `\u4E0D\u80FD\u5C0F\u4E8E\u5185\u8054\u8F6C\u5B58\u914D\u989D ${INLINE_IMAGE_OFFLOAD_BYTE_QUANTUM}\uFF0C\u5426\u5219 llm-deepseek \u52A0\u8F7D\u5931\u8D25\u3002`
      },
      {
        key: "filesApiTimeoutMs",
        type: "integer",
        default: 6e4,
        min: 1,
        max: MAX_TIMER_DELAY_MS,
        label: "\u6587\u4EF6\u63A5\u53E3\u8D85\u65F6\uFF08\u6BEB\u79D2\uFF09",
        help: ""
      },
      {
        key: "fileExpiresAfterSeconds",
        type: "integer",
        default: 604800,
        min: FILE_REFRESH_MARGIN_SECONDS + 1,
        max: 2592e3,
        label: "\u4E0A\u4F20\u6587\u4EF6\u4FDD\u7559\u65F6\u957F\uFF08\u79D2\uFF09",
        help: `\u4E0A\u6E38\u8303\u56F4 3600\u20132592000\uFF0C\u4E14\u5FC5\u987B\u5927\u4E8E\u5237\u65B0\u4F59\u91CF ${FILE_REFRESH_MARGIN_SECONDS}\u3002`
      }
    ],
    crossRules: []
  },
  {
    id: "web-search-deepseek",
    title: "\u8054\u7F51\u641C\u7D22\uFF08DeepSeek\uFF09",
    plugin: "@deepseek-ai/dsh-web-search-deepseek",
    description: "\u641C\u7D22\u5DE5\u5177\u80CC\u540E\u90A3\u6B21\u8C03\u7528\u7684\u9884\u7B97\u3002API key \u8D70\u73AF\u5883\u53D8\u91CF\uFF0C\u4E0D\u5728\u8FD9\u91CC\u6539\u3002",
    fields: [
      {
        key: "maxUses",
        type: "integer",
        default: 5,
        min: 1,
        label: "\u5355\u6B21\u641C\u7D22\u6700\u591A\u8C03\u7528\u6B21\u6570",
        help: ""
      },
      {
        key: "maxTokens",
        type: "integer",
        default: 4096,
        min: 1,
        label: "\u641C\u7D22\u7ED3\u679C token \u4E0A\u9650",
        help: ""
      }
    ],
    crossRules: []
  },
  {
    id: "session-query-sqlite",
    title: "\u4F1A\u8BDD\u68C0\u7D22",
    plugin: "@deepseek-ai/dsh-session-query-sqlite",
    description: "\u5386\u53F2\u4F1A\u8BDD\u641C\u7D22\u7684\u5206\u9875\u4E0E\u6458\u8981\u9884\u7B97\u3002",
    fields: [
      {
        key: "defaultLimit",
        type: "integer",
        default: 20,
        min: 1,
        max: SQLITE_MAX_PAGE_LIMIT,
        label: "\u9ED8\u8BA4\u6BCF\u9875\u6761\u6570",
        help: "\u8C03\u7528\u65B9\u6CA1\u6307\u5B9A\u6761\u6570\u65F6\u7528\u5B83\uFF0C\u5FC5\u987B\u4E0D\u5927\u4E8E\u6BCF\u9875\u6761\u6570\u4E0A\u9650\u3002"
      },
      {
        key: "maxLimit",
        type: "integer",
        default: 100,
        min: 1,
        max: SQLITE_MAX_PAGE_LIMIT,
        label: "\u6BCF\u9875\u6761\u6570\u4E0A\u9650",
        help: ""
      },
      {
        key: "snippetChars",
        type: "integer",
        default: 240,
        min: 1,
        label: "\u6458\u8981\u957F\u5EA6\uFF08\u5B57\u7B26\uFF09",
        help: ""
      },
      {
        key: "readWindowMax",
        type: "integer",
        default: 50,
        min: 0,
        label: "\u5355\u6B21\u8BFB\u53D6\u7A97\u53E3\u4E0A\u9650",
        help: ""
      },
      {
        key: "persistedInspectConcurrency",
        type: "integer",
        default: 4,
        min: 1,
        label: "\u843D\u76D8\u4F1A\u8BDD\u68C0\u67E5\u5E76\u53D1",
        help: ""
      }
    ],
    crossRules: [
      {
        kind: "sumAtMost",
        fields: ["defaultLimit"],
        plus: 0,
        atMost: "maxLimit",
        message: "\u9ED8\u8BA4\u6BCF\u9875\u6761\u6570\u4E0D\u80FD\u8D85\u8FC7\u6BCF\u9875\u6761\u6570\u4E0A\u9650\uFF0C\u5426\u5219 session-query-sqlite \u52A0\u8F7D\u5931\u8D25\u3002"
      }
    ]
  },
  {
    id: "session-title",
    title: "\u4F1A\u8BDD\u6807\u9898",
    plugin: "@deepseek-ai/dsh-session-title",
    description: "\u4FA7\u8FB9\u680F\u90A3\u4E2A\u6807\u9898\u7684\u957F\u5EA6\u9884\u7B97\u3002\u56DE\u9000\u6807\u9898\u662F\u6A21\u578B\u8D77\u540D\u5931\u8D25\u65F6\u6309\u9996\u6761\u6D88\u606F\u622A\u51FA\u6765\u7684\u3002",
    fields: [
      {
        key: "fallbackMaxWords",
        type: "integer",
        default: 5,
        min: 1,
        label: "\u56DE\u9000\u6807\u9898\u6700\u591A\u8BCD\u6570",
        help: ""
      },
      {
        key: "fallbackMaxBytes",
        type: "integer",
        default: 40,
        min: 1,
        label: "\u56DE\u9000\u6807\u9898\u6700\u5927\u5B57\u8282",
        help: "\u4E0D\u80FD\u8D85\u8FC7\u6807\u9898\u6700\u5927\u5B57\u8282\u3002"
      },
      {
        key: "maxTitleBytes",
        type: "integer",
        default: 80,
        min: 1,
        label: "\u6807\u9898\u6700\u5927\u5B57\u8282",
        help: ""
      }
    ],
    crossRules: [
      {
        kind: "sumAtMost",
        fields: ["fallbackMaxBytes"],
        plus: 0,
        atMost: "maxTitleBytes",
        message: "\u56DE\u9000\u6807\u9898\u6700\u5927\u5B57\u8282\u4E0D\u80FD\u8D85\u8FC7\u6807\u9898\u6700\u5927\u5B57\u8282\uFF0C\u5426\u5219 session-title \u52A0\u8F7D\u5931\u8D25\u3002"
      }
    ]
  },
  {
    id: "session-title-llm",
    title: "\u4F1A\u8BDD\u6807\u9898\uFF08\u6A21\u578B\u751F\u6210\uFF09",
    plugin: "@deepseek-ai/dsh-session-title-first-prompt-llm",
    description: "\u62FF\u9996\u6761\u6D88\u606F\u8BA9\u6A21\u578B\u8D77\u6807\u9898\u7684\u9884\u7B97\uFF1B\u8D85\u65F6\u6216\u5931\u8D25\u5C31\u9000\u56DE\u4E0A\u9762\u90A3\u4E2A\u56DE\u9000\u6807\u9898\u3002",
    fields: [
      {
        key: "targetWords",
        type: "integer",
        default: 5,
        min: 1,
        label: "\u76EE\u6807\u8BCD\u6570",
        help: ""
      },
      {
        key: "targetCjkCharacters",
        type: "integer",
        default: 10,
        min: 1,
        label: "\u76EE\u6807\u4E2D\u65E5\u97E9\u5B57\u6570",
        help: ""
      },
      {
        key: "maxInputBytes",
        type: "integer",
        default: 4096,
        min: 1,
        label: "\u8F93\u5165\u622A\u65AD\uFF08\u5B57\u8282\uFF09",
        help: "\u9996\u6761\u6D88\u606F\u53EA\u53D6\u8FD9\u4E48\u591A\u5582\u7ED9\u6A21\u578B\u3002"
      },
      {
        key: "maxOutputTokens",
        type: "integer",
        default: 64,
        min: 1,
        label: "\u8F93\u51FA token \u4E0A\u9650",
        help: ""
      },
      {
        key: "timeoutMs",
        type: "integer",
        default: 6e4,
        min: 1,
        max: MAX_TIMER_DELAY_MS,
        label: "\u8D85\u65F6\uFF08\u6BEB\u79D2\uFF09",
        help: ""
      }
    ],
    crossRules: []
  },
  {
    id: "attachment-local",
    title: "\u56FE\u7247\u9644\u4EF6",
    plugin: "@deepseek-ai/dsh-attachment-local",
    description: "\u62D6\u8FDB\u5BF9\u8BDD\u6846\u7684\u56FE\u7247\u5728\u5165\u5E93\u524D\u7684\u5C3A\u5BF8\u3001\u4F53\u79EF\u4E0E\u5E76\u53D1\u9884\u7B97\u3002",
    fields: [
      {
        key: "maxImageBytes",
        type: "integer",
        default: 20971520,
        min: 1,
        label: "\u5355\u5F20\u539F\u56FE\u4E0A\u9650\uFF08\u5B57\u8282\uFF09",
        help: ""
      },
      {
        key: "maxImagesPerMessage",
        type: "integer",
        default: 20,
        min: 1,
        label: "\u5355\u6761\u6D88\u606F\u56FE\u7247\u6570\u4E0A\u9650",
        help: ""
      },
      {
        key: "maxMessageImageBytes",
        type: "integer",
        default: 209715200,
        min: 1,
        label: "\u5355\u6761\u6D88\u606F\u56FE\u7247\u603B\u5B57\u8282\u4E0A\u9650",
        help: ""
      },
      {
        key: "maxImagePixels",
        type: "integer",
        default: 64e6,
        min: 1,
        label: "\u5355\u5F20\u539F\u56FE\u50CF\u7D20\u4E0A\u9650",
        help: ""
      },
      {
        key: "maxImageDimension",
        type: "integer",
        default: 8192,
        min: 1,
        label: "\u5355\u5F20\u539F\u56FE\u8FB9\u957F\u4E0A\u9650\uFF08\u50CF\u7D20\uFF09",
        help: ""
      },
      {
        key: "normalizedImageMaxDimension",
        type: "integer",
        default: 2048,
        min: 1,
        label: "\u5F52\u4E00\u5316\u540E\u8FB9\u957F\u4E0A\u9650\uFF08\u50CF\u7D20\uFF09",
        help: "\u5165\u5E93\u524D\u4F1A\u5148\u7F29\u5230\u8FD9\u4E2A\u8FB9\u957F\u4EE5\u5185\u3002"
      },
      {
        key: "normalizedImageMaxBytes",
        type: "integer",
        default: 4194304,
        min: 1,
        label: "\u5F52\u4E00\u5316\u540E\u5B57\u8282\u4E0A\u9650",
        help: ""
      },
      {
        key: "imageCompressionConcurrency",
        type: "integer",
        default: 2,
        min: 1,
        max: 8,
        label: "\u538B\u7F29\u5E76\u53D1\u6570",
        help: "\u4E0A\u6E38\u786C\u9650 1\u20138\u3002"
      }
    ],
    crossRules: []
  },
  {
    id: "system-prompt",
    title: "\u7CFB\u7EDF\u63D0\u793A",
    plugin: "@deepseek-ai/dsh-system-prompt",
    description: "\u7CFB\u7EDF\u63D0\u793A\u91CC\u4E24\u4E2A\u53EF\u5F00\u5173\u7684\u56FA\u5B9A\u6BB5\u843D\u3002\u4EBA\u8BBE\uFF08persona\uFF09\u662F\u957F\u6587\u672C\uFF0C\u9762\u677F\u4E0D\u6539\u3002",
    fields: [
      {
        key: "includeHarnessIdentity",
        type: "boolean",
        default: true,
        label: "\u5305\u542B harness \u8EAB\u4EFD\u6BB5",
        help: ""
      },
      {
        key: "includeRuntimeContext",
        type: "boolean",
        default: true,
        label: "\u5305\u542B\u8FD0\u884C\u65F6\u4E0A\u4E0B\u6587\u6BB5",
        help: "\u5DE5\u4F5C\u76EE\u5F55\u3001\u5E73\u53F0\u3001\u65E5\u671F\u8FD9\u4E9B\u3002"
      }
    ],
    crossRules: []
  }
];

// src/harness-config/catalog-tools.js
var TOOL_ENTRIES = [
  {
    id: "compaction-basic",
    title: "\u4E0A\u4E0B\u6587\u538B\u7F29",
    plugin: "@deepseek-ai/dsh-compaction-basic",
    description: "\u4F1A\u8BDD\u903C\u8FD1\u4E0A\u4E0B\u6587\u4E0A\u9650\u65F6\u81EA\u52A8\u538B\u7F29\u5386\u53F2\u3002\u9608\u503C\u4E0E\u4FDD\u7559\u6BD4\u4F8B\u51B3\u5B9A\u538B\u5F97\u591A\u65E9\u3001\u7559\u5F97\u591A\u5C11\u3002",
    fields: [
      {
        key: "auto",
        type: "boolean",
        default: true,
        label: "\u81EA\u52A8\u538B\u7F29",
        help: "\u5173\u6389\u540E\u53EA\u80FD\u624B\u52A8\u89E6\u53D1\u538B\u7F29\u3002"
      },
      {
        key: "thresholdRatio",
        type: "number",
        default: 0.8,
        min: 0,
        max: 1,
        exclusive: true,
        label: "\u89E6\u53D1\u9608\u503C\u6BD4\u4F8B",
        help: "\u5360\u6A21\u578B\u4E0A\u4E0B\u6587\u7A97\u53E3\u7684\u6BD4\u4F8B\uFF0C\u8D85\u8FC7\u5C31\u5F00\u59CB\u538B\u7F29\u3002"
      },
      {
        key: "retainRatio",
        type: "number",
        default: 0.16,
        min: 0,
        max: 1,
        exclusive: true,
        label: "\u4FDD\u7559\u6BD4\u4F8B",
        help: "\u538B\u7F29\u540E\u4FDD\u7559\u7684\u8FD1\u671F\u5185\u5BB9\u6BD4\u4F8B\uFF0C\u5FC5\u987B\u5C0F\u4E8E\u89E6\u53D1\u9608\u503C\u6BD4\u4F8B\u3002"
      },
      {
        key: "maxTokens",
        type: "integer",
        default: 8192,
        min: 1,
        label: "\u6458\u8981 token \u4E0A\u9650",
        help: "\u751F\u6210\u6458\u8981\u65F6\u7ED9\u6A21\u578B\u7684\u8F93\u51FA\u4E0A\u9650\uFF0C\u4E0D\u80FD\u8D85\u8FC7\u6240\u9009\u6A21\u578B\u7684\u8F93\u51FA\u4E0A\u9650\u3002"
      },
      {
        key: "compactionRetries",
        type: "integer",
        default: 1,
        min: 0,
        label: "\u538B\u7F29\u91CD\u8BD5\u6B21\u6570",
        help: "\u4E00\u6B21\u538B\u7F29\u540E\u4ECD\u8D85\u9608\u503C\u65F6\u7684\u989D\u5916\u5C1D\u8BD5\u6B21\u6570\u3002"
      },
      {
        key: "maxOverflowRetries",
        type: "integer",
        default: 1,
        min: 0,
        label: "\u6EA2\u51FA\u91CD\u8BD5\u6B21\u6570",
        help: "\u8BF7\u6C42\u56E0\u8D85\u957F\u88AB\u62D2\u65F6\u7684\u989D\u5916\u5C1D\u8BD5\u6B21\u6570\u3002"
      }
    ],
    crossRules: [
      {
        kind: "lessThan",
        field: "retainRatio",
        than: "thresholdRatio",
        message: "\u4FDD\u7559\u6BD4\u4F8B\u5FC5\u987B\u5C0F\u4E8E\u89E6\u53D1\u9608\u503C\u6BD4\u4F8B\uFF0C\u5426\u5219 compaction-basic \u52A0\u8F7D\u5931\u8D25\u3002"
      }
    ]
  },
  {
    id: "tool-result-pruner",
    title: "\u5DE5\u5177\u7ED3\u679C\u88C1\u526A",
    plugin: "@deepseek-ai/dsh-compaction-tool-result-pruner",
    description: "\u8D85\u957F\u5DE5\u5177\u8F93\u51FA\u53EA\u4FDD\u7559\u5934\u5C3E\uFF0C\u4E2D\u95F4\u66FF\u6362\u6210\u4E00\u884C\u7701\u7565\u6807\u8BB0\u3002",
    fields: [
      {
        key: "thresholdChars",
        type: "integer",
        default: 8192,
        min: 1,
        label: "\u88C1\u526A\u9608\u503C\uFF08\u5B57\u7B26\uFF09",
        help: "\u5DE5\u5177\u8F93\u51FA\u8D85\u8FC7\u8FD9\u4E48\u591A\u7801\u70B9\u624D\u88C1\u526A\u3002"
      },
      {
        key: "headChars",
        type: "integer",
        default: 4096,
        min: 0,
        label: "\u4FDD\u7559\u5F00\u5934\uFF08\u5B57\u7B26\uFF09",
        help: ""
      },
      {
        key: "tailChars",
        type: "integer",
        default: 1024,
        min: 0,
        label: "\u4FDD\u7559\u7ED3\u5C3E\uFF08\u5B57\u7B26\uFF09",
        help: ""
      }
    ],
    crossRules: [
      {
        kind: "sumAtMost",
        fields: ["headChars", "tailChars"],
        plus: PRUNE_MARKER_CHARS,
        atMost: "thresholdChars",
        message: `\u4FDD\u7559\u5F00\u5934 + \u4FDD\u7559\u7ED3\u5C3E + \u7701\u7565\u6807\u8BB0\uFF08${PRUNE_MARKER_CHARS} \u5B57\u7B26\uFF09\u4E0D\u80FD\u8D85\u8FC7\u88C1\u526A\u9608\u503C\uFF0C\u5426\u5219 tool-result-pruner \u52A0\u8F7D\u5931\u8D25\u3002`
      }
    ]
  },
  {
    id: "spill-policy",
    title: "\u5927\u5757\u5185\u5BB9\u5916\u6EA2",
    plugin: "@deepseek-ai/dsh-spill-policy",
    description: "\u8D85\u8FC7\u9608\u503C\u7684\u5185\u5BB9\u4E0D\u518D\u5185\u8054\u8FDB\u4F1A\u8BDD\uFF0C\u6539\u4E3A\u843D\u76D8\u5F15\u7528\u3002",
    fields: [
      {
        key: "maxInlineBytes",
        type: "integer",
        default: 5e4,
        min: 1,
        label: "\u5185\u8054\u4E0A\u9650\uFF08\u5B57\u8282\uFF09",
        help: "\u8D85\u8FC7\u5C31\u5916\u6EA2\u5230\u5B58\u50A8\uFF0C\u4F1A\u8BDD\u91CC\u53EA\u7559\u5F15\u7528\u3002"
      }
    ],
    crossRules: []
  },
  {
    id: "tool-str-replace-editor",
    title: "\u6587\u4EF6\u7F16\u8F91\u5DE5\u5177",
    plugin: "@deepseek-ai/dsh-tool-str-replace-editor",
    description: "\u8BFB\u6587\u4EF6 / \u6539\u6587\u4EF6\u5DE5\u5177\u5355\u6B21\u8FD4\u56DE\u7684\u4F53\u91CF\u4E0A\u9650\u3002",
    fields: [
      {
        key: "maxOutputChars",
        type: "integer",
        default: 16e3,
        min: 1,
        label: "\u5355\u6B21\u8F93\u51FA\u4E0A\u9650\uFF08\u5B57\u7B26\uFF09",
        help: ""
      }
    ],
    crossRules: []
  },
  {
    id: "tool-ralph",
    title: "\u5B50\u4EE3\u7406\u5FAA\u73AF\uFF08ralph\uFF09",
    plugin: "@deepseek-ai/dsh-tool-ralph",
    description: "\u8BA9\u6A21\u578B\u628A\u4E00\u4EF6\u4E8B\u62C6\u6210\u591A\u8F6E\u4EA4\u7ED9\u5B50\u4EE3\u7406\u8DD1\u3002",
    fields: [
      {
        key: "maxRounds",
        type: "integer",
        default: 64,
        min: 1,
        label: "\u6700\u5927\u8F6E\u6570",
        help: "\u4E00\u6B21 ralph \u8C03\u7528\u5141\u8BB8\u7684\u5FAA\u73AF\u8F6E\u6570\u4E0A\u9650\u3002"
      }
    ],
    crossRules: []
  },
  {
    id: "tool-todo",
    title: "\u5F85\u529E\u5DE5\u5177",
    plugin: "@deepseek-ai/dsh-tool-todo",
    description: "\u6A21\u578B\u81EA\u5DF1\u7EF4\u62A4\u7684\u4EFB\u52A1\u6E05\u5355\u3002",
    fields: [
      {
        key: "allowParallelInProgress",
        type: "boolean",
        default: true,
        label: "\u5141\u8BB8\u591A\u4E2A\u8FDB\u884C\u4E2D",
        help: "\u5173\u6389\u540E\u540C\u4E00\u65F6\u523B\u53EA\u5141\u8BB8\u4E00\u6761\u5F85\u529E\u5904\u4E8E\u8FDB\u884C\u4E2D\u3002"
      }
    ],
    crossRules: []
  },
  {
    id: "repeat-tool-reminder",
    title: "\u91CD\u590D\u8C03\u7528\u63D0\u9192",
    plugin: "@deepseek-ai/dsh-repeat-tool-reminder",
    description: "\u540C\u4E00\u4E2A\u5DE5\u5177\u8FDE\u7EED\u7528\u540C\u6837\u53C2\u6570\u8C03\u7528\u65F6\u63D2\u5165\u63D0\u9192\u3002",
    fields: [
      {
        key: "thresholds",
        type: "integer-list",
        default: [3, 5, 8],
        min: 1,
        label: "\u63D0\u9192\u6B21\u6570\u70B9",
        help: "\u9012\u589E\u7684\u6B63\u6574\u6570\uFF0C\u9017\u53F7\u5206\u9694\uFF1B\u5728\u7B2C\u51E0\u6B21\u91CD\u590D\u65F6\u63D0\u9192\u3002"
      },
      {
        key: "argumentsPreviewChars",
        type: "integer",
        default: 500,
        min: 1,
        label: "\u53C2\u6570\u9884\u89C8\u957F\u5EA6\uFF08\u5B57\u7B26\uFF09",
        help: ""
      }
    ],
    crossRules: [
      { kind: "increasing", field: "thresholds", message: "\u63D0\u9192\u6B21\u6570\u70B9\u5FC5\u987B\u4E25\u683C\u9012\u589E\u3002" }
    ]
  },
  {
    id: "tool-web",
    title: "\u8054\u7F51\u641C\u7D22\u5DE5\u5177",
    plugin: "@deepseek-ai/dsh-tool-web",
    description: "\u53EA\u66B4\u9732\u641C\u7D22\u8D85\u65F6\u3002\u6293\u53D6\uFF08fetch\uFF09\u88AB\u4E0A\u6E38\u523B\u610F\u5173\u6389\uFF0C\u9762\u677F\u4E0D\u63D0\u4F9B\u5F00\u5173\u3002",
    fields: [
      {
        key: "searchTimeoutMs",
        type: "integer",
        default: 6e4,
        min: 1,
        label: "\u641C\u7D22\u8D85\u65F6\uFF08\u6BEB\u79D2\uFF09",
        help: ""
      }
    ],
    crossRules: []
  },
  {
    id: "agent-loop",
    title: "\u4EE3\u7406\u4E3B\u5FAA\u73AF",
    plugin: "@deepseek-ai/dsh-agent-loop",
    description: "\u6A21\u578B\u4E00\u8F6E\u91CC\u80FD\u540C\u65F6\u53D1\u51FA\u51E0\u4E2A\u5DE5\u5177\u8C03\u7528\u3002",
    fields: [
      {
        key: "maxParallelToolCalls",
        type: "integer",
        default: 10,
        min: 1,
        label: "\u5E76\u884C\u5DE5\u5177\u8C03\u7528\u4E0A\u9650",
        help: "\u540C\u4E00\u8F6E\u91CC\u6700\u591A\u540C\u65F6\u5728\u8DD1\u7684\u5DE5\u5177\u6570\uFF0C\u8D85\u51FA\u7684\u6392\u961F\u3002"
      }
    ],
    crossRules: []
  },
  {
    id: "goal",
    title: "\u76EE\u6807\uFF08goal\uFF09",
    plugin: "@deepseek-ai/dsh-goal",
    description: "\u6A21\u578B\u628A\u4E00\u4EF6\u4E8B\u767B\u8BB0\u6210 goal \u4E4B\u540E\u81EA\u52A8\u63A8\u8FDB\u7684\u8F6E\u6570\u4E0A\u9650\u3002",
    fields: [
      {
        key: "defaultMaxGoalRounds",
        type: "integer",
        default: 256,
        min: 1,
        label: "\u9ED8\u8BA4\u6700\u5927\u8F6E\u6570",
        help: "\u521B\u5EFA goal \u65F6\u6CA1\u5355\u72EC\u6307\u5B9A\u8F6E\u6570\u5C31\u7528\u5B83\u3002"
      }
    ],
    crossRules: []
  },
  {
    id: "jobs",
    title: "\u540E\u53F0\u4EFB\u52A1",
    plugin: "@deepseek-ai/dsh-jobs-local",
    description: "\u540E\u53F0\u8DD1\u7684\u547D\u4EE4\u4E0E\u5B50\u4EE3\u7406\u5171\u7528\u540C\u4E00\u4EFD\u5E76\u53D1\u989D\u5EA6\u3002",
    fields: [
      {
        key: "maxConcurrentJobsPerOwner",
        type: "integer",
        default: 10,
        min: 1,
        label: "\u6BCF\u4E2A\u6240\u6709\u8005\u5E76\u53D1\u4E0A\u9650",
        help: "\u8D85\u8FC7\u540E\u65B0\u4EFB\u52A1\u76F4\u63A5\u88AB\u62D2\uFF0C\u4E0D\u6392\u961F\u3002"
      }
    ],
    crossRules: []
  },
  {
    id: "bash-sandbox",
    title: "Bash \u5DE5\u5177",
    plugin: "@deepseek-ai/dsh-bash-sandbox",
    description: "\u6A21\u578B\u8DD1 shell \u547D\u4EE4\u65F6\u7684\u8D85\u65F6\u3001\u8F93\u51FA\u4E0E\u5916\u6EA2\u9884\u7B97\u3002",
    fields: [
      {
        key: "timeoutMs",
        type: "integer",
        default: 12e4,
        min: 1,
        label: "\u9ED8\u8BA4\u8D85\u65F6\uFF08\u6BEB\u79D2\uFF09",
        help: "\u6A21\u578B\u6CA1\u6307\u5B9A\u8D85\u65F6\u65F6\u7528\u5B83\uFF0C\u4E14\u4F1A\u88AB\u6700\u5927\u8D85\u65F6\u622A\u65AD\u3002"
      },
      {
        key: "maxTimeoutMs",
        type: "integer",
        default: 6e5,
        min: 1,
        label: "\u6700\u5927\u8D85\u65F6\uFF08\u6BEB\u79D2\uFF09",
        help: "\u6A21\u578B\u81EA\u5DF1\u6307\u5B9A\u7684\u8D85\u65F6\u4E5F\u4E0D\u4F1A\u8D85\u8FC7\u8FD9\u4E2A\u503C\u3002"
      },
      {
        key: "maxOutputBytes",
        type: "integer",
        default: 64e3,
        min: 1,
        label: "\u8F93\u51FA\u4E0A\u9650\uFF08\u5B57\u8282\uFF09",
        help: "\u8D85\u51FA\u7684\u90E8\u5206\u843D\u5230\u5916\u6EA2\u6587\u4EF6\u91CC\u3002"
      },
      {
        key: "maxSpillBytes",
        type: "integer",
        default: 67108864,
        min: 1,
        label: "\u5916\u6EA2\u6587\u4EF6\u4E0A\u9650\uFF08\u5B57\u8282\uFF09",
        help: ""
      },
      {
        key: "graceMs",
        type: "integer",
        default: 3e3,
        min: 1,
        max: MAX_TIMER_DELAY_MS,
        label: "SIGTERM \u5BBD\u9650\uFF08\u6BEB\u79D2\uFF09",
        help: "\u8D85\u65F6\u540E\u5148\u53D1 SIGTERM\uFF0C\u7B49\u8FD9\u4E48\u4E45\u518D SIGKILL\u3002"
      }
    ],
    crossRules: []
  },
  {
    id: "pwsh-sandbox",
    title: "PowerShell \u5DE5\u5177",
    plugin: "@deepseek-ai/dsh-pwsh-sandbox",
    description: "\u4E0E Bash \u5DE5\u5177\u540C\u6784\u7684\u4E00\u5957\u9884\u7B97\uFF0C\u53EA\u5728\u88C5\u4E86 PowerShell \u7684\u673A\u5668\u4E0A\u7528\u5F97\u4E0A\u3002",
    fields: [
      {
        key: "timeoutMs",
        type: "integer",
        default: 12e4,
        min: 1,
        label: "\u9ED8\u8BA4\u8D85\u65F6\uFF08\u6BEB\u79D2\uFF09",
        help: "\u6A21\u578B\u6CA1\u6307\u5B9A\u8D85\u65F6\u65F6\u7528\u5B83\uFF0C\u4E14\u4F1A\u88AB\u6700\u5927\u8D85\u65F6\u622A\u65AD\u3002"
      },
      {
        key: "maxTimeoutMs",
        type: "integer",
        default: 6e5,
        min: 1,
        label: "\u6700\u5927\u8D85\u65F6\uFF08\u6BEB\u79D2\uFF09",
        help: "\u6A21\u578B\u81EA\u5DF1\u6307\u5B9A\u7684\u8D85\u65F6\u4E5F\u4E0D\u4F1A\u8D85\u8FC7\u8FD9\u4E2A\u503C\u3002"
      },
      {
        key: "maxOutputBytes",
        type: "integer",
        default: 64e3,
        min: 1,
        label: "\u8F93\u51FA\u4E0A\u9650\uFF08\u5B57\u8282\uFF09",
        help: "\u8D85\u51FA\u7684\u90E8\u5206\u843D\u5230\u5916\u6EA2\u6587\u4EF6\u91CC\u3002"
      },
      {
        key: "maxSpillBytes",
        type: "integer",
        default: 67108864,
        min: 1,
        label: "\u5916\u6EA2\u6587\u4EF6\u4E0A\u9650\uFF08\u5B57\u8282\uFF09",
        help: ""
      },
      {
        key: "graceMs",
        type: "integer",
        default: 3e3,
        min: 1,
        max: MAX_TIMER_DELAY_MS,
        label: "SIGTERM \u5BBD\u9650\uFF08\u6BEB\u79D2\uFF09",
        help: "\u8D85\u65F6\u540E\u5148\u53D1 SIGTERM\uFF0C\u7B49\u8FD9\u4E48\u4E45\u518D SIGKILL\u3002"
      }
    ],
    crossRules: []
  },
  {
    id: "skill",
    title: "\u6280\u80FD\uFF08skill\uFF09",
    plugin: "@deepseek-ai/dsh-skill",
    description: "\u6280\u80FD\u76EE\u5F55\u626B\u63CF\u7ED3\u679C\u7684\u7F13\u5B58\u6761\u6570\u3002",
    fields: [
      {
        key: "collectCacheMaxEntries",
        type: "integer",
        default: 128,
        min: 1,
        label: "\u626B\u63CF\u7F13\u5B58\u6761\u6570\u4E0A\u9650",
        help: ""
      }
    ],
    crossRules: []
  }
];

// src/harness-config/catalog-entries.js
var CATALOG = [...TOOL_ENTRIES, ...MODEL_ENTRIES];

// src/harness-config/catalog.js
var BY_ID = new Map(CATALOG.map((entry) => [entry.id, entry]));
function checkCrossRules(entry, values) {
  const problems = [];
  for (const rule of entry.crossRules) {
    if (rule.kind === "lessThan") {
      const a = pick(values, rule.field, entry);
      const b = pick(values, rule.than, entry);
      if (typeof a === "number" && typeof b === "number" && !(a < b)) problems.push(rule.message);
    } else if (rule.kind === "sumAtMost") {
      const sum = rule.fields.reduce((acc, key) => acc + toNumber(pick(values, key, entry)), rule.plus);
      const cap = pick(values, rule.atMost, entry);
      if (typeof cap === "number" && sum > cap) problems.push(rule.message);
    } else if (rule.kind === "increasing") {
      const list = pick(values, rule.field, entry);
      if (Array.isArray(list)) {
        for (let i = 1; i < list.length; i += 1) {
          if (!(list[i - 1] < list[i])) {
            problems.push(rule.message);
            break;
          }
        }
      }
    }
  }
  return problems;
}
function pick(values, key, entry) {
  if (values[key] !== void 0) return values[key];
  return entry.fields.find((field) => field.key === key)?.default;
}
function toNumber(value) {
  return typeof value === "number" ? value : 0;
}

// src/client/settings/draft.js
function draftKey(id, key) {
  return `${id}\0${key}`;
}
function currentValue(entryState, field) {
  const effective = entryState.effective;
  if (effective !== null && effective !== void 0 && field.key in effective) {
    return effective[field.key];
  }
  return void 0;
}
function sourceOf(entryState, field) {
  if (entryState.managed.includes(field.key)) return "panel";
  const outside = entryState.outside;
  const bundle = entryState.bundle;
  const inOutside = outside !== null && outside !== void 0 && field.key in outside;
  const inBundle = bundle !== null && bundle !== void 0 && field.key in bundle;
  if (inOutside && (!inBundle || !sameValue(outside[field.key], bundle[field.key]))) return "manual";
  if (inBundle) return "bundle";
  return "system";
}
function formatValue(field, value) {
  if (value === void 0 || value === null) return "";
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}
function parseDraft(field, entry) {
  if (entry.kind === "unset") return { op: "unset" };
  if (entry.kind === "bool") return { op: "set", value: entry.value };
  const text = entry.text.trim();
  if (text === "") return { op: "unset" };
  if (field.type === "integer-list") {
    const parts = text.split(/[,，\s]+/u).filter((part) => part !== "");
    const numbers = parts.map((part) => Number(part));
    if (numbers.some((value2) => !Number.isFinite(value2))) {
      return { error: `${field.label} \u91CC\u6709\u4E0D\u662F\u6570\u5B57\u7684\u9879\uFF1A${text}` };
    }
    return { op: "set", value: numbers };
  }
  const value = Number(text);
  if (!Number.isFinite(value)) return { error: `${field.label} \u4E0D\u662F\u6570\u5B57\uFF1A${text}` };
  return { op: "set", value };
}
function isDirty(entryState, field, parsed) {
  if ("error" in parsed) return true;
  const managed = entryState.managed.includes(field.key);
  if (parsed.op === "unset") return managed;
  if (!managed) return true;
  return !sameValue(entryState.managedValues[field.key], parsed.value);
}
function buildOps(catalog, state, draft) {
  const ops = [];
  const errors = [];
  const merged = /* @__PURE__ */ new Map();
  for (const entry of catalog) {
    const entryState = state[entry.id];
    if (entryState === void 0 || !entryState.present) continue;
    for (const field of entry.fields) {
      const draftEntry = draft[draftKey(entry.id, field.key)];
      if (draftEntry === void 0) continue;
      const parsed = parseDraft(field, draftEntry);
      if (!isDirty(entryState, field, parsed)) continue;
      if ("error" in parsed) {
        errors.push(`${entry.title}\uFF1A${parsed.error}`);
        continue;
      }
      if (!merged.has(entry.id)) merged.set(entry.id, { ...entryState.managedValues });
      const values = merged.get(entry.id);
      if (parsed.op === "unset") delete values[field.key];
      else values[field.key] = parsed.value;
      ops.push({ id: entry.id, field: field.key, op: parsed.op, ...parsed.op === "set" ? { value: parsed.value } : {} });
    }
  }
  if (errors.length > 0) return { ops: [], errors };
  for (const [id, values] of merged) {
    const entry = catalog.find((candidate) => candidate.id === id);
    const effective = { ...state[id].outside ?? {}, ...values };
    for (const problem of checkCrossRules(entry, effective)) errors.push(`${entry.title}\uFF1A${problem}`);
  }
  return errors.length > 0 ? { ops: [], errors } : { ops, errors };
}
function sameValue(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => item === b[index]);
  }
  return a === b;
}

// src/client/settings/styles.js
var ROOT_CLASS2 = "dsh-oi-hcfg";
var SETTINGS_CSS = `
.${ROOT_CLASS2} {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px 0;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
}
.${ROOT_CLASS2}__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.${ROOT_CLASS2}__title {
  display: block;
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
  line-height: 22px;
}
.${ROOT_CLASS2}__subtitle {
  display: block;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
  margin-top: 2px;
}
.${ROOT_CLASS2}__chevron {
  flex: none;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  transition: transform 160ms ease;
}
.${ROOT_CLASS2}__head[aria-expanded="true"] .${ROOT_CLASS2}__chevron { transform: rotate(90deg); }

.${ROOT_CLASS2}__panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.${ROOT_CLASS2}__note {
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
  word-break: break-all;
}
.${ROOT_CLASS2}__warn {
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--dsw-alias-state-warn-tertiary);
  color: var(--dsw-alias-state-warn-label);
  font-size: 12px;
  line-height: 18px;
}
.${ROOT_CLASS2}__error {
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--dsw-alias-interactive-bg-hover-danger);
  color: var(--dsw-alias-state-error-primary);
  font-size: 12px;
  line-height: 18px;
}
.${ROOT_CLASS2}__error > div + div,
.${ROOT_CLASS2}__warn > div + div { margin-top: 4px; }

.${ROOT_CLASS2}__card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 16px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 12px;
  background: var(--dsw-alias-bg-module-platform);
}
.${ROOT_CLASS2}__cardTitle {
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
  font-weight: 500;
  line-height: 22px;
}
.${ROOT_CLASS2}__cardDesc {
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}
.${ROOT_CLASS2}__absent {
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
  font-style: italic;
}

.${ROOT_CLASS2}__field {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 8px 0;
  border-top: 1px solid var(--dsw-alias-border-l1);
}
.${ROOT_CLASS2}__fieldMain { flex: 1 1 auto; min-width: 0; }
.${ROOT_CLASS2}__label {
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  line-height: 20px;
}
.${ROOT_CLASS2}__help {
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}
.${ROOT_CLASS2}__fieldSide {
  display: flex;
  flex: none;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}
.${ROOT_CLASS2}__input {
  box-sizing: border-box;
  width: 160px;
  padding: 4px 8px;
  border: 1px solid var(--dsw-alias-border-l3);
  border-radius: 8px;
  background: var(--dsw-specific-input-major);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 13px;
  line-height: 20px;
}
.${ROOT_CLASS2}__input:focus {
  outline: none;
  border-color: var(--dsw-alias-state-business-primary);
}
.${ROOT_CLASS2}__input[data-dirty] { border-color: var(--dsw-alias-state-business-primary); }
.${ROOT_CLASS2}__check { width: 16px; height: 16px; accent-color: var(--dsw-alias-state-business-primary); }
.${ROOT_CLASS2}__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  line-height: 16px;
}
.${ROOT_CLASS2}__badge {
  max-width: 150px;
  padding: 0 6px;
  border-radius: 6px;
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-secondary);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.${ROOT_CLASS2}__badge[data-source="panel"] {
  background: var(--dsw-alias-state-business-tertiary);
  color: var(--dsw-alias-state-business-primary);
}
.${ROOT_CLASS2}__badge[data-source="manual"] {
  background: var(--dsw-alias-state-warn-tertiary);
  color: var(--dsw-alias-state-warn-label);
}
.${ROOT_CLASS2}__link {
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-state-business-primary);
  cursor: pointer;
}
.${ROOT_CLASS2}__link[disabled] { color: var(--dsw-alias-label-dimmed); cursor: default; }

.${ROOT_CLASS2}__status {
  min-height: 18px;
  text-align: right;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}

/* \u8D70 harness \u81EA\u5DF1\u9ED8\u8BA4\u503C\u7684\u90A3\u4E00\u884C\uFF1A\u53EA\u6DE1\u5316\u63A7\u4EF6\u672C\u8EAB\uFF0C\u8F93\u5165\u6846\u7A7A\u7740\u9760\u7070 placeholder \u663E\u793A\u9ED8\u8BA4\u503C\u3002
   \u6807\u7B7E\u4E0E\u8BF4\u660E\u4FDD\u6301\u6EE1\u5BF9\u6BD4\u5EA6\u2014\u2014\u5B83\u4EEC\u662F\u8FD9\u4E00\u9879\u662F\u4EC0\u4E48\u610F\u601D\uFF0C\u4E0E\u5B83\u6709\u6CA1\u6709\u88AB\u8BBE\u8FC7\u65E0\u5173\u3002
   \u4E0D disable\u2014\u2014\u7167\u6837\u8981\u80FD\u6539\uFF0C\u805A\u7126\u65F6\u6062\u590D\u6EE1\u5BF9\u6BD4\u5EA6\u3002

   \u6DE1\u5316\u53EA\u80FD\u7528 opacity\uFF0C\u4E0D\u80FD\u6539 color\uFF1A\u4E3B\u9898\u63D2\u4EF6\u53EF\u4EE5\u628A --dsw-alias-label-* \u5168\u90E8 !important
   \u6210\u540C\u4E00\u4E2A\u989C\u8272\uFF08\u672C\u4ED3\u5E93\u5B9E\u6D4B\u7684\u4E3B\u9898\u5C31\u628A\u56DB\u6863\u6807\u7B7E\u8272\u7EDF\u7EDF\u538B\u6210\u7EAF\u767D\uFF09\uFF0C\u90A3\u6837\u6309\u989C\u8272\u6DE1\u5316\u7684\u63A7\u4EF6\u548C\u6B63\u5E38
   \u63A7\u4EF6\u4F1A\u957F\u5F97\u4E00\u6A21\u4E00\u6837\uFF0C\u800C\u8FD9\u6761\u89C4\u5219\u4E0D\u4F1A\u6709\u4EBA\u62A5\u9519\u3002 */
.${ROOT_CLASS2}__field[data-default] .${ROOT_CLASS2}__input,
.${ROOT_CLASS2}__field[data-default] .${ROOT_CLASS2}__check { opacity: 0.55; }
.${ROOT_CLASS2}__field[data-default] .${ROOT_CLASS2}__input:focus,
.${ROOT_CLASS2}__field[data-default] .${ROOT_CLASS2}__check:focus { opacity: 1; }
`;

// src/client/settings/fields.jsx
var import_jsx_runtime = require("react/jsx-runtime");
function FieldRow({ t, entry, field, entryState, draft, putDraft, commit, disabled }) {
  const key = draftKey(entry.id, field.key);
  const draftEntry = draft[key];
  const live = currentValue(entryState, field);
  const parsed = draftEntry === void 0 ? void 0 : parseDraft(field, draftEntry);
  const dirty = parsed !== void 0 && isDirty(entryState, field, parsed);
  const source = sourceOf(entryState, field);
  const managed = entryState.managed.includes(field.key);
  const atDefault = source === "system" && draftEntry === void 0;
  const owner = source === "bundle" ? entryState.bundleOwners?.[field.key] ?? null : null;
  const control = field.type === "boolean" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "input",
    {
      type: "checkbox",
      className: `${ROOT_CLASS2}__check`,
      disabled,
      checked: boolFromDraft(draftEntry, live, field),
      onChange: (event) => {
        putDraft(key, { kind: "bool", value: event.target.checked });
        commit();
      }
    }
  ) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "input",
    {
      type: "text",
      inputMode: field.type === "integer-list" ? "text" : "decimal",
      className: `${ROOT_CLASS2}__input`,
      "data-dirty": dirty ? "" : void 0,
      "data-field": `${entry.id}.${field.key}`,
      disabled,
      placeholder: formatValue(field, field.default),
      value: draftEntry?.kind === "text" ? draftEntry.text : formatValue(field, live),
      onChange: (event) => {
        putDraft(key, { kind: "text", text: event.target.value });
      },
      onBlur: () => {
        commit();
      },
      onKeyDown: (event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }
    }
  );
  const clearable = !disabled && (managed || dirty);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: `${ROOT_CLASS2}__field`, "data-default": atDefault ? "" : void 0, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: `${ROOT_CLASS2}__fieldMain`, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: `${ROOT_CLASS2}__label`, children: field.label }),
      field.help === "" ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: `${ROOT_CLASS2}__help`, children: field.help })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: `${ROOT_CLASS2}__fieldSide`, children: [
      control,
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: `${ROOT_CLASS2}__meta`, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "span",
          {
            className: `${ROOT_CLASS2}__badge`,
            "data-source": source,
            "data-owner": owner ?? void 0,
            title: owner ?? void 0,
            children: owner === null ? t(`settings.source.${source}`) : shortenPackage(owner)
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: t("settings.defaultHint", { value: formatValue(field, field.default) }) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            className: `${ROOT_CLASS2}__link`,
            "data-clear": `${entry.id}.${field.key}`,
            disabled: !clearable,
            onClick: () => {
              putDraft(key, managed ? { kind: "unset" } : void 0);
              commit();
            },
            children: t("settings.clear")
          }
        )
      ] })
    ] })
  ] });
}
function shortenPackage(name2) {
  const scope = "@deepseek-ai/";
  return name2.startsWith(scope) ? name2.slice(scope.length) : name2;
}
function boolFromDraft(draftEntry, live, field) {
  if (draftEntry?.kind === "bool") return draftEntry.value;
  if (draftEntry?.kind === "unset") return field.default === true;
  if (typeof live === "boolean") return live;
  return field.default === true;
}

// src/client/settings/panel.jsx
var import_jsx_runtime2 = require("react/jsx-runtime");
function HarnessConfigPanel({ t, load, save }) {
  const [payload, setPayload] = (0, import_react.useState)(null);
  const [errors, setErrors] = (0, import_react.useState)([]);
  const [draft, setDraft] = (0, import_react.useState)({});
  const [busy, setBusy] = (0, import_react.useState)(true);
  const [saved, setSaved] = (0, import_react.useState)(false);
  const mountedRef = (0, import_react.useRef)(true);
  const payloadRef = (0, import_react.useRef)(null);
  const draftRef = (0, import_react.useRef)({});
  const chainRef = (0, import_react.useRef)(Promise.resolve());
  (0, import_react.useEffect)(() => {
    mountedRef.current = true;
    const controller = new AbortController();
    void (async () => {
      try {
        const next = await load(controller.signal);
        payloadRef.current = next;
        if (mountedRef.current) {
          setPayload(next);
          setErrors([]);
        }
      } catch (error) {
        if (controller.signal.aborted || !mountedRef.current) return;
        setErrors(error?.errors ?? [String(error?.message ?? error)]);
      } finally {
        if (!controller.signal.aborted && mountedRef.current) setBusy(false);
      }
    })();
    return () => {
      mountedRef.current = false;
      controller.abort();
    };
  }, [load]);
  const putDraft = (0, import_react.useCallback)((key, value) => {
    const next = { ...draftRef.current };
    if (value === void 0) delete next[key];
    else next[key] = value;
    draftRef.current = next;
    setDraft(next);
    setSaved(false);
    return next;
  }, []);
  const runCommit = (0, import_react.useCallback)(async () => {
    const current = payloadRef.current;
    if (current === null) return;
    const compiled = buildOps(current.catalog, current.state, draftRef.current);
    if (compiled.errors.length > 0) {
      if (mountedRef.current) setErrors(compiled.errors);
      return;
    }
    if (compiled.ops.length === 0) {
      draftRef.current = {};
      if (mountedRef.current) {
        setDraft({});
        setErrors([]);
      }
      return;
    }
    if (mountedRef.current) {
      setBusy(true);
      setErrors([]);
    }
    try {
      const next = await save(compiled.ops);
      payloadRef.current = next;
      draftRef.current = {};
      if (mountedRef.current) {
        setPayload(next);
        setDraft({});
        setSaved(true);
      }
    } catch (error) {
      if (mountedRef.current) setErrors(error?.errors ?? [String(error?.message ?? error)]);
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, [save]);
  const commit = (0, import_react.useCallback)(() => {
    chainRef.current = chainRef.current.then(runCommit, runCommit);
  }, [runCommit]);
  if (payload === null) {
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: `${ROOT_CLASS2}__panel`, "data-state": busy ? "loading" : "failed", children: [
      busy ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: `${ROOT_CLASS2}__note`, children: t("settings.loading") }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ErrorList, { errors })
    ] });
  }
  const dirtyCount = countDirty(payload, draft);
  const readonly = payload.profile.writable !== true;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: `${ROOT_CLASS2}__panel`, "data-state": "ready", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: `${ROOT_CLASS2}__note`, children: t("settings.file", { path: payload.profile.patchPath }) }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: `${ROOT_CLASS2}__note`, children: t("settings.keep") }),
    payload.warnings.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: `${ROOT_CLASS2}__warn`, "data-warnings": "", children: payload.warnings.map((warning) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { children: warning }, warning)) }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ErrorList, { errors }),
    payload.catalog.map((entry) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      EntryCard,
      {
        t,
        entry,
        entryState: payload.state[entry.id],
        draft,
        putDraft,
        commit,
        disabled: readonly
      },
      entry.id
    )),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: `${ROOT_CLASS2}__status`, "data-dirty-count": dirtyCount, children: statusText(t, { busy, dirtyCount, saved }) })
  ] });
}
function EntryCard({ t, entry, entryState, draft, putDraft, commit, disabled }) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: `${ROOT_CLASS2}__card`, "data-entry": entry.id, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: `${ROOT_CLASS2}__cardTitle`, children: entry.title }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: `${ROOT_CLASS2}__cardDesc`, children: entry.description }),
    entryState?.present === true ? entry.fields.map((field) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      FieldRow,
      {
        t,
        entry,
        field,
        entryState,
        draft,
        putDraft,
        commit,
        disabled
      },
      field.key
    )) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: `${ROOT_CLASS2}__absent`, children: t("settings.absent") })
  ] });
}
function ErrorList({ errors }) {
  if (errors.length === 0) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: `${ROOT_CLASS2}__error`, "data-errors": "", children: errors.map((message) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { children: message }, message)) });
}
function statusText(t, { busy, dirtyCount, saved }) {
  if (busy) return t("settings.saving");
  if (dirtyCount > 0) return t("settings.dirty", { n: dirtyCount });
  return saved ? t("settings.saved") : "";
}
function countDirty(payload, draft) {
  let count = 0;
  for (const entry of payload.catalog) {
    const entryState = payload.state[entry.id];
    if (entryState === void 0 || !entryState.present) continue;
    for (const field of entry.fields) {
      const draftEntry = draft[draftKey(entry.id, field.key)];
      if (draftEntry === void 0) continue;
      if (isDirty(entryState, field, parseDraft(field, draftEntry))) count += 1;
    }
  }
  return count;
}

// src/client/settings/index.jsx
var import_jsx_runtime3 = require("react/jsx-runtime");
var ROW_ORDER = 60;
function installHarnessConfigRow(ctx) {
  const dispose = ctx.slots.inject("settings.general.item", () => ctx.slots.register({
    name: "settings.general.item",
    id: "harness-advanced",
    order: ROW_ORDER,
    locale: OWN_NS,
    registrant: "@Tinnikx/dsh-operation-improve",
    inject: () => ({ load: loadHarnessConfig, save: saveHarnessConfig })
  }, HarnessConfigRow));
  return { dispose };
}
function HarnessConfigRow({ t, load, save }) {
  const [open, setOpen] = (0, import_react2.useState)(false);
  const toggle = (0, import_react2.useCallback)(() => {
    setOpen((previous) => !previous);
  }, []);
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: ROOT_CLASS2, "data-dsh-oi-harness-config": "", children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("button", { type: "button", className: `${ROOT_CLASS2}__head`, "aria-expanded": open, onClick: toggle, children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: `${ROOT_CLASS2}__title`, children: t("settings.title") }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: `${ROOT_CLASS2}__subtitle`, children: t("settings.subtitle") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: `${ROOT_CLASS2}__chevron`, "aria-hidden": "true", children: "\u25B8" })
    ] }),
    open ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(HarnessConfigPanel, { t, load, save }) : null
  ] });
}

// src/client/index.js
var name = "@Tinnikx/dsh-operation-improve";
var inject = ["workspaces", "sessions", "locale", "slots"];
var selection = createSelectionStore();
function apply(ctx) {
  const instanceId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const style = document.createElement("style");
  style.dataset.plugin = name;
  style.textContent = [MENU_CSS, TIMESTAMP_CSS, ACTIVE_DOT_CSS, THINK_SCROLL_CSS, SETTINGS_CSS].join("\n");
  document.head.append(style);
  ctx.effect(() => () => style.remove(), "@Tinnikx/dsh-operation-improve: stylesheet");
  const disposeMultiSelect = installMultiSelect({ store: selection });
  ctx.effect(() => disposeMultiSelect, "@Tinnikx/dsh-operation-improve: multi-select");
  const locale = installLocale(ctx);
  ctx.effect(() => locale.dispose, "@Tinnikx/dsh-operation-improve: dictionaries");
  const disposeMenu = installContextMenu({
    store: selection,
    workspaces: ctx.workspaces,
    sessions: ctx.sessions,
    t: locale.t,
    tOwn: locale.tOwn,
    owner: instanceId
  });
  const disposeContextMenu = () => {
    disposeMenu();
    closeContextMenu();
  };
  ctx.effect(() => disposeContextMenu, "@Tinnikx/dsh-operation-improve: context menu");
  const disposeSelection = installSelectionMenu({
    tCommon: locale.tCommon,
    tOwn: locale.tOwn,
    owner: instanceId
  });
  const disposeSelectionMenu = () => {
    disposeSelection();
    closeContextMenu();
  };
  ctx.effect(() => disposeSelectionMenu, "@Tinnikx/dsh-operation-improve: selection menu");
  const timestamps = installTimestamps();
  ctx.effect(() => timestamps.dispose, "@Tinnikx/dsh-operation-improve: timestamps");
  const harnessConfig = installHarnessConfigRow(ctx);
  ctx.effect(() => harnessConfig.dispose, "@Tinnikx/dsh-operation-improve: harness config row");
  const globalKey = "__dshOperationImprove__";
  window[globalKey] = {
    instanceId,
    selection,
    timestamps,
    harnessConfig,
    multiSelect: { dispose: disposeMultiSelect },
    contextMenu: { dispose: disposeContextMenu },
    selectionMenu: { dispose: disposeSelectionMenu },
    // `t` / `tCommon` / `tOwn` 是菜单文案的唯一来源，暴露出来让脚本读到**页面真实 locale
    // 服务**给出的那份文本；注入式验证造的是自己的 ctx，不借这一份就只能拿桩数据对断言。
    // `dispose` 摘掉本插件的词典注册——不摘的话下一次 apply 会撞上「同一个 namespace
    // 的同一个 locale 注册两次」而抛。
    locale: { t: locale.t, tCommon: locale.tCommon, tOwn: locale.tOwn, dispose: locale.dispose },
    stylesheet: { dispose: () => style.remove() },
    dispose: () => {
      harnessConfig.dispose();
      timestamps.dispose();
      disposeSelectionMenu();
      disposeContextMenu();
      disposeMultiSelect();
      locale.dispose();
      style.remove();
      delete window[globalKey];
    }
  };
  ctx.effect(() => () => {
    delete window[globalKey];
  }, "@Tinnikx/dsh-operation-improve: debug handle");
}
return module.exports; } });
