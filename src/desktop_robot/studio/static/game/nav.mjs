/**
 * 导航点击判定：仅明确控件可触发换页，禁止匹配 body/screen 上的 data-view。
 * @param {Element|null|undefined} target
 * @returns {Element|null}
 */
export function findNavControl(target) {
  if (!target || typeof target.closest !== 'function') return null;
  // 仅 button/a；body/section 上的 data-view 只用于样式，不可导航
  return target.closest('button[data-view], a[data-view]');
}
