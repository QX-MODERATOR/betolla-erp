// Betolla ERP — Staff account provisioning
//
// Creates/updates real Supabase Auth accounts for staff, replacing the
// hardcoded plaintext password list that used to live in lib/auth.ts.
// Passwords are chosen by the account owner and never seen, generated, or
// logged by this script — they go straight into Supabase Auth's own
// bcrypt-hashed credential store.
//
// USAGE
//   1. Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and
//      SUPABASE_SERVICE_ROLE_KEY in your environment (e.g. via
//      `node --env-file=.env.local scripts/provision_users.mjs`).
//   2. Create scripts/.user-seed.json (git-ignored — see .gitignore) with
//      the shape shown in USER_SEED_EXAMPLE below, using NEW passwords you
//      choose. Never reuse any password that was ever committed to git.
//   3. Run: node --env-file=.env.local scripts/provision_users.mjs
//   4. Delete scripts/.user-seed.json when done, or at minimum make sure it
//      never gets committed (it is already git-ignored by default).
//
// This script is idempotent: re-running it updates the password/role/name
// of an existing account rather than failing.

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_PATH = join(__dirname, ".user-seed.json");

const USER_SEED_EXAMPLE = `[
  {
    "username": "admin",
    "email": "admin@betolla.com",
    "password": "<choose-a-new-strong-password>",
    "role": "admin",
    "fullName": "المدير العام (Admin)",
    "repKey": "admin"
  },
  {
    "username": "rahma",
    "email": "rahma@betolla.com",
    "password": "<choose-a-new-strong-password>",
    "role": "sales_rep",
    "fullName": "رحمة (مندوبة مبيعات)",
    "repKey": "rahma"
  }
]`;

const VALID_ROLES = ["admin", "sales_manager", "sales_rep", "driver_manager", "driver", "finance"];

function requireEnv(name, fallbackName) {
  const value = process.env[name] || (fallbackName ? process.env[fallbackName] : undefined);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function findUserByEmail(supabase, email) {
  // The admin SDK has no direct getUserByEmail; page through listUsers.
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (match) return match;
    if (data.users.length < perPage) return null;
    page++;
  }
}

async function main() {
  if (!existsSync(SEED_PATH)) {
    console.error(`No seed file found at ${SEED_PATH}.\n`);
    console.error("Create it with real, NEW passwords (never reuse a password that was ever committed to git). Example shape:\n");
    console.error(USER_SEED_EXAMPLE);
    process.exitCode = 1;
    return;
  }

  const supabaseUrl = requireEnv("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const seed = JSON.parse(readFileSync(SEED_PATH, "utf-8"));
  if (!Array.isArray(seed) || seed.length === 0) {
    throw new Error("scripts/.user-seed.json must be a non-empty JSON array.");
  }

  for (const entry of seed) {
    const { username, email, password, role, fullName, repKey } = entry;

    if (!email || !password || !role) {
      throw new Error(`Seed entry for "${username || "?"}" is missing email/password/role.`);
    }
    if (!VALID_ROLES.includes(role)) {
      throw new Error(`Seed entry for "${username}" has invalid role "${role}". Must be one of: ${VALID_ROLES.join(", ")}`);
    }
    if (password.length < 12) {
      throw new Error(`Seed entry for "${username}" has a password shorter than 12 characters — choose a stronger one.`);
    }

    const appMetadata = { role, full_name: fullName, rep_key: repKey };
    const existing = await findUserByEmail(supabase, email);

    if (existing) {
      const { error } = await supabase.auth.admin.updateUserById(existing.id, {
        password,
        app_metadata: appMetadata,
        email_confirm: true,
      });
      if (error) throw error;
      console.log(`Updated existing account: ${email} (role=${role})`);
    } else {
      const { error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: appMetadata,
      });
      if (error) throw error;
      console.log(`Created new account: ${email} (role=${role})`);
    }

    // The on_auth_user_created / on_auth_user_updated trigger (migration
    // 005) upserts profiles.role/full_name/email automatically. rep_key is
    // app-specific and set here directly since the trigger doesn't know it.
    if (repKey) {
      const { error: repKeyError } = await supabase
        .from("profiles")
        .update({ rep_key: repKey })
        .eq("email", email);
      if (repKeyError) {
        console.warn(`Warning: could not set rep_key for ${email}: ${repKeyError.message}`);
      }
    }
  }

  console.log("\nDone. No password was printed or logged by this script.");
  console.log("Reminder: delete scripts/.user-seed.json once you've confirmed everyone can log in.");
}

main().catch((err) => {
  console.error("Provisioning failed:", err.message || err);
  process.exitCode = 1;
});
