import CalibrationSliders from "@/components/CalibrationSliders";
export default function CalibPreview() {
  return (
    <div style={{ minHeight: "100vh", background: "#F2F5F9", padding: 24, display: "flex", justifyContent: "center" }}>
      <div style={{ background: "#FFFFFF", border: "1px solid #E2E7EE", borderRadius: 16, padding: 28, maxWidth: 480, width: "100%" }}>
        <CalibrationSliders sector="banking" onComplete={() => {}} />
      </div>
    </div>
  );
}
