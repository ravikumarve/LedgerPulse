import { prisma } from "../src/index";

/**
 * Create a test organization and return its ID.
 * Used by all test suites to scope data per tenant.
 */
export async function createTestOrg(): Promise<string> {
  const slug = `test-org-${Date.now()}`;
  const org = await prisma.organization.create({
    data: {
      name: "Test Organization",
      slug,
      settings: JSON.stringify({}),
    },
  });
  return org.id;
}
