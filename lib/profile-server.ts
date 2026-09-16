import { createServerClient } from './supabase/server';
import { ALL_INITIAL_PROFILES, type UserProfile } from './profile-store';

interface OverrideRow {
  username: string; // stores the account's stable `id` (see profile-store.ts) -- column name kept for schema compatibility, no migration needed
  name: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  city: string | null;
  bio: string | null;
  avatar: string | null;
  avatar_color: string | null;
}

function mergeOverride(base: UserProfile, row: OverrideRow | undefined): UserProfile {
  if (!row) return base;
  return {
    ...base,
    name: row.name ?? base.name,
    phone: row.phone ?? base.phone,
    whatsapp: row.whatsapp ?? base.whatsapp,
    email: row.email ?? base.email,
    city: row.city ?? base.city,
    bio: row.bio ?? base.bio,
    avatar: row.avatar ?? base.avatar,
    avatarColor: row.avatar_color ?? base.avatarColor,
  };
}

export async function getAllProfilesServer(): Promise<Record<string, UserProfile>> {
  const supabase = createServerClient();
  const { data, error } = await supabase.from('user_profile_overrides').select('*');
  const overrides = new Map<string, OverrideRow>((error || !data ? [] : data).map((r: OverrideRow) => [r.username, r]));

  const merged: Record<string, UserProfile> = {};
  for (const [id, base] of Object.entries(ALL_INITIAL_PROFILES)) {
    merged[id] = mergeOverride(base, overrides.get(id));
  }
  return merged;
}

export async function getProfileServer(id: string): Promise<UserProfile | null> {
  const norm = (id || '').trim();
  const base = ALL_INITIAL_PROFILES[norm];
  if (!base) return null;

  const supabase = createServerClient();
  const { data } = await supabase.from('user_profile_overrides').select('*').eq('username', norm).maybeSingle();
  return mergeOverride(base, data || undefined);
}

export async function updateProfileServer(id: string, updates: Partial<UserProfile>): Promise<UserProfile> {
  const norm = (id || '').trim();
  const base = ALL_INITIAL_PROFILES[norm];
  if (!base) throw new Error('حساب غير معروف.');

  const current = await getProfileServer(norm) || base;
  const trimmedName = updates.name?.trim() || current.name;
  const computedAvatar = updates.avatar || (trimmedName ? trimmedName.charAt(0) : current.avatar);

  const supabase = createServerClient();
  const { error } = await supabase.from('user_profile_overrides').upsert(
    {
      username: norm,
      name: trimmedName,
      phone: updates.phone !== undefined ? updates.phone.trim() : current.phone,
      whatsapp: updates.whatsapp !== undefined ? updates.whatsapp.trim() : current.whatsapp,
      email: updates.email !== undefined ? updates.email.trim() : current.email,
      city: updates.city !== undefined ? updates.city.trim() : current.city,
      bio: updates.bio !== undefined ? updates.bio.trim() : current.bio,
      avatar: computedAvatar,
      avatar_color: updates.avatarColor || current.avatarColor,
    },
    { onConflict: 'username' }
  );

  if (error) throw new Error(error.message);

  // role & contract limits remain authoritative from the static roster, never overridable
  return {
    ...current,
    name: trimmedName,
    avatar: computedAvatar,
    phone: updates.phone !== undefined ? updates.phone.trim() : current.phone,
    whatsapp: updates.whatsapp !== undefined ? updates.whatsapp.trim() : current.whatsapp,
    email: updates.email !== undefined ? updates.email.trim() : current.email,
    city: updates.city !== undefined ? updates.city.trim() : current.city,
    bio: updates.bio !== undefined ? updates.bio.trim() : current.bio,
    avatarColor: updates.avatarColor || current.avatarColor,
    role: base.role,
    commissionRate: base.commissionRate,
    monthlyTarget: base.monthlyTarget,
  };
}
