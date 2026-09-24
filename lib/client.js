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
  min-width: 144px;
  max-width: 360px;
  padding: 3px;
  /* \u5706\u89D2\u8DDF\u4E0A\u6E38 Menu \u9ED8\u8BA4\u6863\uFF08\u5B9E\u6D4B 16px\uFF09\u3002\u89C2\u611F\u5DEE\u4E0D\u5F71\u54CD\u4EFB\u4F55\u52A8\u4F5C\uFF0C
     \u517C\u5BB9\u53E3\u5F84\u4EE5\u5B9E\u6D4B\u7248\u672C\u4E3A\u51C6\u2014\u2014verify(1/2) \u7684 metrics \u65AD\u8A00\u5F53\u573A\u6BD4\u5BF9\u3002 */
  border-radius: 16px;
  /* \u4E0A\u6E38\u9ED8\u8BA4\u6863\u6CA1\u6709\u63CF\u8FB9\uFF08borderTopWidth \u5B9E\u6D4B 0px\uFF09\uFF0C\u6D6E\u5C42\u8FB9\u754C\u7531 box-shadow \u6491\u3002 */
  /* \u4E24\u5C42\uFF1A\u4E3B\u9898\u8272\u753B\u5728 background-image \u4E0A\uFF0C\u57AB\u5728\u5B83\u4E0B\u9762\u7684 background-color \u662F\u540C\u65CF\u7684\u53E6\u4E00\u4E2A
     surface\u3002\u4E3B\u9898\u771F\u628A --dsw-specific-menu \u5B9A\u6210\u534A\u900F\u660E\u65F6\uFF0C\u5408\u6210\u7ED3\u679C\u4ECD\u6BD4\u9875\u9762\u5E95\u8272\u5B9E\u3002 */
  background-color: var(--dsw-alias-bg-layer-1, #2c2c2e);
  background-image: linear-gradient(var(--dsw-oi-surface), var(--dsw-oi-surface));
  /* \u4E0A\u6E38\u9ED8\u8BA4\u6863\uFF1Aborder \u5F52\u96F6\uFF0C\u8FB9\u754C\u611F\u6765\u81EA elevation-prominent \u91CC\u90A3\u6761
     0.5px \u63CF\u8FB9\u9634\u5F71\u2014\u2014\u63CF\u8FB9\u8272\u7531 elevation-stroke-color \u6307\u5B9A\uFF0C\u4E24\u6761\u8981\u4E00\u8D77\u6284\u3002 */
  --dsw-elevation-stroke-color: var(--dsw-alias-border-l1, rgba(128,128,128,0.3));
  box-shadow: var(--dsw-elevation-prominent, 0 8px 24px rgba(0, 0, 0, 0.28));
  color: var(--dsw-alias-label-primary, inherit);
  pointer-events: auto;
  user-select: none;
}
.${ROOT_CLASS}__item {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: 34px;
  padding: 6px 8px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-primary, inherit);
  font-size: 13px;
  line-height: 20px;
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
  width: 14px;
  height: 14px;
  align-items: center;
  justify-content: center;
  color: var(--dsw-alias-label-tertiary, inherit);
}
.${ROOT_CLASS}__icon svg { width: 14px; height: 14px; }
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
/* \u7279\u5F02\u5EA6 (0,2,0) \u662F\u5C42\u53E0\u5951\u7EA6\uFF1A\u4E0E\u529F\u80FD 10 \u7684\u9009\u4E2D\u5E95\u8272\u540C\u7EA7\uFF0C\u9760 ROW_STATES_CSS \u63D2\u5728\u672C\u8868
   \u4E4B\u524D\u8BA9\u300C\u5F53\u524D\u4F1A\u8BDD\u88AB\u6279\u91CF\u5708\u9009\u300D\u65F6\u663E\u793A\u591A\u9009\u84DD\uFF08\u53E0\u52A0\u6001\u53E6\u89C1 src/row-states/index.js\uFF09\u3002 */
