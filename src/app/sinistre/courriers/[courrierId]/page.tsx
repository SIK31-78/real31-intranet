import { CourriersScreen } from "@/components/sinistre/CourriersScreen";

// Next 16 : params est asynchrone.
export default async function Page({ params }: { params: Promise<{ courrierId: string }> }) {
  const { courrierId } = await params;
  return <CourriersScreen courrierId={courrierId} />;
}
