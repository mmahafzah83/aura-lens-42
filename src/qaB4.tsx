import i18n from "./i18n";
import { createRoot } from "react-dom/client";
import "./index.css";
import LinkedInAddressCard from "@/components/settings/LinkedInAddressCard";
import EditProfileModal from "@/components/EditProfileModal";
const q = new URLSearchParams(location.search);
void i18n.changeLanguage("ar");
document.documentElement.lang = "ar"; document.documentElement.dir = "rtl";
createRoot(document.getElementById("root")!).render(
  q.get("v") === "modal"
    ? <EditProfileModal open onClose={() => {}} userId="00000000-0000-0000-0000-000000000001" />
    : <div style={{ padding: 16 }}><LinkedInAddressCard userId="00000000-0000-0000-0000-000000000001" /></div>,
);