[role="treeitem"][data-dsh-oi-selected] {
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
  "confirm.deleteWorkspaces": "\u5220\u9664 {n} \u4E2A\u5DE5\u4F5C\u533A\uFF1F\u5176\u4F1A\u8BDD\u5C06\u663E\u793A\u5728\u201C{group}\u201D\u4E0B\u3002",
  "selection.paste": "\u7C98\u8D34",
  "find.placeholder": "\u5728\u9875\u9762\u4E2D\u67E5\u627E",
  "find.noResults": "\u65E0\u7ED3\u679C",
  "find.count": "{index} / {total}",
  "find.prev": "\u4E0A\u4E00\u4E2A\u5339\u914D\u9879",
  "find.next": "\u4E0B\u4E00\u4E2A\u5339\u914D\u9879",
  "find.close": "\u5173\u95ED\u67E5\u627E",
  "settings.title": "Harness \u9AD8\u7EA7\u914D\u7F6E",
  "settings.subtitle": "\u68C0\u7D22\u5206\u9875\u3001\u5DE5\u5177\u9884\u7B97\u7B49\u53EA\u80FD\u624B\u6539\u914D\u7F6E\u6587\u4EF6\u7684\u9879\u76EE",
  "settings.loading": "\u6B63\u5728\u8BFB\u53D6\u5F53\u524D\u914D\u7F6E\u2026",
  "settings.file": "\u5199\u5165 {path}",
  "settings.keep": "\u6539\u5B8C\u79BB\u5F00\u8F93\u5165\u6846\u5373\u81EA\u52A8\u4FDD\u5B58\uFF0C\u65E0\u9700\u91CD\u542F\uFF1B\u672A\u8BBE\u7F6E\u7684\u9879\u76EE\u8D70 harness \u9ED8\u8BA4\uFF08\u6574\u884C\u7070\u663E\uFF09\uFF0C\u79FB\u9664\u672C\u63D2\u4EF6\u4E0D\u4F1A\u6E05\u7A7A\u5DF2\u5199\u4E0B\u7684\u914D\u7F6E\u3002",
  "settings.piNotice": "\u624B\u52A8\u6DFB\u52A0\u7684\u6A21\u578B\u82E5\u4E0D\u5728 pi-ai \u5185\u7F6E\u76EE\u5F55\u91CC\u3001\u4E5F\u6CA1\u58F0\u660E contextWindow\uFF0C\u4E0A\u4E0B\u6587\u7A97\u53E3\u6309 256K\uFF08262,144 token\uFF09\u8BA1\u2014\u2014\u300CDeepSeek \u6A21\u578B\u63A5\u5165\u300D\u5361\u7684\u9ED8\u8BA4\u7A97\u53E3\u7BA1\u4E0D\u5230\u5B83\u3002\u8BF7\u5728 ~/.dsh/settings.yaml \u91CC\u6309\u8DEF\u7531\u4E3A\u8BE5\u6A21\u578B\u8BBE\u7F6E\u771F\u5B9E\u7A97\u53E3\uFF08\u6A21\u578B\u6761\u76EE\u5199 contextWindow\uFF0C\u6216\u6574\u6761\u8DEF\u7531\u5199 defaultContextWindow\uFF09\u3002",
  "settings.absent": "\u8FD9\u4E2A\u63D2\u4EF6\u4E0D\u5728\u5F53\u524D profile \u7684\u7EC4\u5408\u91CC\uFF0C\u65E0\u6CD5\u914D\u7F6E\u3002",
  "settings.defaultHint": "\u9ED8\u8BA4 {value}",
  "settings.clear": "\u6E05\u9664",
  "settings.saving": "\u4FDD\u5B58\u4E2D\u2026",
  "settings.saved": "\u5DF2\u4FDD\u5B58\uFF0C\u65E0\u9700\u91CD\u542F",
  "settings.dirty": "{n} \u9879\u5F85\u4FDD\u5B58",
  "settings.source.panel": "\u672C\u9762\u677F",
  "settings.source.manual": "\u624B\u5199",
  "settings.source.bundle": "\u7EC4\u5408\u9ED8\u8BA4",
  "settings.source.system": "\u7CFB\u7EDF\u9ED8\u8BA4",
  "settings.effect.immediate": "\u4FDD\u5B58\u5373\u751F\u6548",
  "settings.effect.session": "\u4FDD\u5B58\u5373\u751F\u6548\uFF1B\u5DF2\u5F00\u7684\u4F1A\u8BDD\u4E0D\u53D8",
  "settings.effect.nextRequest": "\u4FDD\u5B58\u5373\u751F\u6548\uFF08\u4E0B\u4E00\u8F6E\u8BF7\u6C42\uFF09",
  "settings.effect.nextQuery": "\u4FDD\u5B58\u5373\u751F\u6548\uFF08\u4E0B\u4E00\u6B21\u68C0\u7D22\uFF09",
  "settings.effect.nextAttachment": "\u4FDD\u5B58\u5373\u751F\u6548\uFF08\u4E0B\u4E00\u6B21\u5165\u5E93\uFF09",
  "settings.effect.nextSession": "\u4FDD\u5B58\u5373\u751F\u6548\uFF08\u65B0\u4F1A\u8BDD\u8D77\uFF09",
  "settings.effect.restart": "\u91CD\u542F harness \u540E\u751F\u6548"
};
var en = {
  "batch.deleteWorkspaces": "Delete {n} workspaces",
  "confirm.deleteWorkspaces": "Delete {n} workspaces? Their sessions will appear under {group}.",
  "selection.paste": "Paste",
  "find.placeholder": "Find in page",
  "find.noResults": "No results",
  "find.count": "{index} of {total}",
  "find.prev": "Previous match",
  "find.next": "Next match",
  "find.close": "Close find bar",
  "settings.title": "Harness advanced configuration",
  "settings.subtitle": "Search paging, tool budgets \u2014 settings that otherwise need a hand-edited config file",
  "settings.loading": "Reading the current configuration\u2026",
  "settings.file": "Written to {path}",
  "settings.keep": "Edits save themselves when the field loses focus, no restart needed. Unset fields are dimmed and fall back to the harness defaults; removing this plugin does not clear what you wrote.",
  "settings.piNotice": 'A manually added model that pi-ai does not know and that declares no contextWindow is sized at 256K (262,144 tokens) \u2014 the default window in the "DeepSeek \u6A21\u578B\u63A5\u5165" card does not reach it. Set the real window per route in ~/.dsh/settings.yaml (contextWindow on the model entry, or defaultContextWindow on the route).',
  "settings.absent": "This plugin is not part of the current profile composition.",
  "settings.defaultHint": "default {value}",
  "settings.clear": "Clear",
  "settings.saving": "Saving\u2026",
  "settings.saved": "Saved, no restart needed",
  "settings.dirty": "{n} pending",
  "settings.source.panel": "this panel",
  "settings.source.manual": "hand-written",
  "settings.source.bundle": "composition",
  "settings.source.system": "harness default",
  "settings.effect.immediate": "applies on save",
  "settings.effect.session": "applies on save; open sessions unchanged",
  "settings.effect.nextRequest": "applies on save (next model request)",
  "settings.effect.nextQuery": "applies on save (next search)",
  "settings.effect.nextAttachment": "applies on save (next image upload)",
  "settings.effect.nextSession": "applies on save (new sessions)",
  "settings.effect.restart": "takes effect after a harness restart"
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
var EDIT = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke-width="1" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M8.85596 2.69971H4.19971C3.37141 2.69971 2.69992 3.37146 2.69971 4.19971V11.8003C2.69992 12.6285 3.37141 13.3003 4.19971 13.3003H11.8003C12.6283 13.2999 13.3001 12.6283 13.3003 11.8003V7.89893H14.3003V11.8003C14.3001 13.1806 13.1806 14.2999 11.8003 14.3003H4.19971C2.81913 14.3003 1.69992 13.1808 1.69971 11.8003V4.19971C1.69992 2.81918 2.81913 1.69971 4.19971 1.69971H8.85596V2.69971Z" fill="currentColor"/><path d="M7.7849 8.23878L13.888 2.13574" stroke="currentColor"/></svg>';
var BRANCH = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke-width="1" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M1.01503 8.0001L5.6964 8.0001C6.41913 8.0001 6.78049 8.0001 7.12115 7.91951C7.4232 7.84804 7.71233 7.73014 7.97821 7.57C8.27809 7.38939 8.5364 7.13669 9.05303 6.63129L11.3281 4.40564" stroke="currentColor"/><path d="M1.01221 7.9999L5.6964 7.9999C6.41913 7.9999 6.78049 7.9999 7.12115 8.08049C7.4232 8.15196 7.71233 8.26986 7.97821 8.43C8.27809 8.61061 8.5364 8.86331 9.05303 9.36871L11.3281 11.5944" stroke="currentColor"/><circle cx="12.4502" cy="3.3079" r="1.56962" stroke="currentColor"/><circle cx="12.4502" cy="12.6921" r="1.56962" stroke="currentColor"/></svg>';
var UNARCHIVE = '<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke-width="1" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path fill-rule="evenodd" clip-rule="evenodd" d="M15.8659 2.05975C17.2603 2.05995 18.3913 3.19096 18.3914 4.58527V5.4874C18.3914 6.02747 18.2192 6.52672 17.9303 6.93735C17.9336 6.96524 17.9388 6.99318 17.9388 7.02195V12.8884C17.9388 13.6345 17.9395 14.2379 17.8996 14.7254C17.8642 15.1593 17.7936 15.5499 17.6373 15.9141L17.5654 16.0685C17.278 16.6328 16.8405 17.1046 16.3038 17.434L16.0679 17.5661C15.66 17.7739 15.2196 17.8598 14.7237 17.9003C14.2362 17.9401 13.6327 17.9405 12.8867 17.9405H7.11122C6.36511 17.9405 5.76171 17.9401 5.27418 17.9003C4.84051 17.8649 4.44949 17.7952 4.08545 17.6391L3.93104 17.5661C3.36673 17.2785 2.89392 16.8414 2.56465 16.3044L2.43245 16.0685C2.22473 15.6608 2.13878 15.2211 2.09825 14.7254C2.05841 14.2379 2.05912 13.6345 2.05912 12.8884V7.02195C2.05912 6.99284 2.06422 6.96449 2.06758 6.93629C1.77931 6.52592 1.60858 6.02687 1.60858 5.4874V4.58527C1.60876 3.19084 2.73962 2.05975 4.1341 2.05975H15.8659ZM16.4984 7.92936C16.296 7.98169 16.0847 8.01288 15.8659 8.01291H4.1341C3.91478 8.01291 3.70246 7.98194 3.49955 7.92936V12.8884C3.49955 13.6582 3.50053 14.1927 3.53445 14.608C3.56769 15.0146 3.62923 15.244 3.71635 15.415L3.7925 15.5514C3.98339 15.8627 4.25749 16.1165 4.58464 16.2833L4.72529 16.3435C4.88095 16.3993 5.08638 16.4402 5.39158 16.4651C5.80685 16.4991 6.34138 16.5001 7.11122 16.5001H12.8867C13.6564 16.5001 14.1911 16.499 14.6063 16.4651C15.0128 16.432 15.2423 16.3703 15.4133 16.2833L15.5508 16.2061C15.8618 16.0152 16.116 15.7419 16.2827 15.415L16.3429 15.2732C16.3985 15.1177 16.4396 14.9128 16.4645 14.608C16.4985 14.1927 16.4984 13.6583 16.4984 12.8884V7.92936ZM4.1341 3.50019C3.53511 3.50019 3.0492 3.98631 3.04902 4.58527V5.4874C3.04902 6.08649 3.535 6.57248 4.1341 6.57248H15.8659C16.4648 6.57228 16.951 6.08638 16.951 5.4874V4.58527C16.9509 3.98644 16.4647 3.50038 15.8659 3.50019H4.1341Z" fill="currentColor"/><path d="M10 14.1V10.1M7.85 12.05L10 9.9L12.15 12.05" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/></svg>';
var TRASH = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke-width="1" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M1.28149 3.88831H14.7187" stroke="currentColor"/><path d="M5.41602 3.88833V2.47962C5.41602 2.29282 5.52492 2.11366 5.71876 1.98157C5.9126 1.84948 6.17551 1.77527 6.44964 1.77527H9.55053C9.82466 1.77527 10.0876 1.84948 10.2814 1.98157C10.4753 2.11366 10.5842 2.29282 10.5842 2.47962V3.88833" stroke="currentColor"/><path d="M2.57349 3.88831L3.19366 13.2943C3.21937 13.5502 3.33952 13.7872 3.53065 13.9593C3.72178 14.1313 3.97016 14.2259 4.22729 14.2246H11.7728C12.0299 14.2259 12.2783 14.1313 12.4694 13.9593C12.6605 13.7872 12.7807 13.5502 12.8064 13.2943L13.4266 3.88831" stroke="currentColor"/><path d="M6.44946 6.98926V11.1238" stroke="currentColor"/><path d="M9.55054 6.98926V11.1238" stroke="currentColor"/></svg>';
var COPY = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke-width="1" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="1.52075" y="4.07373" width="10.3932" height="10.3932" rx="2" stroke="currentColor"/><path d="M11.9792 1.53296C13.36 1.53296 14.4792 2.65225 14.4792 4.03296V9.42847C14.4792 10.3756 13.9521 11.1987 13.1755 11.6228V10.3298C13.3652 10.0787 13.4792 9.7674 13.4792 9.42847V4.03296C13.4792 3.20453 12.8077 2.53296 11.9792 2.53296H6.58374C6.27966 2.53301 5.99684 2.6235 5.7605 2.77905H4.42358C4.85652 2.03463 5.66056 1.53304 6.58374 1.53296H11.9792Z" fill="currentColor"/></svg>';
var PIN_OUTLINE = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke-width="1" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M9.96976 1.70572L13.1554 3.93629L10.9019 8.12317L11.5158 11.605L10.7192 12.7427L2.52767 7.00693L3.3243 5.86922L6.80612 5.25528L9.96976 1.70572Z" stroke="currentColor" stroke-linejoin="round"/><path d="M6.05285 9.47511C6.27284 9.16094 6.70586 9.08458 7.02003 9.30457C7.3342 9.52455 7.41055 9.95757 7.19057 10.2717L3.98587 14.4708L3.21223 13.9291L6.05285 9.47511Z" fill="currentColor"/></svg>';
var PIN_FILL = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke-width="1" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M9.96976 1.70572L13.1554 3.93629L10.9019 8.12317L11.5158 11.605L10.7192 12.7427L2.52767 7.00693L3.3243 5.86922L6.80612 5.25528L9.96976 1.70572Z" fill="currentColor" stroke="currentColor" stroke-linejoin="round"/><path d="M6.05285 9.47511C6.27284 9.16094 6.70586 9.08458 7.02003 9.30457C7.3342 9.52455 7.41055 9.95757 7.19057 10.2717L3.98587 14.4708L3.21223 13.9291L6.05285 9.47511Z" fill="currentColor"/></svg>';
var PASTE = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke-width="1" stroke="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="2.5" y="3.5" width="11" height="10.5" rx="2"/><path d="M6 3.5V2.5A1 1 0 0 1 7 1.5H9A1 1 0 0 1 10 2.5V3.5"/></svg>';
var MENU_ICONS = {
  edit: EDIT,
  branch: BRANCH,
  unarchive: UNARCHIVE,
  trash: TRASH,
  copy: COPY,
  paste: PASTE,
  pinOutline: PIN_OUTLINE,
  pinFill: PIN_FILL
};

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
    const batch = store.getKind() === row.kind && store.has(row.kind, id) && store.size() > 1;
    const targets = batch ? store.getIds() : [id];
    const items = buildItems(row.kind, targets);
    if (items.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
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
    if (many) return [];
    const snapshot = workspaces.list.getSnapshot();
    const pinned = snapshot.pinnedSessionIds.includes(targets[0]);
    const archived = snapshot.archivedSessionIds.includes(targets[0]);
    const items = [];
    if (!archived) {
      items.push({
        id: pinned ? "unpin" : "pin",
        label: t(pinned ? "menu.unpinSession" : "menu.pinSession"),
        icon: pinned ? MENU_ICONS.pinFill : MENU_ICONS.pinOutline
      });
    }
    items.push({ id: "rename", label: t("rename"), icon: MENU_ICONS.edit });
    items.push({ id: "fork", label: t("menu.fork"), icon: MENU_ICONS.branch });
    if (archived) {
      items.push({ id: "unarchive", label: t("menu.unarchiveSession"), icon: MENU_ICONS.unarchive });
    }
    return items;
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
    if (actionId === "fork") {
      const childId = await sessions.fork({ sessionId: targets[0], increaseTitle: true });
      await openSessionRow(childId);
      return;
    }
    if (actionId === "pin") {
      await workspaces.pinSession(targets[0]);
      return;
    }
    if (actionId === "unpin") {
      await workspaces.unpinSession(targets[0]);
      return;
    }
    if (actionId === "unarchive") {
      await workspaces.unarchiveSession(targets[0]);
    }
  }
  async function openSessionRow(sessionId) {
    const DEADLINE_MS = 3e3;
    const INTERVAL_MS = 150;
    const deadline = Date.now() + DEADLINE_MS;
    for (; ; ) {
      for (const row of document.querySelectorAll('[class*="_sessionRow"], [class*="_searchResultRow"]')) {
        if (!(row instanceof HTMLElement)) continue;
        if (rowId(row, "session") === sessionId) {
          row.click();
          return;
        }
      }
      if (Date.now() >= deadline) {
        console.warn(`[@Tinnikx/dsh-operation-improve] fork \u540E\u6CA1\u5728\u4FA7\u680F\u627E\u5230\u5B50\u4F1A\u8BDD ${sessionId} \u7684\u884C\uFF0C\u672A\u81EA\u52A8\u6253\u5F00\uFF08fork \u5DF2\u6210\u529F\uFF09`);
        return;
      }
      await new Promise((r) => setTimeout(r, INTERVAL_MS));
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
  const target = snapshot.kind === "range" ? activeEditable() : snapshot.field;
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
  if (snapshot.kind === "editable") {
    if (!snapshot.field.isConnected) return false;
    snapshot.field.focus();
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
    const hit = probeField(target) ?? probeEditable(target) ?? probeSelection(target, event.clientX, event.clientY);
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
function probeEditable(target) {
  const host = target.closest('[contenteditable=""], [contenteditable="true"]');
  if (!(host instanceof HTMLElement) || host.isContentEditable !== true) return null;
  const selection2 = window.getSelection();
  const range = selection2 !== null && selection2.rangeCount > 0 && !selection2.isCollapsed ? selection2.getRangeAt(0) : null;
  if (range !== null && host.contains(range.commonAncestorContainer)) {
    return {
      text: selection2.toString(),
      editable: true,
      anchor: host,
      snapshot: { kind: "range", range: range.cloneRange() }
    };
  }
  return { text: "", editable: true, anchor: host, snapshot: { kind: "editable", field: host } };
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
var UPSTREAM_TIME_KINDS = /* @__PURE__ */ new Set(["user", "steering", "turn-tail", "turn-process"]);
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
    for (const row of document.querySelectorAll("[data-chat-node-key]")) {
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
          key: row.getAttribute("data-chat-node-key"),
          flowKey: row.getAttribute("data-chat-flow-key"),
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
  const wanted = row.getAttribute("data-chat-node-key");
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
[data-chat-node-key] { padding-right: var(--dsh-oi-ts-gutter, 80px); }
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
[data-chat-node-key] [class*='_timeStart'],
[data-chat-node-key] [class*='_timeEnd'] { opacity: 1 !important; }
`;

// src/active-dot/index.js
var ACTIVE_DOT_CSS = `
svg[data-state='ongoing'] {
  --dsh-state-ongoing: rgb(21, 94, 117);
  color: var(--dsh-state-ongoing);
}

body[data-ds-dark-theme] svg[data-state='ongoing'] {
  --dsh-state-ongoing: rgb(34, 211, 238);
}

svg[data-state='ongoing'] circle:first-of-type {
  opacity: 0.6;
}
`;

// src/think-scroll/index.js
var THINK_SCROLL_CSS = `
[data-variant='think'] [class*='_thinkBody'] {
  max-height: var(--dsh-oi-think-max-height, 60vh);
  overflow-y: auto;
}
`;

// src/row-states/index.js
var ROW_STATES_CSS = `
@property --dsh-oi-row-sweep {
  syntax: '<angle>';
  initial-value: 0deg;
  inherits: false;
}

[class*="_sessionRow"] {
  --dsh-oi-row-signal: 21 94 117;
}

body[data-ds-dark-theme] [class*="_sessionRow"] {
  --dsh-oi-row-signal: 34 211 238;
}

/* ---- \u9009\u4E2D\uFF08\u5F53\u524D\u6253\u5F00\u7684\u4F1A\u8BDD\uFF09\uFF1A\u9752\u8272\u7AD6\u6761 + \u586B\u5145 + \u6807\u9898\u63D0\u6743 ---- */
[class*="_sessionRow"][aria-selected="true"] {
  background-color: rgb(var(--dsh-oi-row-signal) / .10) !important;
}

[class*="_sessionRow"][aria-selected="true"]:not([class*="_drop"])::before {
  content: '';
  position: absolute;
  left: 0;
  top: 20%;
  bottom: 20%;
  width: 3px;
  border-radius: 0 2px 2px 0;
  background: rgb(var(--dsh-oi-row-signal));
  pointer-events: none;
}

[class*="_sessionRow"][aria-selected="true"] {
  position: relative;
}

[class*="_sessionRow"][aria-selected="true"] [class*="_title"] {
  font-weight: 600;
}

[class*="_sessionRow"][aria-selected="true"] [class*="_time"] {
  color: var(--dsw-alias-label-secondary);
}

/* ---- \u8FD0\u884C\u4E2D\uFF1A\u5E38\u4EAE\u9759\u9ED8\u5E95\u8FB9 + \u5F57\u5C3E\u6CBF\u8F6E\u5ED3\u626B\u52A8 ---- */
[class*="_sessionRow"]:has(svg[data-state='ongoing']) {
  position: relative;
  background-color: rgb(var(--dsh-oi-row-signal) / .10);
  box-shadow: inset 0 0 0 1px rgb(var(--dsh-oi-row-signal) / .15);
}

[class*="_sessionRow"][aria-selected="true"]:has(svg[data-state='ongoing']) {
  background-color: rgb(var(--dsh-oi-row-signal) / .14) !important;
}

[class*="_sessionRow"]:has(svg[data-state='ongoing']):not([class*="_drop"])::after {
  content: '';
  position: absolute;
  inset: -1px;
  border-radius: 9px;
  padding: 1px;
  background: conic-gradient(from var(--dsh-oi-row-sweep),
    transparent 0deg 268deg,
    rgb(var(--dsh-oi-row-signal) / .12) 286deg,
    rgb(var(--dsh-oi-row-signal) / .85) 330deg,
    rgb(var(--dsh-oi-row-signal)) 358deg,
    transparent 360deg);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  mask-composite: exclude;
  filter: drop-shadow(0 0 5px rgb(var(--dsh-oi-row-signal) / .55));
  animation: dsh-oi-row-sweep 2.4s linear infinite;
  pointer-events: none;
}

[class*="_sessionRow"]:has(svg[data-state='ongoing']):nth-child(3n+2)::after {
  animation-delay: -.8s;
}

[class*="_sessionRow"]:has(svg[data-state='ongoing']):nth-child(3n+3)::after {
  animation-delay: -1.6s;
}

@keyframes dsh-oi-row-sweep {
  to { --dsh-oi-row-sweep: 360deg; }
}

/* \u51CF\u5C11\u52A8\u6001\uFF1A\u5F57\u5C3E\u7184\u706D\uFF0C\u9759\u9ED8\u5E95\u8FB9\u5E38\u4EAE\u5373\u5B8C\u6210\u8BC6\u522B\uFF08\u540C\u529F\u80FD 5 \u7684\u964D\u7EA7\u601D\u8DEF\uFF09\u3002 */
@media (prefers-reduced-motion: reduce) {
  [class*="_sessionRow"]:has(svg[data-state='ongoing']):not([class*="_drop"])::after {
    display: none;
  }
}
`;

// src/find/matches.js
var SEP = "\0";
var matchId = (m) => m.key + SEP + m.ordinal;
function findOffsets(text, query) {
  const out = [];
  if (text === "" || query === "") return out;
  const needle = query.toLowerCase();
  const haystack = text.toLowerCase();
  if (haystack.length === text.length) {
    for (let from = 0; ; ) {
      const at = haystack.indexOf(needle, from);
      if (at === -1) return out;
      out.push(at);
      from = at + needle.length;
    }
  }
  for (let i = 0; i + query.length <= text.length; i += 1) {
    if (text.slice(i, i + query.length).toLowerCase() !== needle) continue;
    out.push(i);
    i += query.length - 1;
  }
  return out;
}
function buildMatchList(nodes, query, limit) {
  const matches = [];
  if (query === "") return { matches, truncated: false };
  const counters = /* @__PURE__ */ new Map();
  for (const node of nodes) {
    for (const at of findOffsets(node.text, query)) {
      if (matches.length >= limit) return { matches, truncated: true };
      const ordinal = counters.get(node.key) ?? 0;
      counters.set(node.key, ordinal + 1);
      matches.push({ key: node.key, ordinal, start: at, end: at + query.length, ref: node.ref });
    }
  }
  return { matches, truncated: false };
}
function nextIndex(current, total, direction) {
  if (total <= 0) return -1;
  if (current < 0) return direction === "prev" ? total - 1 : 0;
  return direction === "prev" ? (current + total - 1) % total : (current + 1) % total;
}
function reanchor(prev, next, activeIndex) {
  if (next.length === 0) return -1;
  if (activeIndex < 0 || activeIndex >= prev.length) return 0;
  const rank = /* @__PURE__ */ new Map();
  for (let i = next.length - 1; i >= 0; i -= 1) rank.set(matchId(next[i]), i);
  const exact = rank.get(matchId(prev[activeIndex]));
  if (exact !== void 0) return exact;
  for (let i = activeIndex + 1; i < prev.length; i += 1) {
    const at = rank.get(matchId(prev[i]));
    if (at !== void 0) return at;
  }
  for (let i = activeIndex - 1; i >= 0; i -= 1) {
    const at = rank.get(matchId(prev[i]));
    if (at !== void 0) return at;
  }
  return 0;
}

// src/find/index.js
var ROOT_CLASS2 = "dsh-oi-find";
var MENU_CLASS = "dsh-oi-menu";
var LABEL_CLASS2 = "dsh-oi-ts";
var HIGHLIGHT_ALL = "dsh-oi-find";
var HIGHLIGHT_ACTIVE = "dsh-oi-find-active";
var MATCH_LIMIT = 1e3;
var SKIP_SELECTOR = `.${ROOT_CLASS2}, .${MENU_CLASS}, .${LABEL_CLASS2}, script, style, noscript, textarea, input, select, option`;
var ROW_KEY_SELECTOR = "[data-chat-node-key], [data-chat-flow-key]";
var COLLAPSED_SELECTOR = '[data-variant="think"]:not([data-expanded]), [aria-expanded="false"]';
function installFind(deps) {
  const { tOwn, owner } = deps;
  const supported = typeof globalThis.Highlight === "function" && typeof globalThis.CSS !== "undefined" && globalThis.CSS.highlights !== void 0;
  if (!supported) {
    console.warn(
      "[@Tinnikx/dsh-operation-improve] \u8FD9\u4E2A\u8FD0\u884C\u65F6\u6CA1\u6709 CSS Custom Highlight API\uFF0C\u9875\u5185\u67E5\u627E\u4E0D\u4F1A\u751F\u6548\u3002\u672C\u63D2\u4EF6\u4E0D\u9760\u6539 DOM \u753B\u9AD8\u4EAE\uFF0C\u7F3A\u8FD9\u4E2A API \u5C31\u6CA1\u6709\u4E0D\u52A8\u4E0A\u6E38\u7684\u753B\u6CD5\u3002"
    );
    const noop = () => {
    };
    return { dispose: noop, open: noop, close: noop, snapshot: () => ({ supported: false, open: false, query: "", total: 0, truncated: false, index: -1, key: null, activeText: "" }) };
  }
  let bar = null;
  let input = null;
  let status = null;
  let observer = null;
  let queue = false;
  let query = "";
  let matches = [];
  let ranges = [];
  let truncated = false;
  let cursor = -1;
  let disposed = false;
  const allSet = new globalThis.Highlight();
  const activeSet = new globalThis.Highlight();
  function rowKeyFor(el) {
    if (el.closest(SKIP_SELECTOR) !== null) return null;
    if (el.closest(COLLAPSED_SELECTOR) !== null) return null;
    if (!el.checkVisibility({ checkVisibilityCSS: true, visibilityProperty: true, contentVisibilityAuto: true })) return null;
    if (el.getClientRects().length === 0) return null;
    const row = el.closest(ROW_KEY_SELECTOR);
    if (row === null) return "page";
    return row.getAttribute("data-chat-node-key") ?? row.getAttribute("data-chat-flow-key") ?? "page";
  }
  function collect() {
    const out = [];
    const cache = /* @__PURE__ */ new Map();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const el = node.parentElement;
      if (el === null) continue;
      let key = cache.get(el);
      if (key === void 0) {
        key = rowKeyFor(el);
        cache.set(el, key);
      }
      if (key === null) continue;
      const text = node.nodeValue;
      if (text === null || text === "") continue;
      out.push({ key, text, ref: node });
    }
    return out;
  }
  function recompute(keepAnchor) {
    const prev = matches;
    const prevCursor = cursor;
    if (query === "") {
      matches = [];
      ranges = [];
      cursor = -1;
      truncated = false;
    } else {
      const built = buildMatchList(collect(), query, MATCH_LIMIT);
      matches = built.matches;
      truncated = built.truncated;
      ranges = matches.map(toRange);
      if (ranges.length === 0) cursor = -1;
      else if (keepAnchor && prevCursor >= 0) cursor = Math.max(reanchor(prev, matches, prevCursor), 0);
      else cursor = 0;
    }
    paint2();
    renderStatus();
  }
  function toRange(m) {
    const range = document.createRange();
    range.setStart(m.ref, m.start);
    range.setEnd(m.ref, m.end);
    return range;
  }
  function paint2() {
    CSS.highlights.set(HIGHLIGHT_ALL, allSet);
    CSS.highlights.set(HIGHLIGHT_ACTIVE, activeSet);
    allSet.clear();
    activeSet.clear();
    for (const range of ranges) allSet.add(range);
    if (cursor >= 0 && cursor < ranges.length) activeSet.add(ranges[cursor]);
  }
  function renderStatus() {
    if (status === null) return;
    if (query === "") status.textContent = "";
    else if (matches.length === 0) status.textContent = tOwn("find.noResults");
    else status.textContent = tOwn("find.count", {
      index: String(cursor + 1),
      total: truncated ? `${MATCH_LIMIT}+` : String(matches.length)
    });
  }
  function step(direction) {
    if (ranges.length === 0) return;
    cursor = nextIndex(cursor, ranges.length, direction);
    paint2();
    renderStatus();
    const el = matches[cursor].ref.parentElement;
    if (el !== null) el.scrollIntoView({ block: "center", behavior: "instant" });
  }
  function pickedSelection() {
    const selection2 = window.getSelection();
    if (selection2 === null || selection2.isCollapsed || selection2.rangeCount === 0) return null;
    const text = selection2.toString();
    if (text === "" || text.includes("\n") || text.length > 128) return null;
    return text;
  }
  function ensureBar() {
    if (bar !== null) return;
    bar = document.createElement("div");
    bar.className = ROOT_CLASS2;
    bar.setAttribute("role", "search");
    if (owner !== void 0) bar.setAttribute(OWNER_ATTR, owner);
    input = document.createElement("input");
    input.type = "text";
    input.className = `${ROOT_CLASS2}__input`;
    input.spellcheck = false;
    input.setAttribute("aria-label", tOwn("find.placeholder"));
    input.placeholder = tOwn("find.placeholder");
    input.value = query;
    input.addEventListener("input", () => {
      query = input.value;
      recompute(false);
    });
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      event.stopPropagation();
      step(event.shiftKey ? "prev" : "next");
    });
    bar.append(input);
    status = document.createElement("span");
    status.className = `${ROOT_CLASS2}__count`;
    status.setAttribute("aria-live", "polite");
    bar.append(status);
    bar.append(makeButton(`${ROOT_CLASS2}__btn`, "find.prev", "\u2191", () => step("prev")));
    bar.append(makeButton(`${ROOT_CLASS2}__btn`, "find.next", "\u2193", () => step("next")));
    bar.append(makeButton(`${ROOT_CLASS2}__btn`, "find.close", "\xD7", close));
  }
  function makeButton(className, labelKey, glyph, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    const label = tOwn(labelKey);
    button.title = label;
    button.setAttribute("aria-label", label);
    button.textContent = glyph;
    button.addEventListener("click", onClick);
    return button;
  }
  function startObserver() {
    if (observer !== null) return;
    observer = new MutationObserver((records) => {
      for (const record of records) {
        if (bar !== null && record.target instanceof Node && bar.contains(record.target)) continue;
        queueRecompute();
        return;
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  function stopObserver() {
    if (observer === null) return;
    observer.disconnect();
    observer = null;
  }
  function queueRecompute() {
    if (queue || disposed) return;
    queue = true;
    requestAnimationFrame(() => {
      queue = false;
      if (!disposed && bar !== null) recompute(true);
    });
  }
  function open() {
    if (disposed) return;
    closeContextMenu();
    const picked = pickedSelection();
    if (picked !== null && picked !== query) query = picked;
    ensureBar();
    if (bar.parentElement !== document.body) document.body.append(bar);
    recompute(picked === null);
    startObserver();
    input.focus();
    input.select();
  }
  function close() {
    stopObserver();
    if (bar === null) return;
    bar.remove();
    bar = null;
    unregisterHighlights();
  }
  function unregisterHighlights() {
    allSet.clear();
    activeSet.clear();
    if (CSS.highlights.get(HIGHLIGHT_ALL) === allSet) CSS.highlights.delete(HIGHLIGHT_ALL);
    if (CSS.highlights.get(HIGHLIGHT_ACTIVE) === activeSet) CSS.highlights.delete(HIGHLIGHT_ACTIVE);
  }
  const onKeyDown = (event) => {
    if (disposed) return;
    if ((event.ctrlKey || event.metaKey) && !event.altKey && (event.key === "f" || event.key === "F")) {
      event.preventDefault();
      event.stopPropagation();
      open();
      return;
    }
    if (event.key !== "Escape" || bar === null) return;
    if (document.querySelector(`.${MENU_CLASS}`) !== null) return;
    event.preventDefault();
    event.stopPropagation();
    close();
  };
  window.addEventListener("keydown", onKeyDown, true);
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    close();
    window.removeEventListener("keydown", onKeyDown, true);
    unregisterHighlights();
  };
  return {
    dispose,
    open,
    close,
    snapshot: () => ({
      supported: true,
      open: bar !== null,
      query,
      total: matches.length,
      truncated,
      index: cursor,
      key: cursor >= 0 ? matches[cursor].key : null,
      activeText: cursor >= 0 && ranges[cursor] !== void 0 ? ranges[cursor].toString() : ""
    })
  };
}
var FIND_CSS = `
.${ROOT_CLASS2} {
  --dsw-oi-find-surface: var(--dsw-specific-menu, var(--dsw-alias-bg-layer-3, #2c2c2e));
  box-sizing: border-box;
  position: fixed;
  z-index: 2147483000;
  top: 12px;
  right: 16px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  border-radius: 12px;
  background-color: var(--dsw-alias-bg-layer-1, #2c2c2e);
  background-image: linear-gradient(var(--dsw-oi-find-surface), var(--dsw-oi-find-surface));
  --dsw-elevation-stroke-color: var(--dsw-alias-border-l1, rgba(128,128,128,0.3));
  box-shadow: var(--dsw-elevation-prominent, 0 8px 24px rgba(0, 0, 0, 0.28));
  color: var(--dsw-alias-label-primary, inherit);
  font-size: 13px;
  line-height: 20px;
  user-select: none;
}
.${ROOT_CLASS2}__input {
  box-sizing: border-box;
  width: 208px;
  min-width: 0;
  height: 26px;
  padding: 2px 8px;
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.35));
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.18));
  color: var(--dsw-alias-label-primary, inherit);
  font: inherit;
  outline: none;
}
.${ROOT_CLASS2}__input:focus-visible {
  border-color: var(--dsw-specific-input-major, var(--dsw-alias-state-business-primary, #4d6bfe));
}
.${ROOT_CLASS2}__count {
  min-width: 62px;
  padding: 0 4px;
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-tertiary, inherit);
  white-space: nowrap;
}
.${ROOT_CLASS2}__btn {
  box-sizing: border-box;
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-secondary, inherit);
  font: inherit;
  line-height: 1;
  cursor: pointer;
}
.${ROOT_CLASS2}__btn:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.18)); }
::highlight(${HIGHLIGHT_ALL}) {
  background-color: color-mix(in srgb, var(--dsw-alias-state-warn-label, #d9a441) 42%, transparent);
}
::highlight(${HIGHLIGHT_ACTIVE}) {
  background-color: var(--dsw-alias-state-warn-label, #d9a441);
  text-decoration-line: underline;
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
    effect: "nextRequest",
    description: "\u8BF7\u6C42\u4FA7\u7684 token\u3001\u8D85\u65F6\u4E0E\u6587\u4EF6\u914D\u989D\u3002\u6A21\u578B\u5217\u8868\u4E0E API key \u4E0D\u8D70\u8FD9\u91CC\u3002",
    notice: "\u672C\u5361\u53EA\u4F5C\u7528\u4E8E DeepSeek \u5B98\u65B9\u63A5\u5165\uFF08deepseek-official\uFF09\u91CC\u7684\u6A21\u578B\u2014\u2014\u624B\u52A8\u52A0\u7684\u6A21\u578B\u82E5\u6302\u5728\u8FD9\u6761\u8FDE\u63A5\u7684 models \u5217\u8868\u91CC\u4E5F\u5F52\u672C\u5361\u515C\u5E95\uFF1B\u4F46\u82E5\u662F\u6309 pi-ai \u8DEF\u7531\u624B\u914D\u7684 DeepSeek \u517C\u5BB9\u7AEF\u70B9\uFF0C\u672C\u5361\u7BA1\u4E0D\u5230\uFF0C\u672A\u58F0\u660E\u7A97\u53E3\u65F6\u8D70 pi-ai \u81EA\u5DF1\u7684 256K \u515C\u5E95\uFF08\u89C1\u9876\u90E8\u9EC4\u6761\uFF09\u3002",
    fields: [
      {
        key: "maxTokens",
        type: "integer",
        default: 256e3,
        min: 1,
        effect: "nextRequest",
        label: "\u5355\u6B21\u8F93\u51FA token \u4E0A\u9650",
        help: "\u6A21\u578B\u76EE\u5F55\u6CA1\u4E3A\u67D0\u4E2A\u6A21\u578B\u5355\u72EC\u58F0\u660E\u65F6\u7528\u5B83\u3002"
      },
      {
        key: "defaultContextWindow",
        type: "integer",
        default: 1e6,
        min: 1,
        effect: "session",
        label: "\u9ED8\u8BA4\u4E0A\u4E0B\u6587\u7A97\u53E3\uFF08token\uFF09",
        help: "\u6A21\u578B\u76EE\u5F55\u6CA1\u58F0\u660E\u7A97\u53E3\u65F6\u7528\u5B83\uFF0C\u4E0A\u4E0B\u6587\u5360\u7528\u7EDF\u8BA1\u4E5F\u6309\u5B83\u7B97\u3002\u5DF2\u5F00\u7684\u4F1A\u8BDD\u6CBF\u7528\u6253\u5F00\u65F6\u7684\u7A97\u53E3\u3002\u53EA\u515C DeepSeek \u5B98\u65B9\u63A5\u5165\u91CC\u7684\u6A21\u578B\uFF1Bpi-ai \u8DEF\u7531\u4E0A\u624B\u914D\u7684\u6A21\u578B\u4E0D\u8BFB\u672C\u5361\uFF08\u89C1\u9876\u90E8\u9EC4\u6761\uFF09\u3002"
      },
      {
        key: "streamIdleTimeoutMs",
        type: "integer",
        default: 3e5,
        min: 1,
        max: MAX_TIMER_DELAY_MS,
        effect: "nextRequest",
        label: "\u6D41\u7A7A\u95F2\u8D85\u65F6\uFF08\u6BEB\u79D2\uFF09",
        help: "\u4E24\u4E2A\u6570\u636E\u5757\u4E4B\u95F4\u8D85\u8FC7\u8FD9\u4E48\u4E45\u5C31\u5224\u5B9A\u65AD\u6D41\u3002"
      },
      {
        key: "maxImagesPerRequest",
        type: "integer",
        default: 600,
        min: 1,
        effect: "nextRequest",
        label: "\u5355\u6B21\u8BF7\u6C42\u56FE\u7247\u6570\u4E0A\u9650",
        help: ""
      },
      {
        key: "imageOffloadCountQuantum",
        type: "integer",
        default: 20,
        min: 1,
        effect: "nextRequest",
        label: "\u56FE\u7247\u8F6C\u5B58\u5F20\u6570\u6B65\u957F",
        help: "\u56FE\u7247\u5F20\u6570\u8D85\u8FC7\u4E0A\u9650\u65F6\uFF0C\u8981\u8F6C\u5B58\u7684\u91CF\u6309\u8FD9\u4E2A\u6B65\u957F\u5411\u4E0A\u53D6\u6574\uFF08\u4ECE\u6700\u65E7\u7684\u51E0\u5F20\u8D77\uFF09\u3002\u4E0D\u80FD\u8D85\u8FC7\u5355\u6B21\u8BF7\u6C42\u56FE\u7247\u6570\u4E0A\u9650\u3002"
      },
      {
        key: "maxRequestFilesBytes",
        type: "integer",
        default: 134217728,
        min: 1,
        effect: "nextRequest",
        label: "\u5355\u6B21\u8BF7\u6C42\u6587\u4EF6\u603B\u4E0A\u9650\uFF08\u5B57\u8282\uFF09",
        help: "\u4EE5 Files \u5F15\u7528\u5F62\u5F0F\u5E26\u4E0A\u53BB\u7684\u56FE\u7247\u603B\u91CF\u3002\u4E0E\u4E0B\u9762\u7684\u8F6C\u5B58\u6B65\u957F\u4E4B\u95F4\u7684\u7EA6\u675F\u7531\u4E0A\u6E38\u786C\u629B\uFF0C\u9762\u677F\u6309\u5408\u6210\u503C\u62E6\u3002"
      },
      {
        key: "imageOffloadByteQuantum",
        type: "integer",
        default: IMAGE_OFFLOAD_BYTE_QUANTUM,
        min: 1,
        effect: "nextRequest",
        label: "\u56FE\u7247\u8F6C\u5B58\u5B57\u8282\u6B65\u957F\uFF08Files \u5F15\u7528\uFF09",
        help: "\u8BF7\u6C42\u56FE\u7247\u603B\u5B57\u8282\u8D85\u8FC7\u6587\u4EF6\u603B\u4E0A\u9650\u65F6\uFF0C\u8981\u817E\u51FA\u7684\u91CF\u6309\u8FD9\u4E2A\u6B65\u957F\u5411\u4E0A\u53D6\u6574\u3002\u4E0D\u80FD\u8D85\u8FC7\u5355\u6B21\u8BF7\u6C42\u6587\u4EF6\u603B\u4E0A\u9650\u3002"
      },
      {
        key: "maxInlineRequestImageBytes",
        type: "integer",
        default: 20971520,
        min: 1,
        effect: "nextRequest",
        label: "\u5185\u8054\u56FE\u7247\u4E0A\u9650\uFF08\u5B57\u8282\uFF09",
        help: "\u76F4\u63A5\u5185\u8054\uFF08base64\uFF09\u5E26\u4E0A\u53BB\u7684\u56FE\u7247\u603B\u91CF\u3002"
      },
      {
        key: "inlineImageOffloadByteQuantum",
        type: "integer",
        default: INLINE_IMAGE_OFFLOAD_BYTE_QUANTUM,
        min: 1,
        effect: "nextRequest",
        label: "\u56FE\u7247\u8F6C\u5B58\u5B57\u8282\u6B65\u957F\uFF08\u5185\u8054\uFF09",
        help: "\u5185\u8054\u90A3\u4E00\u8DEF\u7684\u540C\u7C7B\u6B65\u957F\u3002\u4E0D\u80FD\u8D85\u8FC7\u5185\u8054\u56FE\u7247\u4E0A\u9650\u3002"
      },
      {
        key: "filesApiTimeoutMs",
        type: "integer",
        default: 6e4,
        min: 1,
        max: MAX_TIMER_DELAY_MS,
        effect: "nextRequest",
        label: "\u6587\u4EF6\u63A5\u53E3\u8D85\u65F6\uFF08\u6BEB\u79D2\uFF09",
        help: ""
      },
      {
        key: "fileExpiresAfterSeconds",
        type: "integer",
        default: 604800,
        min: 3600,
        max: 2592e3,
        effect: "session",
        label: "\u4E0A\u4F20\u6587\u4EF6\u4FDD\u7559\u65F6\u957F\uFF08\u79D2\uFF09",
        help: "\u5DF2\u4E0A\u4F20\u7684\u6587\u4EF6\u6309\u5404\u81EA\u4E0A\u4F20\u65F6\u70B9\u5957\u65E7\u6709\u6548\u671F\uFF1B\u8981\u5168\u90E8\u7528\u65B0\u65F6\u957F\uFF0C\u5F97\u91CD\u65B0\u4E0A\u4F20\u3002"
      },
      {
        key: "fileRefreshMarginSeconds",
        type: "integer",
        default: FILE_REFRESH_MARGIN_SECONDS,
        min: 0,
        effect: "nextRequest",
        label: "\u6587\u4EF6\u7EED\u671F\u4F59\u91CF\uFF08\u79D2\uFF09",
        help: "\u8DDD\u8FC7\u671F\u4E0D\u8DB3\u8FD9\u4E48\u4E45\u5C31\u7B97\u5FEB\u5230\u671F\uFF0C\u7528\u56FE\u7247\u65F6\u4F1A\u5148\u91CD\u65B0\u4E0A\u4F20\u3002\u5FC5\u987B\u4E25\u683C\u5C0F\u4E8E\u4FDD\u7559\u65F6\u957F\u3002"
      },
      {
        key: "fileQuotaCleanupBatch",
        type: "integer",
        default: 100,
        min: 1,
        max: 1e3,
        effect: "nextRequest",
        label: "\u914D\u989D\u6E05\u7406\u6279\u91CF\uFF08\u4E2A\uFF09",
        help: "\u4E0A\u4F20\u649E\u4E0A Files \u914D\u989D\u65F6\uFF0C\u4E00\u6B21\u5220\u6389\u6700\u65E7\u7684\u591A\u5C11\u4E2A\u672C harness \u7684\u6587\u4EF6\u518D\u91CD\u8BD5\u3002"
      }
    ],
    crossRules: [
      {
        kind: "atMost",
        field: "imageOffloadByteQuantum",
        than: "maxRequestFilesBytes",
        message: "\u56FE\u7247\u8F6C\u5B58\u5B57\u8282\u6B65\u957F\uFF08Files \u5F15\u7528\uFF09\u4E0D\u80FD\u8D85\u8FC7\u5355\u6B21\u8BF7\u6C42\u6587\u4EF6\u603B\u4E0A\u9650\uFF0C\u5426\u5219 llm-deepseek \u52A0\u8F7D\u5931\u8D25\u3002"
      },
      {
        kind: "atMost",
        field: "inlineImageOffloadByteQuantum",
        than: "maxInlineRequestImageBytes",
        message: "\u56FE\u7247\u8F6C\u5B58\u5B57\u8282\u6B65\u957F\uFF08\u5185\u8054\uFF09\u4E0D\u80FD\u8D85\u8FC7\u5185\u8054\u56FE\u7247\u4E0A\u9650\uFF0C\u5426\u5219 llm-deepseek \u52A0\u8F7D\u5931\u8D25\u3002"
      },
      {
        kind: "atMost",
        field: "imageOffloadCountQuantum",
        than: "maxImagesPerRequest",
        message: "\u56FE\u7247\u8F6C\u5B58\u5F20\u6570\u6B65\u957F\u4E0D\u80FD\u8D85\u8FC7\u5355\u6B21\u8BF7\u6C42\u56FE\u7247\u6570\u4E0A\u9650\uFF0C\u5426\u5219 llm-deepseek \u52A0\u8F7D\u5931\u8D25\u3002"
      },
      {
        kind: "lessThan",
        field: "fileRefreshMarginSeconds",
        than: "fileExpiresAfterSeconds",
        message: "\u6587\u4EF6\u7EED\u671F\u4F59\u91CF\u5FC5\u987B\u4E25\u683C\u5C0F\u4E8E\u4E0A\u4F20\u6587\u4EF6\u4FDD\u7559\u65F6\u957F\uFF0C\u5426\u5219 llm-deepseek \u52A0\u8F7D\u5931\u8D25\u3002"
      }
    ]
  },
  {
    id: "session-query-sqlite",
    title: "\u4F1A\u8BDD\u68C0\u7D22",
    plugin: "@deepseek-ai/dsh-session-query-sqlite",
    // 'restart' 不只是「新值要重启才用上」：harness 0.1.6-alpha.2 上改这个条目会触发
    // host-HMR 热重挂缺陷，连带摘除 sessionController 且可能静默挂起——侧栏会话列表
    // 全空、撤销写入也不稳定恢复，只有重启 harness 进程可靠。热重载有时确实能把新值
    // 送进 loader（verify:settings 的 1b 实测约 2s），但代价是赌上会话服务，操作口径
    // 一律按重启。见 docs/harness-hmr-session-defect.md。
    effect: "restart",
    description: "\u5386\u53F2\u4F1A\u8BDD\u641C\u7D22\u7684\u5206\u9875\u4E0E\u6458\u8981\u9884\u7B97\u3002\u6CE8\u610F\uFF1Aharness 0.1.6 \u6539\u8FD9\u4E2A\u6761\u76EE\u6709\u5DF2\u77E5\u7F3A\u9677\u2014\u2014\u70ED\u91CD\u8F7D\u53EF\u80FD\u8FDE\u5E26\u6740\u6B7B\u4F1A\u8BDD\u670D\u52A1\uFF08\u4FA7\u680F\u5217\u8868\u6E05\u7A7A\uFF09\u4E14\u64A4\u9500\u4E0D\u6062\u590D\uFF0C\u4FDD\u5B58\u540E\u8BF7\u7ACB\u523B\u91CD\u542F harness\uFF1B\u6309\u300C\u91CD\u542F\u540E\u751F\u6548\u300D\u64CD\u4F5C\u3002",
    fields: [
      {
        key: "defaultLimit",
        type: "integer",
        default: 20,
        min: 1,
        max: SQLITE_MAX_PAGE_LIMIT,
        effect: "restart",
        label: "\u9ED8\u8BA4\u6BCF\u9875\u6761\u6570",
        help: "\u8C03\u7528\u65B9\u6CA1\u6307\u5B9A\u6761\u6570\u65F6\u7528\u5B83\uFF0C\u5FC5\u987B\u4E0D\u5927\u4E8E\u6BCF\u9875\u6761\u6570\u4E0A\u9650\u3002"
      },
      {
        key: "maxLimit",
        type: "integer",
        default: 100,
        min: 1,
        max: SQLITE_MAX_PAGE_LIMIT,
        effect: "restart",
        label: "\u6BCF\u9875\u6761\u6570\u4E0A\u9650",
        help: ""
      },
      {
        key: "snippetChars",
        type: "integer",
        default: 240,
        min: 1,
        effect: "restart",
        label: "\u6458\u8981\u957F\u5EA6\uFF08\u5B57\u7B26\uFF09",
        help: ""
      },
      {
        key: "readWindowMax",
        type: "integer",
        default: 50,
        min: 0,
        effect: "restart",
        label: "\u5355\u6B21\u8BFB\u53D6\u7A97\u53E3\u4E0A\u9650",
        help: ""
      },
      {
        key: "persistedReadConcurrency",
        type: "integer",
        default: 4,
        min: 1,
        effect: "restart",
        label: "\u843D\u76D8\u4F1A\u8BDD\u8BFB\u53D6\u5E76\u53D1",
        help: "\u5E76\u884C\u8BFB\u5386\u53F2\u4F1A\u8BDD\u7684\u5E76\u53D1\u6570\uFF1B\u91CD\u542F harness \u540E\u6309\u65B0\u503C\u6267\u884C\u3002"
      },
      {
        key: "preparedSessionCacheSize",
        type: "integer",
        default: 5,
        min: 1,
        effect: "restart",
        label: "\u9884\u7F16\u8BD1\u4F1A\u8BDD\u7F13\u5B58\u6761\u6570",
        help: "\u91CD\u542F harness \u540E\u751F\u6548\u3002"
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
    id: "session-reference",
    title: "\u4F1A\u8BDD\u5F15\u7528",
    plugin: "@deepseek-ai/dsh-session-reference",
    effect: "nextRequest",
    description: "\u5F80\u4F1A\u8BDD\u91CC\u5F15\u7528\u53E6\u4E00\u573A\u4F1A\u8BDD\u65F6\u7684\u6761\u6570\u4E0E\u4F53\u91CF\u9884\u7B97\u3002",
    fields: [
      {
        key: "maxReferences",
        type: "integer",
        default: 3,
        min: 1,
        max: 3,
        effect: "nextRequest",
        label: "\u5F15\u7528\u6761\u6570\u4E0A\u9650",
        help: "\u4E0A\u6E38\u786C\u4E0A\u9650 3\u3002"
      },
      {
        key: "candidateLimit",
        type: "integer",
        default: 50,
        min: 1,
        effect: "nextRequest",
        label: "\u5019\u9009\u6C60\u4E0A\u9650",
        help: ""
      },
      {
        key: "maxReferenceBytes",
        type: "integer",
        default: 65536,
        min: 1,
        effect: "nextRequest",
        label: "\u5355\u6761\u5F15\u7528\u5185\u5BB9\u4E0A\u9650\uFF08\u5B57\u8282\uFF09",
        help: "\u8BBE\u4E86\u5C31\u56FA\u5B9A\u6309\u8FD9\u4E2A\u5B57\u8282\u6570\u88C1\u5207\u88AB\u5F15\u7528\u7684\u4F1A\u8BDD\u5185\u5BB9\u3002\u4E0D\u8BBE\u5219\u6309\u4E0A\u4E0B\u6587\u7A97\u53E3 \xD7 4 \xD7 \u5F15\u7528\u5360\u6BD4\u63A8\u5BFC\uFF0C\u63D0\u793A\u91CC\u7684 65536 \u662F\u90A3\u6761\u63A8\u5BFC\u5F0F\u7684\u4E0B\u9650\uFF0C\u4E0D\u662F\u63A8\u5BFC\u7ED3\u679C\u3002"
      },
      {
        key: "referenceContextFraction",
        type: "number",
        default: 0.2,
        min: 0,
        max: 1,
        effect: "nextRequest",
        label: "\u5F15\u7528\u5185\u5BB9\u5360\u6BD4",
        help: "\u88AB\u5F15\u7528\u5185\u5BB9\u6700\u591A\u5360\u4E0A\u4E0B\u6587\u7A97\u53E3\u7684\u6BD4\u4F8B\uFF0C\u53D6\u503C 0\u20131\uFF08\u4E0A\u6E38\u6309\u8FD9\u4E2A\u533A\u95F4\u786C\u629B\uFF09\u3002"
      }
    ],
    crossRules: []
  },
  {
    id: "session-title",
    title: "\u4F1A\u8BDD\u6807\u9898",
    plugin: "@deepseek-ai/dsh-session-title",
    effect: "nextSession",
    description: "\u4FA7\u8FB9\u680F\u90A3\u4E2A\u6807\u9898\u7684\u957F\u5EA6\u9884\u7B97\u3002\u56DE\u9000\u6807\u9898\u662F\u6A21\u578B\u8D77\u540D\u5931\u8D25\u65F6\u6309\u9996\u6761\u6D88\u606F\u622A\u51FA\u6765\u7684\u3002",
    fields: [
      {
        key: "fallbackMaxWords",
        type: "integer",
        default: 5,
        min: 1,
        effect: "nextSession",
        label: "\u56DE\u9000\u6807\u9898\u6700\u591A\u8BCD\u6570",
        help: "\u53EA\u5F71\u54CD\u4E4B\u540E\u65B0\u8D77\u7684\u4F1A\u8BDD\u3002"
      },
      {
        key: "fallbackMaxBytes",
        type: "integer",
        default: 40,
        min: 1,
        effect: "nextSession",
        label: "\u56DE\u9000\u6807\u9898\u6700\u5927\u5B57\u8282",
        help: "\u4E0D\u80FD\u8D85\u8FC7\u6807\u9898\u6700\u5927\u5B57\u8282\u3002\u53EA\u5F71\u54CD\u4E4B\u540E\u65B0\u8D77\u7684\u4F1A\u8BDD\u3002"
      },
      {
        key: "maxTitleBytes",
        type: "integer",
        default: 80,
        min: 1,
        effect: "nextSession",
        label: "\u6807\u9898\u6700\u5927\u5B57\u8282",
        help: "\u53EA\u5F71\u54CD\u4E4B\u540E\u65B0\u8D77\u7684\u4F1A\u8BDD\u3002"
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
    effect: "nextSession",
    description: "\u62FF\u9996\u6761\u6D88\u606F\u8BA9\u6A21\u578B\u8D77\u6807\u9898\u7684\u9884\u7B97\uFF1B\u8D85\u65F6\u6216\u5931\u8D25\u5C31\u9000\u56DE\u4E0A\u9762\u90A3\u4E2A\u56DE\u9000\u6807\u9898\u3002",
    fields: [
      {
        key: "targetWords",
        type: "integer",
        default: 5,
        min: 1,
        effect: "nextSession",
        label: "\u76EE\u6807\u8BCD\u6570",
        help: "\u53EA\u5F71\u54CD\u4E4B\u540E\u65B0\u8D77\u7684\u4F1A\u8BDD\u3002"
      },
      {
        key: "targetCjkCharacters",
        type: "integer",
        default: 10,
        min: 1,
        effect: "nextSession",
        label: "\u76EE\u6807\u4E2D\u65E5\u97E9\u5B57\u6570",
        help: "\u53EA\u5F71\u54CD\u4E4B\u540E\u65B0\u8D77\u7684\u4F1A\u8BDD\u3002"
      },
      {
        key: "maxInputBytes",
        type: "integer",
        default: 4096,
        min: 1,
        effect: "nextSession",
        label: "\u8F93\u5165\u622A\u65AD\uFF08\u5B57\u8282\uFF09",
        help: "\u9996\u6761\u6D88\u606F\u53EA\u53D6\u8FD9\u4E48\u591A\u5582\u7ED9\u6A21\u578B\u3002\u53EA\u5F71\u54CD\u4E4B\u540E\u65B0\u8D77\u7684\u4F1A\u8BDD\u3002"
      },
      {
        key: "maxOutputTokens",
        type: "integer",
        default: 64,
        min: 1,
        effect: "nextSession",
        label: "\u8F93\u51FA token \u4E0A\u9650",
        help: "\u53EA\u5F71\u54CD\u4E4B\u540E\u65B0\u8D77\u7684\u4F1A\u8BDD\u3002"
      },
      {
        key: "timeoutMs",
        type: "integer",
        default: 6e4,
        min: 1,
        max: MAX_TIMER_DELAY_MS,
        effect: "nextSession",
        label: "\u8D85\u65F6\uFF08\u6BEB\u79D2\uFF09",
        help: "\u53EA\u5F71\u54CD\u4E4B\u540E\u65B0\u8D77\u7684\u4F1A\u8BDD\u3002"
      }
    ],
    crossRules: []
  },
  {
    id: "session-projection-cache",
    title: "\u4F1A\u8BDD\u6295\u5F71\u7F13\u5B58",
    plugin: "@deepseek-ai/dsh-session-projection-cache",
    effect: "nextQuery",
    description: "\u4FA7\u8FB9\u680F\u4E0E\u68C0\u7D22\u8BFB\u7684\u4F1A\u8BDD\u6295\u5F71\u5199\u76D8\u8282\u594F\u3002\u4E0B\u4E00\u8F6E\u67E5\u8BE2\u6309\u65B0\u503C\u6267\u884C\u3002",
    fields: [
      {
        key: "writeEveryEvents",
        type: "integer",
        default: 200,
        min: 1,
        effect: "nextQuery",
        label: "\u6BCF\u591A\u5C11\u6761\u4E8B\u4EF6\u5199\u4E00\u6B21",
        help: ""
      },
      {
        key: "writeIntervalMs",
        type: "integer",
        default: 5e3,
        min: 1,
        effect: "nextQuery",
        label: "\u5199\u76D8\u95F4\u9694\uFF08\u6BEB\u79D2\uFF09",
        help: ""
      }
    ],
    crossRules: []
  },
  {
    id: "attachment-local",
    title: "\u56FE\u7247\u9644\u4EF6",
    plugin: "@deepseek-ai/dsh-attachment-local",
    effect: "nextAttachment",
    description: "\u62D6\u8FDB\u5BF9\u8BDD\u6846\u7684\u56FE\u7247\u5728\u5165\u5E93\u524D\u7684\u5C3A\u5BF8\u3001\u4F53\u79EF\u4E0E\u5E76\u53D1\u9884\u7B97\u3002\u6539\u5B8C\u5BF9\u4E0B\u4E00\u6B21\u5165\u5E93\u751F\u6548\u3002",
    fields: [
      {
        key: "maxImageBytes",
        type: "integer",
        default: 20971520,
        min: 1,
        effect: "nextAttachment",
        label: "\u5355\u5F20\u539F\u56FE\u4E0A\u9650\uFF08\u5B57\u8282\uFF09",
        help: ""
      },
      {
        key: "maxImagesPerMessage",
        type: "integer",
        default: 20,
        min: 1,
        effect: "nextAttachment",
        label: "\u5355\u6761\u6D88\u606F\u56FE\u7247\u6570\u4E0A\u9650",
        help: ""
      },
      {
        key: "maxMessageImageBytes",
        type: "integer",
        default: 209715200,
        min: 1,
        effect: "nextAttachment",
        label: "\u5355\u6761\u6D88\u606F\u56FE\u7247\u603B\u5B57\u8282\u4E0A\u9650",
        help: ""
      },
      {
        key: "maxImagePixels",
        type: "integer",
        default: 64e6,
        min: 1,
        effect: "nextAttachment",
        label: "\u5355\u5F20\u539F\u56FE\u50CF\u7D20\u4E0A\u9650",
        help: ""
      },
      {
        key: "maxImageDimension",
        type: "integer",
        default: 8192,
        min: 1,
        effect: "nextAttachment",
        label: "\u5355\u5F20\u539F\u56FE\u8FB9\u957F\u4E0A\u9650\uFF08\u50CF\u7D20\uFF09",
        help: ""
      },
      {
        key: "normalizedImageMaxDimension",
        type: "integer",
        default: 8192,
        min: 1,
        effect: "nextAttachment",
        label: "\u5F52\u4E00\u5316\u540E\u8FB9\u957F\u4E0A\u9650\uFF08\u50CF\u7D20\uFF09",
        help: "\u5165\u5E93\u524D\u4F1A\u5148\u7F29\u5230\u8FD9\u4E2A\u8FB9\u957F\u4EE5\u5185\u3002"
      },
      {
        key: "normalizedImageMaxPixels",
        type: "integer",
        default: 4194304,
        min: 1,
        effect: "nextAttachment",
        label: "\u5F52\u4E00\u5316\u540E\u50CF\u7D20\u4E0A\u9650",
        help: ""
      },
      {
        key: "normalizedImageMaxBytes",
        type: "integer",
        default: 4194304,
        min: 1,
        effect: "nextAttachment",
        label: "\u5F52\u4E00\u5316\u540E\u5B57\u8282\u4E0A\u9650",
        help: ""
      },
      {
        key: "imageCompressionConcurrency",
        type: "integer",
        default: 2,
        min: 1,
        max: 8,
        effect: "nextAttachment",
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
    effect: "session",
    description: "\u7CFB\u7EDF\u63D0\u793A\u91CC\u4E24\u4E2A\u53EF\u5F00\u5173\u7684\u56FA\u5B9A\u6BB5\u843D\u3002\u4EBA\u8BBE\uFF08persona\uFF09\u662F\u957F\u6587\u672C\uFF0C\u9762\u677F\u4E0D\u6539\u3002",
    fields: [
      {
        key: "includeHarnessIdentity",
        type: "boolean",
        default: true,
        effect: "session",
        label: "\u5305\u542B harness \u8EAB\u4EFD\u6BB5",
        help: ""
      },
      {
        key: "includeRuntimeContext",
        type: "boolean",
        default: true,
        effect: "session",
        label: "\u5305\u542B\u8FD0\u884C\u65F6\u4E0A\u4E0B\u6587\u6BB5",
        help: "\u5DE5\u4F5C\u76EE\u5F55\u3001\u5E73\u53F0\u3001\u65E5\u671F\u8FD9\u4E9B\u3002"
      }
    ],
    crossRules: []
  }
];

// src/harness-config/catalog-operations.js
var OPERATION_ENTRIES = [
  {
    id: "plugin-manager",
    title: "\u63D2\u4EF6\u5B89\u88C5\u4E0E pnpm \u9884\u7B97",
    plugin: "@deepseek-ai/dsh-plugin-manager",
    effect: "immediate",
    description: "\u88C5\u63D2\u4EF6\u80CC\u540E\u90A3\u53F0 pnpm \u6267\u884C\u5668\u7684\u8D85\u65F6\u3001\u9501\u7B49\u5F85\u4E0E\u65E5\u5FD7\u9884\u7B97\u3002\u88C5\u4E0D\u52A8\u3001\u5361\u4F4F\u3001\u5931\u8D25\u65E5\u5FD7\u88AB\u622A\uFF0C\u90FD\u5728\u8FD9\u4E00\u5361\u8C03\u3002",
    fields: [
      {
        key: "outputBytes",
        type: "integer",
        default: 16384,
        min: 1,
        effect: "immediate",
        label: "pnpm \u8F93\u51FA\u4FDD\u7559\uFF08\u5B57\u8282\uFF09",
        help: "\u53EA\u4FDD\u7559\u65E5\u5FD7\u7684\u6700\u540E\u8FD9\u4E48\u591A\u5B57\u8282\uFF0C\u8D85\u51FA\u4E22\u65E7\u7559\u65B0\u3002\u8C03\u592A\u5C0F\u4F1A\u5728\u5B89\u88C5\u5931\u8D25\u65F6\u770B\u4E0D\u5230\u8DB3\u591F\u4E0A\u4E0B\u6587\u3002"
      },
      {
        key: "lockWaitMs",
        type: "integer",
        default: 12e4,
        min: 0,
        effect: "immediate",
        label: "profile \u5199\u9501\u7B49\u5F85\uFF08\u6BEB\u79D2\uFF09",
        help: "\u6539 package.json\u3001cordis.patch.yml \u8FD9\u4E9B profile \u6587\u4EF6\u65F6\u7B49\u9501\u7684\u4E0A\u9650\uFF1B0 \u8868\u793A\u62A2\u4E0D\u5230\u9501\u7ACB\u523B\u5931\u8D25\u3002"
      },
      {
        key: "inspectTimeoutMs",
        type: "integer",
        default: 2e4,
        min: 1e3,
        effect: "immediate",
        label: "\u8BFB\u5305\u5143\u6570\u636E\u8D85\u65F6\uFF08\u6BEB\u79D2\uFF09",
        help: "\u5B89\u88C5\u524D\u8BFB\u4E00\u4E2A\u5305\u7684\u4FE1\u606F\uFF08pnpm view \u4E0E\u8BFB registry\uFF09\u6309\u5B83\u5224\u8D85\u65F6\u3002\u4E0A\u6E38\u62D2\u7EDD\u5C0F\u4E8E 1000 \u7684\u503C\u3002"
      },
      {
        key: "githubConnectionTimeoutMs",
        type: "integer",
        default: 5e3,
        min: 1e3,
        effect: "immediate",
        label: "GitHub \u8FDE\u901A\u63A2\u6D4B\u8D85\u65F6\uFF08\u6BEB\u79D2\uFF09",
        help: "\u88C5 GitHub \u6765\u6E90\u7684\u5305\u4E4B\u524D\u5148\u63A2\u4E00\u6B21\u8FDE\u901A\u6027\uFF0C\u8D85\u8FC7\u8FD9\u4E2A\u65F6\u95F4\u7B97\u63A2\u6D4B\u5931\u8D25\u3002"
      },
      {
        key: "idleTimeoutMs",
        type: "integer",
        default: 6e5,
        min: 1e3,
        effect: "immediate",
        label: "pnpm \u9759\u9ED8\u5224\u5361\u8D85\u65F6\uFF08\u6BEB\u79D2\uFF09",
        help: "\u5B50\u8FDB\u7A0B\u8FDE\u7EED\u8FD9\u4E48\u4E45\u6CA1\u6709\u4EFB\u4F55\u8F93\u51FA\u5C31\u5224\u5B9A\u5361\u6B7B\u5E76\u7EC8\u6B62\uFF0C\u65E5\u5FD7\u91CC\u7559\u4E00\u884C printed nothing\u3002\u7F51\u7EDC\u6162\u65F6\u8C03\u592A\u5C0F\u4F1A\u8BEF\u6740\u6B63\u5728\u8DD1\u7684\u5B89\u88C5\u3002"
      }
    ],
    crossRules: []
  }
];

// src/harness-config/catalog-tools.js
var TOOL_ENTRIES = [
  {
    id: "spill-policy",
    title: "\u5927\u5757\u5185\u5BB9\u5916\u6EA2",
    plugin: "@deepseek-ai/dsh-spill-policy",
    effect: "immediate",
    description: "\u5DE5\u5177\u7ED3\u679C\u6309\u4F30\u7B97 token \u7ED9\u4FDD\u7559\u9884\u7B97\uFF0C\u8D85\u51FA\u7684\u90E8\u5206\u5916\u6EA2\u4E3A\u53EF\u6062\u590D\u5F15\u7528\u3002",
    fields: [
      {
        // 上游只拒绝负数与非整数，0 合法但必然出事：预算 0 意味着整条结果都外溢，
        // 而外溢提示本身放不下时上游在**该工具结果落地那一刻**抛错，不是加载时。
        key: "maxInlineTokens",
        type: "integer",
        default: 12500,
        min: 1,
        effect: "immediate",
        label: "\u5185\u8054\u4E0A\u9650\uFF08\u4F30\u7B97 token\uFF09",
        help: "\u8D85\u8FC7\u5C31\u628A\u8D85\u51FA\u90E8\u5206\u5916\u6EA2\u5230\u5B58\u50A8\uFF0C\u4F1A\u8BDD\u91CC\u7559\u63D0\u793A\u4E0E\u53EF\u6062\u590D\u5F15\u7528\uFF1B\u9884\u7B97\u592A\u5C0F\u8FDE\u90A3\u6761\u63D0\u793A\u90FD\u653E\u4E0D\u4E0B\uFF0C\u4F1A\u5728\u7ED3\u679C\u8D85\u9884\u7B97\u65F6\u629B\u9519\u3002\u4E0D\u5199\u8FD9\u4E2A\u952E\uFF1D\u4E0D\u542F\u7528\u5916\u6EA2\u3002"
      }
    ],
    crossRules: []
  },
  {
    id: "repeat-tool-reminder",
    title: "\u91CD\u590D\u8C03\u7528\u63D0\u9192",
    plugin: "@deepseek-ai/dsh-repeat-tool-reminder",
    effect: "session",
    description: "\u540C\u4E00\u4E2A\u5DE5\u5177\u8FDE\u7EED\u7528\u540C\u6837\u53C2\u6570\u8C03\u7528\u65F6\u63D2\u5165\u63D0\u9192\u3002",
    fields: [
      {
        key: "thresholds",
        type: "integer-list",
        default: [3, 5, 8],
        min: 1,
        effect: "session",
        label: "\u63D0\u9192\u6B21\u6570\u70B9",
        help: "\u9012\u589E\u7684\u6B63\u6574\u6570\uFF0C\u9017\u53F7\u5206\u9694\uFF1B\u5728\u7B2C\u51E0\u6B21\u91CD\u590D\u65F6\u63D0\u9192\u3002"
      },
      {
        key: "argumentsPreviewChars",
        type: "integer",
        default: 500,
        min: 1,
        effect: "session",
        label: "\u53C2\u6570\u9884\u89C8\u957F\u5EA6\uFF08\u5B57\u7B26\uFF09",
        help: ""
      }
    ],
    crossRules: [
      { kind: "increasing", field: "thresholds", message: "\u63D0\u9192\u6B21\u6570\u70B9\u5FC5\u987B\u4E25\u683C\u9012\u589E\u3002" }
    ]
  },
  {
    id: "bash-sandbox",
    title: "Bash \u5DE5\u5177",
    plugin: "@deepseek-ai/dsh-bash-sandbox",
    effect: "immediate",
    description: "\u6A21\u578B\u8DD1 shell \u547D\u4EE4\u65F6\u7684\u8D85\u65F6\u3001\u8F93\u51FA\u4E0E\u5916\u6EA2\u9884\u7B97\u3002",
    fields: [
      {
        key: "timeoutMs",
        type: "integer",
        default: 12e4,
        min: 1,
        effect: "immediate",
        label: "\u9ED8\u8BA4\u8D85\u65F6\uFF08\u6BEB\u79D2\uFF09",
        help: "\u6A21\u578B\u6CA1\u6307\u5B9A\u8D85\u65F6\u65F6\u7528\u5B83\uFF0C\u4E14\u4F1A\u88AB\u6700\u5927\u8D85\u65F6\u622A\u65AD\u3002"
      },
      {
        key: "maxTimeoutMs",
        type: "integer",
        default: 6e5,
        min: 1,
        effect: "immediate",
        label: "\u6700\u5927\u8D85\u65F6\uFF08\u6BEB\u79D2\uFF09",
        help: "\u6A21\u578B\u81EA\u5DF1\u6307\u5B9A\u7684\u8D85\u65F6\u4E5F\u4E0D\u4F1A\u8D85\u8FC7\u8FD9\u4E2A\u503C\u3002"
      },
      {
        key: "maxOutputBytes",
        type: "integer",
        default: 64e3,
        min: 1,
        effect: "immediate",
        label: "\u8F93\u51FA\u4E0A\u9650\uFF08\u5B57\u8282\uFF09",
        help: "\u8D85\u51FA\u7684\u90E8\u5206\u843D\u5230\u5916\u6EA2\u6587\u4EF6\u91CC\u3002"
      },
      {
        key: "maxSpillBytes",
        type: "integer",
        default: 67108864,
        min: 1,
        effect: "immediate",
        label: "\u5916\u6EA2\u6587\u4EF6\u4E0A\u9650\uFF08\u5B57\u8282\uFF09",
        help: ""
      },
      {
        key: "graceMs",
        type: "integer",
        default: 3e3,
        min: 1,
        max: MAX_TIMER_DELAY_MS,
        effect: "immediate",
        label: "SIGTERM \u5BBD\u9650\uFF08\u6BEB\u79D2\uFF09",
        help: "\u8D85\u65F6\u540E\u5148\u53D1 SIGTERM\uFF0C\u7B49\u8FD9\u4E48\u4E45\u518D SIGKILL\u3002\u5DF2\u5728\u8DD1\u7684\u547D\u4EE4\u4ECD\u6309\u65E7\u503C\u8BA1\u65F6\u3002"
      }
    ],
    crossRules: []
  },
  {
    id: "pwsh-sandbox",
    title: "PowerShell \u5DE5\u5177",
    plugin: "@deepseek-ai/dsh-pwsh-sandbox",
    effect: "immediate",
    description: "\u4E0E Bash \u5DE5\u5177\u540C\u6784\u7684\u4E00\u5957\u9884\u7B97\uFF0C\u53EA\u5728\u88C5\u4E86 PowerShell \u7684\u673A\u5668\u4E0A\u7528\u5F97\u4E0A\u3002",
    fields: [
      {
        key: "timeoutMs",
        type: "integer",
        default: 12e4,
        min: 1,
        effect: "immediate",
        label: "\u9ED8\u8BA4\u8D85\u65F6\uFF08\u6BEB\u79D2\uFF09",
        help: "\u6A21\u578B\u6CA1\u6307\u5B9A\u8D85\u65F6\u65F6\u7528\u5B83\uFF0C\u4E14\u4F1A\u88AB\u6700\u5927\u8D85\u65F6\u622A\u65AD\u3002"
      },
      {
        key: "maxTimeoutMs",
        type: "integer",
        default: 6e5,
        min: 1,
        effect: "immediate",
        label: "\u6700\u5927\u8D85\u65F6\uFF08\u6BEB\u79D2\uFF09",
        help: "\u6A21\u578B\u81EA\u5DF1\u6307\u5B9A\u7684\u8D85\u65F6\u4E5F\u4E0D\u4F1A\u8D85\u8FC7\u8FD9\u4E2A\u503C\u3002"
      },
      {
        key: "maxOutputBytes",
        type: "integer",
        default: 64e3,
        min: 1,
        effect: "immediate",
        label: "\u8F93\u51FA\u4E0A\u9650\uFF08\u5B57\u8282\uFF09",
        help: "\u8D85\u51FA\u7684\u90E8\u5206\u843D\u5230\u5916\u6EA2\u6587\u4EF6\u91CC\u3002"
      },
      {
        key: "maxSpillBytes",
        type: "integer",
        default: 67108864,
        min: 1,
        effect: "immediate",
        label: "\u5916\u6EA2\u6587\u4EF6\u4E0A\u9650\uFF08\u5B57\u8282\uFF09",
        help: ""
      },
      {
        key: "graceMs",
        type: "integer",
        default: 3e3,
        min: 1,
        max: MAX_TIMER_DELAY_MS,
        effect: "immediate",
        label: "SIGTERM \u5BBD\u9650\uFF08\u6BEB\u79D2\uFF09",
        help: "\u8D85\u65F6\u540E\u5148\u53D1 SIGTERM\uFF0C\u7B49\u8FD9\u4E48\u4E45\u518D SIGKILL\u3002\u5DF2\u5728\u8DD1\u7684\u547D\u4EE4\u4ECD\u6309\u65E7\u503C\u8BA1\u65F6\u3002"
      }
    ],
    crossRules: []
  },
  {
    id: "skill",
    title: "\u6280\u80FD\uFF08skill\uFF09",
    plugin: "@deepseek-ai/dsh-skill",
    effect: "immediate",
    description: "\u6280\u80FD\u76EE\u5F55\u626B\u63CF\u7ED3\u679C\u7684\u7F13\u5B58\u6761\u6570\u3002",
    fields: [
      {
        key: "collectCacheMaxEntries",
        type: "integer",
        default: 128,
        min: 1,
        effect: "immediate",
        label: "\u626B\u63CF\u7F13\u5B58\u6761\u6570\u4E0A\u9650",
        help: ""
      }
    ],
    crossRules: []
  }
];

// src/harness-config/catalog-entries.js
var CATALOG = [...TOOL_ENTRIES, ...MODEL_ENTRIES, ...OPERATION_ENTRIES];

// src/harness-config/catalog.js
var BY_ID = new Map(CATALOG.map((entry) => [entry.id, entry]));
function checkCrossRules(entry, values) {
  const problems = [];
  for (const rule of entry.crossRules) {
    if (rule.kind === "lessThan") {
      const a = pick(values, rule.field, entry);
      const b = pick(values, rule.than, entry);
      if (typeof a === "number" && typeof b === "number" && !(a < b)) problems.push(rule.message);
    } else if (rule.kind === "atMost") {
      const a = pick(values, rule.field, entry);
      const b = pick(values, rule.than, entry);
      if (typeof a === "number" && typeof b === "number" && a > b) problems.push(rule.message);
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
var ROOT_CLASS3 = "dsh-oi-hcfg";
var SETTINGS_CSS = `
.${ROOT_CLASS3} {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px 0;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
}
.${ROOT_CLASS3}__head {
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
.${ROOT_CLASS3}__title {
  display: block;
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
  line-height: 22px;
}
.${ROOT_CLASS3}__subtitle {
  display: block;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
  margin-top: 2px;
}
.${ROOT_CLASS3}__chevron {
  flex: none;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  transition: transform 160ms ease;
}
.${ROOT_CLASS3}__head[aria-expanded="true"] .${ROOT_CLASS3}__chevron { transform: rotate(90deg); }

.${ROOT_CLASS3}__panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.${ROOT_CLASS3}__note {
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
  word-break: break-all;
}
.${ROOT_CLASS3}__warn {
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--dsw-alias-state-warn-tertiary);
  color: var(--dsw-alias-state-warn-label);
  font-size: 12px;
  line-height: 18px;
}
.${ROOT_CLASS3}__error {
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--dsw-alias-interactive-bg-hover-danger);
  color: var(--dsw-alias-state-error-primary);
  font-size: 12px;
  line-height: 18px;
}
.${ROOT_CLASS3}__error > div + div,
.${ROOT_CLASS3}__warn > div + div { margin-top: 4px; }

.${ROOT_CLASS3}__card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 16px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 12px;
  background: var(--dsw-alias-bg-module-platform);
}
.${ROOT_CLASS3}__cardTitle {
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
  font-weight: 500;
  line-height: 22px;
}
.${ROOT_CLASS3}__cardDesc {
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}

/* \u751F\u6548\u65B9\u5F0F\u5FBD\u6807\uFF1A\u5361\u7247\u4E0A\u4E00\u679A\uFF08\u6574\u4F53\u53E3\u5F84\uFF09\uFF0C\u4E2A\u522B\u5B57\u6BB5\u884C\u4E3A\u4E0D\u540C\u65F6\u90A3\u884C meta \u91CC\u518D\u6302\u4E00\u679A\u3002 */
.${ROOT_CLASS3}__effect {
  align-self: flex-start;
  padding: 1px 6px;
  border-radius: 6px;
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  line-height: 16px;
}
.${ROOT_CLASS3}__effect[data-effect="restart"] {
  background: var(--dsw-alias-state-warn-tertiary);
  color: var(--dsw-alias-state-warn-label);
}
.${ROOT_CLASS3}__meta .${ROOT_CLASS3}__effect { align-self: auto; }
.${ROOT_CLASS3}__absent {
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
  font-style: italic;
}

.${ROOT_CLASS3}__field {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 8px 0;
  border-top: 1px solid var(--dsw-alias-border-l1);
}
.${ROOT_CLASS3}__fieldMain { flex: 1 1 auto; min-width: 0; }
.${ROOT_CLASS3}__label {
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  line-height: 20px;
}
.${ROOT_CLASS3}__help {
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}
.${ROOT_CLASS3}__fieldSide {
  display: flex;
  flex: none;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}
.${ROOT_CLASS3}__input {
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
.${ROOT_CLASS3}__input:focus {
  outline: none;
  border-color: var(--dsw-alias-state-business-primary);
}
.${ROOT_CLASS3}__input[data-dirty] { border-color: var(--dsw-alias-state-business-primary); }
.${ROOT_CLASS3}__check { width: 16px; height: 16px; accent-color: var(--dsw-alias-state-business-primary); }
.${ROOT_CLASS3}__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  line-height: 16px;
}
.${ROOT_CLASS3}__badge {
  max-width: 150px;
  padding: 0 6px;
  border-radius: 6px;
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-secondary);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.${ROOT_CLASS3}__badge[data-source="panel"] {
  background: var(--dsw-alias-state-business-tertiary);
  color: var(--dsw-alias-state-business-primary);
}
.${ROOT_CLASS3}__badge[data-source="manual"] {
  background: var(--dsw-alias-state-warn-tertiary);
  color: var(--dsw-alias-state-warn-label);
}
.${ROOT_CLASS3}__link {
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-state-business-primary);
  cursor: pointer;
}
.${ROOT_CLASS3}__link[disabled] { color: var(--dsw-alias-label-dimmed); cursor: default; }

.${ROOT_CLASS3}__status {
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
.${ROOT_CLASS3}__field[data-default] .${ROOT_CLASS3}__input,
.${ROOT_CLASS3}__field[data-default] .${ROOT_CLASS3}__check { opacity: 0.55; }
.${ROOT_CLASS3}__field[data-default] .${ROOT_CLASS3}__input:focus,
.${ROOT_CLASS3}__field[data-default] .${ROOT_CLASS3}__check:focus { opacity: 1; }
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
      className: `${ROOT_CLASS3}__check`,
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
      className: `${ROOT_CLASS3}__input`,
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
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: `${ROOT_CLASS3}__field`, "data-default": atDefault ? "" : void 0, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: `${ROOT_CLASS3}__fieldMain`, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: `${ROOT_CLASS3}__label`, children: field.label }),
      field.help === "" ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: `${ROOT_CLASS3}__help`, children: field.help })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: `${ROOT_CLASS3}__fieldSide`, children: [
      control,
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: `${ROOT_CLASS3}__meta`, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "span",
          {
            className: `${ROOT_CLASS3}__effect`,
            "data-effect": field.effect ?? entry.effect,
            title: t(`settings.effect.${field.effect ?? entry.effect}`),
            children: t(`settings.effect.${field.effect ?? entry.effect}`)
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "span",
          {
            className: `${ROOT_CLASS3}__badge`,
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
            className: `${ROOT_CLASS3}__link`,
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
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: `${ROOT_CLASS3}__panel`, "data-state": busy ? "loading" : "failed", children: [
      busy ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: `${ROOT_CLASS3}__note`, children: t("settings.loading") }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ErrorList, { errors })
    ] });
  }
  const dirtyCount = countDirty(payload, draft);
  const readonly = payload.profile.writable !== true;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: `${ROOT_CLASS3}__panel`, "data-state": "ready", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: `${ROOT_CLASS3}__note`, children: t("settings.file", { path: payload.profile.patchPath }) }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: `${ROOT_CLASS3}__note`, children: t("settings.keep") }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: `${ROOT_CLASS3}__warn`, children: t("settings.piNotice") }),
    payload.warnings.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: `${ROOT_CLASS3}__warn`, "data-warnings": "", children: payload.warnings.map((warning) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { children: warning }, warning)) }) : null,
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
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: `${ROOT_CLASS3}__status`, "data-dirty-count": dirtyCount, children: statusText(t, { busy, dirtyCount, saved }) })
  ] });
}
function EntryCard({ t, entry, entryState, draft, putDraft, commit, disabled }) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: `${ROOT_CLASS3}__card`, "data-entry": entry.id, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: `${ROOT_CLASS3}__cardTitle`, children: entry.title }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: `${ROOT_CLASS3}__cardDesc`, children: entry.description }),
    entry.notice !== void 0 && entry.notice !== "" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: `${ROOT_CLASS3}__warn`, children: entry.notice }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      "div",
      {
        className: `${ROOT_CLASS3}__effect`,
        "data-effect": entry.effect,
        title: t(`settings.effect.${entry.effect}`),
        children: t(`settings.effect.${entry.effect}`)
      }
    ),
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
    )) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: `${ROOT_CLASS3}__absent`, children: t("settings.absent") })
  ] });
}
function ErrorList({ errors }) {
  if (errors.length === 0) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: `${ROOT_CLASS3}__error`, "data-errors": "", children: errors.map((message) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { children: message }, message)) });
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
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: ROOT_CLASS3, "data-dsh-oi-harness-config": "", children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("button", { type: "button", className: `${ROOT_CLASS3}__head`, "aria-expanded": open, onClick: toggle, children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: `${ROOT_CLASS3}__title`, children: t("settings.title") }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: `${ROOT_CLASS3}__subtitle`, children: t("settings.subtitle") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: `${ROOT_CLASS3}__chevron`, "aria-hidden": "true", children: "\u25B8" })
    ] }),
    open ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(HarnessConfigPanel, { t, load, save }) : null
  ] });
}

// src/chat-history/history-store.js
function isPristine(current, lastNavigatedValue) {
  if (current === "") return true;
  if (lastNavigatedValue !== null && current === lastNavigatedValue) return true;
  return false;
}
function resolveTurnTexts(items, lookupFullText) {
  const out = [];
  for (const item of items) {
    let text = null;
    const anchor = item.anchor;
    if (anchor !== null && typeof anchor === "object" && anchor.kind === "loaded" && typeof anchor.key === "string") {
      text = lookupFullText(anchor.key);
    }
    if (text === null || text === void 0 || text.trim() === "") {
      text = typeof item.prompt === "string" ? item.prompt : "";
    }
    const trimmed = text.trim();
    if (trimmed !== "") out.push(trimmed);
  }
  return out;
}

// src/chat-history/nav-rail.js
function findRailItems() {
  for (const nav of document.querySelectorAll("nav")) {
    const items = readFiberItems(nav);
    if (items !== null) return items;
  }
  return null;
}
function readFiberItems(el) {
  let fiberKey = null;
  for (const key of Object.keys(el)) {
    if (key.startsWith("__reactFiber$")) {
      fiberKey = key;
      break;
    }
  }
  if (fiberKey === null) return null;
  let fiber = el[fiberKey];
  let depth = 0;
  while (fiber !== null && fiber !== void 0 && depth < 12) {
    const props = fiber.memoizedProps;
    if (props !== null && typeof props === "object" && Array.isArray(props.items) && typeof props.onNavigate === "function" && props.items.every((it) => it !== null && typeof it === "object" && typeof it.turn === "number")) {
      return props.items;
    }
    fiber = fiber.return;
    depth += 1;
  }
  return null;
}
function bubbleTextAt(anchorKey) {
  const row = document.querySelector(`[data-chat-flow-key="${CSS.escape(anchorKey)}"]`);
  const bubble = row?.querySelector('[class*="_bubble"]');
  const text = bubble?.innerText?.trim();
  return text === void 0 || text === "" ? null : text;
}
function findFlowPrompts() {
  const out = [];
  for (const row of document.querySelectorAll('[data-chat-flow-kind="user"]')) {
    const text = row.querySelector('[class*="_bubble"]')?.innerText?.trim();
    if (text !== void 0 && text !== "") out.push(text);
  }
  return out;
}

// src/chat-history/composer.js
function findComposer() {
  return document.querySelector('div[contenteditable="true"][role="textbox"]');
}
function readText(composer) {
  const lines = [...composer.children].map((block) => block.childNodes.length === 1 && block.firstChild?.nodeName === "BR" ? "" : readNode(block));
  while (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n");
}
function readNode(node) {
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue ?? "";
  let out = "";
  for (const child of node.childNodes) {
    out += child.nodeName === "BR" ? "\n" : readNode(child);
  }
  return out;
}
async function writeText(composer, text) {
  composer.focus();
  document.execCommand("selectAll", false);
  await new Promise((r) => setTimeout(r, 50));
  const target = document.contains(composer) ? composer : findComposer();
  if (target === null) return;
  if (text === "") {
    target.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Backspace",
      code: "Backspace",
      bubbles: true,
      cancelable: true
    }));
    return;
  }
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    if (i > 0) {
      target.dispatchEvent(new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        shiftKey: true,
        bubbles: true,
        cancelable: true
      }));
    }
    if (lines[i] !== "") document.execCommand("insertText", false, lines[i]);
  }
}
function caretAtEdge(composer, edge) {
  const selection2 = window.getSelection();
  if (selection2 === null || selection2.rangeCount === 0 || !selection2.isCollapsed) return false;
  const anchor = selection2.getRangeAt(0);
  if (!composer.contains(anchor.startContainer)) return false;
  const probe = document.createRange();
  probe.selectNodeContents(composer);
  if (edge === "start") probe.setEnd(anchor.startContainer, anchor.startOffset);
  else probe.setStart(anchor.startContainer, anchor.startOffset);
  return probe.toString() === "";
}

// src/chat-history/index.js
function readCurrentSession() {
  const rows = document.querySelectorAll(
    '[class*="_sessionRow"][aria-selected="true"], [class*="_searchResultRow"][aria-selected="true"]'
  );
  for (const row of rows) {
    if (!(row instanceof HTMLElement)) continue;
    const id = rowId(row, "session");
    if (id !== null) return id;
  }
  return null;
}
function installChatHistory() {
  let disposed = false;
  let sessionId = readCurrentSession();
  let entries = [];
  let navIndex = -1;
  let lastNavigatedValue = null;
  let writeChain = Promise.resolve();
  function syncSession() {
    const nextId = readCurrentSession();
    if (nextId === sessionId) return;
    sessionId = nextId;
    entries = [];
    navIndex = -1;
    lastNavigatedValue = null;
  }
  function readHistory() {
    const items = findRailItems();
    if (items !== null) {
      const texts = resolveTurnTexts(items, bubbleTextAt);
      if (texts.length > 0) return texts;
    }
    return findFlowPrompts();
  }
  function onKeyDown(event) {
    if (disposed) return;
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    syncSession();
    if (sessionId === null) return;
    const composer = findComposer();
    if (composer === null) return;
    if (document.activeElement !== composer) return;
    const currentText = readText(composer);
    if (navIndex !== -1 && !isPristine(currentText, lastNavigatedValue)) {
      navIndex = -1;
      lastNavigatedValue = null;
      return;
    }
    if (navIndex === -1) {
      if (event.key === "ArrowUp" && !caretAtEdge(composer, "start")) return;
      if (event.key === "ArrowDown" && !caretAtEdge(composer, "end")) return;
    }
    if (!isPristine(currentText, lastNavigatedValue)) return;
    if (event.key === "ArrowUp") {
      if (navIndex === -1) {
        entries = readHistory();
        if (entries.length === 0) return;
        navIndex = entries.length - 1;
      } else if (navIndex > 0) {
        navIndex -= 1;
      } else {
        return;
      }
    } else {
      if (navIndex === -1) return;
      if (navIndex < entries.length - 1) {
        navIndex += 1;
      } else {
        navIndex = -1;
        lastNavigatedValue = "";
        event.preventDefault();
        event.stopPropagation();
        writeChain = writeChain.then(() => writeText(composer, ""));
        return;
      }
    }
    event.preventDefault();
    event.stopPropagation();
    const value = entries[navIndex];
    lastNavigatedValue = value;
    writeChain = writeChain.then(async () => {
      await writeText(composer, value);
      if (disposed) return;
      const current = findComposer();
      if (current !== null) lastNavigatedValue = readText(current);
    });
  }
  document.addEventListener("keydown", onKeyDown, true);
  try {
    const doomed = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key !== null && key.startsWith("dsh-oi-chat-history:")) doomed.push(key);
    }
    for (const key of doomed) localStorage.removeItem(key);
  } catch {
  }
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    document.removeEventListener("keydown", onKeyDown, true);
  };
  return {
    dispose,
    snapshot: () => ({
      sessionId: readCurrentSession(),
      history: readHistory(),
      index: navIndex
    })
  };
}

// src/client/index.js
var name = "@Tinnikx/dsh-operation-improve";
var inject = ["workspaces", "sessions", "locale", "slots"];
var selection = createSelectionStore();
function apply(ctx) {
  const instanceId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const style = document.createElement("style");
  style.dataset.plugin = name;
  style.textContent = [ROW_STATES_CSS, MENU_CSS, TIMESTAMP_CSS, ACTIVE_DOT_CSS, THINK_SCROLL_CSS, SETTINGS_CSS, FIND_CSS].join("\n");
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
  const chatHistory = installChatHistory();
  ctx.effect(() => chatHistory.dispose, "@Tinnikx/dsh-operation-improve: chat history");
  const find = installFind({ tOwn: locale.tOwn, owner: instanceId });
  ctx.effect(() => find.dispose, "@Tinnikx/dsh-operation-improve: find in page");
  const globalKey = "__dshOperationImprove__";
  window[globalKey] = {
    instanceId,
    selection,
    timestamps,
    chatHistory,
    harnessConfig,
    find,
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
      find.dispose();
      chatHistory.dispose();
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
