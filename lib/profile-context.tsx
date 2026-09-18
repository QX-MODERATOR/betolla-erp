"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { getCurrentUser, isSignedIn, refreshSessionUser } from "@/lib/client-api";
import type { UserRole } from "@/lib/auth";
import { UserProfile, DEFAULT_ADMIN_PROFILE, ALL_INITIAL_PROFILES } from "./profile-store";

export type { UserProfile };

interface ProfileContextType {
  profile: UserProfile;
  adminProfile: UserProfile;
  allProfiles: Record<string, UserProfile>;
  updateProfile: (data: Partial<UserProfile>, targetId?: string) => Promise<{ success: boolean; message?: string }>;
  isProfileModalOpen: boolean;
  targetEditUser: string | null;
  openProfileModal: (targetId?: string) => void;
  closeProfileModal: () => void;
  switchProfile: (id: string) => void;
  isSalesRep: boolean;
  isAdmin: boolean;
  isDriverManager: boolean;
  isDriver: boolean;
}

const ProfileContext = createContext<ProfileContextType>({
  profile: DEFAULT_ADMIN_PROFILE,
  adminProfile: DEFAULT_ADMIN_PROFILE,
  allProfiles: ALL_INITIAL_PROFILES,
  updateProfile: async () => ({ success: false }),
  isProfileModalOpen: false,
  targetEditUser: null,
  openProfileModal: () => {},
  closeProfileModal: () => {},
  switchProfile: () => {},
  isSalesRep: false,
  isAdmin: true,
  isDriverManager: false,
  isDriver: false,
});

