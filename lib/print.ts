// Prints only the element marked `.print-area` (see globals.css): the document in an open dialog
// (invoice, payslip, delivery slip), not the page behind it. Elements marked `.no-print` inside it
// (buttons) are left out.
export function printArea() {
  document.body.classList.add("printing-area");
  const done = () => { document.body.classList.remove("printing-area"); window.removeEventListener("afterprint", done); };
  window.addEventListener("afterprint", done);
  window.print();
}
