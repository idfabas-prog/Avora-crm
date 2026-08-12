export type ContactStatus =
  | "New Lead"
  | "Contacted"
  | "Consult Booked"
  | "Showed"
  | "Sold"
  | "Nurture";

export const locations = ["Miami", "Tampa", "Jacksonville"];
export const leadSources = ["Meta Ads", "Google Search", "Referral", "Event", "Website"];
export const employees = ["Maya Bennett", "Sofia Reyes", "Julian Hart", "Nina Caldwell"];

export const metrics = [
  { label: "Revenue", value: "$482,900", detail: "+18.4% vs last month" },
  { label: "New Leads", value: "428", detail: "68 from referrals" },
  { label: "Consults Booked", value: "176", detail: "41.1% booking rate" },
  { label: "Consults Showed", value: "139", detail: "79.0% show rate" },
  { label: "Sales", value: "64", detail: "12 same-day closes" },
  { label: "Close Rate", value: "46.0%", detail: "+4.8 pts" },
  { label: "Average Ticket", value: "$7,545", detail: "Hair restoration leads" },
  { label: "New Patients", value: "58", detail: "22 first treatment starts" }
];

export const revenueByLocation = [
  { name: "Miami", value: 218400 },
  { name: "Tampa", value: 147250 },
  { name: "Jacksonville", value: 117250 }
];

export const revenueByService = [
  { name: "Hair Restoration", value: 204500 },
  { name: "T-Shape", value: 78500 },
  { name: "NeoGen", value: 64300 },
  { name: "Injectables", value: 59800 },
  { name: "Peptides", value: 42100 },
  { name: "Other", value: 33700 }
];

export const salespersonPerformance = [
  { name: "Maya Bennett", revenue: "$154,200", consults: 44, sales: 21, closeRate: "47.7%", averageTicket: "$7,343", commission: "$15,420" },
  { name: "Sofia Reyes", revenue: "$128,650", consults: 39, sales: 17, closeRate: "43.6%", averageTicket: "$7,568", commission: "$12,865" },
  { name: "Julian Hart", revenue: "$116,700", consults: 31, sales: 15, closeRate: "48.4%", averageTicket: "$7,780", commission: "$11,670" },
  { name: "Nina Caldwell", revenue: "$83,350", consults: 25, sales: 11, closeRate: "44.0%", averageTicket: "$7,577", commission: "$8,335" }
];

export const funnelStages = [
  { name: "New Lead", count: 428 },
  { name: "Contacted", count: 322 },
  { name: "Consult Booked", count: 176 },
  { name: "Showed", count: 139 },
  { name: "Sold", count: 64 }
];

export const contacts = [
  { id: "isabella-martin", name: "Isabella Martin", phone: "(305) 555-0148", email: "isabella.m@example.com", location: "Miami", leadSource: "Meta Ads", assignedTo: "Maya Bennett", status: "Consult Booked" as ContactStatus, lifetimeValue: "$12,400", lastActivity: "Booked consult for Friday" },
  { id: "camila-stone", name: "Camila Stone", phone: "(813) 555-0182", email: "camila.s@example.com", location: "Tampa", leadSource: "Referral", assignedTo: "Sofia Reyes", status: "Sold" as ContactStatus, lifetimeValue: "$18,900", lastActivity: "Deposit received" },
  { id: "danielle-cross", name: "Danielle Cross", phone: "(904) 555-0129", email: "danielle.c@example.com", location: "Jacksonville", leadSource: "Google Search", assignedTo: "Julian Hart", status: "Contacted" as ContactStatus, lifetimeValue: "$0", lastActivity: "Left voicemail" },
  { id: "marcus-lee", name: "Marcus Lee", phone: "(305) 555-0119", email: "marcus.l@example.com", location: "Miami", leadSource: "Website", assignedTo: "Nina Caldwell", status: "Showed" as ContactStatus, lifetimeValue: "$6,800", lastActivity: "Proposal sent" },
  { id: "elena-rivera", name: "Elena Rivera", phone: "(813) 555-0194", email: "elena.r@example.com", location: "Tampa", leadSource: "Event", assignedTo: "Maya Bennett", status: "New Lead" as ContactStatus, lifetimeValue: "$0", lastActivity: "New peptide inquiry" },
  { id: "victoria-hale", name: "Victoria Hale", phone: "(904) 555-0137", email: "victoria.h@example.com", location: "Jacksonville", leadSource: "Meta Ads", assignedTo: "Sofia Reyes", status: "Nurture" as ContactStatus, lifetimeValue: "$2,450", lastActivity: "6-month check-in scheduled" }
];

export const pipelineStages = [
  "New Lead",
  "Contacted",
  "Consult Booked",
  "Confirmed",
  "Showed",
  "Proposal",
  "Sold",
  "Treatment",
  "Follow-Up",
  "Lost",
  "Not Candidate"
];

export const opportunities = [
  { stage: "New Lead", contact: "Elena Rivera", value: "$4,800", assignedTo: "Maya Bennett", location: "Tampa", lastActivity: "Peptides form submitted" },
  { stage: "Contacted", contact: "Danielle Cross", value: "$9,600", assignedTo: "Julian Hart", location: "Jacksonville", lastActivity: "Callback requested" },
  { stage: "Consult Booked", contact: "Isabella Martin", value: "$12,400", assignedTo: "Maya Bennett", location: "Miami", lastActivity: "Consult Friday 2:00 PM" },
  { stage: "Showed", contact: "Marcus Lee", value: "$6,800", assignedTo: "Nina Caldwell", location: "Miami", lastActivity: "Photos reviewed" },
  { stage: "Proposal", contact: "Avery Brooks", value: "$14,200", assignedTo: "Sofia Reyes", location: "Tampa", lastActivity: "Financing options sent" },
  { stage: "Sold", contact: "Camila Stone", value: "$18,900", assignedTo: "Sofia Reyes", location: "Tampa", lastActivity: "Deposit received" },
  { stage: "Treatment", contact: "Natalie Wynn", value: "$7,250", assignedTo: "Julian Hart", location: "Jacksonville", lastActivity: "First visit complete" }
];

export const contactTimeline = [
  "Consult booked with Miami team",
  "SMS follow-up sent from sales desk",
  "Hair restoration pricing guide viewed",
  "Lead captured from Meta Ads campaign"
];
