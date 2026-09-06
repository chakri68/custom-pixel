type Child = Node | string | null | undefined | false;

interface Props {
  class?: string;
  text?: string;
  html?: string;
  title?: string;
  attr?: Record<string, string | number | boolean | undefined>;
  style?: Partial<CSSStyleDeclaration>;
  on?: Record<string, (ev: Event) => void>;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  children: Child[] = [],
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.text !== undefined) el.textContent = props.text;
  if (props.html !== undefined) el.innerHTML = props.html;
  if (props.title) el.title = props.title;
  for (const [k, v] of Object.entries(props.attr ?? {})) {
    if (v === undefined || v === false) continue;
    el.setAttribute(k, v === true ? "" : String(v));
  }
  if (props.style) Object.assign(el.style, props.style);
  for (const [k, fn] of Object.entries(props.on ?? {})) {
    el.addEventListener(k, fn);
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c);
  }
  return el;
}

export function frag(children: Child[]): DocumentFragment {
  const f = document.createDocumentFragment();
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    f.append(c);
  }
  return f;
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}
