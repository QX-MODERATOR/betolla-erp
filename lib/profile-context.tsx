"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { getCurrentUser } from "@/lib/client-api";
import type { UserRole } from "@/lib/auth";

export interface UserProfile {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  repId?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  city?: string;
  bio?: string;
  avatar?: string;
  avatarColor?: string;
  // Read-only company contract fields
  commissionRate?: number;
  monthlyTarget?: number;
}

interface ProfileContextType {
  profile: UserProfile;
  rahmaProfile: UserProfile;
  adminProfile: UserProfile;
  updateProfile: (data: Partial<UserProfile>, targetUser?: string) => { success: boolean; message?: string };
  isProfileModalOpen: boolean;
  openProfileModal: (targetUsernameOrRepId?: string) => void;
  closeProfileModal: () => void;
  switchProfile: (username: string) => void;
  isSalesRep: boolean;
  isAdmin: boolean;
  isDriverManager: boolean;
  isDriver: boolean;
}

export const DEFAULT_RAHMA_PROFILE: UserProfile = {
  id: "rep-rahma-01",
  username: "rahma",
  name: "رحمة (مندوبة مبيعات)",
  role: "sales_rep",
  repId: "rahma",
  phone: "0793937385",
  whatsapp: "0793937385",
  email: "rahma@betolla.com",
  city: "عمان والوسط",
  bio: "مندوبة مبيعات معتمدة لشركة بيتولا لمستحضرات التجميل - قسم التريتمنت والبلازما",
  avatar: "ر",
  avatarColor: "amber",
  commissionRate: 3.5,
  monthlyTarget: 4500.0,
};

export const DEFAULT_ADMIN_PROFILE: UserProfile = {
  id: "admin-betolla-01",
  username: "admin",
  name: "المدير العام (Admin)",
  role: "admin",
  phone: "0790000000",
  whatsapp: "0790000000",
  email: "admin@betolla.com",
  city: "المملكة الأردنية الهاشمية",
  bio: "الإدارة العامة لشركة بيتولا كوزمتكس",
  avatar: "أ",
  avatarColor: "amber",
};

export const DEFAULT_DIYA_PROFILE: UserProfile = {
  id: "mgr-diya-01",
  username: "diya",
  name: "ضياء (مدير السائقين)",
  role: "driver_manager",
  repId: "diya",
  phone: "",
  whatsapp: "",
  email: "diya@betolla.com",
  city: "عمان",
  bio: "مدير قسم التوصيل والسائقين - شركة بيتولا كوزمتكس",
  avatar: "ض",
  avatarColor: "blue",
};

export const DEFAULT_KHALID_PROFILE: UserProfile = {
  id: "drv-khalid-01",
  username: "khalid",
  name: "خالد (سائق توصيل)",
  role: "driver",
  repId: "khalid",
  phone: "",
  whatsapp: "",
  email: "khalid@betolla.com",
  city: "عمان",
  bio: "سائق توصيل - شركة بيتولا كوزمتكس",
  avatar: "خ",
  avatarColor: "emerald",
};

export const DEFAULT_ALI_PROFILE: UserProfile = {
  id: "drv-ali-01",
  username: "ali",
  name: "علي (سائق توصيل)",
  role: "driver",
  repId: "ali",
  phone: "",
  whatsapp: "",
  email: "ali@betolla.com",
  city: "عمان",
  bio: "سائق توصيل - شركة بيتولا كوزمتكس",
  avatar: "ع",
  avatarColor: "emerald",
};

export const DEFAULT_ZAID_PROFILE: UserProfile = {
  id: "fin-zaid-01",
  username: "zaid",
  name: "زيد (المحاسبة والمالية)",
  role: "finance",
  repId: "zaid",
  phone: "",
  whatsapp: "",
  email: "zaid@betolla.com",
  city: "عمان",
  bio: "قسم المحاسبة والمالية - شركة بيتولا كوزمتكس",
  avatar: "ز",
  avatarColor: "violet",
};

