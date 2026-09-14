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
  hananProfile: UserProfile;
  rahmaProfile?: UserProfile;
  adminProfile: UserProfile;
  allProfiles: Record<string, UserProfile>;
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

export const DEFAULT_ADMIN_PROFILE: UserProfile = {
  id: "admin-betolla-01",
  username: "admin",
  name: "مسؤول النظام التقني (System Admin)",
  role: "admin",
  phone: "0790000000",
  whatsapp: "0790000000",
  email: "admin@betolla.com",
  city: "المملكة الأردنية الهاشمية",
  bio: "إدارة وتأمين البنية التحتية البرمجية، الدعم الفني، وقواعد البيانات - شركة بيتولا كوزمتكس",
  avatar: "ت",
  avatarColor: "gold",
};

export const DEFAULT_GM_PROFILE: UserProfile = {
  id: "gm-betolla-01",
  username: "gm",
  name: "المدير العام",
  role: "general_manager",
  phone: "0790000000",
  whatsapp: "0790000000",
  email: "gm@betolla.com",
  city: "المملكة الأردنية الهاشمية",
  bio: "الإدارة العامة والتنفيذية لشركة بيتولا لمستحضرات التجميل",
  avatar: "م",
  avatarColor: "gold",
};

export const DEFAULT_SALES_MGR_PROFILE: UserProfile = {
  id: "mgr-sales-01",
  username: "sales.manager",
  name: "مديرة المبيعات",
  role: "sales_manager",
  phone: "0792223344",
  whatsapp: "0792223344",
  email: "sales_mgr@betolla.com",
  city: "عمان والوسط",
  bio: "إدارة ومتابعة فريق المبيعات، خطط الاستهداف البيعية، وتطوير قنوات التوزيع",
  avatar: "س",
  avatarColor: "amber",
  commissionRate: 5.0,
  monthlyTarget: 25000.0,
};

export const DEFAULT_HANAN_PROFILE: UserProfile = {
  id: "rep-hanan-01",
  username: "hanan",
  name: "حنان (مبيعات)",
  role: "sales_rep",
  repId: "hanan",
  phone: "0790000000",
  whatsapp: "0790000000",
  email: "hanan@betolla.com",
  city: "عمان والوسط",
  bio: "مبيعات معتمدة لشركة بيتولا لمستحضرات التجميل",
  avatar: "ح",
  avatarColor: "amber",
  commissionRate: 3.0,
  monthlyTarget: 0,
};

export const DEFAULT_RAHMA_PROFILE = DEFAULT_HANAN_PROFILE;

export const DEFAULT_MKT_MGR_PROFILE: UserProfile = {
  id: "mgr-mkt-01",
  username: "marketing.mgr",
  name: "مدير التسويق",
  role: "marketing_manager",
  phone: "0795556677",
  whatsapp: "0795556677",
  email: "marketing_mgr@betolla.com",
  city: "عمان",
  bio: "إدارة الحملات الإعلانية الممولة، تحليل السوق وسلوك العملاء، وتطوير الهوية التجارية",
  avatar: "ت",
  avatarColor: "blue",
};

export const DEFAULT_MARKETING_PROFILE: UserProfile = {
  id: "mkt-team-01",
  username: "marketing",
  name: "أخصائي التسويق (تسويق)",
  role: "marketing",
  phone: "0798889900",
  whatsapp: "0798889900",
  email: "marketing@betolla.com",
  city: "عمان",
  bio: "صناعة المحتوى، إدارة منصات التواصل الاجتماعي، ومتابعة مصادر وجودة الليدات",
  avatar: "ق",
  avatarColor: "rose",
};

export const DEFAULT_ZAID_PROFILE: UserProfile = {
  id: "fin-zaid-01",
  username: "zaid",
  name: "زيد (المدير المالي)",
  role: "finance",
  repId: "zaid",
  phone: "0797778899",
  whatsapp: "0797778899",
  email: "zaid@betolla.com",
  city: "عمان",
  bio: "الإدارة المالية المركزية، التدقيق المحاسبي، مطابقة عهدة السائقين، والتقارير المالية",
  avatar: "ز",
  avatarColor: "purple",
};

export const DEFAULT_HR_PROFILE: UserProfile = {
  id: "hr-ops-01",
  username: "hr",
  name: "مديرة الموارد البشرية - عمليات",
  role: "hr_operations",
  phone: "0793334455",
  whatsapp: "0793334455",
  email: "hr@betolla.com",
  city: "عمان",
  bio: "إدارة شؤون الموظفين، متابعة الأداء والعمليات التشغيلية واللوجستية في الشركة",
  avatar: "ب",
  avatarColor: "purple",
};

