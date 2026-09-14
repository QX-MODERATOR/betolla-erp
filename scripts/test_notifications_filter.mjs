import {
  addNotification,
  getNotifications,
} from "../lib/notifications-store.ts";

console.log("--- Testing Notification Separation between Admin and Sales Rep (Hanan) ---");

// 1. Admin sends leads to Hanan -> notification added for Hanan
const notifHanan = addNotification({
  repName: "حنان",
  repId: "hanan",
  title: "بيانات جديدة 🔔 New Data",
  message: "قام المسؤول بإرسال 50 رقم إلى حنان",
  phones: ["0791111111", "0792222222"],
  source: "admin",
  link: "/sales",
});

console.log("Created notification for Hanan:", notifHanan.id, "repName:", notifHanan.repName);

// 2. Query notifications for ADMIN
const adminInbox = getNotifications("admin");
console.log("Admin Inbox count:", adminInbox.notifications.length);
const foundInAdmin = adminInbox.notifications.find(n => n.id === notifHanan.id);
if (foundInAdmin) {
  throw new Error("FAIL: Notification meant for Hanan was returned in Admin inbox!");
}
console.log("✓ PASS: Admin inbox does NOT contain Hanan's notification.");

// 3. Query notifications for HANAN
const hananInbox = getNotifications("hanan");
console.log("Hanan Inbox count:", hananInbox.notifications.length);
const foundInHanan = hananInbox.notifications.find(n => n.id === notifHanan.id);
if (!foundInHanan) {
  throw new Error("FAIL: Notification meant for Hanan was NOT found in Hanan inbox!");
}
console.log("✓ PASS: Hanan inbox correctly contains her notification.");

// 4. Admin sends a system alert to ALL or ADMIN
const notifAdmin = addNotification({
  repName: "admin",
  title: "تقرير النظام",
  message: "تنبيه إداري للمسؤول فقط",
  source: "system",
});

const adminInbox2 = getNotifications("admin");
if (!adminInbox2.notifications.find(n => n.id === notifAdmin.id)) {
  throw new Error("FAIL: Admin-specific notification not found in Admin inbox");
}
console.log("✓ PASS: Admin correctly receives admin-specific notifications.");

const hananInbox2 = getNotifications("hanan");
if (hananInbox2.notifications.find(n => n.id === notifAdmin.id)) {
  throw new Error("FAIL: Hanan received admin-specific notification!");
}
console.log("✓ PASS: Hanan does NOT receive admin-specific notifications.");

console.log("✓ ALL NOTIFICATION ROUTING TESTS PASSED 100%!");
