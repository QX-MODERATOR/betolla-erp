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
  profile: UserProfile | null;
  updateProfile: (data: Partial<UserProfile>) => { success: boolean; message?: string };
  isProfileModalOpen: boolean;
  openProfileModal: () => void;
  closeProfileModal: () => void;
  isSalesRep: boolean;
}

const DEFAULT_RAHMA_PROFILE: UserProfile = {
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

const DEFAULT_ADMIN_PROFILE: UserProfile = {
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
  profile: null,
  updateProfile: () => ({ success: false }),
  isProfileModalOpen: false,
  openProfileModal: () => {},
  closeProfileModal: () => {},
  isSalesRep: true,
});

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const baseUser = getCurrentUser();
    const isRep = baseUser?.role === "sales_rep" || baseUser?.username?.toLowerCase() === "rahma";
    const defaultTemplate = isRep ? DEFAULT_RAHMA_PROFILE : DEFAULT_ADMIN_PROFILE;

    // Load any custom edits saved in localStorage
    const savedCustomKey = `betolla_profile_${baseUser?.username || (isRep ? "rahma" : "admin")}`;
    const rawSaved = localStorage.getItem(savedCustomKey);

    if (rawSaved) {
      try {
        const parsed = JSON.parse(rawSaved);
        setProfile({
          ...defaultTemplate,
          ...baseUser,
          ...parsed,
          // Ensure company permissions cannot be tampered with
          role: defaultTemplate.role,
          commissionRate: defaultTemplate.commissionRate,
          monthlyTarget: defaultTemplate.monthlyTarget,
        });
        return;
      } catch {}
    }

    setProfile({
      ...defaultTemplate,
      ...(baseUser || {}),
    });
  }, []);

  const openProfileModal = () => setIsProfileModalOpen(true);
  const closeProfileModal = () => setIsProfileModalOpen(false);

  const updateProfile = (data: Partial<UserProfile>) => {
    if (!profile) return { success: false, message: "لم يتم العثور على حساب المستخدم." };

    // Security check: If sales_rep, prevent modifying role, commission, or target
    const isRep = profile.role === "sales_rep";
    const sanitizedData: Partial<UserProfile> = {
      name: data.name?.trim() || profile.name,
      phone: data.phone?.trim() || profile.phone,
      whatsapp: data.whatsapp?.trim() || profile.whatsapp,
      email: data.email?.trim() || profile.email,
      city: data.city?.trim() || profile.city,
      bio: data.bio?.trim() || profile.bio,
      avatar: data.avatar || profile.avatar,
      avatarColor: data.avatarColor || profile.avatarColor,
    };

    const newProfile: UserProfile = {
      ...profile,
      ...sanitizedData,
      // Strictly maintain role and compensation locks
      role: profile.role,
      commissionRate: profile.commissionRate,
      monthlyTarget: profile.monthlyTarget,
    };

    setProfile(newProfile);

    if (typeof window !== "undefined") {
      const savedCustomKey = `betolla_profile_${profile.username}`;
      localStorage.setItem(savedCustomKey, JSON.stringify(sanitizedData));

      // Also update betolla_user so existing readers get the updated name
      try {
        const currentStored = localStorage.getItem("betolla_user");
        if (currentStored) {
          const parsed = JSON.parse(currentStored);
          localStorage.setItem(
            "betolla_user",
            JSON.stringify({
              ...parsed,
              name: newProfile.name,
              phone: newProfile.phone,
            })
          );
        }
      } catch {}
    }

    return { success: true, message: "تم تحديث البيانات الشخصية بنجاح." };
  };

  const isSalesRep = profile?.role === "sales_rep";

  return (
    <ProfileContext.Provider
      value={{
        profile,
        updateProfile,
        isProfileModalOpen,
        openProfileModal,
        closeProfileModal,
        isSalesRep,
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  return useContext(ProfileContext);
}
