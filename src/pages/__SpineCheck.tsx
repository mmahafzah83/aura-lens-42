import HomeSpine from "@/components/home/HomeSpine";
import { useAuthReady } from "@/hooks/useAuthReady";
export default function SpineCheck() {
  const { user } = useAuthReady();
  return <div style={{ padding: 40, background: "var(--surface-page)", minHeight: "100vh" }}>
    <HomeSpine userId={user?.id ?? null} onSwitchTab={() => {}} onStartSignalPost={() => {}} />
  </div>;
}