// Every lookup here is keyed by the account's stable `id` (SYSTEM_ACCOUNTS[].id
// in lib/auth.ts), never by login username. Usernames get renamed by IT from
// time to time (e.g. "rahma" -> "rahma.sales"); ids never change, so a rename
// can never again silently disconnect someone from their own profile data.
export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [activeId, setActiveId] = useState<string>(DEFAULT_ADMIN_PROFILE.id);
  const [targetEditUser, setTargetEditUser] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>(ALL_INITIAL_PROFILES);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  // Fetch profiles from centralized server API — only for a signed-in session. The provider also
  // wraps /login, where these calls would just fail (e.g. after a failed login attempt). A
  // successful login does a full page load, so the provider remounts and fetches then.
  const fetchProfilesFromServer = useCallback(async () => {
    if (!isSignedIn() || window.location.pathname === "/login") return;
    try {
      const res = await fetch("/api/profile", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (data.success && data.profiles) {
        setProfiles((prev) => ({
          ...prev,
          ...data.profiles,
        }));
      }
    } catch {
      // Fallback silently
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const baseUser = getCurrentUser();
    setCurrentUser(baseUser);

    // Determine initial active profile based on logged-in user's stable id.
    const id = baseUser?.id;
    const initialId = id && ALL_INITIAL_PROFILES[id] ? id : DEFAULT_ADMIN_PROFILE.id;
    setActiveId(initialId);

    // 1. Initial fast local cache load
    const loadedProfiles: Record<string, UserProfile> = { ...ALL_INITIAL_PROFILES };
    for (const [key, defaultProfile] of Object.entries(ALL_INITIAL_PROFILES)) {
      try {
        const raw = localStorage.getItem(`betolla_profile_${key}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          loadedProfiles[key] = {
            ...defaultProfile,
            ...parsed,
            role: defaultProfile.role,
            commissionRate: defaultProfile.commissionRate,
            monthlyTarget: defaultProfile.monthlyTarget,
          };
        }
      } catch {
        // ignore
      }
    }
    setProfiles(loadedProfiles);

    // 2. Fetch authoritative profiles from server
    fetchProfilesFromServer();

    // 2b. Confirm who is signed in against the session cookie, not just the localStorage cache.
    // Without this, a valid session whose cache was cleared keeps rendering as "unknown role":
    // empty sidebar, no permission-gated buttons, and the admin profile as the fallback identity.
    if (window.location.pathname !== "/login") {
      void refreshSessionUser().then((user) => {
        if (!user) return;
        setCurrentUser(user);
        const confirmedId = user.id as string;
        if (ALL_INITIAL_PROFILES[confirmedId]) setActiveId(confirmedId);
        if (!baseUser) fetchProfilesFromServer(); // the first attempt bailed: no cached session yet
      });
    }

    // 3. Periodic background poll to keep all clients/tabs in sync
    const interval = setInterval(fetchProfilesFromServer, 8000);

    const onFocus = () => fetchProfilesFromServer();
    const onProfileUpdate = () => fetchProfilesFromServer();
    window.addEventListener("focus", onFocus);
    window.addEventListener("betolla_profile_updated", onProfileUpdate);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("betolla_profile_updated", onProfileUpdate);
    };
  }, [fetchProfilesFromServer]);

  const openProfileModal = (targetId?: string) => {
    const freshUser = getCurrentUser();
    if (freshUser) {
      setCurrentUser(freshUser);
    }
    const target = targetId || freshUser?.id || currentUser?.id || activeId;

    if (target && ALL_INITIAL_PROFILES[target]) {
      setActiveId(target);
      setTargetEditUser(target);
    } else {
      setTargetEditUser(activeId);
    }
    setIsProfileModalOpen(true);
  };

  const switchProfile = (id: string) => {
    if (ALL_INITIAL_PROFILES[id]) {
      setActiveId(id);
      setTargetEditUser(id);
    }
  };

  const closeProfileModal = () => {
    setIsProfileModalOpen(false);
  };

  const updateProfile = async (data: Partial<UserProfile>, targetId?: string) => {
    const target = targetId || activeId;
    const current = profiles[target] || ALL_INITIAL_PROFILES[target] || DEFAULT_ADMIN_PROFILE;

    const trimmedName = data.name?.trim() || current.name;
    const computedAvatar = data.avatar || (trimmedName ? trimmedName.charAt(0) : current.avatar);

    const sanitizedData: Partial<UserProfile> = {
      name: trimmedName,
      phone: data.phone !== undefined ? data.phone.trim() : current.phone,
      whatsapp: data.whatsapp !== undefined ? data.whatsapp.trim() : current.whatsapp,
      email: data.email !== undefined ? data.email.trim() : current.email,
      city: data.city !== undefined ? data.city.trim() : current.city,
      bio: data.bio !== undefined ? data.bio.trim() : current.bio,
      avatar: computedAvatar,
      avatarColor: data.avatarColor || current.avatarColor,
    };

    const updated: UserProfile = {
      ...current,
      ...sanitizedData,
      role: current.role,
      commissionRate: current.commissionRate,
      monthlyTarget: current.monthlyTarget,
    };

    // Optimistic UI state update
    setProfiles((prev) => ({
      ...prev,
      [target]: updated,
    }));

    if (typeof window !== "undefined") {
      localStorage.setItem(`betolla_profile_${target}`, JSON.stringify(sanitizedData));

      // Synchronize with logged in user if currently editing self
      const loggedIn = getCurrentUser();
      if (loggedIn && loggedIn.id === target) {
        const updatedAuthUser = {
          ...loggedIn,
          name: updated.name,
          phone: updated.phone,
          avatar: updated.avatar,
        };
        localStorage.setItem("betolla_user", JSON.stringify(updatedAuthUser));
        window.dispatchEvent(new Event("betolla_user_updated"));
      }
    }

    // Persist to Server API
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: target,
          updates: sanitizedData,
        }),
      });

      if (res.ok) {
        const resData = await res.json();
        if (resData.success && resData.profile) {
          setProfiles((prev) => ({
            ...prev,
            [target]: resData.profile,
          }));
        }
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("betolla_profile_updated"));
        }
        return { success: true, message: "تم حفظ وتحديث البيانات مركزياً بنجاح." };
      }
    } catch {
      // Return success because local optimistic update succeeded
    }

    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("betolla_profile_updated"));
    }
    return { success: true, message: "تم حفظ وتحديث البيانات بنجاح." };
  };

  const currentLoggedInUser = getCurrentUser() || currentUser;
  const isAdmin =
    currentLoggedInUser?.role === "admin" || currentLoggedInUser?.role === "general_manager";

  const profile = profiles[activeId] || profiles[DEFAULT_ADMIN_PROFILE.id] || DEFAULT_ADMIN_PROFILE;
  const isSalesRep = profile?.role === "sales_rep";
  const isDriverManager = profile?.role === "driver_manager";
  const isDriver = profile?.role === "driver";

  return (
    <ProfileContext.Provider
      value={{
        profile,
        adminProfile: profiles[DEFAULT_ADMIN_PROFILE.id] || DEFAULT_ADMIN_PROFILE,
        allProfiles: profiles,
        updateProfile,
        isProfileModalOpen,
        targetEditUser,
        openProfileModal,
        closeProfileModal,
        switchProfile,
        isSalesRep,
        isAdmin,
        isDriverManager,
        isDriver,
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  return useContext(ProfileContext);
}
