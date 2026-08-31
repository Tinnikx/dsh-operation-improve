/**
 * 「Harness 高级配置」那一行与展开面板的样式。
 *
 * 并进 [client/index.js](../index.js) 那一张 `<style>`，不自插第二张——摘掉那一张就
 * 该还原干净。配色一律走 harness 的设计变量（`--dsw-alias-*`），跟着主题走；写死颜色
 * 会在浅色主题下变成一块深色矩形。
 */

/** BEM 根类名，其余全部是它的后代。 */
export const ROOT_CLASS = 'dsh-oi-hcfg'

/** 一行入口 + 展开面板的全部样式。 */
export const SETTINGS_CSS = `
.${ROOT_CLASS} {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px 0;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
}
.${ROOT_CLASS}__head {
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
.${ROOT_CLASS}__title {
  display: block;
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
  line-height: 22px;
}
.${ROOT_CLASS}__subtitle {
  display: block;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
  margin-top: 2px;
}
.${ROOT_CLASS}__chevron {
  flex: none;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  transition: transform 160ms ease;
}
.${ROOT_CLASS}__head[aria-expanded="true"] .${ROOT_CLASS}__chevron { transform: rotate(90deg); }

.${ROOT_CLASS}__panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.${ROOT_CLASS}__note {
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
  word-break: break-all;
}
.${ROOT_CLASS}__warn {
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--dsw-alias-state-warn-tertiary);
  color: var(--dsw-alias-state-warn-label);
  font-size: 12px;
  line-height: 18px;
}
.${ROOT_CLASS}__error {
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--dsw-alias-interactive-bg-hover-danger);
  color: var(--dsw-alias-state-error-primary);
  font-size: 12px;
  line-height: 18px;
}
.${ROOT_CLASS}__error > div + div,
.${ROOT_CLASS}__warn > div + div { margin-top: 4px; }

.${ROOT_CLASS}__card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 16px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 12px;
  background: var(--dsw-alias-bg-module-platform);
}
.${ROOT_CLASS}__cardTitle {
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
  font-weight: 500;
  line-height: 22px;
}
.${ROOT_CLASS}__cardDesc {
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}
.${ROOT_CLASS}__absent {
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
  font-style: italic;
}

.${ROOT_CLASS}__field {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 8px 0;
  border-top: 1px solid var(--dsw-alias-border-l1);
}
.${ROOT_CLASS}__fieldMain { flex: 1 1 auto; min-width: 0; }
.${ROOT_CLASS}__label {
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  line-height: 20px;
}
.${ROOT_CLASS}__help {
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}
.${ROOT_CLASS}__fieldSide {
  display: flex;
  flex: none;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}
.${ROOT_CLASS}__input {
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
.${ROOT_CLASS}__input:focus {
  outline: none;
  border-color: var(--dsw-alias-state-business-primary);
}
.${ROOT_CLASS}__input[data-dirty] { border-color: var(--dsw-alias-state-business-primary); }
.${ROOT_CLASS}__check { width: 16px; height: 16px; accent-color: var(--dsw-alias-state-business-primary); }
.${ROOT_CLASS}__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  line-height: 16px;
}
.${ROOT_CLASS}__badge {
  max-width: 150px;
  padding: 0 6px;
  border-radius: 6px;
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-secondary);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.${ROOT_CLASS}__badge[data-source="panel"] {
  background: var(--dsw-alias-state-business-tertiary);
  color: var(--dsw-alias-state-business-primary);
}
.${ROOT_CLASS}__badge[data-source="manual"] {
  background: var(--dsw-alias-state-warn-tertiary);
  color: var(--dsw-alias-state-warn-label);
}
.${ROOT_CLASS}__link {
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-state-business-primary);
  cursor: pointer;
}
.${ROOT_CLASS}__link[disabled] { color: var(--dsw-alias-label-dimmed); cursor: default; }

.${ROOT_CLASS}__status {
  min-height: 18px;
  text-align: right;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}

/* 走 harness 自己默认值的那一行：只淡化控件本身，输入框空着靠灰 placeholder 显示默认值。
   标签与说明保持满对比度——它们是这一项是什么意思，与它有没有被设过无关。
   不 disable——照样要能改，聚焦时恢复满对比度。

   淡化只能用 opacity，不能改 color：主题插件可以把 --dsw-alias-label-* 全部 !important
   成同一个颜色（本仓库实测的主题就把四档标签色统统压成纯白），那样按颜色淡化的控件和正常
   控件会长得一模一样，而这条规则不会有人报错。 */
.${ROOT_CLASS}__field[data-default] .${ROOT_CLASS}__input,
.${ROOT_CLASS}__field[data-default] .${ROOT_CLASS}__check { opacity: 0.55; }
.${ROOT_CLASS}__field[data-default] .${ROOT_CLASS}__input:focus,
.${ROOT_CLASS}__field[data-default] .${ROOT_CLASS}__check:focus { opacity: 1; }
`
