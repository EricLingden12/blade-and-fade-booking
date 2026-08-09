import { AboutSection } from "@/components/site/about-section";
import { BarbersSection } from "@/components/site/barbers-section";
import { Hero } from "@/components/site/hero";
import { MapSection } from "@/components/site/map-section";
import { ServicesSection } from "@/components/site/services-section";
import { getActiveServices, getActiveStaff } from "@/lib/queries/public";
import { getCurrency } from "@/lib/queries/settings";

export default async function HomePage() {
  const [services, staff, currency] = await Promise.all([
    getActiveServices(),
    getActiveStaff(),
    getCurrency(),
  ]);

  return (
    <>
      <Hero />
      <ServicesSection services={services} currency={currency} />
      <BarbersSection staff={staff} />
      <AboutSection />
      <MapSection />
    </>
  );
}
