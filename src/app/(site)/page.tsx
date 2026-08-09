import { AboutSection } from "@/components/site/about-section";
import { BarbersSection } from "@/components/site/barbers-section";
import { Hero } from "@/components/site/hero";
import { ServicesSection } from "@/components/site/services-section";
import { getActiveServices, getActiveStaff } from "@/lib/queries/public";

export default async function HomePage() {
  const [services, staff] = await Promise.all([
    getActiveServices(),
    getActiveStaff(),
  ]);

  return (
    <>
      <Hero />
      <ServicesSection services={services} />
      <BarbersSection staff={staff} />
      <AboutSection />
    </>
  );
}
