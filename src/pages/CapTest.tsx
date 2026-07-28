// TEMP-VERIFY
import { useState } from "react";
import CaptureModal from "@/components/CaptureModal";
export default function CapTest() {
  const [open, setOpen] = useState(true);
  const pre = new URLSearchParams(window.location.search).get("pre") || undefined;
  return <CaptureModal open={open} onOpenChange={setOpen} prefillText={pre} />;
}
