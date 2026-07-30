import MoveCard from "@/components/home/MoveCard";
import { useAuthReady } from "@/hooks/useAuthReady";
export default function MoveCheck() {
  const { user } = useAuthReady();
  return <div style={{ padding: 40, background: "var(--surface-page)", minHeight: "100vh" }}>
    <MoveCard userId={user?.id ?? null} onOpenDraft={() => {}} onStartSignalPost={() => {}} />
  </div>;
}
