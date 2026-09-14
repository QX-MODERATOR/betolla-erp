import {
  getAllProfilesServer,
  getProfileServer,
  updateProfileServer,
} from "../lib/profile-store.ts";

console.log("--- Testing Profile Store & Synchronization ---");

// 1. Check initial profiles
const initialHanan = getProfileServer("hanan");
console.log("Initial Hanan Profile:", initialHanan?.name, "| Phone:", initialHanan?.phone);
if (!initialHanan) throw new Error("FAIL: Hanan profile not found");

// 2. Update Hanan's profile as Admin would do
const updatedHanan = updateProfileServer("hanan", {
  phone: "0793937385",
  bio: "مبيعات معتمدة - اتصال مباشر مع الصالونات",
});

console.log("Updated Hanan Profile:", updatedHanan.name, "| Phone:", updatedHanan.phone);
if (updatedHanan.phone !== "0793937385") {
  throw new Error("FAIL: Phone was not updated properly");
}

// 3. Verify that getting Hanan again returns the updated data
const retrieved = getProfileServer("hanan");
console.log("Retrieved Hanan Profile:", retrieved?.name, "| Phone:", retrieved?.phone);
if (retrieved?.phone !== "0793937385") {
  throw new Error("FAIL: Retrieved phone mismatch");
}

// 4. Verify all profiles include updated Hanan
const all = getAllProfilesServer();
if (all.hanan.phone !== "0793937385") {
  throw new Error("FAIL: allProfiles store not updated");
}

console.log("✓ SUCCESS: Profile store and sync tests passed with 100% precision!");
