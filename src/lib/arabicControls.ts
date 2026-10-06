/** All controls, including legacy raw HTML, obey the Arabic arrow-free rule. */
export function stripArabicControlArrows(root: ParentNode = document): void {
  if (document.documentElement.dir !== "rtl") return;
  for (const control of root.querySelectorAll('button, a, [role="button"], [role="link"]')) {
    const walker = document.createTreeWalker(control, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const text = node.nodeValue ?? "";
      const clean = text.replace(/[→←↗↖↘↙]/g, "");
      if (clean !== text) node.nodeValue = clean;
      node = walker.nextNode();
    }
  }
}