export const DEFAULT_DIYA_PROFILE: UserProfile = {
  id: "mgr-diya-01",
  username: "diya",
  name: "ضياء (مدير سائقين التوصيل)",
  role: "driver_manager",
  repId: "diya",
  phone: "0790230211",
  whatsapp: "0790230211",
  email: "diya@betolla.com",
  city: "عمان والوسط",
  bio: "إدارة أسطول السائقين، تنظيم مسارات التوصيل، متابعة الشحنات وتسوية عهدة الكاش",
  avatar: "ض",
  avatarColor: "blue",
};

export const DEFAULT_KHALID_PROFILE: UserProfile = {
  id: "drv-khalid-01",
  username: "khalid",
  name: "خالد (سائق توصيل)",
  role: "driver",
  repId: "khalid",
  phone: "0791112233",
  whatsapp: "0791112233",
  email: "khalid@betolla.com",
  city: "عمان والوسط",
  bio: "سائق ومندوب التوصيل الميداني وتحصيل النقدية - شركة بيتولا كوزمتكس",
  avatar: "خ",
  avatarColor: "emerald",
};

export const DEFAULT_ALI_PROFILE: UserProfile = {
  id: "drv-ali-01",
  username: "ali",
  name: "علي (سائق توصيل)",
  role: "driver",
  repId: "ali",
  phone: "0794445566",
  whatsapp: "0794445566",
  email: "ali@betolla.com",
  city: "عمان والوسط",
  bio: "سائق ومندوب التوصيل الميداني وتحصيل النقدية - شركة بيتولا كوزمتكس",
  avatar: "ع",
  avatarColor: "emerald",
};

export const DEFAULT_BX_PROFILE: UserProfile = {
  id: "drv-bx-01",
  username: "bx",
  name: "BX Arabia (شركة توصيل)",
  role: "driver",
  repId: "BX Arabia",
  phone: "0790001122",
  whatsapp: "0790001122",
  email: "bx@betolla.com",
  city: "المملكة الأردنية الهاشمية",
  bio: "شريك وشركة التوصيل والشحن المعتمدة - شركة بيتولا كوزمتكس",
  avatar: "B",
  avatarColor: "amber",
};

// Map of all default profiles by username
export const ALL_DEFAULT_PROFILES: Record<string, UserProfile> = {
  admin: DEFAULT_ADMIN_PROFILE,
  gm: DEFAULT_GM_PROFILE,
  "sales.manager": DEFAULT_SALES_MGR_PROFILE,
  hanan: DEFAULT_HANAN_PROFILE,
  "marketing.mgr": DEFAULT_MKT_MGR_PROFILE,
  marketing: DEFAULT_MARKETING_PROFILE,
  zaid: DEFAULT_ZAID_PROFILE,
  hr: DEFAULT_HR_PROFILE,
  diya: DEFAULT_DIYA_PROFILE,
  khalid: DEFAULT_KHALID_PROFILE,
  ali: DEFAULT_ALI_PROFILE,
  bx: DEFAULT_BX_PROFILE,
};

const ProfileContext = createContext<ProfileContextType>({
  profile: DEFAULT_ADMIN_PROFILE,
  hananProfile: DEFAULT_HANAN_PROFILE,
  rahmaProfile: DEFAULT_HANAN_PROFILE,
  adminProfile: DEFAULT_ADMIN_PROFILE,
  allProfiles: ALL_DEFAULT_PROFILES,
  updateProfile: () => ({ success: false }),
  isProfileModalOpen: false,
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
  const [activeUsername, setActiveUsername] = useState<string>("hanan");
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

    const trimmedName = data.name?.trim() || current.name;
    const computedAvatar = data.avatar || (trimmedName ? trimmedName.charAt(0) : current.avatar);

    const sanitizedData: Partial<UserProfile> = {
      name: trimmedName,
      phone: data.phone?.trim() || current.phone,
      whatsapp: data.whatsapp?.trim() || current.whatsapp,
      email: data.email?.trim() || current.email,
      city: data.city?.trim() || current.city,
      bio: data.bio?.trim() || current.bio,
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

    return { success: true, message: "تم حفظ وتحديث البيانات بنجاح." };
  };

  const profile = profiles[activeUsername] || profiles.admin;
  const isSalesRep = profile?.role === "sales_rep";
  const isAdmin =
    currentUser?.role === "admin" ||
    currentUser?.role === "general_manager" ||
    currentUser?.username?.toLowerCase() === "admin" ||
    currentUser?.username?.toLowerCase() === "gm";
  const isDriverManager = profile?.role === "driver_manager";
  const isDriver = profile?.role === "driver";

  return (
    <ProfileContext.Provider
      value={{
        profile,
        hananProfile: profiles.hanan || DEFAULT_HANAN_PROFILE,
        rahmaProfile: profiles.hanan || DEFAULT_HANAN_PROFILE,
        adminProfile: profiles.admin,
        allProfiles: profiles,
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
