"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { getCurrentUser } from "@/lib/client-api";

export interface UserProfile {
  id: string;
  username: string;
  name: string;
  role: "admin" | "sales_manager" | "sales_rep";
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
});

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [activeUsername, setActiveUsername] = useState<string>("rahma");
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({
    rahma: DEFAULT_RAHMA_PROFILE,
    admin: DEFAULT_ADMIN_PROFILE,
  });
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const baseUser = getCurrentUser();
    setCurrentUser(baseUser);

    // Determine initial active profile:
    // If on /sales or logged in as sales_rep/rahma -> default to "rahma"
    const isSalesRoute = window.location.pathname.includes("/sales");
    const isRep = baseUser?.role === "sales_rep" || baseUser?.username?.toLowerCase() === "rahma";
    const initialUser = isSalesRoute || isRep ? "rahma" : (baseUser?.username?.toLowerCase() === "admin" ? "admin" : "rahma");
    setActiveUsername(initialUser);

    const loadProfile = (username: string, defaultObj: UserProfile): UserProfile => {
      try {
        const raw = localStorage.getItem(`betolla_profile_${username}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          return {
            ...defaultObj,
            ...parsed,
            role: defaultObj.role,
            commissionRate: defaultObj.commissionRate,
            monthlyTarget: defaultObj.monthlyTarget,
          };
        }
      } catch {}
      return defaultObj;
    };

    setProfiles({
      rahma: loadProfile("rahma", DEFAULT_RAHMA_PROFILE),
      admin: loadProfile("admin", DEFAULT_ADMIN_PROFILE),
    });
  }, []);

  const openProfileModal = (targetUsernameOrRepId?: string) => {
    let target = targetUsernameOrRepId?.toLowerCase();
    if (!target) {
      const isSalesRoute = typeof window !== "undefined" && window.location.pathname.includes("/sales");
      const isRep = currentUser?.role === "sales_rep" || currentUser?.username?.toLowerCase() === "rahma";
      target = isSalesRoute || isRep ? "rahma" : (currentUser?.username?.toLowerCase() === "admin" ? "admin" : "rahma");
    }
    if (target === "rahma" || target === "admin") {
      setActiveUsername(target);
    }
    setIsProfileModalOpen(true);
  };

  const switchProfile = (username: string) => {
    const norm = username.toLowerCase();
    if (norm === "rahma" || norm === "admin") {
      setActiveUsername(norm);
    }
  };

  const closeProfileModal = () => setIsProfileModalOpen(false);

  const updateProfile = (data: Partial<UserProfile>, targetUser?: string) => {
    const target = (targetUser || activeUsername).toLowerCase();
    const current = profiles[target] || DEFAULT_RAHMA_PROFILE;

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

  const profile = profiles[activeUsername] || profiles.rahma;
  const isSalesRep = profile?.role === "sales_rep";
  const isAdmin = currentUser?.role === "admin" || currentUser?.username?.toLowerCase() === "admin";

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
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  return useContext(ProfileContext);
}
