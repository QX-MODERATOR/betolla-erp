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
  username: "admin.zaid",
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

export const DEFAULT_ADMIN_QX_PROFILE: UserProfile = {
  id: "admin-qx-01",
  username: "admin.qx",
  name: "مسؤول النظام التقني (System Admin)",
  role: "admin",
  phone: "0790000001",
  whatsapp: "0790000001",
  email: "admin.qx@betolla.com",
  city: "المملكة الأردنية الهاشمية",
  bio: "إدارة وتأمين البنية التحتية البرمجية، الدعم الفني، وقواعد البيانات - شركة بيتولا كوزمتكس",
  avatar: "Q",
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

export const DEFAULT_RASHA_PROFILE: UserProfile = {
  id: "mgr-rasha-01",
  username: "rasha.sales.mgn",
  name: "رشا (مديرة مبيعات)",
  role: "sales_manager",
  phone: "0790000005",
  whatsapp: "0790000005",
  email: "rasha@betolla.com",
  city: "عمان والوسط",
  bio: "إدارة ومتابعة فريق المبيعات، خطط الاستهداف البيعية، وتطوير قنوات التوزيع",
  avatar: "ر",
  avatarColor: "amber",
  commissionRate: 5.0,
  monthlyTarget: 25000.0,
};

export const DEFAULT_RAHMA_PROFILE: UserProfile = {
  id: "rep-rahma-01",
  username: "rahma.sales",
  name: "رحمة (مبيعات)",
  role: "sales_rep",
  repId: "rahma",
  phone: "0793937385",
  whatsapp: "0793937385",
  email: "rahma@betolla.com",
  city: "عمان والوسط",
  bio: "مبيعات معتمدة لشركة بيتولا لمستحضرات التجميل - قسم التريتمنت والبلازما",
  avatar: "ر",
  avatarColor: "amber",
  commissionRate: 3.5,
  monthlyTarget: 4500.0,
};

export const DEFAULT_HANAN_PROFILE: UserProfile = {
  id: "rep-hanan-01",
  username: "hanan.sales",
  name: "حنان (مبيعات)",
  role: "sales_rep",
  repId: "hanan",
  phone: "0790000006",
  whatsapp: "0790000006",
  email: "hanan@betolla.com",
  city: "عمان والوسط",
  bio: "مبيعات معتمدة لشركة بيتولا لمستحضرات التجميل",
  avatar: "ح",
  avatarColor: "rose",
  commissionRate: 3.5,
  monthlyTarget: 4500.0,
};

export const DEFAULT_AYA_PROFILE: UserProfile = {
  id: "rep-aya-01",
  username: "aya.sales",
  name: "آية (مبيعات)",
  role: "sales_rep",
  repId: "آية",
  phone: "0790000007",
  whatsapp: "0790000007",
  email: "aya@betolla.com",
  city: "عمان والوسط",
  bio: "مبيعات معتمدة لشركة بيتولا لمستحضرات التجميل",
  avatar: "آ",
  avatarColor: "blue",
  commissionRate: 3.0,
  monthlyTarget: 3500.0,
};

export const DEFAULT_SABREEN_PROFILE: UserProfile = {
  id: "rep-sabreen-01",
  username: "sabreen.sales",
  name: "صابرين (مبيعات)",
  role: "sales_rep",
  repId: "صابرين",
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


export const DEFAULT_MKT_MGR_PROFILE: UserProfile = {
  id: "mgr-mkt-01",
  username: "ammar.mrk.mgr",
  name: "مدير التسويق",
  role: "marketing_manager",
  phone: "0795556677",
  whatsapp: "0795556677",
  email: "marketing_mgr@betolla.com",
  city: "عمان",
  bio: "إدارة الحملات الإعلانية الممولة، تحليل السوق وسلوك العملاء، وتطوير الهوية التجارية",
  avatar: "ع",
  avatarColor: "blue",
};

export const DEFAULT_MARKETING_PROFILE: UserProfile = {
  id: "mkt-team-01",
  username: "hanin.marketing",
  name: "أخصائي التسويق (تسويق)",
  role: "marketing",
  phone: "0798889900",
  whatsapp: "0798889900",
  email: "marketing@betolla.com",
  city: "عمان",
  bio: "صناعة المحتوى، إدارة منصات التواصل الاجتماعي، ومتابعة مصادر وجودة الليدات",
  avatar: "ح",
  avatarColor: "rose",
};

export const DEFAULT_LEEN_PROFILE: UserProfile = {
  id: "mkt-leen-01",
  username: "leen.marketing",
  name: "لين (تسويق)",
  role: "marketing",
  phone: "0790000008",
  whatsapp: "0790000008",
  email: "leen@betolla.com",
  city: "عمان",
  bio: "صناعة المحتوى، إدارة منصات التواصل الاجتماعي، ومتابعة مصادر وجودة الليدات",
  avatar: "ل",
  avatarColor: "rose",
};

export const DEFAULT_ZAID_PROFILE: UserProfile = {
  id: "fin-zaid-01",
  username: "ahmad.finance",
  name: "أحمد (المدير المالي)",
  role: "finance",
  repId: "ahmad",
  phone: "0797778899",
  whatsapp: "0797778899",
  email: "ahmad@betolla.com",
  city: "عمان",
  bio: "الإدارة المالية المركزية، التدقيق المحاسبي، مطابقة عهدة السائقين، والتقارير المالية",
  avatar: "أ",
  avatarColor: "purple",
};

export const DEFAULT_HR_PROFILE: UserProfile = {
  id: "hr-ops-01",
  username: "hr.areej",
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
  username: "diya.mgn",
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
  username: "khalid.driver",
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
  username: "ali.driver",
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

// Keyed by the stable account `id` (lib/auth.ts SYSTEM_ACCOUNTS[].id), NEVER by
// login username — usernames get renamed by IT from time to time, ids don't.
// Keying this by username was the root cause of the profile modal showing the
// wrong person's data after any username rename (it fell back to a default
// profile because the old username key no longer matched anyone).
export const ALL_INITIAL_PROFILES: Record<string, UserProfile> = {
  "admin-betolla-01": DEFAULT_ADMIN_PROFILE,
  "admin-qx-01": DEFAULT_ADMIN_QX_PROFILE,
  "gm-betolla-01": DEFAULT_GM_PROFILE,
  "mgr-sales-01": DEFAULT_SALES_MGR_PROFILE,
  "mgr-rasha-01": DEFAULT_RASHA_PROFILE,
  "rep-rahma-01": DEFAULT_RAHMA_PROFILE,
  "rep-hanan-01": DEFAULT_HANAN_PROFILE,
  "rep-aya-01": DEFAULT_AYA_PROFILE,
  "rep-sabreen-01": DEFAULT_SABREEN_PROFILE,
  "rep-hamza-01": DEFAULT_HAMZA_PROFILE,
  "mgr-mkt-01": DEFAULT_MKT_MGR_PROFILE,
  "mkt-team-01": DEFAULT_MARKETING_PROFILE,
  "mkt-leen-01": DEFAULT_LEEN_PROFILE,
  "fin-zaid-01": DEFAULT_ZAID_PROFILE,
  "hr-ops-01": DEFAULT_HR_PROFILE,
  "mgr-diya-01": DEFAULT_DIYA_PROFILE,
  "drv-khalid-01": DEFAULT_KHALID_PROFILE,
  "drv-ali-01": DEFAULT_ALI_PROFILE,
  "drv-bx-01": DEFAULT_BX_PROFILE,
};
