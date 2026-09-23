// Prints only the element marked `.print-area` (see globals.css): the document in an open dialog
// (invoice, payslip, delivery slip), not the page behind it. Elements marked `.no-print` inside it
// (buttons) are left out.
//
// Inside the Android app `window.print()` does nothing — a WebView has no print dialog of its own.
// The app (MainActivity.PrintBridge, from 2.8.0) exposes `BetollaAndroid.print()`, which opens
// Android's print screen for the page, where "Save as PDF" is one of the printers; it fires
// `afterprint` when that screen closes, so the print-only layout is undone the same way.
interface AndroidBridge { print(title: string): void }

const APP_UA = /BetollaERP-Android/;

export function printArea() {
  const android = (window as unknown as { BetollaAndroid?: AndroidBridge }).BetollaAndroid;
  if (!android && APP_UA.test(navigator.userAgent)) {
    window.alert("الطباعة وحفظ PDF تحتاج تحديث تطبيق بيتولا إلى آخر إصدار.");
    return;
  }
  document.body.classList.add("printing-area");
  const done = () => { document.body.classList.remove("printing-area"); window.removeEventListener("afterprint", done); };
  window.addEventListener("afterprint", done);
  if (android) android.print(document.title || "Betolla");
  else window.print();
}
