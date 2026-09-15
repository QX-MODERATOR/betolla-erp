"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { getCurrentUser } from "@/lib/client-api";
import type { UserRole } from "@/lib/auth";
import {
  UserProfile,
  DEFAULT_ADMIN_PROFILE,
  DEFAULT_GM_PROFILE,
  DEFAULT_SALES_MGR_PROFILE,
  DEFAULT_HANAN_PROFILE,
  DEFAULT_SABREEN_PROFILE,
  DEFAULT_HAMZA_PROFILE,
  DEFAULT_SARA_PROFILE,
  DEFAULT_MKT_MGR_PROFILE,
  DEFAULT_MARKETING_PROFILE,
  DEFAULT_ZAID_PROFILE,
  DEFAULT_HR_PROFILE,
  DEFAULT_DIYA_PROFILE,
  DEFAULT_KHALID_PROFILE,
  DEFAULT_ALI_PROFILE,
  DEFAULT_BX_PROFILE,
  ALL_INITIAL_PROFILES,
} from "./profile-store";

export type { UserProfile };
export {
  DEFAULT_ADMIN_PROFILE,
  DEFAULT_GM_PROFILE,
  DEFAULT_SALES_MGR_PROFILE,
  DEFAULT_HANAN_PROFILE,
  DEFAULT_SABREEN_PROFILE,
  DEFAULT_HAMZA_PROFILE,
  DEFAULT_SARA_PROFILE,
  DEFAULT_MKT_MGR_PROFILE,
  DEFAULT_MARKETING_PROFILE,
  DEFAULT_ZAID_PROFILE,
  DEFAULT_HR_PROFILE,
  DEFAULT_DIYA_PROFILE,
  DEFAULT_KHALID_PROFILE,
  DEFAULT_ALI_PROFILE,
  DEFAULT_BX_PROFILE,
};

export const DEFAULT_RAHMA_PROFILE = DEFAULT_HANAN_PROFILE;
export const ALL_DEFAULT_PROFILES = ALL_INITIAL_PROFILES;

interface ProfileContextType {
  profile: UserProfile;
  hananProfile: UserProfile;
  rahmaProfile?: UserProfile;
  adminProfile: UserProfile;
  allProfiles: Record<string, UserProfile>;
  updateProfile: (data: Partial<UserProfile>, targetUser?: string) => Promise<{ success: boolean; message?: string }>;
  isProfileModalOpen: boolean;
  targetEditUser: string | null;
  openProfileModal: (targetUsernameOrRepId?: string) => void;
  closeProfileModal: () => void;
  switchProfile: (username: string) => void;
  isSalesRep: boolean;
  isAdmin: boolean;
  isDriverManager: boolean;
  isDriver: boolean;
}

const ProfileContext = createContext<ProfileContextType>({
  profile: DEFAULT_ADMIN_PROFILE,
  hananProfile: DEFAULT_HANAN_PROFILE,
  rahmaProfile: DEFAULT_HANAN_PROFILE,
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

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [activeUsername, setActiveUsername] = useState<string>("admin");
  const [targetEditUser, setTargetEditUser] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>(ALL_INITIAL_PROFILES);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  // Fetch profiles from centralized server API
  const fetchProfilesFromServer = useCallback(async () => {
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

    // Determine initial active profile based on logged-in user
    const username = baseUser?.username?.toLowerCase();
    const initialUser = username && ALL_INITIAL_PROFILES[username] ? username : "admin";
    setActiveUsername(initialUser);

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

  const openProfileModal = (targetUsernameOrRepId?: string) => {
    const freshUser = getCurrentUser();
    if (freshUser) {
      setCurrentUser(freshUser);
    }
    const target =
      targetUsernameOrRepId?.toLowerCase() ||
      freshUser?.username?.toLowerCase() ||
      currentUser?.username?.toLowerCase() ||
      activeUsername;

    if (target && ALL_INITIAL_PROFILES[target]) {
      setActiveUsername(target);
      setTargetEditUser(target);
    } else {
      setTargetEditUser(activeUsername);
    }
    setIsProfileModalOpen(true);
  };

  const switchProfile = (username: string) => {
    const norm = username.toLowerCase();
    if (ALL_INITIAL_PROFILES[norm]) {
      setActiveUsername(norm);
      setTargetEditUser(norm);
    }
  };

  const closeProfileModal = () => {
    setIsProfileModalOpen(false);
  };

  const updateProfile = async (data: Partial<UserProfile>, targetUser?: string) => {
    const target = (targetUser || activeUsername).toLowerCase();
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
      if (loggedIn && loggedIn.username?.toLowerCase() === target) {
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
          username: target,
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
    currentLoggedInUser?.role === "admin" ||
    currentLoggedInUser?.role === "general_manager" ||
    currentLoggedInUser?.username?.toLowerCase() === "admin" ||
    currentLoggedInUser?.username?.toLowerCase() === "gm";

  const profile = profiles[activeUsername] || profiles.admin || DEFAULT_ADMIN_PROFILE;
  const isSalesRep = profile?.role === "sales_rep";
  const isDriverManager = profile?.role === "driver_manager";
  const isDriver = profile?.role === "driver";

  return (
    <ProfileContext.Provider
      value={{
        profile,
        hananProfile: profiles.hanan || DEFAULT_HANAN_PROFILE,
        rahmaProfile: profiles.hanan || DEFAULT_HANAN_PROFILE,
        adminProfile: profiles.admin || DEFAULT_ADMIN_PROFILE,
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
