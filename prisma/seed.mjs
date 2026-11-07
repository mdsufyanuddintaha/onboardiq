// Idempotent seed: job-role templates that map to AD security groups.
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const templates = [
  { name: "Software Developer", department: "Engineering", adGroups: ["SG-Engineering", "SG-Git-Access", "SG-VPN-Users"] },
  { name: "HR Specialist", department: "Human Resources", adGroups: ["SG-HR", "SG-HR-Documents"] },
  { name: "Finance Analyst", department: "Finance", adGroups: ["SG-Finance", "SG-ERP-ReadOnly"] },
  { name: "IT Support Technician", department: "IT", adGroups: ["SG-IT-Support", "SG-Helpdesk-Agents"] },
  { name: "Sales Representative", department: "Sales", adGroups: ["SG-Sales", "SG-CRM-Users"] },
];

for (const t of templates) {
  await prisma.roleTemplate.upsert({ where: { name: t.name }, update: { department: t.department, adGroups: t.adGroups }, create: t });
}
console.log(`Seeded ${templates.length} role templates`);
await prisma.$disconnect();
