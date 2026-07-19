import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // Create a default organization
  const org = await prisma.organization.create({
    data: {
      name: "Acme Corp",
      slug: "acme-corp",
      settings: JSON.stringify({
        defaultCurrency: "INR",
        timezone: "Asia/Kolkata",
        matchingTolerances: { quantityPercent: 2, unitPricePercent: 5, totalAmountPercent: 1 },
        matchWeights: { invDn: 50, invEwb: 30, dnEwb: 20 },
      }),
    },
  });

  // Create a test user
  const bcrypt = await import("bcryptjs");
  const hash = await bcrypt.hash("password123", 10);
  const user = await prisma.user.create({
    data: {
      email: "admin@acmecorp.in",
      passwordHash: hash,
      name: "Ravi Admin",
    },
  });

  await prisma.organizationMember.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      role: "ADMIN",
    },
  });

  // Create a test vendor
  const vendor = await prisma.vendor.create({
    data: {
      organizationId: org.id,
      name: "Acme Industrial Supplies",
      gstin: "27AAACA1234A1Z1",
      email: "billing@acmeindustries.in",
      phone: "+91-9876543210",
    },
  });

  // Create a test invoice
  const invoice = await prisma.invoice.create({
    data: {
      organizationId: org.id,
      vendorId: vendor.id,
      invoiceNumber: "INV-2026-001",
      invoiceDate: new Date("2026-07-01"),
      totalAmount: 125000.0,
      taxAmount: 22500.0,
      lineItems: JSON.stringify([
        { sku: "WIDGET-A", description: "Steel Widget A", qty: 100, unitPrice: 850, total: 85000 },
        { sku: "WIDGET-B", description: "Brass Widget B", qty: 50, unitPrice: 800, total: 40000 },
      ]),
    },
  });

  // Create a test delivery note
  await prisma.deliveryNote.create({
    data: {
      organizationId: org.id,
      vendorId: vendor.id,
      deliveryNoteNumber: "DN-2026-001",
      deliveryDate: new Date("2026-07-03"),
      invoiceId: invoice.id,
      totalQuantity: 150,
      lineItems: JSON.stringify([
        { sku: "WIDGET-A", description: "Steel Widget A", qty: 100 },
        { sku: "WIDGET-B", description: "Brass Widget B", qty: 48 },
      ]),
      weightbridgeValue: 2450.5,
    },
  });

  console.log("✅ Seed complete!");
  console.log(`   Org: ${org.name} (${org.slug})`);
  console.log(`   User: admin@acmecorp.in / password123`);
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
