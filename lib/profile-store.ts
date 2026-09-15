import type { UserRole } from "./auth";

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

export const DEFAULT_SABREEN_PROFILE: UserProfile = {
  id: "rep-sabreen-01",
  username: "sabreen",
  name: "صابرين (مبيعات)",
  role: "sales_rep",
  repId: "sabreen",
  phone: "0790000002",
  whatsapp: "0790000002",
  email: "sabreen@betolla.com",
  city: "عمان والوسط",
  bio: "مبيعات معتمدة لشركة بيتولا لمستحضرات التجميل",
  avatar: "ص",
  avatarColor: "amber",
  commissionRate: 3.0,
  monthlyTarget: 3500.0,
};

export const DEFAULT_HAMZA_PROFILE: UserProfile = {
  id: "rep-hamza-01",
  username: "hamza",
  name: "حمزة (مبيعات)",
  role: "sales_rep",
  repId: "hamza",
  phone: "0790000003",
  whatsapp: "0790000003",
  email: "hamza@betolla.com",
  city: "عمان والوسط",
  bio: "مبيعات معتمدة لشركة بيتولا لمستحضرات التجميل",
  avatar: "ح",
  avatarColor: "blue",
  commissionRate: 3.5,
  monthlyTarget: 6000.0,
};

export const DEFAULT_SARA_PROFILE: UserProfile = {
  id: "rep-sara-01",
  username: "sara",
  name: "سارة (مبيعات)",
  role: "sales_rep",
  repId: "sara",
  phone: "0790000004",
  whatsapp: "0790000004",
  email: "sara@betolla.com",
  city: "عمان والوسط",
  bio: "مبيعات معتمدة لشركة بيتولا لمستحضرات التجميل",
  avatar: "س",
  avatarColor: "rose",
  commissionRate: 2.5,
  monthlyTarget: 2000.0,
};

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

export const ALL_INITIAL_PROFILES: Record<string, UserProfile> = {
  admin: DEFAULT_ADMIN_PROFILE,
  gm: DEFAULT_GM_PROFILE,
  "sales.manager": DEFAULT_SALES_MGR_PROFILE,
  hanan: DEFAULT_HANAN_PROFILE,
  sabreen: DEFAULT_SABREEN_PROFILE,
  hamza: DEFAULT_HAMZA_PROFILE,
  sara: DEFAULT_SARA_PROFILE,
  "marketing.mgr": DEFAULT_MKT_MGR_PROFILE,
  marketing: DEFAULT_MARKETING_PROFILE,
  zaid: DEFAULT_ZAID_PROFILE,
  hr: DEFAULT_HR_PROFILE,
  diya: DEFAULT_DIYA_PROFILE,
  khalid: DEFAULT_KHALID_PROFILE,
  ali: DEFAULT_ALI_PROFILE,
  bx: DEFAULT_BX_PROFILE,
};

declare global {
  // eslint-disable-next-line no-var
  var __betolla_profiles__: Record<string, UserProfile> | undefined;
}

if (!global.__betolla_profiles__) {
  global.__betolla_profiles__ = { ...ALL_INITIAL_PROFILES };
}

export function getAllProfilesServer(): Record<string, UserProfile> {
  if (!global.__betolla_profiles__) {
    global.__betolla_profiles__ = { ...ALL_INITIAL_PROFILES };
  }
  return global.__betolla_profiles__;
}

export function getProfileServer(username: string): UserProfile | null {
  const all = getAllProfilesServer();
  const norm = (username || "").toLowerCase().trim();
  return all[norm] || null;
}

export function updateProfileServer(username: string, updates: Partial<UserProfile>): UserProfile {
  const all = getAllProfilesServer();
  const norm = (username || "").toLowerCase().trim();
  const current = all[norm] || {
    id: `user-${norm}`,
    username: norm,
    name: norm,
    role: "sales_rep" as UserRole,
  };

  const trimmedName = updates.name?.trim() || current.name;
  const computedAvatar = updates.avatar || (trimmedName ? trimmedName.charAt(0) : current.avatar);

  const updated: UserProfile = {
    ...current,
    ...updates,
    name: trimmedName,
    avatar: computedAvatar,
    phone: updates.phone !== undefined ? updates.phone.trim() : current.phone,
    whatsapp: updates.whatsapp !== undefined ? updates.whatsapp.trim() : current.whatsapp,
    email: updates.email !== undefined ? updates.email.trim() : current.email,
    city: updates.city !== undefined ? updates.city.trim() : current.city,
    bio: updates.bio !== undefined ? updates.bio.trim() : current.bio,
    role: current.role, // role & contract limits remain authoritative
    commissionRate: current.commissionRate,
    monthlyTarget: current.monthlyTarget,
  };

  all[norm] = updated;
  global.__betolla_profiles__ = all;

  return updated;
}