// Map of all default profiles by username
const ALL_DEFAULT_PROFILES: Record<string, UserProfile> = {
  rahma: DEFAULT_RAHMA_PROFILE,
  admin: DEFAULT_ADMIN_PROFILE,
  diya: DEFAULT_DIYA_PROFILE,
  khalid: DEFAULT_KHALID_PROFILE,
  ali: DEFAULT_ALI_PROFILE,
  zaid: DEFAULT_ZAID_PROFILE,
};

const ProfileContext = createContext<ProfileContextType>({
  profile: DEFAULT_RAHMA_PROFILE,
  rahmaProfile: DEFAULT_RAHMA_PROFILE,
  adminProfile: DEFAULT_ADMIN_PROFILE,
  updateProfile: () => ({ success: false }),
  isProfileModalOpen: false,
  openProfileModal: () => {},
  closeProfileModal: () => {},
  switchProfile: () => {},
  isSalesRep: true,
  isAdmin: false,
  isDriverManager: false,
  isDriver: false,
});

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [activeUsername, setActiveUsername] = useState<string>("rahma");
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>(ALL_DEFAULT_PROFILES);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const baseUser = getCurrentUser();
    setCurrentUser(baseUser);

    // Determine initial active profile based on logged-in user
    const username = baseUser?.username?.toLowerCase();
    const initialUser = username && ALL_DEFAULT_PROFILES[username] ? username : "admin";
    setActiveUsername(initialUser);

    // Load saved profile customizations from localStorage
    const loadedProfiles: Record<string, UserProfile> = {};
    for (const [key, defaultProfile] of Object.entries(ALL_DEFAULT_PROFILES)) {
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
        } else {
          loadedProfiles[key] = defaultProfile;
        }
      } catch {
        loadedProfiles[key] = defaultProfile;
      }
    }

    setProfiles(loadedProfiles);
  }, []);

  const openProfileModal = (targetUsernameOrRepId?: string) => {
    const freshUser = getCurrentUser();
    if (freshUser) {
      setCurrentUser(freshUser);
    }
    const target = targetUsernameOrRepId?.toLowerCase() || freshUser?.username?.toLowerCase() || currentUser?.username?.toLowerCase() || activeUsername;
    if (target && ALL_DEFAULT_PROFILES[target]) {
      setActiveUsername(target);
    }
    setIsProfileModalOpen(true);
  };

  const switchProfile = (username: string) => {
    const norm = username.toLowerCase();
    if (ALL_DEFAULT_PROFILES[norm]) {
      setActiveUsername(norm);
    }
  };

  const closeProfileModal = () => setIsProfileModalOpen(false);

  const updateProfile = (data: Partial<UserProfile>, targetUser?: string) => {
    const target = (targetUser || activeUsername).toLowerCase();
    const current = profiles[target] || DEFAULT_ADMIN_PROFILE;

    const sanitizedData: Partial<UserProfile> = {
      name: data.name?.trim() || current.name,
      phone: data.phone?.trim() || current.phone,
      whatsapp: data.whatsapp?.trim() || current.whatsapp,
      email: data.email?.trim() || current.email,
      city: data.city?.trim() || current.city,
      bio: data.bio?.trim() || current.bio,
      avatar: data.avatar || current.avatar,
      avatarColor: data.avatarColor || current.avatarColor,
    };

    const updated: UserProfile = {
      ...current,
      ...sanitizedData,
      role: current.role,
      commissionRate: current.commissionRate,
      monthlyTarget: current.monthlyTarget,
    };

    setProfiles((prev) => ({
      ...prev,
      [target]: updated,
    }));

    if (typeof window !== "undefined") {
      localStorage.setItem(`betolla_profile_${target}`, JSON.stringify(sanitizedData));
    }

    return { success: true, message: "تم حفظ وتحديث البيانات بنجاح." };
  };

  const profile = profiles[activeUsername] || profiles.admin;
  const isSalesRep = profile?.role === "sales_rep";
  const isAdmin = currentUser?.role === "admin" || currentUser?.username?.toLowerCase() === "admin";
  const isDriverManager = profile?.role === "driver_manager";
  const isDriver = profile?.role === "driver";

  return (
    <ProfileContext.Provider
      value={{
        profile,
        rahmaProfile: profiles.rahma,
        adminProfile: profiles.admin,
        updateProfile,
        isProfileModalOpen,
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
